-- Мягкое удаление: записи помечаются, из выборок исчезают, данные остаются.
ALTER TABLE tasks ADD COLUMN deleted_at TEXT;
ALTER TABLE projects ADD COLUMN deleted_at TEXT;
ALTER TABLE task_types ADD COLUMN deleted_at TEXT;
ALTER TABLE people ADD COLUMN deleted_at TEXT;
ALTER TABLE roles ADD COLUMN deleted_at TEXT;
