package store

import (
	"database/sql"
	"errors"
	"testing"
)

type env struct {
	db  *sql.DB
	pid int64 // дефолтный проект для задач теста
}

func openTest(t *testing.T) env {
	t.Helper()
	db, err := Open(":memory:")
	if err != nil {
		t.Fatalf("открытие тестовой базы: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	p, err := CreateProject(db, "Тестовый", "#c9a96a", nil)
	if err != nil {
		t.Fatalf("создание проекта: %v", err)
	}
	return env{db: db, pid: p.ID}
}

func (e env) mk(t *testing.T, title string, parent *int64, day *string) Task {
	t.Helper()
	req := CreateReq{Title: title, ParentID: parent, ScheduledOn: day}
	if parent == nil {
		req.ProjectID = &e.pid
	}
	task, _, err := CreateTask(e.db, req)
	if err != nil {
		t.Fatalf("создание %q: %v", title, err)
	}
	return task
}

func (e env) get(t *testing.T, id int64) Task {
	t.Helper()
	all, err := ListTasks(e.db)
	if err != nil {
		t.Fatalf("список: %v", err)
	}
	for _, task := range all {
		if task.ID == id {
			return task
		}
	}
	t.Fatalf("задача %d не найдена", id)
	return Task{}
}

func TestCreate(t *testing.T) {
	e := openTest(t)

	r1 := e.mk(t, "Работа", nil, nil)
	r2 := e.mk(t, "Быт", nil, nil)
	if r1.Position != 0 || r2.Position != 1 {
		t.Errorf("позиции корней: %d, %d; ждали 0, 1", r1.Position, r2.Position)
	}
	if r1.ProjectID != e.pid {
		t.Errorf("проект корня: %d; ждали %d", r1.ProjectID, e.pid)
	}

	c1 := e.mk(t, "CI", &r1.ID, nil)
	c2 := e.mk(t, "Дока", &r1.ID, nil)
	if c1.Position != 0 || c2.Position != 1 {
		t.Errorf("позиции детей: %d, %d; ждали 0, 1", c1.Position, c2.Position)
	}
	if c1.ProjectID != e.pid {
		t.Errorf("ребёнок не унаследовал проект: %d", c1.ProjectID)
	}

	d1 := e.mk(t, "На вторник", nil, new("2026-07-22"))
	d2 := e.mk(t, "Тоже вторник", nil, new("2026-07-22"))
	if d1.DayPosition == nil || *d1.DayPosition != 0 || d2.DayPosition == nil || *d2.DayPosition != 1 {
		t.Errorf("day_position: %v, %v; ждали 0, 1", d1.DayPosition, d2.DayPosition)
	}

	if _, _, err := CreateTask(e.db, CreateReq{Title: "   ", ProjectID: &e.pid}); !errors.Is(err, ErrValidation) {
		t.Errorf("пустой title: ждали ErrValidation, получили %v", err)
	}
	if _, _, err := CreateTask(e.db, CreateReq{Title: "x", ParentID: new(int64(9999))}); !errors.Is(err, ErrBadParent) {
		t.Errorf("несуществующий родитель: ждали ErrBadParent, получили %v", err)
	}
	if _, _, err := CreateTask(e.db, CreateReq{Title: "x", ProjectID: &e.pid, ScheduledOn: new("2026-13-99")}); !errors.Is(err, ErrValidation) {
		t.Errorf("битая дата: ждали ErrValidation, получили %v", err)
	}
	if _, _, err := CreateTask(e.db, CreateReq{Title: "x"}); !errors.Is(err, ErrValidation) {
		t.Errorf("корень без проекта: ждали ErrValidation, получили %v", err)
	}
	if _, _, err := CreateTask(e.db, CreateReq{Title: "x", ProjectID: new(int64(9999))}); !errors.Is(err, ErrBadProject) {
		t.Errorf("несуществующий проект: ждали ErrBadProject, получили %v", err)
	}
}

func TestCycleGuard(t *testing.T) {
	e := openTest(t)
	a := e.mk(t, "a", nil, nil)
	b := e.mk(t, "b", &a.ID, nil)
	c := e.mk(t, "c", &b.ID, nil)

	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetParentID: true, ParentID: &c.ID}); !errors.Is(err, ErrCycle) {
		t.Errorf("перенос под потомка: ждали ErrCycle, получили %v", err)
	}
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetParentID: true, ParentID: &a.ID}); !errors.Is(err, ErrCycle) {
		t.Errorf("перенос под себя: ждали ErrCycle, получили %v", err)
	}
}

func TestReparentAndPositions(t *testing.T) {
	e := openTest(t)
	a := e.mk(t, "a", nil, nil)
	b := e.mk(t, "b", nil, nil)
	x := e.mk(t, "x", &a.ID, nil)
	y := e.mk(t, "y", &a.ID, nil)
	z := e.mk(t, "z", &a.ID, nil)
	w := e.mk(t, "w", &b.ID, nil)

	affected, err := UpdateTask(e.db, y.ID, UpdateReq{SetParentID: true, ParentID: &b.ID})
	if err != nil {
		t.Fatalf("reparent: %v", err)
	}
	ny := e.get(t, y.ID)
	if ny.ParentID == nil || *ny.ParentID != b.ID || ny.Position != 1 {
		t.Errorf("y после переноса: parent=%v pos=%d", ny.ParentID, ny.Position)
	}
	if nx, nz := e.get(t, x.ID), e.get(t, z.ID); nx.Position != 0 || nz.Position != 1 {
		t.Errorf("старые сиблинги: x=%d z=%d; ждали 0,1", nx.Position, nz.Position)
	}
	if nw := e.get(t, w.ID); nw.Position != 0 {
		t.Errorf("w сдвинулся: %d", nw.Position)
	}
	ids := map[int64]bool{}
	for _, task := range affected {
		ids[task.ID] = true
	}
	if !ids[y.ID] || !ids[z.ID] {
		t.Errorf("в затронутых нет y или z")
	}

	// в корень на позицию 0
	if _, err := UpdateTask(e.db, y.ID, UpdateReq{SetParentID: true, ParentID: nil, Position: new(0)}); err != nil {
		t.Fatalf("в корень: %v", err)
	}
	ny = e.get(t, y.ID)
	if ny.ParentID != nil || ny.Position != 0 {
		t.Errorf("y в корне: parent=%v pos=%d", ny.ParentID, ny.Position)
	}
	if na, nb := e.get(t, a.ID), e.get(t, b.ID); na.Position != 1 || nb.Position != 2 {
		t.Errorf("корни после вставки: a=%d b=%d; ждали 1,2", na.Position, nb.Position)
	}
}

