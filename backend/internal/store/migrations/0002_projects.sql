CREATE TABLE projects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
  color      TEXT NOT NULL,
  position   INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Каждый корень v1 становится проектом; id проекта = id корневой задачи
-- (свежая таблица — коллизий нет), цвет — по кругу палитры.
WITH palette(i, c) AS (
  VALUES (0,'#c9a96a'),(1,'#8fb56b'),(2,'#6a9bc9'),(3,'#c9736a'),
         (4,'#9a7bc9'),(5,'#6ac9b8'),(6,'#c98fb0'),(7,'#a8c96a'),
         (8,'#6a7ec9'),(9,'#c9836a'),(10,'#8a8f98'),(11,'#5fb0c9')
),
roots AS (
  SELECT id, title, created_at, updated_at,
         ROW_NUMBER() OVER (ORDER BY position, id) - 1 AS rn
  FROM tasks WHERE parent_id IS NULL
)
INSERT INTO projects (id, name, color, position, created_at, updated_at)
SELECT r.id, r.title, p.c, r.rn, r.created_at, r.updated_at
FROM roots r JOIN palette p ON p.i = r.rn % 12;

CREATE TABLE tasks_v2 (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id    INTEGER REFERENCES tasks_v2(id),
  project_id   INTEGER NOT NULL REFERENCES projects(id),
  title        TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description  TEXT NOT NULL DEFAULT '',
  done         INTEGER NOT NULL DEFAULT 0,
  scheduled_on TEXT,
  position     INTEGER NOT NULL,
  day_position INTEGER,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- Не-корневые задачи: проект = их верхний предок; дети корней поднимаются
-- до корней проекта (parent_id NULL).
WITH RECURSIVE lineage(id, root_id) AS (
  SELECT id, id FROM tasks WHERE parent_id IS NULL
  UNION ALL
  SELECT t.id, l.root_id FROM tasks t JOIN lineage l ON t.parent_id = l.id
)
INSERT INTO tasks_v2 (id, parent_id, project_id, title, description, done,
                      scheduled_on, position, day_position, created_at, updated_at)
SELECT t.id,
       CASE WHEN t.parent_id IN (SELECT id FROM tasks WHERE parent_id IS NULL)
            THEN NULL ELSE t.parent_id END,
       l.root_id,
       t.title, t.description, t.done, t.scheduled_on, t.position,
       t.day_position, t.created_at, t.updated_at
FROM tasks t JOIN lineage l ON l.id = t.id
WHERE t.parent_id IS NOT NULL;

-- Корень со значимыми полями (дата/готовность/описание) не выбрасывается,
-- а остаётся задачей внутри своего проекта (position -1 — первым в списке).
INSERT INTO tasks_v2 (id, parent_id, project_id, title, description, done,
                      scheduled_on, position, day_position, created_at, updated_at)
SELECT t.id, NULL, t.id, t.title, t.description, t.done, t.scheduled_on,
       -1, t.day_position, t.created_at, t.updated_at
FROM tasks t
WHERE t.parent_id IS NULL
  AND (t.scheduled_on IS NOT NULL OR t.done = 1 OR t.description != '');

DROP TABLE tasks;
ALTER TABLE tasks_v2 RENAME TO tasks;

CREATE INDEX idx_tasks_parent ON tasks(parent_id);
CREATE INDEX idx_tasks_day ON tasks(scheduled_on);
CREATE INDEX idx_tasks_project ON tasks(project_id);
