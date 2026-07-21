package store

import (
	"database/sql"
	"errors"
	"fmt"
	"regexp"
)

var (
	ErrBadProject      = errors.New("проект не существует")
	ErrProjectNotEmpty = errors.New("сначала удали задачи и под-проекты")
	ErrArchivedTarget  = errors.New("нельзя переносить в архивный проект")
)

var colorRe = regexp.MustCompile(`^#[0-9a-f]{6}$`)

type Project struct {
	ID        int64
	ParentID  *int64
	Name      string
	Color     string
	StartOn   *string
	DueOn     *string
	Archived  bool
	Position  int
	CreatedAt string
	UpdatedAt string
}

type ProjectUpdate struct {
	Name        *string
	Color       *string
	Position    *int
	SetParentID bool
	ParentID    *int64
	Archived    *bool
	SetStartOn  bool
	StartOn     *string
	SetDueOn    bool
	DueOn       *string
}

func validProjectName(s string) error {
	if err := validTitle(s); err != nil {
		return fmt.Errorf("%w: имя проекта не может быть пустым", ErrValidation)
	}
	return nil
}

func validColor(s string) error {
	if !colorRe.MatchString(s) {
		return fmt.Errorf("%w: цвет должен быть в формате #rrggbb", ErrValidation)
	}
	return nil
}

func CreateProject(db *sql.DB, name, color string, parentID *int64) (Project, error) {
	if err := validProjectName(name); err != nil {
		return Project{}, err
	}
	if err := validColor(color); err != nil {
		return Project{}, err
	}
	tx, err := db.Begin()
	if err != nil {
		return Project{}, err
	}
	defer tx.Rollback()

	if parentID != nil {
		parent, err := loadProject(tx, *parentID)
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				return Project{}, ErrBadProject
			}
			return Project{}, err
		}
		if parent.Archived {
			return Project{}, ErrArchivedTarget
		}
	}

	var pos int
	if err := tx.QueryRow(`SELECT COALESCE(MAX(position)+1, 0) FROM projects WHERE parent_id IS ?`, parentID).Scan(&pos); err != nil {
		return Project{}, err
	}
	ts := now()
	res, err := tx.Exec(
		`INSERT INTO projects (parent_id, name, color, position, archived, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)`,
		parentID, name, color, pos, ts, ts,
	)
	if err != nil {
		return Project{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Project{}, err
	}
	p, err := loadProject(tx, id)
	if err != nil {
		return Project{}, err
	}
	return p, tx.Commit()
}