func TestRootsScopedByProject(t *testing.T) {
	e := openTest(t)
	p2, err := CreateProject(e.db, "Другой", "#8fb56b", nil)
	if err != nil {
		t.Fatal(err)
	}
	r1 := e.mk(t, "r1", nil, nil)
	r2 := e.mk(t, "r2", nil, nil)
	q, _, err := CreateTask(e.db, CreateReq{Title: "q", ProjectID: &p2.ID})
	if err != nil {
		t.Fatal(err)
	}
	if q.Position != 0 {
		t.Errorf("корень второго проекта: pos=%d; ждали 0 (своя нумерация)", q.Position)
	}
	// перенос r2 на 0 не трогает корни чужого проекта
	if _, err := UpdateTask(e.db, r2.ID, UpdateReq{Position: new(0)}); err != nil {
		t.Fatal(err)
	}
	if nq := e.get(t, q.ID); nq.Position != 0 {
		t.Errorf("корень чужого проекта перенумерован: %d", nq.Position)
	}
	if nr1 := e.get(t, r1.ID); nr1.Position != 1 {
		t.Errorf("r1 после сдвига: %d; ждали 1", nr1.Position)
	}
}

// Каскад отключён (v4): done родителя и детей полностью независимы.
func TestNoAutoCascade(t *testing.T) {
	e := openTest(t)
	a := e.mk(t, "a", nil, nil)
	b := e.mk(t, "b", &a.ID, nil)
	c1 := e.mk(t, "c1", &b.ID, nil)
	c2 := e.mk(t, "c2", &b.ID, nil)

	// оба ребёнка done → родители НЕ закрываются
	if _, err := UpdateTask(e.db, c1.ID, UpdateReq{Done: new(true)}); err != nil {
		t.Fatal(err)
	}
	if _, err := UpdateTask(e.db, c2.ID, UpdateReq{Done: new(true)}); err != nil {
		t.Fatal(err)
	}
	if e.get(t, b.ID).Done || e.get(t, a.ID).Done {
		t.Errorf("авто-каскад вверх не должен срабатывать")
	}

	// ручное закрытие родителя, затем создание ребёнка — родитель НЕ открывается
	if _, err := UpdateTask(e.db, b.ID, UpdateReq{Done: new(true)}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := CreateTask(e.db, CreateReq{Title: "c3", ParentID: &b.ID}); err != nil {
		t.Fatal(err)
	}
	if !e.get(t, b.ID).Done {
		t.Errorf("создание ребёнка не должно снимать done родителя")
	}

	// снятие done ребёнка не трогает родителя
	if _, err := UpdateTask(e.db, c1.ID, UpdateReq{Done: new(false)}); err != nil {
		t.Fatal(err)
	}
	if !e.get(t, b.ID).Done {
		t.Errorf("uncheck ребёнка не должен открывать родителя")
	}
}

func TestManualParentDone(t *testing.T) {
	e := openTest(t)
	a := e.mk(t, "a", nil, nil)
	_ = e.mk(t, "b", &a.ID, nil)
	// ручная отметка родителя при несделанных детях — разрешена
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{Done: new(true)}); err != nil {
		t.Fatal(err)
	}
	if !e.get(t, a.ID).Done {
		t.Errorf("ручной done родителя не применился")
	}
}

func TestCrossProjectReparentRepaints(t *testing.T) {
	e := openTest(t)
	p2, err := CreateProject(e.db, "Другой", "#8fb56b", nil)
	if err != nil {
		t.Fatal(err)
	}
	a := e.mk(t, "a", nil, nil)
	b := e.mk(t, "b", &a.ID, nil)
	q, _, err := CreateTask(e.db, CreateReq{Title: "q", ProjectID: &p2.ID})
	if err != nil {
		t.Fatal(err)
	}
	// поддерево a уезжает под q → перекрашивается в p2
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetParentID: true, ParentID: &q.ID}); err != nil {
		t.Fatal(err)
	}
	if na, nb := e.get(t, a.ID), e.get(t, b.ID); na.ProjectID != p2.ID || nb.ProjectID != p2.ID {
		t.Errorf("поддерево не перекрашено: a=%d b=%d; ждали %d", na.ProjectID, nb.ProjectID, p2.ID)
	}
}

func TestScheduling(t *testing.T) {
	e := openTest(t)
	a := e.mk(t, "a", nil, new("2026-07-21"))
	b := e.mk(t, "b", nil, new("2026-07-21"))
	c := e.mk(t, "c", nil, nil)

	if _, err := UpdateTask(e.db, c.ID, UpdateReq{SetScheduledOn: true, ScheduledOn: new("2026-07-21")}); err != nil {
		t.Fatalf("назначение: %v", err)
	}
	if nc := e.get(t, c.ID); nc.DayPosition == nil || *nc.DayPosition != 2 {
		t.Errorf("c в конец дня: %v", nc.DayPosition)
	}

	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetScheduledOn: true, ScheduledOn: new("2026-07-22")}); err != nil {
		t.Fatalf("смена дня: %v", err)
	}
	na := e.get(t, a.ID)
	if *na.ScheduledOn != "2026-07-22" || *na.DayPosition != 0 {
		t.Errorf("a на новом дне: %v %v", *na.ScheduledOn, *na.DayPosition)
	}
	nb, nc := e.get(t, b.ID), e.get(t, c.ID)
	if *nb.DayPosition != 0 || *nc.DayPosition != 1 {
		t.Errorf("старый день уплотнён: b=%v c=%v", *nb.DayPosition, *nc.DayPosition)
	}

	if _, err := UpdateTask(e.db, b.ID, UpdateReq{SetScheduledOn: true, ScheduledOn: nil}); err != nil {
		t.Fatalf("снятие: %v", err)
	}
	if nb = e.get(t, b.ID); nb.ScheduledOn != nil || nb.DayPosition != nil {
		t.Errorf("после снятия: %v %v", nb.ScheduledOn, nb.DayPosition)
	}

	d := e.mk(t, "d", nil, new("2026-07-22"))
	if _, err := UpdateTask(e.db, d.ID, UpdateReq{DayPosition: new(0)}); err != nil {
		t.Fatalf("внутри дня: %v", err)
	}
	nd, na2 := e.get(t, d.ID), e.get(t, a.ID)
	if *nd.DayPosition != 0 || *na2.DayPosition != 1 {
		t.Errorf("порядок дня: d=%v a=%v", *nd.DayPosition, *na2.DayPosition)
	}
}

func TestDeleteCascade(t *testing.T) {
	e := openTest(t)
	a := e.mk(t, "a", nil, nil)
	b := e.mk(t, "b", &a.ID, nil)
	_ = e.mk(t, "c", &b.ID, nil)
	d := e.mk(t, "d", nil, nil)

	n, err := DeleteTask(e.db, a.ID)
	if err != nil {
		t.Fatalf("удаление: %v", err)
	}
	if n != 3 {
		t.Errorf("удалено %d; ждали 3", n)
	}
	all, _ := ListTasks(e.db)
	if len(all) != 1 || all[0].ID != d.ID {
		t.Errorf("осталось: %+v", all)
	}
	if _, err := DeleteTask(e.db, 9999); !errors.Is(err, ErrNotFound) {
		t.Errorf("удаление несуществующей: %v", err)
	}
}

