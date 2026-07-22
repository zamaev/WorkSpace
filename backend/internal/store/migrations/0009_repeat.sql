-- Правило повтора: JSON {"kind":"weekly","days":[1..7]} у живой задачи серии.
ALTER TABLE tasks ADD COLUMN repeat TEXT;
