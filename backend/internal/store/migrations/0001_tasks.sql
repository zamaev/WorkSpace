CREATE TABLE tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id    INTEGER REFERENCES tasks(id),
  title        TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description  TEXT NOT NULL DEFAULT '',
  done         INTEGER NOT NULL DEFAULT 0,
  scheduled_on TEXT,
  position     INTEGER NOT NULL,
  day_position INTEGER,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_tasks_parent ON tasks(parent_id);
CREATE INDEX idx_tasks_day ON tasks(scheduled_on);