func TestProjectsCRUD(t *testing.T) {
	e := openTest(t)

	p2, err := CreateProject(e.db, "Второй", "#8fb56b", nil)
	if err != nil {
		t.Fatal(err)
	}
	if p2.Position != 1 {
		t.Errorf("позиция второго проекта: %d; ждали 1", p2.Position)
	}
	if _, err := CreateProject(e.db, "  ", "#8fb56b", nil); !errors.Is(err, ErrValidation) {
		t.Errorf("пустое имя: %v", err)
	}
	if _, err := CreateProject(e.db, "x", "red", nil); !errors.Is(err, ErrValidation) {
		t.Errorf("кривой цвет: %v", err)
	}

	if _, err := UpdateProject(e.db, p2.ID, ProjectUpdate{Name: new("Переименован"), Color: new("#6a9bc9")}); err != nil {
		t.Fatal(err)
	}

	// перестановка p2 на 0 в scope корня
	if _, err := UpdateProject(e.db, p2.ID, ProjectUpdate{Position: new(0)}); err != nil {
		t.Fatal(err)
	}
	ps, _ := ListProjects(e.db)
	if ps[0].ID != p2.ID {
		t.Errorf("после move: %+v", ps)
	}

	// удаление: с задачами — запрещено
	_ = e.mk(t, "t1", nil, nil)
	if err := DeleteProject(e.db, e.pid); !errors.Is(err, ErrProjectNotEmpty) {
		t.Errorf("удаление с задачами: %v", err)
	}
	// пустой — удаляется
	if err := DeleteProject(e.db, p2.ID); err != nil {
		t.Errorf("удаление пустого: %v", err)
	}
	if err := DeleteProject(e.db, 9999); !errors.Is(err, ErrNotFound) {
		t.Errorf("удаление несуществующего: %v", err)
	}
}

func TestProjectTree(t *testing.T) {
	e := openTest(t)
	child, err := CreateProject(e.db, "Ребёнок", "#8fb56b", &e.pid)
	if err != nil {
		t.Fatal(err)
	}
	if child.ParentID == nil || *child.ParentID != e.pid || child.Position != 0 {
		t.Fatalf("вложенный проект: %+v", child)
	}
	// позиции в scope родителя: второй корень получает 1, не 2
	root2, err := CreateProject(e.db, "Корень2", "#6a9bc9", nil)
	if err != nil {
		t.Fatal(err)
	}
	if root2.Position != 1 {
		t.Errorf("позиция корня в своём scope: %d", root2.Position)
	}

	// цикл: родителя под собственного ребёнка нельзя
	if _, err := UpdateProject(e.db, e.pid, ProjectUpdate{SetParentID: true, ParentID: &child.ID}); !errors.Is(err, ErrCycle) {
		t.Errorf("цикл проектов: %v", err)
	}
	// удаление с под-проектами запрещено
	if err := DeleteProject(e.db, e.pid); !errors.Is(err, ErrProjectNotEmpty) {
		t.Errorf("удаление с под-проектами: %v", err)
	}
	// перенос ребёнка в корень
	if _, err := UpdateProject(e.db, child.ID, ProjectUpdate{SetParentID: true, ParentID: nil}); err != nil {
		t.Fatal(err)
	}
	ps, _ := ListProjects(e.db)
	for _, p := range ps {
		if p.ID == child.ID && p.ParentID != nil {
			t.Errorf("ребёнок не в корне: %+v", p)
		}
	}
}

func TestProjectArchive(t *testing.T) {
	e := openTest(t)
	child, err := CreateProject(e.db, "Ребёнок", "#8fb56b", &e.pid)
	if err != nil {
		t.Fatal(err)
	}

	// архивация рекурсивна вниз
	affected, err := UpdateProject(e.db, e.pid, ProjectUpdate{Archived: new(true)})
	if err != nil {
		t.Fatal(err)
	}
	if len(affected) != 2 {
		t.Errorf("затронуто %d; ждали 2", len(affected))
	}
	ps, _ := ListProjects(e.db)
	for _, p := range ps {
		if !p.Archived {
			t.Errorf("не архивирован: %+v", p)
		}
	}

	// запреты: создание задачи и проекта в архивном, перенос в архивный
	if _, _, err := CreateTask(e.db, CreateReq{Title: "x", ProjectID: &e.pid}); !errors.Is(err, ErrArchivedTarget) {
		t.Errorf("задача в архивный: %v", err)
	}
	if _, err := CreateProject(e.db, "x", "#8fb56b", &e.pid); !errors.Is(err, ErrArchivedTarget) {
		t.Errorf("проект в архивный: %v", err)
	}
	other, _ := CreateProject(e.db, "Живой", "#6a9bc9", nil)
	if _, err := UpdateProject(e.db, other.ID, ProjectUpdate{SetParentID: true, ParentID: &child.ID}); !errors.Is(err, ErrArchivedTarget) {
		t.Errorf("перенос проекта в архивный: %v", err)
	}
	task, _, err := CreateTask(e.db, CreateReq{Title: "жив", ProjectID: &other.ID})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := UpdateTask(e.db, task.ID, UpdateReq{SetProjectID: true, ProjectID: &e.pid}); !errors.Is(err, ErrArchivedTarget) {
		t.Errorf("перенос задачи в архивный: %v", err)
	}

	// разархивация рекурсивна
	if _, err := UpdateProject(e.db, e.pid, ProjectUpdate{Archived: new(false)}); err != nil {
		t.Fatal(err)
	}
	ps, _ = ListProjects(e.db)
	for _, p := range ps {
		if p.Archived {
			t.Errorf("остался архивным: %+v", p)
		}
	}
}

func TestTaskProjectTransfer(t *testing.T) {
	e := openTest(t)
	p2, err := CreateProject(e.db, "Другой", "#8fb56b", nil)
	if err != nil {
		t.Fatal(err)
	}
	existing, _, err := CreateTask(e.db, CreateReq{Title: "уже там", ProjectID: &p2.ID})
	if err != nil {
		t.Fatal(err)
	}
	_ = existing
	a := e.mk(t, "a", nil, nil)
	b := e.mk(t, "b", &a.ID, nil)
	sib := e.mk(t, "sib", nil, nil)

	// перенос поддерева a в корень p2
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetProjectID: true, ProjectID: &p2.ID}); err != nil {
		t.Fatal(err)
	}
	na, nb := e.get(t, a.ID), e.get(t, b.ID)
	if na.ProjectID != p2.ID || nb.ProjectID != p2.ID {
		t.Errorf("поддерево не перекрашено: %d %d", na.ProjectID, nb.ProjectID)
	}
	if na.ParentID != nil || na.Position != 1 {
		t.Errorf("a не в конце корней p2: parent=%v pos=%d", na.ParentID, na.Position)
	}
	// старые сиблинги уплотнились
	if ns := e.get(t, sib.ID); ns.Position != 0 {
		t.Errorf("старый сиблинг: %d", ns.Position)
	}
}

