-- Связи задач — на логические задачи (как task_notes в 0017): связь между
-- сериями повторов живёт на якорях и переживает спавн следующего вхождения.
-- tasks уже пересобрана в 0017, logical_id есть у всех — резолвим по нему.

-- 1) само-связи после перевода на якорь (обе стороны — вхождения ОДНОЙ серии)
--    убираем: задача не может быть связана сама с собой
DELETE FROM task_links WHERE (
  SELECT a.logical_id FROM tasks a WHERE a.id = task_links.from_id
) = (
  SELECT b.logical_id FROM tasks b WHERE b.id = task_links.to_id
);

-- 2) дедуп по будущей логической тройке (from, to, type) — связи разных
--    вхождений одной серии схлопнулись бы в дубли
DELETE FROM task_links WHERE id NOT IN (
  SELECT MIN(l.id) FROM task_links l
  JOIN tasks a ON a.id = l.from_id
  JOIN tasks b ON b.id = l.to_id
  GROUP BY a.logical_id, b.logical_id, l.type_id
);

-- 3) перевод концов на логический якорь
UPDATE task_links SET
  from_id = (SELECT logical_id FROM tasks WHERE id = task_links.from_id),
  to_id   = (SELECT logical_id FROM tasks WHERE id = task_links.to_id);

-- 4) честные имена колонок + индексы
ALTER TABLE task_links RENAME COLUMN from_id TO from_logical;
ALTER TABLE task_links RENAME COLUMN to_id TO to_logical;
DROP INDEX idx_task_links_from;
DROP INDEX idx_task_links_to;
CREATE INDEX idx_task_links_from ON task_links(from_logical);
CREATE INDEX idx_task_links_to ON task_links(to_logical);
