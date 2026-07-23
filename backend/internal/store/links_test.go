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
	if link.FromID != a.ID || link.ToID != b.ID {
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
