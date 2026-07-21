package store

import (
	"database/sql"
	"errors"
	"fmt"
	"regexp"
)

var ErrBadProject = errors.New("проект не существует")

var colorRe = regexp.MustCompile(`^#[0-9a-f]{6}$`)

type Project struct {
	ID        int64
	Name      string
	Color     string
	StartOn   *string
	DueOn     *string
	Position  int
	CreatedAt string
	UpdatedAt string
}

type ProjectUpdate struct {
	Name       *string
	Color      *string
	Position   *int
	SetStartOn bool
	StartOn    *string
	SetDueOn   bool
	DueOn      *string
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

func CreateProject(db *sql.DB, name, color string) (Project, error) {
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

	var pos int
	if err := tx.QueryRow(`SELECT COALESCE(MAX(position)+1, 0) FROM projects`).Scan(&pos); err != nil {
		return Project{}, err
	}
	ts := now()
	res, err := tx.Exec(
		`INSERT INTO projects (name, color, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
		name, color, pos, ts, ts,
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

// UpdateProject: смена position вставляет проект на индекс среди остальных
// и плотно перенумеровывает весь список (как задачи в дереве).
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

	affected := map[int64]bool{id: true}
	if r.Position != nil {
		rows, err := tx.Query(`SELECT id FROM projects WHERE id != ? ORDER BY position, id`, id)
		if err != nil {
			return nil, err
		}
		others, err := scanIDs(rows)
		rows.Close()
		if err != nil {
			return nil, err
		}
		list := insertAt(others, id, clamp(*r.Position, 0, len(others)))
		for i, pid := range list {
			res, err := tx.Exec(`UPDATE projects SET position = ?, updated_at = ? WHERE id = ? AND position != ?`, i, now(), pid, i)
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

// DeleteProject удаляет проект и все его задачи; возвращает число задач.
func DeleteProject(db *sql.DB, id int64) (int, error) {
	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	if _, err := loadProject(tx, id); err != nil {
		return 0, err
	}
	res, err := tx.Exec(`DELETE FROM tasks WHERE project_id = ?`, id)
	if err != nil {
		return 0, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return 0, err
	}
	if _, err := tx.Exec(`DELETE FROM projects WHERE id = ?`, id); err != nil {
		return 0, err
	}
	return int(n), tx.Commit()
}

const projectSelect = `SELECT id, name, color, start_on, due_on, position, created_at, updated_at FROM projects`

func scanProjects(rows *sql.Rows) ([]Project, error) {
	var out []Project
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.Name, &p.Color, &p.StartOn, &p.DueOn, &p.Position, &p.CreatedAt, &p.UpdatedAt); err != nil {
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

func projectExists(q querier, id int64) error {
	var n int
	if err := q.QueryRow(`SELECT count(*) FROM projects WHERE id = ?`, id).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		return ErrBadProject
	}
	return nil
}