func TestDueBeforeScheduledForbidden(t *testing.T) {
	e := openTest(t)
	// create: дедлайн раньше плана — 422
	if _, _, err := CreateTask(e.db, CreateReq{Title: "x", ProjectID: &e.pid, ScheduledOn: new("2026-07-25"), DueOn: new("2026-07-24")}); !errors.Is(err, ErrValidation) {
		t.Errorf("create: %v", err)
	}
	a := e.mk(t, "a", nil, new("2026-07-25"))
	// patch: дедлайн раньше плана
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetDueOn: true, DueOn: new("2026-07-24")}); !errors.Is(err, ErrValidation) {
		t.Errorf("patch due: %v", err)
	}
	// дедлайн в тот же день — ок
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetDueOn: true, DueOn: new("2026-07-25")}); err != nil {
		t.Errorf("равные даты: %v", err)
	}
	// теперь перенос плана позже дедлайна — 422
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetScheduledOn: true, ScheduledOn: new("2026-07-26")}); !errors.Is(err, ErrValidation) {
		t.Errorf("patch scheduled: %v", err)
	}
}

func TestTaskDueOn(t *testing.T) {
	e := openTest(t)
	a := e.mk(t, "a", nil, nil)

	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetDueOn: true, DueOn: new("2026-07-25")}); err != nil {
		t.Fatalf("установка дедлайна: %v", err)
	}
	if na := e.get(t, a.ID); na.DueOn == nil || *na.DueOn != "2026-07-25" {
		t.Errorf("дедлайн не установился: %v", na.DueOn)
	}
	// дедлайн не трогает scheduled_on
	if na := e.get(t, a.ID); na.ScheduledOn != nil {
		t.Errorf("дедлайн задел план: %v", na.ScheduledOn)
	}
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetDueOn: true, DueOn: nil}); err != nil {
		t.Fatalf("снятие дедлайна: %v", err)
	}
	if na := e.get(t, a.ID); na.DueOn != nil {
		t.Errorf("дедлайн не снялся: %v", na.DueOn)
	}
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetDueOn: true, DueOn: new("2026-99-01")}); !errors.Is(err, ErrValidation) {
		t.Errorf("битый дедлайн: %v", err)
	}

	// создание сразу с дедлайном
	b, _, err := CreateTask(e.db, CreateReq{Title: "b", ProjectID: &e.pid, DueOn: new("2026-08-01")})
	if err != nil || b.DueOn == nil || *b.DueOn != "2026-08-01" {
		t.Errorf("создание с дедлайном: %v %v", err, b.DueOn)
	}
}

func TestProjectDates(t *testing.T) {
	e := openTest(t)

	if _, err := UpdateProject(e.db, e.pid, ProjectUpdate{SetStartOn: true, StartOn: new("2026-07-20"), SetDueOn: true, DueOn: new("2026-08-10")}); err != nil {
		t.Fatalf("даты проекта: %v", err)
	}
	ps, _ := ListProjects(e.db)
	if ps[0].StartOn == nil || *ps[0].StartOn != "2026-07-20" || ps[0].DueOn == nil || *ps[0].DueOn != "2026-08-10" {
		t.Errorf("даты не сохранились: %+v", ps[0])
	}

	// старт позже дедлайна — 422
	if _, err := UpdateProject(e.db, e.pid, ProjectUpdate{SetStartOn: true, StartOn: new("2026-09-01")}); !errors.Is(err, ErrValidation) {
		t.Errorf("start > due: ждали ErrValidation, получили %v", err)
	}
	// снятие дедлайна освобождает от проверки
	if _, err := UpdateProject(e.db, e.pid, ProjectUpdate{SetDueOn: true, DueOn: nil}); err != nil {
		t.Fatalf("снятие дедлайна: %v", err)
	}
	if _, err := UpdateProject(e.db, e.pid, ProjectUpdate{SetStartOn: true, StartOn: new("2026-09-01")}); err != nil {
		t.Errorf("start без due: %v", err)
	}
}

func TestEndOn(t *testing.T) {
	e := openTest(t)

	// диапазон без начала — 422
	if _, _, err := CreateTask(e.db, CreateReq{Title: "x", ProjectID: &e.pid, EndOn: new("2026-07-25")}); !errors.Is(err, ErrValidation) {
		t.Errorf("endOn без scheduledOn: %v", err)
	}
	// конец раньше начала — 422
	if _, _, err := CreateTask(e.db, CreateReq{Title: "x", ProjectID: &e.pid, ScheduledOn: new("2026-07-25"), EndOn: new("2026-07-24")}); !errors.Is(err, ErrValidation) {
		t.Errorf("endOn < scheduledOn: %v", err)
	}
	// нормальный диапазон
	a, _, err := CreateTask(e.db, CreateReq{Title: "span", ProjectID: &e.pid, ScheduledOn: new("2026-07-22"), EndOn: new("2026-07-24")})
	if err != nil || a.EndOn == nil || *a.EndOn != "2026-07-24" {
		t.Fatalf("создание диапазона: %v %+v", err, a)
	}
	// снятие плана обнуляет конец
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetScheduledOn: true, ScheduledOn: nil}); err != nil {
		t.Fatal(err)
	}
	if na := e.get(t, a.ID); na.ScheduledOn != nil || na.EndOn != nil {
		t.Errorf("endOn не обнулился при снятии плана: %+v", na)
	}
	// patch: конец раньше начала — 422
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetScheduledOn: true, ScheduledOn: new("2026-07-25")}); err != nil {
		t.Fatal(err)
	}
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetEndOn: true, EndOn: new("2026-07-24")}); !errors.Is(err, ErrValidation) {
		t.Errorf("patch endOn < scheduledOn: %v", err)
	}
	// сдвиг диапазона целиком (оба поля одним PATCH)
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetScheduledOn: true, ScheduledOn: new("2026-07-27"), SetEndOn: true, EndOn: new("2026-07-29")}); err != nil {
		t.Errorf("сдвиг диапазона: %v", err)
	}
}

