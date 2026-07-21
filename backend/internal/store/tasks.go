package store

import (
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"time"
)

var (
	ErrNotFound   = errors.New("задача не найдена")
	ErrCycle      = errors.New("нельзя перенести задачу внутрь её собственного поддерева")
	ErrBadParent  = errors.New("родительская задача не существует")
	ErrValidation = errors.New("невалидные данные")
)

var dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

type Task struct {
	ID          int64
	ParentID    *int64
	ProjectID   int64
	Title       string
	Description string
	Done        bool
	ScheduledOn *string
	DueOn       *string
	Position    int
	DayPosition *int
	CreatedAt   string
	UpdatedAt   string
}

type CreateReq struct {
	Title       string
	Description string
	ParentID    *int64
	ProjectID   *int64 // обязателен для корня; у ребёнка игнорируется (наследует)
	ScheduledOn *string
	DueOn       *string
}

// UpdateReq — уже разобранное намерение PATCH: для nullable-полей пара
// Set*/значение различает «не трогать» и «записать null».
type UpdateReq struct {
	Title          *string
	Description    *string
	Done           *bool
	SetScheduledOn bool
	ScheduledOn    *string
	SetDueOn       bool
	DueOn          *string
	SetParentID    bool
	ParentID       *int64
	SetProjectID   bool
	ProjectID      *int64 // перенос в корень указанного проекта
	Position       *int
	DayPosition    *int
}

func now() string { return time.Now().UTC().Format(time.RFC3339) }

func validTitle(s string) error {
	if len(regexp.MustCompile(`\S`).FindString(s)) == 0 {
		return fmt.Errorf("%w: название не может быть пустым", ErrValidation)
	}
	return nil
}

func validDate(s string) error {
	if !dateRe.MatchString(s) {
		return fmt.Errorf("%w: дата должна быть в формате ГГГГ-ММ-ДД", ErrValidation)
	}
	if _, err := time.Parse("2006-01-02", s); err != nil {
		return fmt.Errorf("%w: несуществующая дата %q", ErrValidation, s)
	}
	return nil
}

// CreateTask возвращает созданную задачу и все затронутые записи
// (созданная + предки, потерявшие done по правилу «добавил → ветка открыта»).
func CreateTask(db *sql.DB, r CreateReq) (Task, []Task, error) {
	if err := validTitle(r.Title); err != nil {
		return Task{}, nil, err
	}
	if r.ScheduledOn != nil {
		if err := validDate(*r.ScheduledOn); err != nil {
			return Task{}, nil, err
		}
	}
	if r.DueOn != nil {
		if err := validDate(*r.DueOn); err != nil {
			return Task{}, nil, err
		}
	}
	if r.ScheduledOn != nil && r.DueOn != nil && *r.DueOn < *r.ScheduledOn {
		return Task{}, nil, fmt.Errorf("%w: дедлайн раньше запланированного дня", ErrValidation)
	}
	tx, err := db.Begin()
	if err != nil {
		return Task{}, nil, err
	}
	defer tx.Rollback()

	var projectID int64
	if r.ParentID != nil {
		parent, err := loadOne(tx, *r.ParentID)
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				return Task{}, nil, ErrBadParent
			}
			return Task{}, nil, err
		}
		projectID = parent.ProjectID
	} else {
		if r.ProjectID == nil {
			return Task{}, nil, fmt.Errorf("%w: корневой задаче нужен проект", ErrValidation)
		}
		proj, err := loadProject(tx, *r.ProjectID)
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				return Task{}, nil, ErrBadProject
			}
			return Task{}, nil, err
		}
		if proj.Archived {
			return Task{}, nil, ErrArchivedTarget
		}
		projectID = *r.ProjectID
	}

	var pos int
	if err := tx.QueryRow(
		`SELECT COALESCE(MAX(position)+1, 0) FROM tasks WHERE parent_id IS ? AND project_id = ?`, r.ParentID, projectID,
	).Scan(&pos); err != nil {
		return Task{}, nil, err
	}

	var dayPos *int
	if r.ScheduledOn != nil {
		var p int
		if err := tx.QueryRow(
			`SELECT COALESCE(MAX(day_position)+1, 0) FROM tasks WHERE scheduled_on = ?`, *r.ScheduledOn,
		).Scan(&p); err != nil {
			return Task{}, nil, err
		}
		dayPos = &p
	}

	ts := now()
	res, err := tx.Exec(
		`INSERT INTO tasks (parent_id, project_id, title, description, done, scheduled_on, due_on, position, day_position, created_at, updated_at)
		 VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
		r.ParentID, projectID, r.Title, r.Description, r.ScheduledOn, r.DueOn, pos, dayPos, ts, ts,
	)
	if err != nil {
		return Task{}, nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Task{}, nil, err
	}

	affected := map[int64]bool{id: true}

	task, err := loadOne(tx, id)
	if err != nil {
		return Task{}, nil, err
	}
	tasks, err := loadMany(tx, affected)
	if err != nil {
		return Task{}, nil, err
	}
	return task, tasks, tx.Commit()
}

func ListTasks(db *sql.DB) ([]Task, error) {
	rows, err := db.Query(taskSelect + ` ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTasks(rows)
}

