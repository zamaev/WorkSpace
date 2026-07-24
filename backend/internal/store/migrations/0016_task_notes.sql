-- Связь задача ↔ заметка (many-to-many): прикрепление заметок к задачам.
-- Двусторонняя — видна и в задаче, и в заметке. Пара уникальна.
CREATE TABLE task_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL REFERENCES tasks(id),
  note_id    INTEGER NOT NULL REFERENCES notes(id),
  created_at TEXT NOT NULL,
  UNIQUE (task_id, note_id)
);
CREATE INDEX idx_task_notes_task ON task_notes(task_id);
CREATE INDEX idx_task_notes_note ON task_notes(note_id);
