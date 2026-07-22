-- Мягкий дедлайн: цель-ориентир до жёсткого due_on.
ALTER TABLE tasks ADD COLUMN soft_due_on TEXT;