func UpdateTask(db *sql.DB, id int64, r UpdateReq) ([]Task, error) {
	if r.Title != nil {
		if err := validTitle(*r.Title); err != nil {
			return nil, err
		}
	}
	if r.SetScheduledOn && r.ScheduledOn != nil {
		if err := validDate(*r.ScheduledOn); err != nil {
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

	cur, err := loadOne(tx, id)
	if err != nil {
		return nil, err
	}

	affected := map[int64]bool{id: true}

	// простые поля
	if r.Title != nil {
		cur.Title = *r.Title
	}
	if r.Description != nil {
		cur.Description = *r.Description
	}
	if r.Done != nil {
		cur.Done = *r.Done
	}
	if r.SetDueOn {
		cur.DueOn = r.DueOn
	}
	// финальное состояние дат: дедлайн не может быть раньше плана
	finalScheduled := cur.ScheduledOn
	if r.SetScheduledOn {
		finalScheduled = r.ScheduledOn
	}
	if finalScheduled != nil && cur.DueOn != nil && *cur.DueOn < *finalScheduled {
		return nil, fmt.Errorf("%w: дедлайн раньше запланированного дня", ErrValidation)
	}
	if _, err := tx.Exec(
		`UPDATE tasks SET title = ?, description = ?, done = ?, due_on = ?, updated_at = ? WHERE id = ?`,
		cur.Title, cur.Description, cur.Done, cur.DueOn, now(), id,
	); err != nil {
		return nil, err
	}

	// перенос в корень другого проекта: эквивалент parentId=null в scope
	// нового проекта
	if r.SetProjectID && r.ProjectID != nil && *r.ProjectID != cur.ProjectID {
		proj, err := loadProject(tx, *r.ProjectID)
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				return nil, ErrBadProject
			}
			return nil, err
		}
		if proj.Archived {
			return nil, ErrArchivedTarget
		}
		oldSibs, err := siblingIDs(tx, cur.ParentID, cur.ProjectID, id)
		if err != nil {
			return nil, err
		}
		if err := renumberPositions(tx, oldSibs, affected); err != nil {
			return nil, err
		}
		if _, err := tx.Exec(`UPDATE tasks SET parent_id = NULL, updated_at = ? WHERE id = ?`, now(), id); err != nil {
			return nil, err
		}
		if err := repaintSubtree(tx, id, *r.ProjectID, affected); err != nil {
			return nil, err
		}
		newRoots, err := siblingIDs(tx, nil, *r.ProjectID, id)
		if err != nil {
			return nil, err
		}
		if err := renumberPositions(tx, append(newRoots, id), affected); err != nil {
			return nil, err
		}
		cur, err = loadOne(tx, id)
		if err != nil {
			return nil, err
		}
	}

	// перенос по дереву и/или позиция
	newParent, parentChanged := cur.ParentID, false
	if r.SetParentID && !sameParent(r.ParentID, cur.ParentID) {
		newParent, parentChanged = r.ParentID, true
		if newParent != nil {
			if *newParent == id {
				return nil, ErrCycle
			}
			if err := mustExist(tx, *newParent, ErrBadParent); err != nil {
				return nil, err
			}
			inSubtree, err := isDescendant(tx, id, *newParent)
			if err != nil {
				return nil, err
			}
			if inSubtree {
				return nil, ErrCycle
			}
		}
	}
	if parentChanged || r.Position != nil {
		// уплотнить старых сиблингов (без задачи), вставить в целевой список
		oldSibs, err := siblingIDs(tx, cur.ParentID, cur.ProjectID, id)
		if err != nil {
			return nil, err
		}
		targetSibs := oldSibs
		targetProject := cur.ProjectID
		if parentChanged {
			if err := renumberPositions(tx, oldSibs, affected); err != nil {
				return nil, err
			}
			if newParent != nil {
				p, err := loadOne(tx, *newParent)
				if err != nil {
					return nil, err
				}
				targetProject = p.ProjectID
			}
			if targetProject != cur.ProjectID {
				tp, err := loadProject(tx, targetProject)
				if err != nil {
					return nil, err
				}
				if tp.Archived {
					return nil, ErrArchivedTarget
				}
			}
			targetSibs, err = siblingIDs(tx, newParent, targetProject, id)
			if err != nil {
				return nil, err
			}
		}
		at := len(targetSibs)
		if r.Position != nil {
			at = clamp(*r.Position, 0, len(targetSibs))
		}
		list := insertAt(targetSibs, id, at)
		if _, err := tx.Exec(`UPDATE tasks SET parent_id = ?, updated_at = ? WHERE id = ?`, newParent, now(), id); err != nil {
			return nil, err
		}
		// перенос под родителя другого проекта перекрашивает всё поддерево
		if targetProject != cur.ProjectID {
			if err := repaintSubtree(tx, id, targetProject, affected); err != nil {
				return nil, err
			}
		}
		if err := renumberPositions(tx, list, affected); err != nil {
			return nil, err
		}
	}

	// дата и/или позиция внутри дня
	cur, err = loadOne(tx, id)
	if err != nil {
		return nil, err
	}
	newDay, dayChanged := cur.ScheduledOn, false
	if r.SetScheduledOn && !sameDay(r.ScheduledOn, cur.ScheduledOn) {
		newDay, dayChanged = r.ScheduledOn, true
	}
	if dayChanged || (r.DayPosition != nil && cur.ScheduledOn != nil) {
		if cur.ScheduledOn != nil {
			oldList, err := dayIDs(tx, *cur.ScheduledOn, id)
			if err != nil {
				return nil, err
			}
			if dayChanged {
				if err := renumberDay(tx, oldList, affected); err != nil {
					return nil, err
				}
			}
		}
		if newDay == nil {
			if _, err := tx.Exec(`UPDATE tasks SET scheduled_on = NULL, day_position = NULL, updated_at = ? WHERE id = ?`, now(), id); err != nil {
				return nil, err
			}
		} else {
			list, err := dayIDs(tx, *newDay, id)
			if err != nil {
				return nil, err
			}
			at := len(list)
			if r.DayPosition != nil {
				at = clamp(*r.DayPosition, 0, len(list))
			}
			list = insertAt(list, id, at)
			if _, err := tx.Exec(`UPDATE tasks SET scheduled_on = ?, updated_at = ? WHERE id = ?`, *newDay, now(), id); err != nil {
				return nil, err
			}
			if err := renumberDay(tx, list, affected); err != nil {
				return nil, err
			}
		}
	}

	tasks, err := loadMany(tx, affected)
	if err != nil {
		return nil, err
	}
	return tasks, tx.Commit()
}

