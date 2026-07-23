// Интеграционные сценарии: настоящий HTTP-хендлер поверх файловой SQLite
// с прод-прагмами (WAL, busy_timeout, FK) и полными миграциями. База —
// во временном каталоге теста, Go удаляет его сам после прогона.
package integration

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"workspace/internal/api"
	"workspace/internal/store"
)

type task struct {
	ID          int64   `json:"id"`
	ParentID    *int64  `json:"parentId"`
	Title       string  `json:"title"`
	Done        bool    `json:"done"`
	ScheduledOn *string `json:"scheduledOn"`
	SoftDueOn   *string `json:"softDueOn"`
	DueOn       *string `json:"dueOn"`
	SeriesID    *int64  `json:"seriesId"`
	Repeat      *struct {
		Kind string `json:"kind"`
		Days []int  `json:"days"`
	} `json:"repeat"`
}

type env struct {
	t   *testing.T
	srv *httptest.Server
}

func newEnv(t *testing.T) env {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "workspace.db"))
	if err != nil {
		t.Fatalf("открытие файловой базы: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	srv := httptest.NewServer(api.Handler(db))
	t.Cleanup(srv.Close)
	return env{t: t, srv: srv}
}

func (e env) do(method, path string, body any) (*http.Response, []byte) {
	e.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			e.t.Fatal(err)
		}
	}
	req, err := http.NewRequest(method, e.srv.URL+path, &buf)
	if err != nil {
		e.t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatalf("%s %s: %v", method, path, err)
	}
	defer res.Body.Close()
	var out bytes.Buffer
	if _, err := out.ReadFrom(res.Body); err != nil {
		e.t.Fatal(err)
	}
	return res, out.Bytes()
}

func (e env) must(method, path string, body any, want int) []byte {
	e.t.Helper()
	res, b := e.do(method, path, body)
	if res.StatusCode != want {
		e.t.Fatalf("%s %s: статус %d, ждал %d; тело: %s", method, path, res.StatusCode, want, b)
	}
	return b
}

func (e env) project(name string) int64 {
	b := e.must("POST", "/api/projects", map[string]any{"name": name, "color": "#c9a96a"}, 201)
	var out struct {
		Project struct {
			ID int64 `json:"id"`
		} `json:"project"`
	}
	if err := json.Unmarshal(b, &out); err != nil {
		e.t.Fatal(err)
	}
	return out.Project.ID
}

func (e env) createTask(body map[string]any) task {
	b := e.must("POST", "/api/tasks", body, 201)
	var out struct {
		Task task `json:"task"`
	}
	if err := json.Unmarshal(b, &out); err != nil {
		e.t.Fatal(err)
	}
	return out.Task
}

func (e env) tasks() []task {
	b := e.must("GET", "/api/tasks", nil, 200)
	var out struct {
		Tasks []task `json:"tasks"`
	}
	if err := json.Unmarshal(b, &out); err != nil {
		e.t.Fatal(err)
	}
	return out.Tasks
}

func (e env) patch(id int64, body map[string]any, want int) {
	e.t.Helper()
	e.must("PATCH", fmt.Sprintf("/api/tasks/%d", id), body, want)
}

func onDate(list []task, title, date string) []task {
	var out []task
	for _, x := range list {
		if x.Title == title && x.ScheduledOn != nil && *x.ScheduledOn == date {
			out = append(out, x)
		}
	}
	return out
}

// Жизненный цикл серии: правило → done-спавн → перенос на день
// следующего вхождения (кейс пользователя: в этот день не должно
// оказаться двух задач) → серия продолжается дальше.
func TestSeriesLifecycle(t *testing.T) {
	e := newEnv(t)
	pid := e.project("Демо")
	// 2030-01-07 — понедельник; правило пн/ср
	m := e.createTask(map[string]any{"title": "планёрка", "projectId": pid, "scheduledOn": "2030-01-07"})
	e.patch(m.ID, map[string]any{"repeat": map[string]any{"kind": "weekly", "days": []int{1, 3}}}, 200)

	// done: спавн на ср 09, правило и series_id переезжают
	e.patch(m.ID, map[string]any{"done": true}, 200)
	all := e.tasks()
	if len(all) != 2 {
		t.Fatalf("после done: %d задач, ждал 2", len(all))
	}
	spawned := onDate(all, "планёрка", "2030-01-09")
	if len(spawned) != 1 || spawned[0].Repeat == nil || spawned[0].SeriesID == nil || *spawned[0].SeriesID != m.ID {
		t.Fatalf("спавн после done: %+v", spawned)
	}

	// перенос (вперёд и назад) НИЧЕГО не создаёт: правило остаётся у
	// задачи, всего задач по-прежнему две (done + живая)
	for _, day := range []string{"2030-01-14", "2030-01-02", "2030-01-16"} {
		e.patch(spawned[0].ID, map[string]any{"scheduledOn": day}, 200)
		all = e.tasks()
		if len(all) != 2 {
			t.Fatalf("после переноса на %s: %d задач, ждал 2", day, len(all))
		}
		live := onDate(all, "планёрка", day)
		if len(live) != 1 || live[0].Repeat == nil || live[0].SeriesID == nil {
			t.Fatalf("после переноса на %s: %+v", day, live)
		}
	}
}

