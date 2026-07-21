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

func TestCRUDOverHTTP(t *testing.T) {
	srv := testServer(t)

	// создание корня
	code, res := call(t, "POST", srv.URL+"/api/tasks", map[string]any{"title": "Работа"})
	if code != 201 {
		t.Fatalf("POST: %d %s", code, res["error"])
	}
	var root struct {
		ID int64 `json:"id"`
	}
	json.Unmarshal(res["task"], &root)

	// ребёнок с датой
	code, res = call(t, "POST", srv.URL+"/api/tasks", map[string]any{
		"title": "CI", "parentId": root.ID, "scheduledOn": "2026-07-22",
	})
	if code != 201 {
		t.Fatalf("POST ребёнка: %d %s", code, res["error"])
	}
	var child struct {
		ID          int64  `json:"id"`
		ScheduledOn string `json:"scheduledOn"`
		DayPosition int    `json:"dayPosition"`
	}
	json.Unmarshal(res["task"], &child)
	if child.ScheduledOn != "2026-07-22" || child.DayPosition != 0 {
		t.Errorf("ребёнок: %+v", child)
	}

	// список
	code, res = call(t, "GET", srv.URL+"/api/tasks", nil)
	var list []json.RawMessage
	json.Unmarshal(res["tasks"], &list)
	if code != 200 || len(list) != 2 {
		t.Fatalf("GET: %d, %d задач", code, len(list))
	}

	// PATCH: снять дату (null значим)
	code, res = call(t, "PATCH", fmt.Sprintf("%s/api/tasks/%d", srv.URL, child.ID), map[string]any{"scheduledOn": nil})
	if code != 200 {
		t.Fatalf("PATCH: %d %s", code, res["error"])
	}
	var patched []struct {
		ID          int64   `json:"id"`
		ScheduledOn *string `json:"scheduledOn"`
		DayPosition *int    `json:"dayPosition"`
	}
	json.Unmarshal(res["tasks"], &patched)
	if len(patched) != 1 || patched[0].ScheduledOn != nil || patched[0].DayPosition != nil {
		t.Errorf("после снятия даты: %+v", patched)
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

	if code, _ := call(t, "POST", srv.URL+"/api/tasks", map[string]any{"title": "  "}); code != 422 {
		t.Errorf("пустой title: %d", code)
	}
	if code, _ := call(t, "POST", srv.URL+"/api/tasks", map[string]any{"title": "x", "scheduledOn": "2026-13-99"}); code != 422 {
		t.Errorf("битая дата: %d", code)
	}
	if code, _ := call(t, "POST", srv.URL+"/api/tasks", map[string]any{"title": "x", "parentId": 999}); code != 422 {
		t.Errorf("плохой родитель: %d", code)
	}
	if code, _ := call(t, "PATCH", srv.URL+"/api/tasks/999", map[string]any{"done": true}); code != 404 {
		t.Errorf("PATCH несуществующей: %d", code)
	}
	if code, _ := call(t, "DELETE", srv.URL+"/api/tasks/999", nil); code != 404 {
		t.Errorf("DELETE несуществующей: %d", code)
	}
	if code, _ := call(t, "PATCH", srv.URL+"/api/tasks/abc", map[string]any{}); code != 400 {
		t.Errorf("кривой id: %d", code)
	}

	// цикл через http
	_, res := call(t, "POST", srv.URL+"/api/tasks", map[string]any{"title": "a"})
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
