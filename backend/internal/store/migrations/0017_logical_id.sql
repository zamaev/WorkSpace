-- logical_id — постоянный идентификатор «логической задачи», обязателен у всех:
-- у разовой равен её id, у серии повторов один на все вхождения (id первой
-- задачи серии; бывший series_id). Привязки (task_notes) переводятся на него,
-- чтобы заметка переживала спавн следующего вхождения при отметке ✓.

-- 1) дедуп ДО конвертации: привязки разных вхождений одной серии после
--    перевода на якорь стали бы одинаковыми парами и UPDATE упал бы об
--    UNIQUE(task_id, note_id) — группируем по будущему значению заранее
DELETE FROM task_notes WHERE id NOT IN (
  SELECT MIN(tn.id) FROM task_notes tn
  JOIN tasks t ON t.id = tn.task_id
  GROUP BY COALESCE(t.series_id, t.id), tn.note_id
);

-- 2) привязки заметок: физический task_id → логический якорь.
--    Делается ДО пересборки tasks — нужен ещё существующий series_id.
UPDATE task_notes SET task_id = (
  SELECT COALESCE(t.series_id, t.id) FROM tasks t WHERE t.id = task_notes.task_id
);

-- 3) честное имя колонки (UNIQUE-констрейнт переименуется автоматически)
ALTER TABLE task_notes RENAME COLUMN task_id TO logical_id;
DROP INDEX idx_task_notes_task;
CREATE INDEX idx_task_notes_logical ON task_notes(logical_id);

-- 4) tasks: series_id → logical_id NOT NULL. NOT NULL не добавить через
--    ALTER — пересборка таблицы (rebuild-паттерн, как в 0002).
CREATE TABLE tasks_v3 (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id    INTEGER REFERENCES tasks_v3(id),
  project_id   INTEGER NOT NULL REFERENCES projects(id),
  title        TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description  TEXT NOT NULL DEFAULT '',
  done         INTEGER NOT NULL DEFAULT 0,
  scheduled_on TEXT,
  position     INTEGER NOT NULL,
  day_position INTEGER,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  due_on       TEXT,
  end_on       TEXT,
  type_id      INTEGER REFERENCES task_types(id),
  assignee_id  INTEGER REFERENCES people(id),
  soft_due_on  TEXT,
  repeat       TEXT,
  deleted_at   TEXT,
  -- без REFERENCES: свежесозданная задача получает logical_id = свой id
  -- вторым шагом внутри транзакции (id неизвестен до INSERT)
  logical_id   INTEGER NOT NULL
);

INSERT INTO tasks_v3 (id, parent_id, project_id, title, description, done,
                      scheduled_on, position, day_position, created_at, updated_at,
                      due_on, end_on, type_id, assignee_id, soft_due_on, repeat,
                      deleted_at, logical_id)
SELECT id, parent_id, project_id, title, description, done,
       scheduled_on, position, day_position, created_at, updated_at,
       due_on, end_on, type_id, assignee_id, soft_due_on, repeat,
       deleted_at, COALESCE(series_id, id)
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_v3 RENAME TO tasks;

CREATE INDEX idx_tasks_parent ON tasks(parent_id);
CREATE INDEX idx_tasks_day ON tasks(scheduled_on);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_logical ON tasks(logical_id);
