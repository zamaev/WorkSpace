package store

import (
	"database/sql"
	"errors"
	"fmt"
)

var (
	ErrBadLinkType = errors.New("тип связи не существует")
	ErrSelfLink    = errors.New("нельзя связать задачу саму с собой")
	ErrDupLink     = errors.New("такая связь уже есть")
)

// LinkType — тип связи задач. directed=true: name — прямая подпись
// («блокирует»), reverseName — обратная («блокируется»). directed=false:
// name — симметричная подпись («связана с»), reverseName пуст.
type LinkType struct {
	ID          int64
	Name        string
	ReverseName string
	Directed    bool
	Position    int
	CreatedAt   string
	UpdatedAt   string
}

// TaskLink — связь from→to между ЛОГИЧЕСКИМИ задачами через тип: у серии
// повторов связь видна на всех вхождениях и переживает спавн следующего.
type TaskLink struct {
	ID          int64
	FromLogical int64
	ToLogical   int64
	TypeID      int64
	CreatedAt   string
}

// ── типы связей ──

func CreateLinkType(db *sql.DB, name, reverseName string, directed bool) (LinkType, error) {
	if err := validTitle(name); err != nil {
		return LinkType{}, fmt.Errorf("%w: имя типа связи не может быть пустым", ErrValidation)
	}
	d := 0
	if directed {
		d = 1
	}
	ts := now()
	res, err := db.Exec(
		`INSERT INTO link_types (name, reverse_name, directed, position, created_at, updated_at)
		 VALUES (?, ?, ?, (SELECT COALESCE(MAX(position)+1, 0) FROM link_types WHERE deleted_at IS NULL), ?, ?)`,
		name, reverseName, d, ts, ts,
	)
	if err != nil {
		return LinkType{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return LinkType{}, err
	}
	return loadLinkType(db, id)
}

func ListLinkTypes(db *sql.DB) ([]LinkType, error) {
	rows, err := db.Query(`SELECT id, name, reverse_name, directed, position, created_at, updated_at FROM link_types WHERE deleted_at IS NULL ORDER BY position, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanLinkTypes(rows)
}

type LinkTypeUpdate struct {
	Name        *string
	ReverseName *string
	Directed    *bool
	Position    *int
}

func UpdateLinkType(db *sql.DB, id int64, r LinkTypeUpdate) (LinkType, error) {
	if r.Name != nil {
		if err := validTitle(*r.Name); err != nil {
			return LinkType{}, fmt.Errorf("%w: имя типа связи не может быть пустым", ErrValidation)
		}
	}
	cur, err := loadLinkType(db, id)
	if err != nil {
		return LinkType{}, err
	}
	if r.Name != nil {
		cur.Name = *r.Name
	}
	if r.ReverseName != nil {
		cur.ReverseName = *r.ReverseName
	}
	if r.Directed != nil {
		cur.Directed = *r.Directed
	}
	d := 0
	if cur.Directed {
		d = 1
	}
	if _, err := db.Exec(`UPDATE link_types SET name = ?, reverse_name = ?, directed = ?, updated_at = ? WHERE id = ?`,
		cur.Name, cur.ReverseName, d, now(), id); err != nil {
		return LinkType{}, err
	}
	if r.Position != nil {
		if err := reorderRef(db, "link_types", id, *r.Position); err != nil {
			return LinkType{}, err
		}
	}
	return loadLinkType(db, id)
}

// DeleteLinkType мягко удаляет тип; связи этого типа перестают
// показываться (ListTaskLinks фильтрует по живому типу).
func DeleteLinkType(db *sql.DB, id int64) error {
	if _, err := loadLinkType(db, id); err != nil {
		return err
	}
	_, err := db.Exec(`UPDATE link_types SET deleted_at = ? WHERE id = ?`, now(), id)
	return err
}

func loadLinkType(q querier, id int64) (LinkType, error) {
	rows, err := q.Query(`SELECT id, name, reverse_name, directed, position, created_at, updated_at FROM link_types WHERE id = ? AND deleted_at IS NULL`, id)
	if err != nil {
		return LinkType{}, err
	}
	defer rows.Close()
	lts, err := scanLinkTypes(rows)
	if err != nil {
		return LinkType{}, err
	}
	if len(lts) == 0 {
		return LinkType{}, ErrNotFound
	}
	return lts[0], nil
}

func scanLinkTypes(rows *sql.Rows) ([]LinkType, error) {
	var out []LinkType
	for rows.Next() {
		var lt LinkType
		var directed int
		if err := rows.Scan(&lt.ID, &lt.Name, &lt.ReverseName, &directed, &lt.Position, &lt.CreatedAt, &lt.UpdatedAt); err != nil {
			return nil, err
		}
		lt.Directed = directed != 0
		out = append(out, lt)
	}
	return out, rows.Err()
}

// ── связи задач ──

// ListTaskLinks — все связи, где жив тип и есть хотя бы одно живое вхождение
// каждой из логических задач-концов (soft-delete всей серии скрывает связь).
func ListTaskLinks(db *sql.DB) ([]TaskLink, error) {
	rows, err := db.Query(`
		SELECT l.id, l.from_logical, l.to_logical, l.type_id, l.created_at
		FROM task_links l
		JOIN link_types t ON t.id = l.type_id AND t.deleted_at IS NULL
		WHERE EXISTS (SELECT 1 FROM tasks a WHERE a.logical_id = l.from_logical AND a.deleted_at IS NULL)
		  AND EXISTS (SELECT 1 FROM tasks b WHERE b.logical_id = l.to_logical AND b.deleted_at IS NULL)
		ORDER BY l.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TaskLink
	for rows.Next() {
		var l TaskLink
		if err := rows.Scan(&l.ID, &l.FromLogical, &l.ToLogical, &l.TypeID, &l.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// logicalOf резолвит физический id вхождения в логический якорь (живой).
func logicalOf(q querier, taskID int64) (int64, error) {
	var lid int64
	err := q.QueryRow(`SELECT logical_id FROM tasks WHERE id = ? AND deleted_at IS NULL`, taskID).Scan(&lid)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrNotFound
	}
	return lid, err
}

// CreateTaskLink связывает ЛОГИЧЕСКИЕ задачи: принимает id любых живых
// вхождений (физические строки) и резолвит их в logical_id. Связь двух
// вхождений одной серии — само-связь (запрещена).
func CreateTaskLink(db *sql.DB, fromID, toID, typeID int64) (TaskLink, error) {
	tx, err := db.Begin()
	if err != nil {
		return TaskLink{}, err
	}
	defer tx.Rollback()

	fromLogical, err := logicalOf(tx, fromID)
	if err != nil {
		return TaskLink{}, err
	}
	toLogical, err := logicalOf(tx, toID)
	if err != nil {
		return TaskLink{}, err
	}
	if fromLogical == toLogical {
		return TaskLink{}, ErrSelfLink
	}
	if _, err := loadLinkType(tx, typeID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return TaskLink{}, ErrBadLinkType
		}
		return TaskLink{}, err
	}
	// дубль той же связи (та же логическая пара + тип, в ту же сторону) запрещён
	var n int
	if err := tx.QueryRow(`SELECT count(*) FROM task_links WHERE from_logical = ? AND to_logical = ? AND type_id = ?`, fromLogical, toLogical, typeID).Scan(&n); err != nil {
		return TaskLink{}, err
	}
	if n > 0 {
		return TaskLink{}, ErrDupLink
	}
	ts := now()
	res, err := tx.Exec(`INSERT INTO task_links (from_logical, to_logical, type_id, created_at) VALUES (?, ?, ?, ?)`, fromLogical, toLogical, typeID, ts)
	if err != nil {
		return TaskLink{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return TaskLink{}, err
	}
	if err := tx.Commit(); err != nil {
		return TaskLink{}, err
	}
	return TaskLink{ID: id, FromLogical: fromLogical, ToLogical: toLogical, TypeID: typeID, CreatedAt: ts}, nil
}

func DeleteTaskLink(db *sql.DB, id int64) error {
	res, err := db.Exec(`DELETE FROM task_links WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
