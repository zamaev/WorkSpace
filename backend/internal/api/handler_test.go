package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"workspace/internal/store"
)

func testServer(t *testing.T) *httptest.Server {
	t.Helper()
	db, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("база: %v", err)
	}
	srv := httptest.NewServer(Handler(db))
	t.Cleanup(func() { srv.Close(); db.Close() })
	return srv
}

func call(t *testing.T, method, url string, body any) (int, map[string]json.RawMessage) {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatal(err)
		}
	}
	req, err := http.NewRequest(method, url, &buf)
	if err != nil {
		t.Fatal(err)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	out := map[string]json.RawMessage{}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		t.Fatalf("декодирование ответа %s %s: %v", method, url, err)
	}
	return res.StatusCode, out
}

func mkProject(t *testing.T, srv *httptest.Server, name string) int64 {
	t.Helper()
	code, res := call(t, "POST", srv.URL+"/api/projects", map[string]any{"name": name, "color": "#c9a96a"})
	if code != 201 {
		t.Fatalf("POST project: %d %s", code, res["error"])
	}
	var p struct {
		ID int64 `json:"id"`
	}
	json.Unmarshal(res["project"], &p)
	return p.ID
}

func TestOptUnmarshal(t *testing.T) {
	var b patchBody
	if err := json.Unmarshal([]byte(`{"scheduledOn": null, "title": "x"}`), &b); err != nil {
		t.Fatal(err)
	}
	if !b.ScheduledOn.Set || b.ScheduledOn.Val != nil {
		t.Errorf("null: Set=%v Val=%v", b.ScheduledOn.Set, b.ScheduledOn.Val)
	}
	if !b.Title.Set || b.Title.Val == nil || *b.Title.Val != "x" {
		t.Errorf("значение: %+v", b.Title)
	}
	if b.ParentID.Set {
		t.Errorf("отсутствующий ключ считался присутствующим")
	}
}

func TestProjectsOverHTTP(t *testing.T) {
	srv := testServer(t)

	pid := mkProject(t, srv, "Работа")

	code, res := call(t, "GET", srv.URL+"/api/projects", nil)
	var list []struct {
		Name  string `json:"name"`
		Color string `json:"color"`
	}
	json.Unmarshal(res["projects"], &list)
	if code != 200 || len(list) != 1 || list[0].Name != "Работа" || list[0].Color != "#c9a96a" {
		t.Fatalf("GET projects: %d %+v", code, list)
	}

	code, res = call(t, "PATCH", fmt.Sprintf("%s/api/projects/%d", srv.URL, pid), map[string]any{"name": "Дом", "color": "#8fb56b"})
	if code != 200 {
		t.Fatalf("PATCH project: %d %s", code, res["error"])
	}

	if code, _ := call(t, "POST", srv.URL+"/api/projects", map[string]any{"name": "x", "color": "зелёный"}); code != 422 {
		t.Errorf("кривой цвет: %d", code)
	}
	if code, _ := call(t, "PATCH", srv.URL+"/api/projects/999", map[string]any{"name": "y"}); code != 404 {
		t.Errorf("PATCH несуществующего: %d", code)
	}

	// удаление каскадом с задачами
	call(t, "POST", srv.URL+"/api/tasks", map[string]any{"title": "a", "projectId": pid})
	code, res = call(t, "DELETE", fmt.Sprintf("%s/api/projects/%d", srv.URL, pid), nil)
	var deleted int
	json.Unmarshal(res["deleted"], &deleted)
	if code != 200 || deleted != 1 {
		t.Errorf("DELETE project: %d, задач удалено %d", code, deleted)
	}
}