func TestTypesAndPeople(t *testing.T) {
	e := openTest(t)

	tp, err := CreateType(e.db, "Разработка", "💻")
	if err != nil || tp.Position != 0 {
		t.Fatalf("создание типа: %v %+v", err, tp)
	}
	if _, err := CreateType(e.db, "  ", ""); !errors.Is(err, ErrValidation) {
		t.Errorf("пустой тип: %v", err)
	}
	p, err := CreatePerson(e.db, "Айдрус", "#8fb56b")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := CreatePerson(e.db, "x", "red"); !errors.Is(err, ErrValidation) {
		t.Errorf("кривой цвет: %v", err)
	}

	// назначение на задачу
	a := e.mk(t, "a", nil, nil)
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetTypeID: true, TypeID: &tp.ID, SetAssigneeID: true, AssigneeID: &p.ID}); err != nil {
		t.Fatal(err)
	}
	na := e.get(t, a.ID)
	if na.TypeID == nil || *na.TypeID != tp.ID || na.AssigneeID == nil || *na.AssigneeID != p.ID {
		t.Errorf("назначение: %+v", na)
	}
	// несуществующие ссылки
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetTypeID: true, TypeID: new(int64(999))}); !errors.Is(err, ErrBadType) {
		t.Errorf("плохой тип: %v", err)
	}
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetAssigneeID: true, AssigneeID: new(int64(999))}); !errors.Is(err, ErrBadPerson) {
		t.Errorf("плохой человек: %v", err)
	}

	// снятие null'ом
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetTypeID: true, TypeID: nil}); err != nil {
		t.Fatal(err)
	}
	if na := e.get(t, a.ID); na.TypeID != nil {
		t.Errorf("тип не снялся")
	}

	// удаление справочника снимает ссылки
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetTypeID: true, TypeID: &tp.ID}); err != nil {
		t.Fatal(err)
	}
	if err := DeleteType(e.db, tp.ID); err != nil {
		t.Fatal(err)
	}
	if na := e.get(t, a.ID); na.TypeID != nil {
		t.Errorf("после удаления типа ссылка осталась")
	}
	if err := DeletePerson(e.db, p.ID); err != nil {
		t.Fatal(err)
	}
	if na := e.get(t, a.ID); na.AssigneeID != nil {
		t.Errorf("после удаления человека исполнитель остался")
	}

	// rename
	tp2, _ := CreateType(e.db, "QA", "")
	if _, err := UpdateType(e.db, tp2.ID, TypeUpdate{Name: new("Тестирование")}); err != nil {
		t.Fatal(err)
	}
	types, _ := ListTypes(e.db)
	if len(types) != 1 || types[0].Name != "Тестирование" {
		t.Errorf("типы: %+v", types)
	}
}

func TestTypeReorder(t *testing.T) {
	e := openTest(t)
	if _, err := CreateType(e.db, "A", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := CreateType(e.db, "B", ""); err != nil {
		t.Fatal(err)
	}
	c, err := CreateType(e.db, "C", "")
	if err != nil {
		t.Fatal(err)
	}
	names := func() string {
		ts, _ := ListTypes(e.db)
		s := ""
		for _, x := range ts {
			s += x.Name
		}
		return s
	}
	if names() != "ABC" {
		t.Fatalf("исходный порядок по position: %s", names())
	}
	// перетащили C в начало
	if _, err := UpdateType(e.db, c.ID, TypeUpdate{Position: new(0)}); err != nil {
		t.Fatal(err)
	}
	if names() != "CAB" {
		t.Errorf("после reorder C→0: %s (ждал CAB)", names())
	}
}

func TestRolesAndMembers(t *testing.T) {
	e := openTest(t)

	// роли: create/rename/назначение человеку/удаление снимает
	role, err := CreateRole(e.db, "Backend")
	if err != nil {
		t.Fatal(err)
	}
	p, err := CreatePerson(e.db, "Пётр", "#8fb56b")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := UpdatePerson(e.db, p.ID, PersonUpdate{SetRoleID: true, RoleID: &role.ID}); err != nil {
		t.Fatal(err)
	}
	people, _ := ListPeople(e.db)
	if people[0].RoleID == nil || *people[0].RoleID != role.ID {
		t.Errorf("роль не назначилась: %+v", people[0])
	}
	if _, err := UpdateRole(e.db, role.ID, RoleUpdate{Name: new("Бэкенд")}); err != nil {
		t.Fatal(err)
	}
	if err := DeleteRole(e.db, role.ID); err != nil {
		t.Fatal(err)
	}
	people, _ = ListPeople(e.db)
	if people[0].RoleID != nil {
		t.Errorf("роль не снялась после удаления")
	}

	// участники проекта: replace, чистка при удалении человека
	p2, _ := CreatePerson(e.db, "Мария", "#6a9bc9")
	if err := SetProjectMembers(e.db, e.pid, []int64{p.ID, p2.ID}); err != nil {
		t.Fatal(err)
	}
	ms, _ := ListMembers(e.db)
	if len(ms) != 2 {
		t.Fatalf("участники: %+v", ms)
	}
	if err := SetProjectMembers(e.db, e.pid, []int64{p2.ID}); err != nil {
		t.Fatal(err)
	}
	ms, _ = ListMembers(e.db)
	if len(ms) != 1 || ms[0].PersonID != p2.ID {
		t.Errorf("replace не сработал: %+v", ms)
	}
	if err := DeletePerson(e.db, p2.ID); err != nil {
		t.Fatal(err)
	}
	ms, _ = ListMembers(e.db)
	if len(ms) != 0 {
		t.Errorf("членство не почистилось: %+v", ms)
	}
	// несуществующий человек в составе — ошибка
	if err := SetProjectMembers(e.db, e.pid, []int64{999}); !errors.Is(err, ErrBadPerson) {
		t.Errorf("плохой участник: %v", err)
	}

	// emoji типа
	tp, err := CreateType(e.db, "Встреча", "🤝")
	if err != nil || tp.Emoji != "🤝" {
		t.Fatalf("emoji при создании: %v %+v", err, tp)
	}
	if _, err := UpdateType(e.db, tp.ID, TypeUpdate{Emoji: new("📞")}); err != nil {
		t.Fatal(err)
	}
	types, _ := ListTypes(e.db)
	if types[0].Emoji != "📞" {
		t.Errorf("emoji не обновился: %+v", types[0])
	}
}

func TestRefReorder(t *testing.T) {
	e := openTest(t)
	a, _ := CreatePerson(e.db, "А", "#8fb56b")
	b, _ := CreatePerson(e.db, "Б", "#6a9bc9")
	c, _ := CreatePerson(e.db, "В", "#c9736a")
	_ = a
	_ = b
	// В → на позицию 0
	if _, err := UpdatePerson(e.db, c.ID, PersonUpdate{Position: new(0)}); err != nil {
		t.Fatal(err)
	}
	people, _ := ListPeople(e.db)
	if people[0].ID != c.ID || people[1].Position != 1 || people[2].Position != 2 {
		t.Errorf("порядок людей: %+v", people)
	}

	r1, _ := CreateRole(e.db, "X")
	r2, _ := CreateRole(e.db, "Y")
	if _, err := UpdateRole(e.db, r2.ID, RoleUpdate{Position: new(0)}); err != nil {
		t.Fatal(err)
	}
	roles, _ := ListRoles(e.db)
	if roles[0].ID != r2.ID || roles[1].ID != r1.ID {
		t.Errorf("порядок ролей: %+v", roles)
	}
}

func TestSoftDueInvariants(t *testing.T) {
	e := openTest(t)
	// create: мягкий позже жёсткого — 422
	if _, _, err := CreateTask(e.db, CreateReq{Title: "x", ProjectID: &e.pid, SoftDueOn: new("2026-07-26"), DueOn: new("2026-07-25")}); !errors.Is(err, ErrValidation) {
		t.Errorf("create soft>hard: %v", err)
	}
	// create: мягкий раньше плана — 422
	if _, _, err := CreateTask(e.db, CreateReq{Title: "x", ProjectID: &e.pid, ScheduledOn: new("2026-07-25"), SoftDueOn: new("2026-07-24")}); !errors.Is(err, ErrValidation) {
		t.Errorf("create soft<plan: %v", err)
	}
	// happy: план ≤ мягкий ≤ жёсткий
	a, _, err := CreateTask(e.db, CreateReq{Title: "a", ProjectID: &e.pid, ScheduledOn: new("2026-07-24"), SoftDueOn: new("2026-07-25"), DueOn: new("2026-07-26")})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if na := e.get(t, a.ID); na.SoftDueOn == nil || *na.SoftDueOn != "2026-07-25" {
		t.Errorf("мягкий не сохранился: %v", na.SoftDueOn)
	}
	// patch: жёсткий раньше мягкого — 422
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetDueOn: true, DueOn: new("2026-07-24")}); !errors.Is(err, ErrValidation) {
		t.Errorf("patch hard<soft: %v", err)
	}
	// patch: перенос плана позже мягкого — 422
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetScheduledOn: true, ScheduledOn: new("2026-07-26")}); !errors.Is(err, ErrValidation) {
		t.Errorf("patch plan>soft: %v", err)
	}
	// снятие мягкого — жёсткий остаётся
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetSoftDueOn: true, SoftDueOn: nil}); err != nil {
		t.Fatalf("снятие мягкого: %v", err)
	}
	if na := e.get(t, a.ID); na.SoftDueOn != nil || na.DueOn == nil {
		t.Errorf("после снятия: soft=%v hard=%v", na.SoftDueOn, na.DueOn)
	}
	// только мягкий, без жёсткого — валидно
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetDueOn: true, DueOn: nil}); err != nil {
		t.Fatal(err)
	}
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetSoftDueOn: true, SoftDueOn: new("2026-07-25")}); err != nil {
		t.Errorf("только мягкий: %v", err)
	}
}

