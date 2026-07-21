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
	p, err := CreateProject(db, "Тестовый", "#c9a96a")
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
	p2, err := CreateProject(e.db, "Другой", "#8fb56b")
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

func TestCascadeDone(t *testing.T) {
	e := openTest(t)
	a := e.mk(t, "a", nil, nil)
	b := e.mk(t, "b", &a.ID, nil)
	c1 := e.mk(t, "c1", &b.ID, nil)
	c2 := e.mk(t, "c2", &b.ID, nil)

	// c1 done → b ещё нет (c2 не сделана)
	if _, err := UpdateTask(e.db, c1.ID, UpdateReq{Done: new(true)}); err != nil {
		t.Fatal(err)
	}
	if e.get(t, b.ID).Done {
		t.Errorf("b закрылась раньше времени")
	}

	// c2 done → b и a закрываются каскадом
	affected, err := UpdateTask(e.db, c2.ID, UpdateReq{Done: new(true)})
	if err != nil {
		t.Fatal(err)
	}
	if !e.get(t, b.ID).Done || !e.get(t, a.ID).Done {
		t.Errorf("каскад вверх не сработал: b=%v a=%v", e.get(t, b.ID).Done, e.get(t, a.ID).Done)
	}
	ids := map[int64]bool{}
	for _, task := range affected {
		ids[task.ID] = true
	}
	if !ids[b.ID] || !ids[a.ID] {
		t.Errorf("затронутые не содержат b/a")
	}

	// снял c1 → b и a открываются
	if _, err := UpdateTask(e.db, c1.ID, UpdateReq{Done: new(false)}); err != nil {
		t.Fatal(err)
	}
	if e.get(t, b.ID).Done || e.get(t, a.ID).Done {
		t.Errorf("uncheck вверх не сработал")
	}

	// закрыли обратно, затем создание ребёнка открывает предков
	if _, err := UpdateTask(e.db, c1.ID, UpdateReq{Done: new(true)}); err != nil {
		t.Fatal(err)
	}
	if !e.get(t, a.ID).Done {
		t.Fatalf("предусловие: a должна быть закрыта")
	}
	_, created, err := CreateTask(e.db, CreateReq{Title: "c3", ParentID: &b.ID})
	if err != nil {
		t.Fatal(err)
	}
	if e.get(t, b.ID).Done || e.get(t, a.ID).Done {
		t.Errorf("создание не открыло предков")
	}
	ids = map[int64]bool{}
	for _, task := range created {
		ids[task.ID] = true
	}
	if !ids[b.ID] || !ids[a.ID] {
		t.Errorf("затронутые создания не содержат предков: %v", ids)
	}
}

func TestCascadeOnReparent(t *testing.T) {
	e := openTest(t)
	a := e.mk(t, "a", nil, nil)
	b := e.mk(t, "b", &a.ID, nil)
	if _, err := UpdateTask(e.db, b.ID, UpdateReq{Done: new(true)}); err != nil {
		t.Fatal(err)
	}
	if !e.get(t, a.ID).Done {
		t.Fatalf("предусловие: a закрыта")
	}
	// перенос несделанной задачи под a открывает a
	x := e.mk(t, "x", nil, nil)
	if _, err := UpdateTask(e.db, x.ID, UpdateReq{SetParentID: true, ParentID: &a.ID}); err != nil {
		t.Fatal(err)
	}
	if e.get(t, a.ID).Done {
		t.Errorf("перенос несделанной не открыл предка")
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
	p2, err := CreateProject(e.db, "Другой", "#8fb56b")
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

	p2, err := CreateProject(e.db, "Второй", "#8fb56b")
	if err != nil {
		t.Fatal(err)
	}
	if p2.Position != 1 {
		t.Errorf("позиция второго проекта: %d; ждали 1", p2.Position)
	}
	if _, err := CreateProject(e.db, "  ", "#8fb56b"); !errors.Is(err, ErrValidation) {
		t.Errorf("пустое имя: %v", err)
	}
	if _, err := CreateProject(e.db, "x", "red"); !errors.Is(err, ErrValidation) {
		t.Errorf("кривой цвет: %v", err)
	}

	if _, err := UpdateProject(e.db, p2.ID, ProjectUpdate{Name: new("Переименован"), Color: new("#6a9bc9")}); err != nil {
		t.Fatal(err)
	}
	ps, _ := ListProjects(e.db)
	if len(ps) != 2 || ps[1].Name != "Переименован" || ps[1].Color != "#6a9bc9" {
		t.Errorf("после rename: %+v", ps)
	}

	// перестановка p2 на 0
	if _, err := UpdateProject(e.db, p2.ID, ProjectUpdate{Position: new(0)}); err != nil {
		t.Fatal(err)
	}
	ps, _ = ListProjects(e.db)
	if ps[0].ID != p2.ID || ps[0].Position != 0 || ps[1].Position != 1 {
		t.Errorf("после move: %+v", ps)
	}

	// удаление с задачами
	_ = e.mk(t, "t1", nil, nil)
	root := e.mk(t, "t2", nil, nil)
	_ = e.mk(t, "t3", &root.ID, nil)
	n, err := DeleteProject(e.db, e.pid)
	if err != nil {
		t.Fatal(err)
	}
	if n != 3 {
		t.Errorf("удалено задач: %d; ждали 3", n)
	}
	if _, err := DeleteProject(e.db, 9999); !errors.Is(err, ErrNotFound) {
		t.Errorf("удаление несуществующего: %v", err)
	}
	all, _ := ListTasks(e.db)
	if len(all) != 0 {
		t.Errorf("задачи не удалились: %+v", all)
	}
}