func DeleteTask(db *sql.DB, id int64) (int, error) {
	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	if err := mustExist(tx, id, ErrNotFound); err != nil {
		return 0, err
	}
	res, err := tx.Exec(`
		WITH RECURSIVE sub(id) AS (
			SELECT id FROM tasks WHERE id = ?
			UNION ALL
			SELECT t.id FROM tasks t JOIN sub ON t.parent_id = sub.id
		)
		DELETE FROM tasks WHERE id IN (SELECT id FROM sub)`, id)
	if err != nil {
		return 0, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return 0, err
	}
	return int(n), tx.Commit()
}

func repaintSubtree(e interface {
	querier
	execer
}, id, projectID int64, affected map[int64]bool) error {
	rows, err := e.Query(`
		WITH RECURSIVE sub(id) AS (
			SELECT id FROM tasks WHERE id = ?
			UNION ALL
			SELECT t.id FROM tasks t JOIN sub ON t.parent_id = sub.id
		)
		SELECT id FROM sub`, id)
	if err != nil {
		return err
	}
	ids, err := scanIDs(rows)
	rows.Close()
	if err != nil {
		return err
	}
	for _, tid := range ids {
		if _, err := e.Exec(`UPDATE tasks SET project_id = ?, updated_at = ? WHERE id = ?`, projectID, now(), tid); err != nil {
			return err
		}
		affected[tid] = true
	}
	return nil
}

