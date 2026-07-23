package store

import (
	"errors"
	"testing"
)

func TestTaskNotes(t *testing.T) {
	e := openTest(t)
	task := e.mk(t, "задача", nil, nil)
	note, err := CreateNote(e.db, "заметка", nil)
	if err != nil {
		t.Fatal(err)
	}

	tn, err := CreateTaskNote(e.db, task.ID, note.ID)
	if err != nil {
		t.Fatal(err)
	}
	// дубль пары — ErrDupTaskNote
	if _, err := CreateTaskNote(e.db, task.ID, note.ID); !errors.Is(err, ErrDupTaskNote) {
		t.Errorf("дубль: %v", err)
	}
	// несуществующая задача / заметка → ErrNotFound
	if _, err := CreateTaskNote(e.db, 9999, note.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("несущ. задача: %v", err)
	}
	if _, err := CreateTaskNote(e.db, task.ID, 9999); !errors.Is(err, ErrNotFound) {
		t.Errorf("несущ. заметка: %v", err)
	}
	// список — одна привязка
	if list, _ := ListTaskNotes(e.db); len(list) != 1 {
		t.Fatalf("привязок %d, ждал 1", len(list))
	}
	// soft-delete заметки — связь исчезает из списка
	if _, err := DeleteNote(e.db, note.ID); err != nil {
		t.Fatal(err)
	}
	if list, _ := ListTaskNotes(e.db); len(list) != 0 {
		t.Errorf("связь удалённой заметки видна: %+v", list)
	}
	// снять связь (hard delete)
	if err := DeleteTaskNote(e.db, tn.ID); err != nil {
		t.Fatal(err)
	}
	if err := DeleteTaskNote(e.db, 9999); !errors.Is(err, ErrNotFound) {
		t.Errorf("удаление несущ. связи: %v", err)
	}
}