// Мягкое удаление сквозь HTTP: каскад, невидимость в списках, правило
// «проект удаляется только пустой» по живым задачам.
func TestSoftDeleteFlow(t *testing.T) {
	e := newEnv(t)
	pid := e.project("Демо")
	root := e.createTask(map[string]any{"title": "корень", "projectId": pid})
	e.createTask(map[string]any{"title": "дитя", "parentId": root.ID})

	res, b := e.do("DELETE", fmt.Sprintf("/api/projects/%d", pid), nil)
	if res.StatusCode != 422 {
		t.Fatalf("удаление непустого проекта: %d %s", res.StatusCode, b)
	}
	var del struct {
		Deleted int `json:"deleted"`
	}
	if err := json.Unmarshal(e.must("DELETE", fmt.Sprintf("/api/tasks/%d", root.ID), nil, 200), &del); err != nil {
		t.Fatal(err)
	}
	if del.Deleted != 2 {
		t.Errorf("каскад пометил %d, ждал 2", del.Deleted)
	}
	if got := e.tasks(); len(got) != 0 {
		t.Errorf("после удаления в списке: %+v", got)
	}
	e.must("DELETE", fmt.Sprintf("/api/projects/%d", pid), nil, 200)
	// PATCH по удалённой — 404
	e.patch(root.ID, map[string]any{"title": "зомби"}, 404)
}

// Инварианты дат сквозь HTTP: план ≤ мягкий ≤ жёсткий, диапазон одним
// запросом, повтор несовместим с диапазоном.
func TestDateInvariants(t *testing.T) {
	e := newEnv(t)
	pid := e.project("Демо")
	a := e.createTask(map[string]any{"title": "а", "projectId": pid, "scheduledOn": "2030-01-07"})

	e.patch(a.ID, map[string]any{"softDueOn": "2030-01-10", "dueOn": "2030-01-09"}, 422)
	e.patch(a.ID, map[string]any{"softDueOn": "2030-01-09", "dueOn": "2030-01-10"}, 200)
	// перенос плана позже мягкого — 422
	e.patch(a.ID, map[string]any{"scheduledOn": "2030-01-11"}, 422)
	// диапазон одним запросом — 200; конец раньше начала — 422
	e.patch(a.ID, map[string]any{"scheduledOn": "2030-01-07", "endOn": "2030-01-09"}, 200)
	e.patch(a.ID, map[string]any{"endOn": "2030-01-01"}, 422)
	// повтор на диапазонной — 422
	e.patch(a.ID, map[string]any{"repeat": map[string]any{"kind": "weekly", "days": []int{1}}}, 422)
}

type linkType struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	ReverseName string `json:"reverseName"`
	Directed    bool   `json:"directed"`
}

// Связи задач сквозь HTTP: сиды типов, создание связи, дубль/самосвязь,
// исчезновение при soft-delete задачи.
func TestTaskLinksFlow(t *testing.T) {
	e := newEnv(t)
	pid := e.project("Демо")
	a := e.createTask(map[string]any{"title": "A", "projectId": pid})
	b := e.createTask(map[string]any{"title": "B", "projectId": pid})

	// сиды типов связей
	var lt struct {
		LinkTypes []linkType `json:"linkTypes"`
	}
	if err := json.Unmarshal(e.must("GET", "/api/link-types", nil, 200), &lt); err != nil {
		t.Fatal(err)
	}
	if len(lt.LinkTypes) != 3 || lt.LinkTypes[0].Name != "порождает" {
		t.Fatalf("сиды типов связей: %+v", lt.LinkTypes)
	}
	blocks := lt.LinkTypes[1].ID // «блокирует»

	// A блокирует B
	e.must("POST", "/api/task-links", map[string]any{"fromId": a.ID, "toId": b.ID, "typeId": blocks}, 201)
	// самосвязь — 422
	if res, _ := e.do("POST", "/api/task-links", map[string]any{"fromId": a.ID, "toId": a.ID, "typeId": blocks}); res.StatusCode != 422 {
		t.Errorf("самосвязь: %d", res.StatusCode)
	}
	// дубль — 422
	if res, _ := e.do("POST", "/api/task-links", map[string]any{"fromId": a.ID, "toId": b.ID, "typeId": blocks}); res.StatusCode != 422 {
		t.Errorf("дубль: %d", res.StatusCode)
	}
	// список связей — одна
	var tl struct {
		TaskLinks []struct {
			ID     int64 `json:"id"`
			FromID int64 `json:"fromId"`
			ToID   int64 `json:"toId"`
		} `json:"taskLinks"`
	}
	if err := json.Unmarshal(e.must("GET", "/api/task-links", nil, 200), &tl); err != nil {
		t.Fatal(err)
	}
	if len(tl.TaskLinks) != 1 {
		t.Fatalf("связей %d, ждал 1", len(tl.TaskLinks))
	}
	// soft-delete B — связь исчезает
	e.must("DELETE", fmt.Sprintf("/api/tasks/%d", b.ID), nil, 200)
	if err := json.Unmarshal(e.must("GET", "/api/task-links", nil, 200), &tl); err != nil {
		t.Fatal(err)
	}
	if len(tl.TaskLinks) != 0 {
		t.Errorf("связь удалённой задачи видна: %+v", tl.TaskLinks)
	}
}
