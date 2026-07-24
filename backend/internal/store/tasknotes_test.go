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

// Зеркало кейса «soft-delete заметки» из TestTaskNotes: удаление задачи
// скрывает связь, а прикрепить к удалённой задаче/заметке нельзя.
func TestTaskNotesTaskSide(t *testing.T) {
	e := openTest(t)
	task := e.mk(t, "задача", nil, nil)
	note, err := CreateNote(e.db, "заметка", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := CreateTaskNote(e.db, task.ID, note.ID); err != nil {
		t.Fatal(err)
	}

	// soft-delete задачи — связь исчезает из списка
	if _, err := DeleteTask(e.db, task.ID); err != nil {
		t.Fatal(err)
	}
	if list, _ := ListTaskNotes(e.db); len(list) != 0 {
		t.Errorf("связь удалённой задачи видна: %+v", list)
	}

	// прикрепить к soft-deleted задаче нельзя
	note2, err := CreateNote(e.db, "вторая", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := CreateTaskNote(e.db, task.ID, note2.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("привязка к удалённой задаче: %v", err)
	}
	// и к soft-deleted заметке нельзя
	task2 := e.mk(t, "живая", nil, nil)
	if _, err := DeleteNote(e.db, note2.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := CreateTaskNote(e.db, task2.ID, note2.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("привязка к удалённой заметке: %v", err)
	}
}
