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
	// привязка хранит логический id (у разовой = её id)
	if tn.LogicalID != task.ID {
		t.Fatalf("logicalId привязки: %d, ждал %d", tn.LogicalID, task.ID)
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

	// soft-delete задачи — связь исчезает из списка (вхождений больше нет)
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

// Сердце фичи: заметка цепляется к логической задаче, поэтому переживает
// спавн следующего вхождения серии повторов.
func TestTaskNotesSurviveSeriesSpawn(t *testing.T) {
	e := openTest(t)
	m := e.mk(t, "планёрка", nil, new("2030-01-07"))
	if _, err := UpdateTask(e.db, m.ID, UpdateReq{SetRepeat: true, Repeat: repeatPtr(1)}); err != nil {
		t.Fatal(err)
	}
	note, err := CreateNote(e.db, "протокол", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := CreateTaskNote(e.db, m.ID, note.ID); err != nil {
		t.Fatal(err)
	}

	// ✓ → спавн следующего вхождения
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
	if spawned == nil {
		t.Fatal("спавна не было")
	}

	// привязка одна и указывает на логическую задачу — новое вхождение её видит
	list, _ := ListTaskNotes(e.db)
	if len(list) != 1 || list[0].LogicalID != spawned.LogicalID || list[0].LogicalID != m.ID {
		t.Fatalf("привязка после спавна: %+v (logical спавна %d)", list, spawned.LogicalID)
	}

	// прикрепить ту же заметку через НОВОЕ вхождение — дубль по логической
	if _, err := CreateTaskNote(e.db, spawned.ID, note.ID); !errors.Is(err, ErrDupTaskNote) {
		t.Errorf("дубль через другое вхождение: %v", err)
	}

	// удаление одного вхождения (прошлого) связь не скрывает — серия жива
	if _, err := DeleteTask(e.db, m.ID); err != nil {
		t.Fatal(err)
	}
	if list, _ := ListTaskNotes(e.db); len(list) != 1 {
		t.Errorf("связь пропала после удаления прошлого вхождения: %+v", list)
	}
	// удаление последнего живого вхождения — связь скрыта
	if _, err := DeleteTask(e.db, spawned.ID); err != nil {
		t.Fatal(err)
	}
	if list, _ := ListTaskNotes(e.db); len(list) != 0 {
		t.Errorf("связь видна без живых вхождений: %+v", list)
	}
}

// Миграция 0017: существующие привязки переезжают на логический якорь,
// дубли вхождений одной серии схлопываются.
func TestMigrationLogicalID(t *testing.T) {
	e := openTest(t)
	// серия: m (прошлое, done) + spawned (живое), заметка привязана к
	// ФИЗИЧЕСКОМУ прошлому вхождению как до 0017 — эмулируем сырым INSERT
	m := e.mk(t, "синк", nil, new("2030-01-07"))
	if _, err := UpdateTask(e.db, m.ID, UpdateReq{SetRepeat: true, Repeat: repeatPtr(1)}); err != nil {
		t.Fatal(err)
	}
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
	note, err := CreateNote(e.db, "протокол", nil)
	if err != nil {
		t.Fatal(err)
	}
	// как выглядели данные до миграции: привязки к обоим физическим вхождениям
	if _, err := e.db.Exec(`INSERT INTO task_notes (logical_id, note_id, created_at) VALUES (?, ?, 't'), (?, ?, 't')`,
		m.ID, note.ID, spawned.ID, note.ID); err != nil {
		t.Fatal(err)
	}
	// повторяем шаги миграции 0017 над task_notes: сначала дедуп по будущему
	// якорю (иначе UPDATE упал бы об UNIQUE), затем перевод на якорь
	if _, err := e.db.Exec(`DELETE FROM task_notes WHERE id NOT IN (
		SELECT MIN(tn.id) FROM task_notes tn
		JOIN tasks t ON t.id = tn.logical_id
		GROUP BY t.logical_id, tn.note_id
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := e.db.Exec(`UPDATE task_notes SET logical_id = (SELECT t.logical_id FROM tasks t WHERE t.id = task_notes.logical_id)`); err != nil {
		t.Fatal(err)
	}
	list, _ := ListTaskNotes(e.db)
	if len(list) != 1 || list[0].LogicalID != m.ID {
		t.Fatalf("после дедупа: %+v", list)
	}
}