// Даты повторов — в далёком будущем, чтобы max(дата, сегодня) был
// детерминирован и не зависел от реального «сегодня».
// 2030-01-07 — понедельник.
func repeatPtr(days ...int) *RepeatRule { return &RepeatRule{Kind: "weekly", Days: days} }

func TestNextOccurrence(t *testing.T) {
	cases := []struct {
		from string
		days []int
		want string
	}{
		{"2030-01-07", []int{1}, "2030-01-14"},    // строго после: тот же пн не считается
		{"2030-01-07", []int{1, 4}, "2030-01-10"}, // ближайший чт
		{"2030-01-06", []int{1, 4}, "2030-01-07"}, // с вс на пн
		{"2030-01-10", []int{1, 4}, "2030-01-14"}, // с чт на пн следующей недели
		{"2030-01-07", []int{7}, "2030-01-13"},    // воскресенье = 7
	}
	for _, c := range cases {
		if got := nextOccurrence(c.from, c.days); got != c.want {
			t.Errorf("nextOccurrence(%s,%v) = %s, want %s", c.from, c.days, got, c.want)
		}
	}
}

func TestRepeatValidation(t *testing.T) {
	e := openTest(t)
	a := e.mk(t, "a", nil, nil)
	// без даты плана — 422
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetRepeat: true, Repeat: repeatPtr(1)}); !errors.Is(err, ErrValidation) {
		t.Errorf("повтор без плана: %v", err)
	}
	// с диапазоном — 422
	b, _, err := CreateTask(e.db, CreateReq{Title: "b", ProjectID: &e.pid, ScheduledOn: new("2030-01-07"), EndOn: new("2030-01-09")})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := UpdateTask(e.db, b.ID, UpdateReq{SetRepeat: true, Repeat: repeatPtr(1)}); !errors.Is(err, ErrValidation) {
		t.Errorf("повтор с диапазоном: %v", err)
	}
	// кривые дни — 422
	c := e.mk(t, "c", nil, new("2030-01-07"))
	for _, days := range [][]int{{}, {0}, {8}, {1, 1}} {
		if _, err := UpdateTask(e.db, c.ID, UpdateReq{SetRepeat: true, Repeat: repeatPtr(days...)}); !errors.Is(err, ErrValidation) {
			t.Errorf("дни %v: %v", days, err)
		}
	}
	// валидная установка: дни нормализуются сортировкой
	if _, err := UpdateTask(e.db, c.ID, UpdateReq{SetRepeat: true, Repeat: repeatPtr(4, 1)}); err != nil {
		t.Fatal(err)
	}
	if nc := e.get(t, c.ID); nc.Repeat == nil || *nc.Repeat != `{"kind":"weekly","days":[1,4]}` {
		t.Errorf("правило: %v", nc.Repeat)
	}
	// снятие даты у повторяющейся — 422 (сначала снять повтор)
	if _, err := UpdateTask(e.db, c.ID, UpdateReq{SetScheduledOn: true}); !errors.Is(err, ErrValidation) {
		t.Errorf("снятие даты: %v", err)
	}
	// снятие повтора
	if _, err := UpdateTask(e.db, c.ID, UpdateReq{SetRepeat: true}); err != nil {
		t.Fatal(err)
	}
	if nc := e.get(t, c.ID); nc.Repeat != nil {
		t.Errorf("повтор не снялся: %v", *nc.Repeat)
	}
}

