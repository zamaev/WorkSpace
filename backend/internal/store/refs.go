package store

import (
	"database/sql"
	"errors"
	"fmt"
)

// Справочники: типы задач и люди (команда). CRUD без reorder — порядок
// по создании.

var (
	ErrBadType   = errors.New("тип не существует")
	ErrBadPerson = errors.New("человек не существует")
)

type TaskType struct {
	ID        int64
	Name      string
	Position  int
	CreatedAt string
	UpdatedAt string
}

type Person struct {
	ID        int64
	Name      string
	Color     string
	Position  int
	CreatedAt string
	UpdatedAt string
}

func CreateType(db *sql.DB, name string) (TaskType, error) {
	if err := validTitle(name); err != nil {
		return TaskType{}, fmt.Errorf("%w: имя типа не может быть пустым", ErrValidation)
	}
	ts := now()
	res, err := db.Exec(
		`INSERT INTO task_types (name, position, created_at, updated_at)
		 VALUES (?, (SELECT COALESCE(MAX(position)+1, 0) FROM task_types), ?, ?)`,
		name, ts, ts,
	)
	if err != nil {
		return TaskType{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return TaskType{}, err
	}
	return loadType(db, id)
}

func ListTypes(db *sql.DB) ([]TaskType, error) {
	rows, err := db.Query(`SELECT id, name, position, created_at, updated_at FROM task_types ORDER BY position, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TaskType
	for rows.Next() {
		var t TaskType
		if err := rows.Scan(&t.ID, &t.Name, &t.Position, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func UpdateType(db *sql.DB, id int64, name string) (TaskType, error) {
	if err := validTitle(name); err != nil {
		return TaskType{}, fmt.Errorf("%w: имя типа не может быть пустым", ErrValidation)
	}
	res, err := db.Exec(`UPDATE task_types SET name = ?, updated_at = ? WHERE id = ?`, name, now(), id)
	if err != nil {
		return TaskType{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return TaskType{}, ErrNotFound
	}
	return loadType(db, id)
}

// DeleteType снимает тип с задач и удаляет его.
func DeleteType(db *sql.DB, id int64) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := refExists(tx, "task_types", id); err != nil {
		return err
	}
	if _, err := tx.Exec(`UPDATE tasks SET type_id = NULL, updated_at = ? WHERE type_id = ?`, now(), id); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM task_types WHERE id = ?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

func loadType(db *sql.DB, id int64) (TaskType, error) {
	var t TaskType
	err := db.QueryRow(`SELECT id, name, position, created_at, updated_at FROM task_types WHERE id = ?`, id).
		Scan(&t.ID, &t.Name, &t.Position, &t.CreatedAt, &t.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return TaskType{}, ErrNotFound
	}
	return t, err
}

func CreatePerson(db *sql.DB, name, color string) (Person, error) {
	if err := validTitle(name); err != nil {
		return Person{}, fmt.Errorf("%w: имя не может быть пустым", ErrValidation)
	}
	if err := validColor(color); err != nil {
		return Person{}, err
	}
	ts := now()
	res, err := db.Exec(
		`INSERT INTO people (name, color, position, created_at, updated_at)
		 VALUES (?, ?, (SELECT COALESCE(MAX(position)+1, 0) FROM people), ?, ?)`,
		name, color, ts, ts,
	)
	if err != nil {
		return Person{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Person{}, err
	}
	return loadPerson(db, id)
}

func ListPeople(db *sql.DB) ([]Person, error) {
	rows, err := db.Query(`SELECT id, name, color, position, created_at, updated_at FROM people ORDER BY position, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Person
	for rows.Next() {
		var p Person
		if err := rows.Scan(&p.ID, &p.Name, &p.Color, &p.Position, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

type PersonUpdate struct {
	Name  *string
	Color *string
}

func UpdatePerson(db *sql.DB, id int64, r PersonUpdate) (Person, error) {
	cur, err := loadPerson(db, id)
	if err != nil {
		return Person{}, err
	}
	if r.Name != nil {
		if err := validTitle(*r.Name); err != nil {
			return Person{}, fmt.Errorf("%w: имя не может быть пустым", ErrValidation)
		}
		cur.Name = *r.Name
	}
	if r.Color != nil {
		if err := validColor(*r.Color); err != nil {
			return Person{}, err
		}
		cur.Color = *r.Color
	}
	if _, err := db.Exec(`UPDATE people SET name = ?, color = ?, updated_at = ? WHERE id = ?`, cur.Name, cur.Color, now(), id); err != nil {
		return Person{}, err
	}
	return loadPerson(db, id)
}

// DeletePerson снимает исполнителя с его задач и удаляет человека.
func DeletePerson(db *sql.DB, id int64) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := refExists(tx, "people", id); err != nil {
		return err
	}
	if _, err := tx.Exec(`UPDATE tasks SET assignee_id = NULL, updated_at = ? WHERE assignee_id = ?`, now(), id); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM people WHERE id = ?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

func loadPerson(db *sql.DB, id int64) (Person, error) {
	var p Person
	err := db.QueryRow(`SELECT id, name, color, position, created_at, updated_at FROM people WHERE id = ?`, id).
		Scan(&p.ID, &p.Name, &p.Color, &p.Position, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Person{}, ErrNotFound
	}
	return p, err
}

func refExists(q querier, table string, id int64) error {
	var n int
	if err := q.QueryRow(`SELECT count(*) FROM `+table+` WHERE id = ?`, id).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
