package store

import (
	"database/sql"
	"testing"
)

// Миграция 0002 поверх данных v1: корни становятся проектами, дети — корнями
// проекта; корень со значимыми полями остаётся задачей-копией в проекте.
func TestMigration0002(t *testing.T) {
	db, err := sql.Open("sqlite", "file::memory:")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })

	body, err := migrationsFS.ReadFile("migrations/0001_tasks.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(string(body)); err != nil {
		t.Fatalf("применение 0001: %v", err)
	}
	if _, err := db.Exec(`CREATE TABLE schema_migrations (version TEXT PRIMARY KEY);
		INSERT INTO schema_migrations VALUES ('0001_tasks.sql')`); err != nil {
		t.Fatal(err)
	}

	// данные v1: «Работа» (корень с детьми), «Быт» (корень с датой, без детей)
	seed := `INSERT INTO tasks (id, parent_id, title, description, done, scheduled_on, position, day_position, created_at, updated_at) VALUES
		(1, NULL, 'Работа', '', 0, NULL, 0, NULL, 't', 't'),
		(2, NULL, 'Быт', '', 0, '2026-07-23', 1, 0, 't', 't'),
		(3, 1, 'Проект X', '', 0, NULL, 0, NULL, 't', 't'),
		(4, 3, 'CI', '', 1, '2026-07-21', 0, 0, 't', 't')`
	if _, err := db.Exec(seed); err != nil {
		t.Fatal(err)
	}

	if err := migrate(db); err != nil {
		t.Fatalf("миграция: %v", err)
	}

	projects, err := ListProjects(db)
	if err != nil {
		t.Fatal(err)
	}
	if len(projects) != 2 || projects[0].Name != "Работа" || projects[1].Name != "Быт" {
		t.Fatalf("проекты: %+v", projects)
	}
	if projects[0].Color == projects[1].Color {
		t.Errorf("цвета не различаются: %s", projects[0].Color)
	}

	tasks, err := ListTasks(db)
	if err != nil {
		t.Fatal(err)
	}
	byID := map[int64]Task{}
	for _, task := range tasks {
		byID[task.ID] = task
	}
	// «Работа» (id 1) исчезла как задача — незначимый корень
	if _, ok := byID[1]; ok {
		t.Errorf("незначимый корень остался задачей")
	}
	// «Проект X» поднят до корня проекта «Работа»
	if p3 := byID[3]; p3.ParentID != nil || p3.ProjectID != 1 {
		t.Errorf("Проект X: parent=%v project=%d", p3.ParentID, p3.ProjectID)
	}
	// «CI» остался ребёнком «Проект X», унаследовал проект
	if p4 := byID[4]; p4.ParentID == nil || *p4.ParentID != 3 || p4.ProjectID != 1 || !p4.Done {
		t.Errorf("CI: %+v", p4)
	}
	// «Быт» с датой — задача-копия внутри проекта «Быт»
	p2, ok := byID[2]
	if !ok || p2.ProjectID != 2 || p2.ScheduledOn == nil || *p2.ScheduledOn != "2026-07-23" || p2.Position != -1 {
		t.Errorf("копия Быта: %+v (ok=%v)", p2, ok)
	}
}