func TestRepeatDoneSpawnsNext(t *testing.T) {
	e := openTest(t)
	typ, err := CreateType(e.db, "Встреча", "🤝")
	if err != nil {
		t.Fatal(err)
	}
	person, err := CreatePerson(e.db, "Оля", "#8fb56b")
	if err != nil {
		t.Fatal(err)
	}
	m, _, err := CreateTask(e.db, CreateReq{Title: "Планёрка", Description: "агенда в вики", ProjectID: &e.pid, ScheduledOn: new("2030-01-07"), TypeID: &typ.ID, AssigneeID: &person.ID})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := UpdateTask(e.db, m.ID, UpdateReq{SetRepeat: true, Repeat: repeatPtr(1, 4)}); err != nil {
		t.Fatal(err)
	}
	// подзадачи-агенда: одна уже done
	s1 := e.mk(t, "статусы", &m.ID, nil)
	s2 := e.mk(t, "блокеры", &m.ID, nil)
	if _, err := UpdateTask(e.db, s1.ID, UpdateReq{Done: new(true)}); err != nil {
		t.Fatal(err)
	}

	before, _ := ListTasks(e.db)
	out, err := UpdateTask(e.db, m.ID, UpdateReq{Done: new(true)})
	if err != nil {
		t.Fatal(err)
	}
	after, _ := ListTasks(e.db)
	if len(after) != len(before)+3 {
		t.Fatalf("ожидал +3 задачи (копия+2 подзадачи), было %d стало %d", len(before), len(after))
	}
	// старая: done, правило снято
	if om := e.get(t, m.ID); !om.Done || om.Repeat != nil {
		t.Errorf("старая: done=%v repeat=%v", om.Done, om.Repeat)
	}
	// новая: всё перенесено, дата — ближайший чт
	var spawned *Task
	for i := range out {
		if out[i].ID != m.ID && out[i].ParentID == nil && out[i].Title == "Планёрка" {
			spawned = &out[i]
		}
	}
	if spawned == nil {
		t.Fatal("копия не найдена в ответе")
	}
	if spawned.Description != "агенда в вики" || spawned.TypeID == nil || *spawned.TypeID != typ.ID || spawned.AssigneeID == nil || *spawned.AssigneeID != person.ID {
		t.Errorf("поля не перенесены: %+v", spawned)
	}
	if spawned.ScheduledOn == nil || *spawned.ScheduledOn != "2030-01-10" {
		t.Errorf("дата копии: %v", spawned.ScheduledOn)
	}
	if spawned.Repeat == nil || *spawned.Repeat != `{"kind":"weekly","days":[1,4]}` {
		t.Errorf("правило не переехало: %v", spawned.Repeat)
	}
	if spawned.Done || spawned.DueOn != nil || spawned.EndOn != nil {
		t.Errorf("копия: done=%v due=%v end=%v", spawned.Done, spawned.DueOn, spawned.EndOn)
	}
	// подзадачи скопированы со сброшенным done и без дат
	kids := 0
	for _, x := range after {
		if x.ParentID != nil && *x.ParentID == spawned.ID {
			kids++
			if x.Done || x.ScheduledOn != nil {
				t.Errorf("подзадача копии: %+v", x)
			}
		}
	}
	if kids != 2 {
		t.Errorf("подзадач у копии %d, ждал 2", kids)
	}
	// идемпотентность: повторный done=true не спавнит
	if _, err := UpdateTask(e.db, m.ID, UpdateReq{Done: new(true)}); err != nil {
		t.Fatal(err)
	}
	// снятие done не спавнит и не возвращает правило
	if _, err := UpdateTask(e.db, m.ID, UpdateReq{Done: new(false)}); err != nil {
		t.Fatal(err)
	}
	final, _ := ListTasks(e.db)
	if len(final) != len(after) {
		t.Errorf("дубли: было %d стало %d", len(after), len(final))
	}
	_ = s2
}

func TestRepeatMoveNeverSpawns(t *testing.T) {
	e := openTest(t)
	m := e.mk(t, "синк", nil, new("2030-01-14")) // пн; правило пн/чт
	if _, err := UpdateTask(e.db, m.ID, UpdateReq{SetRepeat: true, Repeat: repeatPtr(1, 4)}); err != nil {
		t.Fatal(err)
	}
	// перенос вперёд, назад, на день правила, на чужой день — задача
	// всегда одна, правило всегда при ней
	for _, day := range []string{"2030-01-15", "2030-01-10", "2030-01-17", "2030-01-21"} {
		if _, err := UpdateTask(e.db, m.ID, UpdateReq{SetScheduledOn: true, ScheduledOn: new(day)}); err != nil {
			t.Fatalf("перенос на %s: %v", day, err)
		}
		all, _ := ListTasks(e.db)
		if len(all) != 1 {
			t.Fatalf("после переноса на %s: %d задач, ждал 1", day, len(all))
		}
		nm := e.get(t, m.ID)
		if nm.Repeat == nil || *nm.ScheduledOn != day || nm.Done {
			t.Fatalf("после переноса на %s: %+v", day, nm)
		}
	}
}

func TestRepeatDoneSpawnSkipsOccupiedDay(t *testing.T) {
	e := openTest(t)
	// legacy-данные: в серии может быть вторая живая задача (дубли
	// старых версий) — done-спавн не должен вставать на её день.
	// правило пн/ср, живая пн 07; вторая живая руками на ср 09
	m := e.mk(t, "планёрка", nil, new("2030-01-07"))
	if _, err := UpdateTask(e.db, m.ID, UpdateReq{SetRepeat: true, Repeat: repeatPtr(1, 3)}); err != nil {
		t.Fatal(err)
	}
	other := e.mk(t, "планёрка (дубль)", nil, new("2030-01-09"))
	if _, err := e.db.Exec(`UPDATE tasks SET series_id = ? WHERE id = ?`, m.ID, other.ID); err != nil {
		t.Fatal(err)
	}
	out, err := UpdateTask(e.db, m.ID, UpdateReq{Done: new(true)})
	if err != nil {
		t.Fatal(err)
	}
	var spawned *Task
	for i := range out {
		if out[i].ID != m.ID && out[i].Title == "планёрка" {
			spawned = &out[i]
		}
	}
	// ср 09 занята дублем — спавн на пн 14
	if spawned == nil || spawned.ScheduledOn == nil || *spawned.ScheduledOn != "2030-01-14" {
		t.Fatalf("спавн должен скипнуть занятую ср 09: %+v", spawned)
	}
}

func TestSoftDelete(t *testing.T) {
	e := openTest(t)
	a := e.mk(t, "a", nil, new("2030-01-07"))
	b := e.mk(t, "b", &a.ID, nil)
	sib := e.mk(t, "sib", nil, nil)

	n, err := DeleteTask(e.db, a.ID)
	if err != nil {
		t.Fatal(err)
	}
	if n != 2 {
		t.Errorf("помечено %d, ждал 2 (каскад)", n)
	}
	// из списков исчезли, но строки в базе живы с deleted_at
	all, _ := ListTasks(e.db)
	if len(all) != 1 || all[0].ID != sib.ID {
		t.Errorf("список: %+v", all)
	}
	var cnt int
	if err := e.db.QueryRow(`SELECT count(*) FROM tasks WHERE deleted_at IS NOT NULL`).Scan(&cnt); err != nil || cnt != 2 {
		t.Errorf("deleted_at строк: %d (%v)", cnt, err)
	}
	// PATCH по удалённой — 404
	if _, err := UpdateTask(e.db, b.ID, UpdateReq{Title: new("x")}); !errors.Is(err, ErrNotFound) {
		t.Errorf("patch по удалённой: %v", err)
	}
	// день удалённой освобождён: новая задача в тот же день получает day_position 0
	c := e.mk(t, "c", nil, new("2030-01-07"))
	if nc := e.get(t, c.ID); nc.DayPosition == nil || *nc.DayPosition != 0 {
		t.Errorf("day_position: %v", nc.DayPosition)
	}
}