func TestCRUDOverHTTP(t *testing.T) {
	srv := testServer(t)
	pid := mkProject(t, srv, "Работа")

	// создание корня
	code, res := call(t, "POST", srv.URL+"/api/tasks", map[string]any{"title": "Корень", "projectId": pid})
	if code != 201 {
		t.Fatalf("POST: %d %s", code, res["error"])
	}
	var root struct {
		ID        int64 `json:"id"`
		ProjectID int64 `json:"projectId"`
	}
	json.Unmarshal(res["task"], &root)
	if root.ProjectID != pid {
		t.Errorf("projectId корня: %d", root.ProjectID)
	}

	// ребёнок с датой наследует проект
	code, res = call(t, "POST", srv.URL+"/api/tasks", map[string]any{
		"title": "CI", "parentId": root.ID, "scheduledOn": "2026-07-22",
	})
	if code != 201 {
		t.Fatalf("POST ребёнка: %d %s", code, res["error"])
	}
	var child struct {
		ID          int64  `json:"id"`
		ProjectID   int64  `json:"projectId"`
		ScheduledOn string `json:"scheduledOn"`
		DayPosition int    `json:"dayPosition"`
	}
	json.Unmarshal(res["task"], &child)
	if child.ProjectID != pid || child.ScheduledOn != "2026-07-22" || child.DayPosition != 0 {
		t.Errorf("ребёнок: %+v", child)
	}

	// каскад через http: done ребёнка закрывает корень; в ответе оба
	code, res = call(t, "PATCH", fmt.Sprintf("%s/api/tasks/%d", srv.URL, child.ID), map[string]any{"done": true})
	if code != 200 {
		t.Fatalf("PATCH done: %d %s", code, res["error"])
	}
	var patched []struct {
		ID   int64 `json:"id"`
		Done bool  `json:"done"`
	}
	json.Unmarshal(res["tasks"], &patched)
	if len(patched) != 2 {
		t.Fatalf("каскад в ответе: %+v", patched)
	}
	for _, p := range patched {
		if !p.Done {
			t.Errorf("не done в каскаде: %+v", p)
		}
	}

	// создание нового ребёнка открывает предков; ответ содержит task+tasks
	code, res = call(t, "POST", srv.URL+"/api/tasks", map[string]any{"title": "ещё", "parentId": root.ID})
	if code != 201 {
		t.Fatalf("POST ещё: %d", code)
	}
	var affected []struct {
		ID   int64 `json:"id"`
		Done bool  `json:"done"`
	}
	json.Unmarshal(res["tasks"], &affected)
	foundRoot := false
	for _, a := range affected {
		if a.ID == root.ID {
			foundRoot = true
			if a.Done {
				t.Errorf("корень не открылся при создании")
			}
		}
	}
	if !foundRoot {
		t.Errorf("корень не в затронутых: %+v", affected)
	}

	// PATCH: снять дату (null значим)
	code, res = call(t, "PATCH", fmt.Sprintf("%s/api/tasks/%d", srv.URL, child.ID), map[string]any{"scheduledOn": nil})
	if code != 200 {
		t.Fatalf("PATCH: %d %s", code, res["error"])
	}

	// DELETE каскадом
	code, res = call(t, "DELETE", fmt.Sprintf("%s/api/tasks/%d", srv.URL, root.ID), nil)
	var deleted int
	json.Unmarshal(res["deleted"], &deleted)
	if code != 200 || deleted != 3 {
		t.Errorf("DELETE: %d, удалено %d", code, deleted)
	}
}

func TestErrors(t *testing.T) {
	srv := testServer(t)
	pid := mkProject(t, srv, "P")

	if code, _ := call(t, "POST", srv.URL+"/api/tasks", map[string]any{"title": "  ", "projectId": pid}); code != 422 {
		t.Errorf("пустой title: %d", code)
	}
	if code, _ := call(t, "POST", srv.URL+"/api/tasks", map[string]any{"title": "x"}); code != 422 {
		t.Errorf("корень без проекта: %d", code)
	}
	if code, _ := call(t, "POST", srv.URL+"/api/tasks", map[string]any{"title": "x", "projectId": 999}); code != 422 {
		t.Errorf("плохой проект: %d", code)
	}
	if code, _ := call(t, "POST", srv.URL+"/api/tasks", map[string]any{"title": "x", "projectId": pid, "scheduledOn": "2026-13-99"}); code != 422 {
		t.Errorf("битая дата: %d", code)
	}
	if code, _ := call(t, "PATCH", srv.URL+"/api/tasks/999", map[string]any{"done": true}); code != 404 {
		t.Errorf("PATCH несуществующей: %d", code)
	}
	if code, _ := call(t, "PATCH", srv.URL+"/api/tasks/abc", map[string]any{}); code != 400 {
		t.Errorf("кривой id: %d", code)
	}

	// цикл через http
	_, res := call(t, "POST", srv.URL+"/api/tasks", map[string]any{"title": "a", "projectId": pid})
	var a struct {
		ID int64 `json:"id"`
	}
	json.Unmarshal(res["task"], &a)
	_, res = call(t, "POST", srv.URL+"/api/tasks", map[string]any{"title": "b", "parentId": a.ID})
	var b struct {
		ID int64 `json:"id"`
	}
	json.Unmarshal(res["task"], &b)
	if code, _ := call(t, "PATCH", fmt.Sprintf("%s/api/tasks/%d", srv.URL, a.ID), map[string]any{"parentId": b.ID}); code != 422 {
		t.Errorf("цикл: %d", code)
	}
}
