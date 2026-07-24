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

	// удаление с задачами — 422; после удаления задач — ок
	_, res = call(t, "POST", srv.URL+"/api/tasks", map[string]any{"title": "a", "projectId": pid})
	var created struct {
		ID int64 `json:"id"`
	}
	json.Unmarshal(res["task"], &created)
	if code, _ := call(t, "DELETE", fmt.Sprintf("%s/api/projects/%d", srv.URL, pid), nil); code != 422 {
		t.Errorf("DELETE непустого: %d", code)
	}
	call(t, "DELETE", fmt.Sprintf("%s/api/tasks/%d", srv.URL, created.ID), nil)
	if code, _ := call(t, "DELETE", fmt.Sprintf("%s/api/projects/%d", srv.URL, pid), nil); code != 200 {
		t.Errorf("DELETE пустого: %d", code)
	}

	// вложенный проект + архивация рекурсивно
	rootID := mkProject(t, srv, "Корень")
	code, res = call(t, "POST", srv.URL+"/api/projects", map[string]any{"name": "Дитя", "color": "#8fb56b", "parentId": rootID})
	if code != 201 {
		t.Fatalf("вложенный проект: %d %s", code, res["error"])
	}
	code, res = call(t, "PATCH", fmt.Sprintf("%s/api/projects/%d", srv.URL, rootID), map[string]any{"archived": true})
	if code != 200 {
		t.Fatalf("архивация: %d %s", code, res["error"])
	}
	var archived []struct {
		Archived bool `json:"archived"`
	}
	json.Unmarshal(res["projects"], &archived)
	if len(archived) != 2 || !archived[0].Archived || !archived[1].Archived {
		t.Errorf("рекурсивная архивация: %+v", archived)
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

	// v4: каскада нет — done ребёнка не трогает корень
	code, res = call(t, "PATCH", fmt.Sprintf("%s/api/tasks/%d", srv.URL, child.ID), map[string]any{"done": true})
	if code != 200 {
		t.Fatalf("PATCH done: %d %s", code, res["error"])
	}
	var patched []struct {
		ID   int64 `json:"id"`
		Done bool  `json:"done"`
	}
	json.Unmarshal(res["tasks"], &patched)
	if len(patched) != 1 || patched[0].ID != child.ID {
		t.Fatalf("в ответе должен быть только сам ребёнок: %+v", patched)
	}

	// перенос задачи в другой проект через projectId
	pid2 := mkProject(t, srv, "Второй")
	code, res = call(t, "PATCH", fmt.Sprintf("%s/api/tasks/%d", srv.URL, child.ID), map[string]any{"projectId": pid2})
	if code != 200 {
		t.Fatalf("перенос projectId: %d %s", code, res["error"])
	}
	var moved []struct {
		ID        int64  `json:"id"`
		ProjectID int64  `json:"projectId"`
		ParentID  *int64 `json:"parentId"`
	}
	json.Unmarshal(res["tasks"], &moved)
	ok := false
	for _, m := range moved {
		if m.ID == child.ID && m.ProjectID == pid2 && m.ParentID == nil {
			ok = true
		}
	}
	if !ok {
		t.Errorf("перенос не сработал: %+v", moved)
	}
	// вернём обратно под корень для теста DELETE ниже
	call(t, "PATCH", fmt.Sprintf("%s/api/tasks/%d", srv.URL, child.ID), map[string]any{"parentId": root.ID})

	// PATCH: снять дату (null значим)
	code, res = call(t, "PATCH", fmt.Sprintf("%s/api/tasks/%d", srv.URL, child.ID), map[string]any{"scheduledOn": nil})
	if code != 200 {
		t.Fatalf("PATCH: %d %s", code, res["error"])
	}

	// DELETE каскадом
	code, res = call(t, "DELETE", fmt.Sprintf("%s/api/tasks/%d", srv.URL, root.ID), nil)
	var deleted int
	json.Unmarshal(res["deleted"], &deleted)
	if code != 200 || deleted != 2 {
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

// Полный HTTP-цикл привязок заметка↔задача: create/дубль(422)/несущ.(404),
// список, скрытие после удаления задачи, снятие связи.
func TestTaskNotesOverHTTP(t *testing.T) {
	srv := testServer(t)
	pid := mkProject(t, srv, "Работа")

	code, res := call(t, "POST", srv.URL+"/api/tasks", map[string]any{"title": "Задача", "projectId": pid})
	if code != 201 {
		t.Fatalf("POST task: %d %s", code, res["error"])
	}
	var task struct {
		ID int64 `json:"id"`
	}
	json.Unmarshal(res["task"], &task)

	code, res = call(t, "POST", srv.URL+"/api/notes", map[string]any{"title": "Заметка"})
	if code != 201 {
		t.Fatalf("POST note: %d %s", code, res["error"])
	}
	var note struct {
		ID int64 `json:"id"`
	}
	json.Unmarshal(res["note"], &note)

	// привязать
	code, res = call(t, "POST", srv.URL+"/api/task-notes", map[string]any{"taskId": task.ID, "noteId": note.ID})
	if code != 201 {
		t.Fatalf("POST task-note: %d %s", code, res["error"])
	}
	var tn struct {
		ID        int64 `json:"id"`
		LogicalID int64 `json:"logicalId"`
		NoteID    int64 `json:"noteId"`
	}
	json.Unmarshal(res["taskNote"], &tn)
	// привязка живёт на логическом id (у разовой задачи = её id)
	if tn.LogicalID != task.ID || tn.NoteID != note.ID {
		t.Errorf("тело привязки: %+v", tn)
	}

	// дубль пары → 422, несуществующая заметка → 404
	if code, _ := call(t, "POST", srv.URL+"/api/task-notes", map[string]any{"taskId": task.ID, "noteId": note.ID}); code != 422 {
		t.Errorf("дубль: %d", code)
	}
	if code, _ := call(t, "POST", srv.URL+"/api/task-notes", map[string]any{"taskId": task.ID, "noteId": int64(9999)}); code != 404 {
		t.Errorf("несущ. заметка: %d", code)
	}

	// список — одна привязка
	code, res = call(t, "GET", srv.URL+"/api/task-notes", nil)
	var list []struct {
		ID int64 `json:"id"`
	}
	json.Unmarshal(res["taskNotes"], &list)
	if code != 200 || len(list) != 1 {
		t.Fatalf("GET: %d, привязок %d", code, len(list))
	}

	// удаление задачи скрывает связь из списка
	if code, _ := call(t, "DELETE", fmt.Sprintf("%s/api/tasks/%d", srv.URL, task.ID), nil); code != 200 {
		t.Fatalf("DELETE task: %d", code)
	}
	code, res = call(t, "GET", srv.URL+"/api/task-notes", nil)
	list = nil
	json.Unmarshal(res["taskNotes"], &list)
	if code != 200 || len(list) != 0 {
		t.Errorf("после удаления задачи: %d, привязок %d", code, len(list))
	}

	// снять связь; повторно → 404
	if code, _ := call(t, "DELETE", fmt.Sprintf("%s/api/task-notes/%d", srv.URL, tn.ID), nil); code != 200 {
		t.Errorf("DELETE link: %d", code)
	}
	if code, _ := call(t, "DELETE", fmt.Sprintf("%s/api/task-notes/%d", srv.URL, tn.ID), nil); code != 404 {
		t.Errorf("повторный DELETE: %d", code)
	}
}
