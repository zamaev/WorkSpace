-- Якорь серии повторов: id первой задачи серии; наследуется при спавне.
ALTER TABLE tasks ADD COLUMN series_id INTEGER;
