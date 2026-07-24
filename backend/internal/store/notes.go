package store

import (
	"database/sql"
	"errors"
)

// Note — узел древовидной вики. Пустой title допустим («Без названия» на
// клиенте): заметку создают до того, как придумали имя.
type Note struct {
	ID        int64
	ParentID  *int64
	Title     string
	Body      string
	Position  int
	CreatedAt string
	UpdatedAt string
}

// NoteUpdate — разобранный PATCH. Для parentID пара Set/значение
// различает «не трогать» и «сделать корнем».
type NoteUpdate struct {
	Title       *string
	Body        *string
	SetParentID bool
	ParentID    *int64
	Position    *int
}

func CreateNote(db *sql.DB, title string, parentID *int64) (Note, error) {
	tx, err := db.Begin()
	if err != nil {
		return Note{}, err
	}
	defer tx.Rollback()

	if parentID != nil {
		if _, err := loadNote(tx, *parentID); err != nil {
			if errors.Is(err, ErrNotFound) {
				return Note{}, ErrBadParent
			}
			return Note{}, err
		}
	}

	var pos int
	if err := tx.QueryRow(`SELECT COALESCE(MAX(position)+1, 0) FROM notes WHERE parent_id IS ? AND deleted_at IS NULL`, parentID).Scan(&pos); err != nil {
		return Note{}, err
	}
	ts := now()
	res, err := tx.Exec(
		`INSERT INTO notes (parent_id, title, body, position, created_at, updated_at) VALUES (?, ?, '', ?, ?, ?)`,
		parentID, title, pos, ts, ts,
	)
	if err != nil {
		return Note{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Note{}, err
	}
	n, err := loadNote(tx, id)
	if err != nil {
		return Note{}, err
	}
	return n, tx.Commit()
}

func ListNotes(db *sql.DB) ([]Note, error) {
	rows, err := db.Query(noteSelect + ` WHERE deleted_at IS NULL ORDER BY position, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanNotes(rows)
}

func UpdateNote(db *sql.DB, id int64, r NoteUpdate) ([]Note, error) {
	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	cur, err := loadNote(tx, id)
	if err != nil {
		return nil, err
	}
	affected := map[int64]bool{id: true}

	if r.Title != nil {
		cur.Title = *r.Title
	}
	if r.Body != nil {
		cur.Body = *r.Body
	}
	if _, err := tx.Exec(`UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE id = ?`,
		cur.Title, cur.Body, now(), id); err != nil {
		return nil, err
	}

	// перенос по дереву и/или позиция
	newParent, parentChanged := cur.ParentID, false
	if r.SetParentID && !sameParent(r.ParentID, cur.ParentID) {
		newParent, parentChanged = r.ParentID, true
		if newParent != nil {
			if *newParent == id {
				return nil, ErrCycle
			}
			if _, err := loadNote(tx, *newParent); err != nil {
				if errors.Is(err, ErrNotFound) {
					return nil, ErrBadParent
				}
				return nil, err
			}
			inSubtree, err := isNoteDescendant(tx, id, *newParent)
			if err != nil {
				return nil, err
			}
			if inSubtree {
				return nil, ErrCycle
			}
		}
	}
	if parentChanged || r.Position != nil {
		oldSibs, err := noteSiblingIDs(tx, cur.ParentID, id)
		if err != nil {
			return nil, err
		}
		targetSibs := oldSibs
		if parentChanged {
			if err := renumberNotes(tx, oldSibs, affected); err != nil {
				return nil, err
			}
			targetSibs, err = noteSiblingIDs(tx, newParent, id)
			if err != nil {
				return nil, err
			}
		}
		at := len(targetSibs)
		if r.Position != nil {
			at = clamp(*r.Position, 0, len(targetSibs))
		}
		list := insertAt(targetSibs, id, at)
		if _, err := tx.Exec(`UPDATE notes SET parent_id = ?, updated_at = ? WHERE id = ?`, newParent, now(), id); err != nil {
			return nil, err
		}
		if err := renumberNotes(tx, list, affected); err != nil {
			return nil, err
		}
	}

	out := make([]Note, 0, len(affected))
	for nid := range affected {
		n, err := loadNote(tx, nid)
		if err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, tx.Commit()
}

// DeleteNote мягко удаляет заметку и всё её поддерево; возвращает число
// помеченных записей.
func DeleteNote(db *sql.DB, id int64) (int, error) {
	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	if _, err := loadNote(tx, id); err != nil {
		return 0, err
	}
	res, err := tx.Exec(`
		WITH RECURSIVE sub(id) AS (
			SELECT id FROM notes WHERE id = ?
			UNION ALL
			SELECT n.id FROM notes n JOIN sub ON n.parent_id = sub.id WHERE n.deleted_at IS NULL
		)
		UPDATE notes SET deleted_at = ? WHERE id IN (SELECT id FROM sub) AND deleted_at IS NULL`, id, now())
	if err != nil {
		return 0, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return 0, err
	}
	return int(n), tx.Commit()
}

const noteSelect = `SELECT id, parent_id, title, body, position, created_at, updated_at FROM notes`

func scanNotes(rows *sql.Rows) ([]Note, error) {
	var out []Note
	for rows.Next() {
		var n Note
		if err := rows.Scan(&n.ID, &n.ParentID, &n.Title, &n.Body, &n.Position, &n.CreatedAt, &n.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func loadNote(q querier, id int64) (Note, error) {
	rows, err := q.Query(noteSelect+` WHERE id = ? AND deleted_at IS NULL`, id)
	if err != nil {
		return Note{}, err
	}
	defer rows.Close()
	ns, err := scanNotes(rows)
	if err != nil {
		return Note{}, err
	}
	if len(ns) == 0 {
		return Note{}, ErrNotFound
	}
	return ns[0], nil
}

func noteSiblingIDs(q querier, parent *int64, exclude int64) ([]int64, error) {
	rows, err := q.Query(`SELECT id FROM notes WHERE parent_id IS ? AND id != ? AND deleted_at IS NULL ORDER BY position, id`, parent, exclude)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanIDs(rows)
}

func noteSubtreeIDs(q querier, id int64) ([]int64, error) {
	rows, err := q.Query(`
		WITH RECURSIVE sub(id) AS (
			SELECT id FROM notes WHERE id = ?
			UNION ALL
			SELECT n.id FROM notes n JOIN sub ON n.parent_id = sub.id WHERE n.deleted_at IS NULL
		)
		SELECT id FROM sub`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanIDs(rows)
}

func isNoteDescendant(q querier, root, candidate int64) (bool, error) {
	ids, err := noteSubtreeIDs(q, root)
	if err != nil {
		return false, err
	}
	for _, id := range ids {
		if id == candidate {
			return true, nil
		}
	}
	return false, nil
}

func renumberNotes(e execer, ids []int64, affected map[int64]bool) error {
	for i, id := range ids {
		res, err := e.Exec(`UPDATE notes SET position = ?, updated_at = ? WHERE id = ? AND position != ?`, i, now(), id, i)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n > 0 {
			affected[id] = true
		}
	}
	return nil
}
