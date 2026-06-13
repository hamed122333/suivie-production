-- Livraison partielle cumulative sur une seule fiche (pas de split).
-- quantity = commande totale ; quantity_delivered = cumul livré ; reste en DONE jusqu'au complet.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS quantity_delivered NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tasks_partial_delivery
  ON tasks (status, quantity_delivered)
  WHERE status = 'DONE' AND quantity_delivered > 0;
