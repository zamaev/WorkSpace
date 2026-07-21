ALTER TABLE task_types ADD COLUMN emoji TEXT NOT NULL DEFAULT '';

CREATE TABLE roles (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
  position   INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE people ADD COLUMN role_id INTEGER REFERENCES roles(id);

CREATE TABLE project_members (
  project_id INTEGER NOT NULL REFERENCES projects(id),
  person_id  INTEGER NOT NULL REFERENCES people(id),
  PRIMARY KEY (project_id, person_id)
);