// ── помощники ──

const taskSelect = `SELECT id, parent_id, project_id, title, description, done, scheduled_on, due_on, position, day_position, created_at, updated_at FROM tasks`

func scanTasks(rows *sql.Rows) ([]Task, error) {
	var out []Task
	for rows.Next() {
		var t Task
		if err := rows.Scan(&t.ID, &t.ParentID, &t.ProjectID, &t.Title, &t.Description, &t.Done, &t.ScheduledOn, &t.DueOn, &t.Position, &t.DayPosition, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

type querier interface {
	Query(query string, args ...any) (*sql.Rows, error)
	QueryRow(query string, args ...any) *sql.Row
}

func loadOne(q querier, id int64) (Task, error) {
	rows, err := q.Query(taskSelect+` WHERE id = ?`, id)
	if err != nil {
		return Task{}, err
	}
	defer rows.Close()
	tasks, err := scanTasks(rows)
	if err != nil {
		return Task{}, err
	}
	if len(tasks) == 0 {
		return Task{}, ErrNotFound
	}
	return tasks[0], nil
}

func loadMany(q querier, ids map[int64]bool) ([]Task, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	args := make([]any, 0, len(ids))
	ph := ""
	for id := range ids {
		if ph != "" {
			ph += ","
		}
		ph += "?"
		args = append(args, id)
	}
	rows, err := q.Query(taskSelect+` WHERE id IN (`+ph+`) ORDER BY id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTasks(rows)
}

func mustExist(q querier, id int64, notFound error) error {
	var n int
	if err := q.QueryRow(`SELECT count(*) FROM tasks WHERE id = ?`, id).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		return notFound
	}
	return nil
}

// isDescendant: candidate находится в поддереве root?
func isDescendant(q querier, root, candidate int64) (bool, error) {
	var n int
	err := q.QueryRow(`
		WITH RECURSIVE sub(id) AS (
			SELECT id FROM tasks WHERE id = ?
			UNION ALL
			SELECT t.id FROM tasks t JOIN sub ON t.parent_id = sub.id
		)
		SELECT count(*) FROM sub WHERE id = ?`, root, candidate).Scan(&n)
	return n > 0, err
}

// siblingIDs: сиблинги в рамках родителя; для корней (parent NULL) — в рамках
// проекта, иначе корни разных проектов перенумеровывали бы друг друга.
func siblingIDs(q querier, parent *int64, projectID int64, exclude int64) ([]int64, error) {
	rows, err := q.Query(
		`SELECT id FROM tasks WHERE parent_id IS ? AND project_id = ? AND id != ? ORDER BY position`,
		parent, projectID, exclude,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanIDs(rows)
}

func dayIDs(q querier, day string, exclude int64) ([]int64, error) {
	rows, err := q.Query(`SELECT id FROM tasks WHERE scheduled_on = ? AND id != ? ORDER BY day_position`, day, exclude)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanIDs(rows)
}

func scanIDs(rows *sql.Rows) ([]int64, error) {
	var out []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

type execer interface {
	Exec(query string, args ...any) (sql.Result, error)
}

// renumberPositions присваивает списку плотные position 0..n; в affected
// попадают только реально изменившиеся строки.
func renumberPositions(e execer, ids []int64, affected map[int64]bool) error {
	for i, id := range ids {
		res, err := e.Exec(`UPDATE tasks SET position = ?, updated_at = ? WHERE id = ? AND position != ?`, i, now(), id, i)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n > 0 {
			affected[id] = true
		}
	}
	return nil
}

func renumberDay(e execer, ids []int64, affected map[int64]bool) error {
	for i, id := range ids {
		res, err := e.Exec(`UPDATE tasks SET day_position = ?, updated_at = ? WHERE id = ? AND day_position IS NOT ?`, i, now(), id, i)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n > 0 {
			affected[id] = true
		}
	}
	return nil
}

func insertAt(list []int64, id int64, at int) []int64 {
	out := make([]int64, 0, len(list)+1)
	out = append(out, list[:at]...)
	out = append(out, id)
	return append(out, list[at:]...)
}

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func sameParent(a, b *int64) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func sameDay(a, b *string) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}
