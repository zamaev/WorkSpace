package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"slices"
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
	EndOn       *string
	SoftDueOn   *string
	DueOn       *string
	TypeID      *int64
	AssigneeID  *int64
	Position    int
	DayPosition *int
	Repeat      *string // JSON {"kind":"weekly","days":[1..7]} — правило повтора живой задачи серии
	SeriesID    *int64  // якорь серии: id первой задачи; наследуется при спавне
	CreatedAt   string
	UpdatedAt   string
}

type CreateReq struct {
	Title       string
	Description string
	ParentID    *int64
	ProjectID   *int64 // обязателен для корня; у ребёнка игнорируется (наследует)
	ScheduledOn *string
	EndOn       *string
	SoftDueOn   *string
	DueOn       *string
	TypeID      *int64
	AssigneeID  *int64
}

// UpdateReq — уже разобранное намерение PATCH: для nullable-полей пара
// Set*/значение различает «не трогать» и «записать null».
type UpdateReq struct {
	Title          *string
	Description    *string
	Done           *bool
	SetScheduledOn bool
	ScheduledOn    *string
	SetEndOn       bool
	EndOn          *string
	SetSoftDueOn   bool
	SoftDueOn      *string
	SetDueOn       bool
	DueOn          *string
	SetParentID    bool
	ParentID       *int64
	SetProjectID   bool
	ProjectID      *int64 // перенос в корень указанного проекта
	SetTypeID      bool
	TypeID         *int64
	SetAssigneeID  bool
	AssigneeID     *int64
	Position       *int
	DayPosition    *int
	SetRepeat      bool
	Repeat         *RepeatRule
}

func now() string { return time.Now().UTC().Format(time.RFC3339) }

func todayISO() string { return time.Now().Format("2006-01-02") }

// RepeatRule — еженедельный повтор по дням ISO (1=пн … 7=вс).
type RepeatRule struct {
	Kind string `json:"kind"`
	Days []int  `json:"days"`
}

func validRepeat(r RepeatRule) error {
	if r.Kind != "weekly" {
		return fmt.Errorf("%w: неизвестный вид повтора %q", ErrValidation, r.Kind)
	}
	if len(r.Days) == 0 {
		return fmt.Errorf("%w: повтору нужен хотя бы один день недели", ErrValidation)
	}
	seen := map[int]bool{}
	for _, d := range r.Days {
		if d < 1 || d > 7 {
			return fmt.Errorf("%w: день недели вне 1..7", ErrValidation)
		}
		if seen[d] {
			return fmt.Errorf("%w: день недели повторяется", ErrValidation)
		}
		seen[d] = true
	}
	return nil
}

func marshalRepeat(r RepeatRule) string {
	days := append([]int(nil), r.Days...)
	slices.Sort(days)
	b, _ := json.Marshal(RepeatRule{Kind: r.Kind, Days: days})
	return string(b)
}

func parseRepeat(s string) (RepeatRule, error) {
	var r RepeatRule
	if err := json.Unmarshal([]byte(s), &r); err != nil {
		return r, err
	}
	return r, validRepeat(r)
}

// nextOccurrence — ближайшая дата СТРОГО после from с днём недели из days.
func nextOccurrence(fromISO string, days []int) string {
	t, err := time.Parse("2006-01-02", fromISO)
	if err != nil {
		return fromISO
	}
	for i := 1; i <= 7; i++ {
		c := t.AddDate(0, 0, i)
		wd := int(c.Weekday())
		if wd == 0 {
			wd = 7 // ISO: воскресенье = 7
		}
		if slices.Contains(days, wd) {
			return c.Format("2006-01-02")
		}
	}
	return fromISO
}

func maxISO(a, b string) string {
	if a > b {
		return a
	}
	return b
}