func TestSoftDeleteProjectAndRefs(t *testing.T) {
	e := openTest(t)
	// проект с живой задачей не удаляется; после удаления задачи — можно
	p2, err := CreateProject(e.db, "второй", "#c9a96a", nil)
	if err != nil {
		t.Fatal(err)
	}
	tk, _, err := CreateTask(e.db, CreateReq{Title: "t", ProjectID: &p2.ID})
	if err != nil {
		t.Fatal(err)
	}
	if err := DeleteProject(e.db, p2.ID); !errors.Is(err, ErrProjectNotEmpty) {
		t.Errorf("непустой: %v", err)
	}
	if _, err := DeleteTask(e.db, tk.ID); err != nil {
		t.Fatal(err)
	}
	if err := DeleteProject(e.db, p2.ID); err != nil {
		t.Errorf("после мягкого удаления задачи проект должен удалиться: %v", err)
	}
	ps, _ := ListProjects(e.db)
	for _, p := range ps {
		if p.ID == p2.ID {
			t.Error("удалённый проект в списке")
		}
	}
	// тип: пометка + отвязка задач
	typ, err := CreateType(e.db, "Встреча", "🤝")
	if err != nil {
		t.Fatal(err)
	}
	a := e.mk(t, "a", nil, nil)
	if _, err := UpdateTask(e.db, a.ID, UpdateReq{SetTypeID: true, TypeID: &typ.ID}); err != nil {
		t.Fatal(err)
	}
	if err := DeleteType(e.db, typ.ID); err != nil {
		t.Fatal(err)
	}
	types, _ := ListTypes(e.db)
	if len(types) != 0 {
		t.Errorf("типы: %+v", types)
	}
	if na := e.get(t, a.ID); na.TypeID != nil {
		t.Errorf("задача не отвязана: %v", na.TypeID)
	}
}

func TestSeriesID(t *testing.T) {
	e := openTest(t)
	m := e.mk(t, "синк", nil, new("2030-01-07"))
	if _, err := UpdateTask(e.db, m.ID, UpdateReq{SetRepeat: true, Repeat: repeatPtr(1, 4)}); err != nil {
		t.Fatal(err)
	}
	if nm := e.get(t, m.ID); nm.SeriesID == nil || *nm.SeriesID != m.ID {
		t.Fatalf("якорь серии: %v", nm.SeriesID)
	}
	// done-спавн наследует series_id
	out, err := UpdateTask(e.db, m.ID, UpdateReq{Done: new(true)})
	if err != nil {
		t.Fatal(err)
	}
	var spawned *Task
	for i := range out {
		if out[i].ID != m.ID {
			spawned = &out[i]
		}
	}
	if spawned == nil || spawned.SeriesID == nil || *spawned.SeriesID != m.ID {
		t.Fatalf("спавн без якоря: %+v", spawned)
	}
	// перенос спавненной: серия и правило остаются при ней, спавна нет
	if _, err := UpdateTask(e.db, spawned.ID, UpdateReq{SetScheduledOn: true, ScheduledOn: new("2030-01-11")}); err != nil {
		t.Fatal(err)
	}
	if ns := e.get(t, spawned.ID); ns.SeriesID == nil || *ns.SeriesID != m.ID || ns.Repeat == nil {
		t.Errorf("после переноса: %+v", ns)
	}
	// снятие правила якорь не трогает
	if _, err := UpdateTask(e.db, spawned.ID, UpdateReq{SetRepeat: true}); err != nil {
		t.Fatal(err)
	}
	if ns := e.get(t, spawned.ID); ns.SeriesID == nil {
		t.Error("якорь пропал после снятия правила")
	}
}

func TestReviewFixesBatch(t *testing.T) {
	e := openTest(t)

	// 1. спавн серии не воскрешает soft-deleted подзадачи
	m := e.mk(t, "серия", nil, new("2030-01-07"))
	if _, err := UpdateTask(e.db, m.ID, UpdateReq{SetRepeat: true, Repeat: repeatPtr(1)}); err != nil {
		t.Fatal(err)
	}
	kid := e.mk(t, "живая", &m.ID, nil)
	dead := e.mk(t, "удалённая", &m.ID, nil)
	if _, err := DeleteTask(e.db, dead.ID); err != nil {
		t.Fatal(err)
	}
	out, err := UpdateTask(e.db, m.ID, UpdateReq{Done: new(true)})
	if err != nil {
		t.Fatal(err)
	}
	for _, x := range out {
		if x.Title == "удалённая" {
			t.Error("soft-deleted подзадача воскресла в спавне")
		}
	}
	_ = kid

	// 2. PATCH {done:true, repeat:{...}} одним запросом: правило не остаётся на done
	m2 := e.mk(t, "двойной", nil, new("2030-01-07"))
	if _, err := UpdateTask(e.db, m2.ID, UpdateReq{SetRepeat: true, Repeat: repeatPtr(1)}); err != nil {
		t.Fatal(err)
	}
	if _, err := UpdateTask(e.db, m2.ID, UpdateReq{Done: new(true), SetRepeat: true, Repeat: repeatPtr(1, 2)}); err != nil {
		t.Fatal(err)
	}
	if nm := e.get(t, m2.ID); !nm.Done || nm.Repeat != nil {
		t.Errorf("done-задача с правилом: %+v", nm)
	}

	// 3. подзадача в архивном проекте — 422
	p2, err := CreateProject(e.db, "арх", "#c9a96a", nil)
	if err != nil {
		t.Fatal(err)
	}
	root, _, err := CreateTask(e.db, CreateReq{Title: "к", ProjectID: &p2.ID})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := UpdateProject(e.db, p2.ID, ProjectUpdate{Archived: new(true)}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := CreateTask(e.db, CreateReq{Title: "поздно", ParentID: &root.ID}); !errors.Is(err, ErrArchivedTarget) {
		t.Errorf("создание в архивном: %v", err)
	}

	// 4. PATCH projectId того же проекта = перенос в корень
	a := e.mk(t, "родитель2", nil, nil)
	b := e.mk(t, "дитя2", &a.ID, nil)
	if _, err := UpdateTask(e.db, b.ID, UpdateReq{SetProjectID: true, ProjectID: &e.pid}); err != nil {
		t.Fatal(err)
	}
	if nb := e.get(t, b.ID); nb.ParentID != nil {
		t.Errorf("дитя не стало корнем: %+v", nb.ParentID)
	}

	// 5. PATCH endOn без даты плана — 422
	c := e.mk(t, "бездаты", nil, nil)
	if _, err := UpdateTask(e.db, c.ID, UpdateReq{SetEndOn: true, EndOn: new("2030-01-09")}); !errors.Is(err, ErrValidation) {
		t.Errorf("endOn без плана: %v", err)
	}
}
