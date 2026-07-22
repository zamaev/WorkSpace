-- Заякорить legacy-повторы: правило есть, series_id не проставлен (до 0011).
UPDATE tasks SET series_id = id WHERE repeat IS NOT NULL AND series_id IS NULL AND deleted_at IS NULL;