// validSoftDue: план ≤ мягкий ≤ жёсткий (каждая пара — если обе даты заданы).
func validSoftDue(scheduled, soft, due *string) error {
	if soft == nil {
		return nil
	}
	if scheduled != nil && *soft < *scheduled {
		return fmt.Errorf("%w: мягкий дедлайн раньше запланированного дня", ErrValidation)
	}
	if due != nil && *due < *soft {
		return fmt.Errorf("%w: жёсткий дедлайн раньше мягкого", ErrValidation)
	}
	return nil
}

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
	if r.SoftDueOn != nil {
		if err := validDate(*r.SoftDueOn); err != nil {
			return Task{}, nil, err
		}
	}
	if r.EndOn != nil {
		if err := validDate(*r.EndOn); err != nil {
			return Task{}, nil, err
		}
		if r.ScheduledOn == nil {
			return Task{}, nil, fmt.Errorf("%w: диапазону работы нужен день начала", ErrValidation)
		}
		if *r.EndOn < *r.ScheduledOn {
			return Task{}, nil, fmt.Errorf("%w: конец работы раньше начала", ErrValidation)
		}
	}
	if r.ScheduledOn != nil && r.DueOn != nil && *r.DueOn < *r.ScheduledOn {
		return Task{}, nil, fmt.Errorf("%w: дедлайн раньше запланированного дня", ErrValidation)
	}
	if err := validSoftDue(r.ScheduledOn, r.SoftDueOn, r.DueOn); err != nil {
		return Task{}, nil, err
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
		`SELECT COALESCE(MAX(position)+1, 0) FROM tasks WHERE parent_id IS ? AND project_id = ? AND deleted_at IS NULL`, r.ParentID, projectID,
	).Scan(&pos); err != nil {
		return Task{}, nil, err
	}

	var dayPos *int
	if r.ScheduledOn != nil {
		var p int
		if err := tx.QueryRow(
			`SELECT COALESCE(MAX(day_position)+1, 0) FROM tasks WHERE scheduled_on = ? AND deleted_at IS NULL`, *r.ScheduledOn,
		).Scan(&p); err != nil {
			return Task{}, nil, err
		}
		dayPos = &p
	}

	if r.TypeID != nil {
		if err := refExists(tx, "task_types", *r.TypeID); err != nil {
			return Task{}, nil, ErrBadType
		}
	}
	if r.AssigneeID != nil {
		if err := refExists(tx, "people", *r.AssigneeID); err != nil {
			return Task{}, nil, ErrBadPerson
		}
	}

	ts := now()
	res, err := tx.Exec(
		`INSERT INTO tasks (parent_id, project_id, title, description, done, scheduled_on, end_on, soft_due_on, due_on, type_id, assignee_id, position, day_position, created_at, updated_at)
		 VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		r.ParentID, projectID, r.Title, r.Description, r.ScheduledOn, r.EndOn, r.SoftDueOn, r.DueOn, r.TypeID, r.AssigneeID, pos, dayPos, ts, ts,
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
	rows, err := db.Query(taskSelect + ` WHERE deleted_at IS NULL ORDER BY id`)
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
	if r.SetSoftDueOn && r.SoftDueOn != nil {
		if err := validDate(*r.SoftDueOn); err != nil {
			return nil, err
		}
	}
	if r.SetEndOn && r.EndOn != nil {
		if err := validDate(*r.EndOn); err != nil {
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

	// повтор: done-переход или разовый перенос спавнят следующее
	// вхождение; правило при этом переезжает в новую задачу
	spawnDate, spawnRule := "", ""
	if cur.Repeat != nil && cur.ScheduledOn != nil {
		if rule, err := parseRepeat(*cur.Repeat); err == nil {
			// спавн следующего вхождения — ТОЛЬКО при выполнении.
			// Перенос повторяющейся ничего не создаёт: правило остаётся
			// у задачи, будущие вхождения — призраки от новой даты
			doneFlip := r.Done != nil && *r.Done && !cur.Done
			if doneFlip {
				spawnDate = nextOccurrence(maxISO(*cur.ScheduledOn, todayISO()), rule.Days)
				// не приземляемся на день, уже занятый другим живым
				// вхождением серии (разовые переносы занимают дни)
				if cur.SeriesID != nil {
					for range 53 {
						var n int
						if err := tx.QueryRow(
							`SELECT count(*) FROM tasks WHERE series_id = ? AND scheduled_on = ? AND done = 0 AND deleted_at IS NULL AND id != ?`,
							*cur.SeriesID, spawnDate, id,
						).Scan(&n); err != nil {
							return nil, err
						}
						if n == 0 {
							break
						}
						spawnDate = nextOccurrence(spawnDate, rule.Days)
					}
				}
				spawnRule = *cur.Repeat
				cur.Repeat = nil
			}
		}
	}

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
	if r.SetSoftDueOn {
		cur.SoftDueOn = r.SoftDueOn
	}
	if r.SetEndOn {
		cur.EndOn = r.EndOn
	}
	if r.SetTypeID {
		if r.TypeID != nil {
			if err := refExists(tx, "task_types", *r.TypeID); err != nil {
				return nil, ErrBadType
			}
		}
		cur.TypeID = r.TypeID
	}
	if r.SetRepeat {
		if r.Repeat != nil {
			if err := validRepeat(*r.Repeat); err != nil {
				return nil, err
			}
			m := marshalRepeat(*r.Repeat)
			cur.Repeat = &m
			// якорь серии: серия начинается с этой задачи; при снятии
			// правила якорь остаётся — история серии связана
			if cur.SeriesID == nil {
				cur.SeriesID = &id
			}
		} else {
			cur.Repeat = nil
		}
	}
	if r.SetAssigneeID {
		if r.AssigneeID != nil {
			if err := refExists(tx, "people", *r.AssigneeID); err != nil {
				return nil, ErrBadPerson
			}
		}
		cur.AssigneeID = r.AssigneeID
	}
	// финальное состояние дат: дедлайн не раньше плана, конец не раньше
	// начала, диапазон без начала не существует
	finalScheduled := cur.ScheduledOn
	if r.SetScheduledOn {
		finalScheduled = r.ScheduledOn
	}
	if finalScheduled == nil {
		cur.EndOn = nil
	}
	if finalScheduled != nil && cur.DueOn != nil && *cur.DueOn < *finalScheduled {
		return nil, fmt.Errorf("%w: дедлайн раньше запланированного дня", ErrValidation)
	}
	if err := validSoftDue(finalScheduled, cur.SoftDueOn, cur.DueOn); err != nil {
		return nil, err
	}
	if cur.EndOn != nil && finalScheduled != nil && *cur.EndOn < *finalScheduled {
		return nil, fmt.Errorf("%w: конец работы раньше начала", ErrValidation)
	}
	if cur.Repeat != nil {
		if finalScheduled == nil {
			return nil, fmt.Errorf("%w: повтору нужна дата плана", ErrValidation)
		}
		if cur.EndOn != nil {
			return nil, fmt.Errorf("%w: повтор несовместим с диапазоном работы", ErrValidation)
		}
	}
	if _, err := tx.Exec(
		`UPDATE tasks SET title = ?, description = ?, done = ?, end_on = ?, soft_due_on = ?, due_on = ?, type_id = ?, assignee_id = ?, repeat = ?, series_id = ?, updated_at = ? WHERE id = ?`,
		cur.Title, cur.Description, cur.Done, cur.EndOn, cur.SoftDueOn, cur.DueOn, cur.TypeID, cur.AssigneeID, cur.Repeat, cur.SeriesID, now(), id,
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

	if spawnDate != "" {
		final, err := loadOne(tx, id)
		if err != nil {
			return nil, err
		}
		if err := spawnSeriesCopy(tx, final, spawnRule, spawnDate, affected); err != nil {
			return nil, err
		}
	}

	tasks, err := loadMany(tx, affected)
	if err != nil {
		return nil, err
	}
	return tasks, tx.Commit()
}

// spawnSeriesCopy — следующее вхождение серии: копия задачи (описание,
// тип, исполнитель, правило) на дату dateISO + копия поддерева со
// сброшенным done и без дат.
func spawnSeriesCopy(tx *sql.Tx, src Task, rule, dateISO string, affected map[int64]bool) error {
	sibs, err := siblingIDs(tx, src.ParentID, src.ProjectID, 0)
	if err != nil {
		return err
	}
	day, err := dayIDs(tx, dateISO, 0)
	if err != nil {
		return err
	}
	ts := now()
	res, err := tx.Exec(
		`INSERT INTO tasks (parent_id, project_id, title, description, done, scheduled_on, repeat, series_id, type_id, assignee_id, position, day_position, created_at, updated_at)
		 VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		src.ParentID, src.ProjectID, src.Title, src.Description, dateISO, rule, src.SeriesID, src.TypeID, src.AssigneeID, len(sibs), len(day), ts, ts,
	)
	if err != nil {
		return err
	}
	newID, err := res.LastInsertId()
	if err != nil {
		return err
	}
	affected[newID] = true
	return copyChildren(tx, src.ID, newID, src.ProjectID, affected)
}

