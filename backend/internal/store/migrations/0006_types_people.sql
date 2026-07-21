CREATE TABLE task_types (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
  position   INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE people (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
  color      TEXT NOT NULL,
  position   INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE tasks ADD COLUMN type_id INTEGER REFERENCES task_types(id);
ALTER TABLE tasks ADD COLUMN assignee_id INTEGER REFERENCES people(id);
