package store

import (
	"database/sql"
	"errors"
	"testing"
)

func openTest(t *testing.T) *sql.DB {
	t.Helper()
	db, err := Open(":memory:")
	if err != nil {
		t.Fatalf("открытие тестовой базы: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func mk(t *testing.T, db *sql.DB, title string, parent *int64, day *string) Task {
	t.Helper()
	task, err := CreateTask(db, CreateReq{Title: title, ParentID: parent, ScheduledOn: day})
	if err != nil {
		t.Fatalf("создание %q: %v", title, err)
	}
	return task
}

func get(t *testing.T, db *sql.DB, id int64) Task {
	t.Helper()
	all, err := ListTasks(db)
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
	db := openTest(t)

	r1 := mk(t, db, "Работа", nil, nil)
	r2 := mk(t, db, "Быт", nil, nil)
	if r1.Position != 0 || r2.Position != 1 {
		t.Errorf("позиции корней: %d, %d; ждали 0, 1", r1.Position, r2.Position)
	}

	c1 := mk(t, db, "CI", &r1.ID, nil)
	c2 := mk(t, db, "Дока", &r1.ID, nil)
	if c1.Position != 0 || c2.Position != 1 {
		t.Errorf("позиции детей: %d, %d; ждали 0, 1", c1.Position, c2.Position)
	}

	d1 := mk(t, db, "На вторник", nil, new("2026-07-22"))
	d2 := mk(t, db, "Тоже вторник", nil, new("2026-07-22"))
	if d1.DayPosition == nil || *d1.DayPosition != 0 || d2.DayPosition == nil || *d2.DayPosition != 1 {
		t.Errorf("day_position: %v, %v; ждали 0, 1", d1.DayPosition, d2.DayPosition)
	}

	if _, err := CreateTask(db, CreateReq{Title: "   "}); !errors.Is(err, ErrValidation) {
		t.Errorf("пустой title: ждали ErrValidation, получили %v", err)
	}
	if _, err := CreateTask(db, CreateReq{Title: "x", ParentID: new(int64(9999))}); !errors.Is(err, ErrBadParent) {
		t.Errorf("несуществующий родитель: ждали ErrBadParent, получили %v", err)
	}
	if _, err := CreateTask(db, CreateReq{Title: "x", ScheduledOn: new("2026-13-99")}); !errors.Is(err, ErrValidation) {
		t.Errorf("битая дата: ждали ErrValidation, получили %v", err)
	}
}

func TestCycleGuard(t *testing.T) {
	db := openTest(t)
	a := mk(t, db, "a", nil, nil)
	b := mk(t, db, "b", &a.ID, nil)
	c := mk(t, db, "c", &b.ID, nil)

	if _, err := UpdateTask(db, a.ID, UpdateReq{SetParentID: true, ParentID: &c.ID}); !errors.Is(err, ErrCycle) {
		t.Errorf("перенос под потомка: ждали ErrCycle, получили %v", err)
	}
	if _, err := UpdateTask(db, a.ID, UpdateReq{SetParentID: true, ParentID: &a.ID}); !errors.Is(err, ErrCycle) {
		t.Errorf("перенос под себя: ждали ErrCycle, получили %v", err)
	}
	if _, err := UpdateTask(db, a.ID, UpdateReq{SetParentID: true, ParentID: new(int64(9999))}); !errors.Is(err, ErrBadParent) {
		t.Errorf("перенос под несуществующего: ждали ErrBadParent, получили %v", err)
	}
}

func TestReparent(t *testing.T) {
	db := openTest(t)
	a := mk(t, db, "a", nil, nil)
	b := mk(t, db, "b", nil, nil)
	x := mk(t, db, "x", &a.ID, nil)
	y := mk(t, db, "y", &a.ID, nil)
	z := mk(t, db, "z", &a.ID, nil)
	w := mk(t, db, "w", &b.ID, nil)

	// y уезжает под b: старые сиблинги x,z уплотняются в 0,1; y — в конец детей b
	affected, err := UpdateTask(db, y.ID, UpdateReq{SetParentID: true, ParentID: &b.ID})
	if err != nil {
		t.Fatalf("reparent: %v", err)
	}
	ny := get(t, db, y.ID)
	if ny.ParentID == nil || *ny.ParentID != b.ID || ny.Position != 1 {
		t.Errorf("y после переноса: parent=%v pos=%d; ждали parent=%d pos=1", ny.ParentID, ny.Position, b.ID)
	}
	if nx, nz := get(t, db, x.ID), get(t, db, z.ID); nx.Position != 0 || nz.Position != 1 {
		t.Errorf("старые сиблинги: x=%d z=%d; ждали 0,1", nx.Position, nz.Position)
	}
	if nw := get(t, db, w.ID); nw.Position != 0 {
		t.Errorf("w сдвинулся: %d", nw.Position)
	}
	ids := map[int64]bool{}
	for _, task := range affected {
		ids[task.ID] = true
	}
	if !ids[y.ID] || !ids[z.ID] {
		t.Errorf("в затронутых нет y или z: %v", ids)
	}

	// перенос в корень с позицией 0
	if _, err := UpdateTask(db, y.ID, UpdateReq{SetParentID: true, ParentID: nil, Position: new(0)}); err != nil {
		t.Fatalf("в корень: %v", err)
	}
	ny = get(t, db, y.ID)
	if ny.ParentID != nil || ny.Position != 0 {
		t.Errorf("y в корне: parent=%v pos=%d", ny.ParentID, ny.Position)
	}
	if na, nb := get(t, db, a.ID), get(t, db, b.ID); na.Position != 1 || nb.Position != 2 {
		t.Errorf("корни после вставки: a=%d b=%d; ждали 1,2", na.Position, nb.Position)
	}
}

func TestPositionMove(t *testing.T) {
	db := openTest(t)
	a := mk(t, db, "a", nil, nil)
	b := mk(t, db, "b", nil, nil)
	c := mk(t, db, "c", nil, nil)

	// c на позицию 0 → порядок c,a,b
	if _, err := UpdateTask(db, c.ID, UpdateReq{Position: new(0)}); err != nil {
		t.Fatalf("move: %v", err)
	}
	na, nb, nc := get(t, db, a.ID), get(t, db, b.ID), get(t, db, c.ID)
	if nc.Position != 0 || na.Position != 1 || nb.Position != 2 {
		t.Errorf("после move: c=%d a=%d b=%d; ждали 0,1,2", nc.Position, na.Position, nb.Position)
	}

	// позиция за пределами — кламп в конец
	if _, err := UpdateTask(db, c.ID, UpdateReq{Position: new(99)}); err != nil {
		t.Fatalf("кламп: %v", err)
	}
	if nc = get(t, db, c.ID); nc.Position != 2 {
		t.Errorf("кламп в конец: %d", nc.Position)
	}
}

func TestScheduling(t *testing.T) {
	db := openTest(t)
	a := mk(t, db, "a", nil, new("2026-07-21"))
	b := mk(t, db, "b", nil, new("2026-07-21"))
	c := mk(t, db, "c", nil, nil)

	// назначение даты — в конец дня
	if _, err := UpdateTask(db, c.ID, UpdateReq{SetScheduledOn: true, ScheduledOn: new("2026-07-21")}); err != nil {
		t.Fatalf("назначение: %v", err)
	}
	if nc := get(t, db, c.ID); nc.DayPosition == nil || *nc.DayPosition != 2 {
		t.Errorf("c в конец дня: %v", nc.DayPosition)
	}

	// смена дня: старый день уплотняется, новый — в конец
	if _, err := UpdateTask(db, a.ID, UpdateReq{SetScheduledOn: true, ScheduledOn: new("2026-07-22")}); err != nil {
		t.Fatalf("смена дня: %v", err)
	}
	na := get(t, db, a.ID)
	if *na.ScheduledOn != "2026-07-22" || *na.DayPosition != 0 {
		t.Errorf("a на новом дне: %v %v", *na.ScheduledOn, *na.DayPosition)
	}
	nb, nc := get(t, db, b.ID), get(t, db, c.ID)
	if *nb.DayPosition != 0 || *nc.DayPosition != 1 {
		t.Errorf("старый день уплотнён: b=%v c=%v; ждали 0,1", *nb.DayPosition, *nc.DayPosition)
	}

	// снятие даты — day_position NULL
	if _, err := UpdateTask(db, b.ID, UpdateReq{SetScheduledOn: true, ScheduledOn: nil}); err != nil {
		t.Fatalf("снятие: %v", err)
	}
	if nb = get(t, db, b.ID); nb.ScheduledOn != nil || nb.DayPosition != nil {
		t.Errorf("после снятия: %v %v", nb.ScheduledOn, nb.DayPosition)
	}

	// перестановка внутри дня
	d := mk(t, db, "d", nil, new("2026-07-22"))
	if _, err := UpdateTask(db, d.ID, UpdateReq{DayPosition: new(0)}); err != nil {
		t.Fatalf("внутри дня: %v", err)
	}
	nd, na2 := get(t, db, d.ID), get(t, db, a.ID)
	if *nd.DayPosition != 0 || *na2.DayPosition != 1 {
		t.Errorf("порядок дня: d=%v a=%v; ждали 0,1", *nd.DayPosition, *na2.DayPosition)
	}
}

func TestDoneAndFields(t *testing.T) {
	db := openTest(t)
	a := mk(t, db, "a", nil, nil)
	b := mk(t, db, "b", &a.ID, nil)

	if _, err := UpdateTask(db, a.ID, UpdateReq{Done: new(true), Title: new("A!"), Description: new("описание")}); err != nil {
		t.Fatalf("update: %v", err)
	}
	na := get(t, db, a.ID)
	if !na.Done || na.Title != "A!" || na.Description != "описание" {
		t.Errorf("поля: %+v", na)
	}
	if nb := get(t, db, b.ID); nb.Done {
		t.Errorf("done родителя тронул ребёнка")
	}
	if na.UpdatedAt == a.UpdatedAt && na.UpdatedAt == a.CreatedAt {
		t.Log("updated_at не изменился в пределах секунды — допустимо (RFC3339 с секундами)")
	}

	if _, err := UpdateTask(db, a.ID, UpdateReq{Title: new("  ")}); !errors.Is(err, ErrValidation) {
		t.Errorf("пустой title: %v", err)
	}
	if _, err := UpdateTask(db, 9999, UpdateReq{Done: new(true)}); !errors.Is(err, ErrNotFound) {
		t.Errorf("нет задачи: %v", err)
	}
}

func TestDeleteCascade(t *testing.T) {
	db := openTest(t)
	a := mk(t, db, "a", nil, nil)
	b := mk(t, db, "b", &a.ID, nil)
	_ = mk(t, db, "c", &b.ID, nil)
	d := mk(t, db, "d", nil, nil)

	n, err := DeleteTask(db, a.ID)
	if err != nil {
		t.Fatalf("удаление: %v", err)
	}
	if n != 3 {
		t.Errorf("удалено %d; ждали 3", n)
	}
	all, _ := ListTasks(db)
	if len(all) != 1 || all[0].ID != d.ID {
		t.Errorf("осталось: %+v", all)
	}
	if _, err := DeleteTask(db, 9999); !errors.Is(err, ErrNotFound) {
		t.Errorf("удаление несуществующей: %v", err)
	}
}