func copyChildren(tx *sql.Tx, fromParent, toParent, projectID int64, affected map[int64]bool) error {
	rows, err := tx.Query(taskSelect+` WHERE parent_id = ? ORDER BY position, id`, fromParent)
	if err != nil {
		return err
	}
	children, err := scanTasks(rows)
	if err != nil {
		return err
	}
	ts := now()
	for i, c := range children {
		res, err := tx.Exec(
			`INSERT INTO tasks (parent_id, project_id, title, description, done, type_id, assignee_id, position, created_at, updated_at)
			 VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
			toParent, projectID, c.Title, c.Description, c.TypeID, c.AssigneeID, i, ts, ts,
		)
		if err != nil {
			return err
		}
		newID, err := res.LastInsertId()
		if err != nil {
			return err
		}
		affected[newID] = true
		if err := copyChildren(tx, c.ID, newID, projectID, affected); err != nil {
			return err
		}
	}
	return nil
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
			SELECT t.id FROM tasks t JOIN sub ON t.parent_id = sub.id WHERE t.deleted_at IS NULL
		)
		UPDATE tasks SET deleted_at = ? WHERE id IN (SELECT id FROM sub) AND deleted_at IS NULL`, id, now())
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
			SELECT t.id FROM tasks t JOIN sub ON t.parent_id = sub.id WHERE t.deleted_at IS NULL
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

const taskSelect = `SELECT id, parent_id, project_id, title, description, done, scheduled_on, end_on, soft_due_on, due_on, type_id, assignee_id, position, day_position, repeat, series_id, created_at, updated_at FROM tasks`

func scanTasks(rows *sql.Rows) ([]Task, error) {
	var out []Task
	for rows.Next() {
		var t Task
		if err := rows.Scan(&t.ID, &t.ParentID, &t.ProjectID, &t.Title, &t.Description, &t.Done, &t.ScheduledOn, &t.EndOn, &t.SoftDueOn, &t.DueOn, &t.TypeID, &t.AssigneeID, &t.Position, &t.DayPosition, &t.Repeat, &t.SeriesID, &t.CreatedAt, &t.UpdatedAt); err != nil {
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
	rows, err := q.Query(taskSelect+` WHERE id = ? AND deleted_at IS NULL`, id)
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
	if err := q.QueryRow(`SELECT count(*) FROM tasks WHERE id = ? AND deleted_at IS NULL`, id).Scan(&n); err != nil {
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
			SELECT t.id FROM tasks t JOIN sub ON t.parent_id = sub.id WHERE t.deleted_at IS NULL
		)
		SELECT count(*) FROM sub WHERE id = ?`, root, candidate).Scan(&n)
	return n > 0, err
}

// siblingIDs: сиблинги в рамках родителя; для корней (parent NULL) — в рамках
// проекта, иначе корни разных проектов перенумеровывали бы друг друга.
func siblingIDs(q querier, parent *int64, projectID int64, exclude int64) ([]int64, error) {
	rows, err := q.Query(
		`SELECT id FROM tasks WHERE parent_id IS ? AND project_id = ? AND id != ? AND deleted_at IS NULL ORDER BY position`,
		parent, projectID, exclude,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanIDs(rows)
}

func dayIDs(q querier, day string, exclude int64) ([]int64, error) {
	rows, err := q.Query(`SELECT id FROM tasks WHERE scheduled_on = ? AND id != ? AND deleted_at IS NULL ORDER BY day_position`, day, exclude)
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
