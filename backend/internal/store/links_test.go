package store

import (
	"errors"
	"testing"
)

func TestLinkTypesSeeded(t *testing.T) {
	e := openTest(t)
	lts, err := ListLinkTypes(e.db)
	if err != nil {
		t.Fatal(err)
	}
	if len(lts) != 3 {
		t.Fatalf("сидов типов связей %d, ждал 3", len(lts))
	}
	if lts[0].Name != "порождает" || lts[0].ReverseName != "порождена из" || !lts[0].Directed {
		t.Errorf("первый тип: %+v", lts[0])
	}
	if lts[2].Name != "связана с" || lts[2].Directed {
		t.Errorf("ненаправленный тип: %+v", lts[2])
	}
}

func TestLinkTypeCRUD(t *testing.T) {
	e := openTest(t)
	lt, err := CreateLinkType(e.db, "дублирует", "дублируется", true)
	if err != nil {
		t.Fatal(err)
	}
	// пустое имя — 422
	if _, err := CreateLinkType(e.db, "  ", "", false); !errors.Is(err, ErrValidation) {
		t.Errorf("пустое имя: %v", err)
	}
	// правка
	if _, err := UpdateLinkType(e.db, lt.ID, LinkTypeUpdate{Name: new("связана как дубль"), Directed: new(false)}); err != nil {
		t.Fatal(err)
	}
	// удаление
	if err := DeleteLinkType(e.db, lt.ID); err != nil {
		t.Fatal(err)
	}
	lts, _ := ListLinkTypes(e.db)
	for _, x := range lts {
		if x.ID == lt.ID {
			t.Error("удалённый тип связи в списке")
		}
	}
}

func TestTaskLinkCRUD(t *testing.T) {
	e := openTest(t)
	a := e.mk(t, "A", nil, nil)
	b := e.mk(t, "B", nil, nil)
	lts, _ := ListLinkTypes(e.db)
	blocks := lts[1] // «блокирует»

	// A блокирует B
	link, err := CreateTaskLink(e.db, a.ID, b.ID, blocks.ID)
	if err != nil {
		t.Fatal(err)
	}
	// у разовых задач логический id = их id
	if link.FromLogical != a.ID || link.ToLogical != b.ID {
		t.Errorf("связь: %+v", link)
	}
	// самосвязь — 422
	if _, err := CreateTaskLink(e.db, a.ID, a.ID, blocks.ID); !errors.Is(err, ErrSelfLink) {
		t.Errorf("самосвязь: %v", err)
	}
	// дубль — 422
	if _, err := CreateTaskLink(e.db, a.ID, b.ID, blocks.ID); !errors.Is(err, ErrDupLink) {
		t.Errorf("дубль: %v", err)
	}
	// обратная сторона (B блокирует A) — не дубль, разрешена
	if _, err := CreateTaskLink(e.db, b.ID, a.ID, blocks.ID); err != nil {
		t.Errorf("обратная сторона: %v", err)
	}
	// несуществующий тип — 422
	if _, err := CreateTaskLink(e.db, a.ID, b.ID, 9999); !errors.Is(err, ErrBadLinkType) {
		t.Errorf("плохой тип: %v", err)
	}
	// несуществующая задача — 404
	if _, err := CreateTaskLink(e.db, a.ID, 9999, blocks.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("плохая задача: %v", err)
	}

	all, _ := ListTaskLinks(e.db)
	if len(all) != 2 {
		t.Errorf("связей %d, ждал 2", len(all))
	}

	// удаление связи
	if err := DeleteTaskLink(e.db, link.ID); err != nil {
		t.Fatal(err)
	}
	if all, _ := ListTaskLinks(e.db); len(all) != 1 {
		t.Errorf("после удаления связей %d, ждал 1", len(all))
	}
}

// Связь на логической задаче переживает спавн следующего вхождения серии.
func TestTaskLinkSurvivesSeriesSpawn(t *testing.T) {
	e := openTest(t)
	other := e.mk(t, "проект", nil, nil)
	m := e.mk(t, "планёрка", nil, new("2030-01-07"))
	if _, err := UpdateTask(e.db, m.ID, UpdateReq{SetRepeat: true, Repeat: repeatPtr(1)}); err != nil {
		t.Fatal(err)
	}
	lts, _ := ListLinkTypes(e.db)
	if _, err := CreateTaskLink(e.db, m.ID, other.ID, lts[0].ID); err != nil {
		t.Fatal(err)
	}
	// ✓ → спавн
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
	if spawned == nil {
		t.Fatal("спавна не было")
	}
	// связь одна, на логическом якоре — новое вхождение её видит
	all, _ := ListTaskLinks(e.db)
	if len(all) != 1 || all[0].FromLogical != spawned.LogicalID {
		t.Fatalf("связь после спавна: %+v (logical спавна %d)", all, spawned.LogicalID)
	}
	// дубль через новое вхождение — по логической паре
	if _, err := CreateTaskLink(e.db, spawned.ID, other.ID, lts[0].ID); !errors.Is(err, ErrDupLink) {
		t.Errorf("дубль через другое вхождение: %v", err)
	}
	// связь двух вхождений ОДНОЙ серии — само-связь
	m2 := e.mk(t, "план2", nil, new("2030-02-07"))
	if _, err := UpdateTask(e.db, m2.ID, UpdateReq{SetRepeat: true, Repeat: repeatPtr(1)}); err != nil {
		t.Fatal(err)
	}
	out2, _ := UpdateTask(e.db, m2.ID, UpdateReq{Done: new(true)})
	var sp2 *Task
	for i := range out2 {
		if out2[i].ID != m2.ID && out2[i].Title == "план2" {
			sp2 = &out2[i]
		}
	}
	if _, err := CreateTaskLink(e.db, m2.ID, sp2.ID, lts[0].ID); !errors.Is(err, ErrSelfLink) {
		t.Errorf("связь вхождений одной серии должна быть само-связью: %v", err)
	}
}

func TestTaskLinksHiddenWhenEndpointGone(t *testing.T) {
	e := openTest(t)
	a := e.mk(t, "A", nil, nil)
	b := e.mk(t, "B", nil, nil)
	lts, _ := ListLinkTypes(e.db)
	if _, err := CreateTaskLink(e.db, a.ID, b.ID, lts[0].ID); err != nil {
		t.Fatal(err)
	}
	// soft-delete задачи B — связь исчезает из выборки
	if _, err := DeleteTask(e.db, b.ID); err != nil {
		t.Fatal(err)
	}
	if all, _ := ListTaskLinks(e.db); len(all) != 0 {
		t.Errorf("связь удалённой задачи видна: %+v", all)
	}
	// удаление типа связи тоже прячет связь
	c := e.mk(t, "C", nil, nil)
	d := e.mk(t, "D", nil, nil)
	if _, err := CreateTaskLink(e.db, c.ID, d.ID, lts[1].ID); err != nil {
		t.Fatal(err)
	}
	if err := DeleteLinkType(e.db, lts[1].ID); err != nil {
		t.Fatal(err)
	}
	if all, _ := ListTaskLinks(e.db); len(all) != 0 {
		t.Errorf("связь удалённого типа видна: %+v", all)
	}
}
