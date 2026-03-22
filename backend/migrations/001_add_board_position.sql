-- Run once on existing databases: psql -f migrations/001_add_board_position.sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS board_position INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY status ORDER BY created_at ASC, id ASC) - 1 AS rn
  FROM tasks
)
UPDATE tasks t
SET board_position = ranked.rn
FROM ranked
WHERE t.id = ranked.id;
