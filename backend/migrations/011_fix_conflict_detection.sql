-- Correction de la détection des conflits de stock.
-- Règle : un conflit existe UNIQUEMENT si au moins 2 tâches actives
-- partagent le même article ET que leur demande totale dépasse le stock disponible.
-- Une seule tâche avec stock insuffisant n'est PAS un conflit.

-- 1. Remettre à zéro tous les flags incorrectement positionnés
UPDATE tasks SET has_stock_conflict = FALSE, competing_clients = NULL;

-- 2. Marquer les vrais conflits (≥2 tâches + demande totale > stock)
UPDATE tasks t
SET has_stock_conflict = TRUE,
    competing_clients  = (
      SELECT STRING_AGG(
               DISTINCT COALESCE(NULLIF(t2.client_name, ''), t2.order_code, 'SP-' || t2.id::TEXT),
               ', '
             )
      FROM tasks t2
      WHERE UPPER(t2.item_reference) = UPPER(t.item_reference)
        AND t2.id != t.id
        AND t2.status NOT IN ('DONE')
        AND (t2.task_type IS NULL OR t2.task_type != 'PREDICTIVE')
    )
WHERE t.item_reference IS NOT NULL
  AND t.status NOT IN ('DONE')
  AND (t.task_type IS NULL OR t.task_type != 'PREDICTIVE')
  -- Condition 1 : au moins une autre tâche active avec le même article
  AND EXISTS (
    SELECT 1
    FROM tasks t2
    WHERE UPPER(t2.item_reference) = UPPER(t.item_reference)
      AND t2.id != t.id
      AND t2.status NOT IN ('DONE')
      AND (t2.task_type IS NULL OR t2.task_type != 'PREDICTIVE')
  )
  -- Condition 2 : la demande totale dépasse le stock disponible
  AND (
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