func ListProjects(db *sql.DB) ([]Project, error) {
	rows, err := db.Query(projectSelect + ` ORDER BY position, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanProjects(rows)
}

func UpdateProject(db *sql.DB, id int64, r ProjectUpdate) ([]Project, error) {
	if r.Name != nil {
		if err := validProjectName(*r.Name); err != nil {
			return nil, err
		}
	}
	if r.Color != nil {
		if err := validColor(*r.Color); err != nil {
			return nil, err
		}
	}
	if r.SetStartOn && r.StartOn != nil {
		if err := validDate(*r.StartOn); err != nil {
			return nil, err
		}
	}
	if r.SetDueOn && r.DueOn != nil {
		if err := validDate(*r.DueOn); err != nil {
			return nil, err
		}
	}

	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	cur, err := loadProject(tx, id)
	if err != nil {
		return nil, err
	}
	affected := map[int64]bool{id: true}

	if r.Name != nil {
		cur.Name = *r.Name
	}
	if r.Color != nil {
		cur.Color = *r.Color
	}
	if r.SetStartOn {
		cur.StartOn = r.StartOn
	}
	if r.SetDueOn {
		cur.DueOn = r.DueOn
	}
	if cur.StartOn != nil && cur.DueOn != nil && *cur.StartOn > *cur.DueOn {
		return nil, fmt.Errorf("%w: старт проекта позже дедлайна", ErrValidation)
	}
	if _, err := tx.Exec(`UPDATE projects SET name = ?, color = ?, start_on = ?, due_on = ?, updated_at = ? WHERE id = ?`,
		cur.Name, cur.Color, cur.StartOn, cur.DueOn, now(), id); err != nil {
		return nil, err
	}

	// перенос по дереву проектов и/или позиция
	newParent, parentChanged := cur.ParentID, false
	if r.SetParentID && !sameParent(r.ParentID, cur.ParentID) {
		newParent, parentChanged = r.ParentID, true
		if newParent != nil {
			if *newParent == id {
				return nil, ErrCycle
			}
			target, err := loadProject(tx, *newParent)
			if err != nil {
				if errors.Is(err, ErrNotFound) {
					return nil, ErrBadProject
				}
				return nil, err
			}
			if target.Archived {
				return nil, ErrArchivedTarget
			}
			inSubtree, err := isProjectDescendant(tx, id, *newParent)
			if err != nil {
				return nil, err
			}
			if inSubtree {
				return nil, ErrCycle
			}
		}
	}
	if parentChanged || r.Position != nil {
		oldSibs, err := projectSiblingIDs(tx, cur.ParentID, id)
		if err != nil {
			return nil, err
		}
		targetSibs := oldSibs
		if parentChanged {
			if err := renumberProjects(tx, oldSibs, affected); err != nil {
				return nil, err
			}
			targetSibs, err = projectSiblingIDs(tx, newParent, id)
			if err != nil {
				return nil, err
			}
		}
		at := len(targetSibs)
		if r.Position != nil {
			at = clamp(*r.Position, 0, len(targetSibs))
		}
		list := insertAt(targetSibs, id, at)
		if _, err := tx.Exec(`UPDATE projects SET parent_id = ?, updated_at = ? WHERE id = ?`, newParent, now(), id); err != nil {
			return nil, err
		}
		if err := renumberProjects(tx, list, affected); err != nil {
			return nil, err
		}
	}

	// архивация/разархивация — рекурсивно на всё поддерево
	if r.Archived != nil {
		ids, err := projectSubtreeIDs(tx, id)
		if err != nil {
			return nil, err
		}
		val := 0
		if *r.Archived {
			val = 1
		}
		for _, pid := range ids {
			res, err := tx.Exec(`UPDATE projects SET archived = ?, updated_at = ? WHERE id = ? AND archived != ?`, val, now(), pid, val)
			if err != nil {
				return nil, err
			}
			if n, _ := res.RowsAffected(); n > 0 {
				affected[pid] = true
			}
		}
	}

	out := make([]Project, 0, len(affected))
	for pid := range affected {
		p, err := loadProject(tx, pid)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, tx.Commit()
}

// DeleteProject удаляет только пустой проект (без задач и под-проектов).
func DeleteProject(db *sql.DB, id int64) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := loadProject(tx, id); err != nil {
		return err
	}
	var n int
	if err := tx.QueryRow(`SELECT count(*) FROM tasks WHERE project_id = ?`, id).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return fmt.Errorf("%w: в проекте есть задачи", ErrProjectNotEmpty)
	}
	if err := tx.QueryRow(`SELECT count(*) FROM projects WHERE parent_id = ?`, id).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return fmt.Errorf("%w: у проекта есть под-проекты", ErrProjectNotEmpty)
	}
	if _, err := tx.Exec(`DELETE FROM projects WHERE id = ?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

const projectSelect = `SELECT id, parent_id, name, color, start_on, due_on, archived, position, created_at, updated_at FROM projects`

func scanProjects(rows *sql.Rows) ([]Project, error) {
	var out []Project
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.ParentID, &p.Name, &p.Color, &p.StartOn, &p.DueOn, &p.Archived, &p.Position, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func loadProject(q querier, id int64) (Project, error) {
	rows, err := q.Query(projectSelect+` WHERE id = ?`, id)
	if err != nil {
		return Project{}, err
	}
	defer rows.Close()
	ps, err := scanProjects(rows)
	if err != nil {
		return Project{}, err
	}
	if len(ps) == 0 {
		return Project{}, ErrNotFound
	}
	return ps[0], nil
}

func projectSiblingIDs(q querier, parent *int64, exclude int64) ([]int64, error) {
	rows, err := q.Query(`SELECT id FROM projects WHERE parent_id IS ? AND id != ? ORDER BY position, id`, parent, exclude)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanIDs(rows)
}

func projectSubtreeIDs(q querier, id int64) ([]int64, error) {
	rows, err := q.Query(`
		WITH RECURSIVE sub(id) AS (
			SELECT id FROM projects WHERE id = ?
			UNION ALL
			SELECT p.id FROM projects p JOIN sub ON p.parent_id = sub.id
		)
		SELECT id FROM sub`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanIDs(rows)
}

func isProjectDescendant(q querier, root, candidate int64) (bool, error) {
	ids, err := projectSubtreeIDs(q, root)
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

func renumberProjects(e execer, ids []int64, affected map[int64]bool) error {
	for i, id := range ids {
		res, err := e.Exec(`UPDATE projects SET position = ?, updated_at = ? WHERE id = ? AND position != ?`, i, now(), id, i)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n > 0 {
			affected[id] = true
		}
	}
	return nil
}
