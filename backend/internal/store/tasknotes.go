package store

import (
	"database/sql"
	"errors"
)

// ErrDupTaskNote — заметка уже прикреплена к задаче (пара уникальна).
var ErrDupTaskNote = errors.New("заметка уже прикреплена к задаче")

// TaskNote — привязка заметки к задаче (many-to-many).
type TaskNote struct {
	ID        int64  `json:"id"`
	TaskID    int64  `json:"taskId"`
	NoteID    int64  `json:"noteId"`
	CreatedAt string `json:"createdAt"`
}

// ListTaskNotes — все привязки, где и задача, и заметка живы (soft-delete
// любой стороны скрывает связь).
func ListTaskNotes(db *sql.DB) ([]TaskNote, error) {
	rows, err := db.Query(`
		SELECT tn.id, tn.task_id, tn.note_id, tn.created_at
		FROM task_notes tn
		JOIN tasks t ON t.id = tn.task_id AND t.deleted_at IS NULL
		JOIN notes n ON n.id = tn.note_id AND n.deleted_at IS NULL
		ORDER BY tn.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TaskNote
	for rows.Next() {
		var tn TaskNote
		if err := rows.Scan(&tn.ID, &tn.TaskID, &tn.NoteID, &tn.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, tn)
	}
	return out, rows.Err()
}

func CreateTaskNote(db *sql.DB, taskID, noteID int64) (TaskNote, error) {
	tx, err := db.Begin()
	if err != nil {
		return TaskNote{}, err
	}
	defer tx.Rollback()

	if err := mustExist(tx, taskID, ErrNotFound); err != nil {
		return TaskNote{}, err
	}
	var live int
	if err := tx.QueryRow(`SELECT count(*) FROM notes WHERE id = ? AND deleted_at IS NULL`, noteID).Scan(&live); err != nil {
		return TaskNote{}, err
	}
	if live == 0 {
		return TaskNote{}, ErrNotFound
	}
	var dup int
	if err := tx.QueryRow(`SELECT count(*) FROM task_notes WHERE task_id = ? AND note_id = ?`, taskID, noteID).Scan(&dup); err != nil {
		return TaskNote{}, err
	}
	if dup > 0 {
		return TaskNote{}, ErrDupTaskNote
	}
	ts := now()
	res, err := tx.Exec(`INSERT INTO task_notes (task_id, note_id, created_at) VALUES (?, ?, ?)`, taskID, noteID, ts)
	if err != nil {
		return TaskNote{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return TaskNote{}, err
	}
	if err := tx.Commit(); err != nil {
		return TaskNote{}, err
	}
	return TaskNote{ID: id, TaskID: taskID, NoteID: noteID, CreatedAt: ts}, nil
}

func DeleteTaskNote(db *sql.DB, id int64) error {
	res, err := db.Exec(`DELETE FROM task_notes WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
