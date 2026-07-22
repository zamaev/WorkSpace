package store

import (
	"database/sql"
	"errors"
	"testing"
)

func notesEnv(t *testing.T) *sql.DB {
	t.Helper()
	db, err := Open(":memory:")
	if err != nil {
		t.Fatalf("открытие базы: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func mkNote(t *testing.T, db *sql.DB, title string, parent *int64) Note {
	t.Helper()
	n, err := CreateNote(db, title, parent)
	if err != nil {
		t.Fatalf("создание %q: %v", title, err)
	}
	return n
}

func getNote(t *testing.T, db *sql.DB, id int64) Note {
	t.Helper()
	all, err := ListNotes(db)
	if err != nil {
		t.Fatal(err)
	}
	for _, n := range all {
		if n.ID == id {
			return n
		}
	}
	t.Fatalf("заметка %d не найдена в списке", id)
	return Note{}
}

func TestNotesCRUD(t *testing.T) {
	db := notesEnv(t)
	a := mkNote(t, db, "A", nil)
	b := mkNote(t, db, "B", nil)
	child := mkNote(t, db, "child", &a.ID)
	if child.ParentID == nil || *child.ParentID != a.ID || child.Position != 0 {
		t.Fatalf("вложенная: %+v", child)
	}
	if b.Position != 1 {
		t.Errorf("позиция B: %d", b.Position)
	}
	// пустой title валиден
	empty := mkNote(t, db, "", nil)
	if empty.Title != "" {
		t.Errorf("пустой title: %q", empty.Title)
	}
	// правка тела и заголовка
	if _, err := UpdateNote(db, a.ID, NoteUpdate{Title: strptr("A!"), Body: strptr("# заголовок\nтекст")}); err != nil {
		t.Fatal(err)
	}
	na := getNote(t, db, a.ID)
	if na.Title != "A!" || na.Body != "# заголовок\nтекст" {
		t.Errorf("после правки: %+v", na)
	}
}

func TestNotesReorderAndReparent(t *testing.T) {
	db := notesEnv(t)
	a := mkNote(t, db, "A", nil)
	b := mkNote(t, db, "B", nil)
	c := mkNote(t, db, "C", nil)
	if _, err := UpdateNote(db, c.ID, NoteUpdate{Position: intptr(0)}); err != nil {
		t.Fatal(err)
	}
	order := func() []int64 {
		all, _ := ListNotes(db)
		var ids []int64
		for _, n := range all {
			if n.ParentID == nil {
				ids = append(ids, n.ID)
			}
		}
		return ids
	}
	if got := order(); got[0] != c.ID {
		t.Errorf("после переноса C в начало: %v", got)
	}
	if _, err := UpdateNote(db, b.ID, NoteUpdate{SetParentID: true, ParentID: &a.ID}); err != nil {
		t.Fatal(err)
	}
	nb := getNote(t, db, b.ID)
	if nb.ParentID == nil || *nb.ParentID != a.ID {
		t.Errorf("B не вложилась: %+v", nb)
	}
	// цикл: A под своего потомка B
	if _, err := UpdateNote(db, a.ID, NoteUpdate{SetParentID: true, ParentID: &b.ID}); !errors.Is(err, ErrCycle) {
		t.Errorf("цикл не пойман: %v", err)
	}
	// сам в себя
	if _, err := UpdateNote(db, a.ID, NoteUpdate{SetParentID: true, ParentID: &a.ID}); !errors.Is(err, ErrCycle) {
		t.Errorf("сам в себя: %v", err)
	}
}

func TestNotesCascadeSoftDelete(t *testing.T) {
	db := notesEnv(t)
	a := mkNote(t, db, "A", nil)
	b := mkNote(t, db, "b", &a.ID)
	c := mkNote(t, db, "c", &b.ID)
	sib := mkNote(t, db, "sib", nil)

	n, err := DeleteNote(db, a.ID)
	if err != nil {
		t.Fatal(err)
	}
	if n != 3 {
		t.Errorf("помечено %d, ждал 3 (каскад)", n)
	}
	all, _ := ListNotes(db)
	if len(all) != 1 || all[0].ID != sib.ID {
		t.Errorf("после удаления в списке: %+v", all)
	}
	var cnt int
	if err := db.QueryRow(`SELECT count(*) FROM notes WHERE deleted_at IS NOT NULL`).Scan(&cnt); err != nil || cnt != 3 {
		t.Errorf("deleted_at строк: %d (%v)", cnt, err)
	}
	if _, err := UpdateNote(db, b.ID, NoteUpdate{Title: strptr("зомби")}); !errors.Is(err, ErrNotFound) {
		t.Errorf("patch удалённой: %v", err)
	}
	_ = c
}

func strptr(s string) *string { return &s }
func intptr(i int) *int       { return &i }
