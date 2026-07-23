-- Типы связей задач: справочник (как типы задач). Направленные типы
-- имеют прямую и обратную подпись (блокирует/блокируется); ненаправленные
-- — одну (связана с). Сиды по умолчанию — редактируемы/удаляемы.
CREATE TABLE link_types (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  reverse_name TEXT NOT NULL DEFAULT '',
  directed     INTEGER NOT NULL DEFAULT 1,
  position     INTEGER NOT NULL,
  deleted_at   TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
INSERT INTO link_types (name, reverse_name, directed, position, created_at, updated_at) VALUES
 ('порождает', 'порождена из', 1, 0, '2026-07-23T00:00:00Z', '2026-07-23T00:00:00Z'),
 ('блокирует', 'блокируется', 1, 1, '2026-07-23T00:00:00Z', '2026-07-23T00:00:00Z'),
 ('связана с', '', 0, 2, '2026-07-23T00:00:00Z', '2026-07-23T00:00:00Z');
