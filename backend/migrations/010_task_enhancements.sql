-- Feature enhancements: unknown product flag, stock quantities at creation,
-- stock conflict detection, urgent date flag, predictive task support.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS is_known_product            BOOLEAN       DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS stock_available_at_creation NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS stock_deficit               NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS has_stock_conflict          BOOLEAN       DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS competing_clients           TEXT,
  ADD COLUMN IF NOT EXISTS urgent_date_pending         BOOLEAN       DEFAULT FALSE;

-- Remplir stock_available_at_creation pour les tâches existantes TODO/WAITING_STOCK
-- depuis la table stock_import (dernière entrée connue pour chaque article)
UPDATE tasks t
SET stock_available_at_creation = COALESCE((
      SELECT si.quantity
      FROM stock_import si
      WHERE UPPER(si.article) = UPPER(t.item_reference)
      ORDER BY si.id DESC
      LIMIT 1
    ), 0),
    stock_deficit = GREATEST(
      COALESCE(t.quantity, 1) - COALESCE((
        SELECT si.quantity
        FROM stock_import si
        WHERE UPPER(si.article) = UPPER(t.item_reference)
        ORDER BY si.id DESC
        LIMIT 1
      ), 0),
      0
    )
WHERE t.item_reference IS NOT NULL
  AND t.status NOT IN ('DONE')
  AND (t.task_type IS NULL OR t.task_type != 'PREDICTIVE');

-- Détecter les conflits de stock pour les tâches actives partageant le même article
UPDATE tasks t
SET has_stock_conflict = TRUE,
    competing_clients  = (
      SELECT STRING_AGG(DISTINCT t2.client_name, ', ')
      FROM tasks t2
      WHERE UPPER(t2.item_reference) = UPPER(t.item_reference)
        AND t2.id != t.id
        AND t2.status NOT IN ('DONE')
        AND (t2.task_type IS NULL OR t2.task_type != 'PREDICTIVE')
        AND t2.client_name IS NOT NULL
    )
WHERE t.item_reference IS NOT NULL
  AND t.status NOT IN ('DONE')
  AND (t.task_type IS NULL OR t.task_type != 'PREDICTIVE')
  AND (
    -- Demande totale > stock disponible pour cet article
    SELECT COALESCE(SUM(t3.quantity), 0)
    FROM tasks t3
    WHERE UPPER(t3.item_reference) = UPPER(t.item_reference)
      AND t3.status NOT IN ('DONE')
      AND (t3.task_type IS NULL OR t3.task_type != 'PREDICTIVE')
  ) > COALESCE((
    SELECT si.quantity
    FROM stock_import si
    WHERE UPPER(si.article) = UPPER(t.item_reference)
    ORDER BY si.id DESC
    LIMIT 1
  ), 0);
