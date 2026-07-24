package store

import (
	"database/sql"
	"errors"
)

// ErrDupTaskNote — заметка уже прикреплена к задаче (пара уникальна).
var ErrDupTaskNote = errors.New("заметка уже прикреплена к задаче")

// TaskNote — привязка заметки к ЛОГИЧЕСКОЙ задаче (many-to-many): у серии
// повторов заметка видна на всех вхождениях и переживает спавн следующего.
type TaskNote struct {
	ID        int64  `json:"id"`
	LogicalID int64  `json:"logicalId"`
	NoteID    int64  `json:"noteId"`
	CreatedAt string `json:"createdAt"`
}

// ListTaskNotes — все привязки, у которых жива заметка и живо хотя бы одно
// вхождение логической задачи (soft-delete всей серии скрывает связь).
func ListTaskNotes(db *sql.DB) ([]TaskNote, error) {
	rows, err := db.Query(`
		SELECT tn.id, tn.logical_id, tn.note_id, tn.created_at
		FROM task_notes tn
		JOIN notes n ON n.id = tn.note_id AND n.deleted_at IS NULL
		WHERE EXISTS (
			SELECT 1 FROM tasks t WHERE t.logical_id = tn.logical_id AND t.deleted_at IS NULL
		)
		ORDER BY tn.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TaskNote
	for rows.Next() {
		var tn TaskNote
		if err := rows.Scan(&tn.ID, &tn.LogicalID, &tn.NoteID, &tn.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, tn)
	}
	return out, rows.Err()
}

// CreateTaskNote прикрепляет заметку к логической задаче: принимает id
// любого живого вхождения (физической строки) и резолвит его в logical_id.
func CreateTaskNote(db *sql.DB, taskID, noteID int64) (TaskNote, error) {
	tx, err := db.Begin()
	if err != nil {
		return TaskNote{}, err
	}
	defer tx.Rollback()

	var logicalID int64
	if err := tx.QueryRow(`SELECT logical_id FROM tasks WHERE id = ? AND deleted_at IS NULL`, taskID).Scan(&logicalID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return TaskNote{}, ErrNotFound
		}
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
	if err := tx.QueryRow(`SELECT count(*) FROM task_notes WHERE logical_id = ? AND note_id = ?`, logicalID, noteID).Scan(&dup); err != nil {
		return TaskNote{}, err
	}
	if dup > 0 {
		return TaskNote{}, ErrDupTaskNote
	}
	ts := now()
	res, err := tx.Exec(`INSERT INTO task_notes (logical_id, note_id, created_at) VALUES (?, ?, ?)`, logicalID, noteID, ts)
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
	return TaskNote{ID: id, LogicalID: logicalID, NoteID: noteID, CreatedAt: ts}, nil
}

// DeleteTaskNote снимает привязку с логической задачи целиком (для серии —
// со всех вхождений разом).
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
