-- Связи между задачами: from относится к to через тип. Для направленных
-- from→to — прямое направление; для ненаправленных сторона не важна.
CREATE TABLE task_links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id    INTEGER NOT NULL REFERENCES tasks(id),
  to_id      INTEGER NOT NULL REFERENCES tasks(id),
  type_id    INTEGER NOT NULL REFERENCES link_types(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_task_links_from ON task_links(from_id);
CREATE INDEX idx_task_links_to ON task_links(to_id);
