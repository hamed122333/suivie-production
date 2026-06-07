-- Préparation partielle (À Préparer → En Préparation).
-- Sous-état d'une tâche : le préparateur déclare une quantité partielle, le
-- commercial valide auprès du client, puis split éventuel (part préparée +
-- reliquat). Aucun nouveau statut Kanban — uniquement des champs + relations.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS partial_preparation_status VARCHAR(40),      -- NULL | PENDING_CUSTOMER | APPROVED | REJECTED
  ADD COLUMN IF NOT EXISTS partial_prepared_quantity  NUMERIC(12,2),    -- quantité déclarée préparée
  ADD COLUMN IF NOT EXISTS partial_origin_task_id      INTEGER REFERENCES tasks(id) ON DELETE SET NULL, -- sur le reliquat → tâche d'origine
  ADD COLUMN IF NOT EXISTS partial_parent_order_code   VARCHAR(100),    -- code commande partagé (lien parent/enfant)
  ADD COLUMN IF NOT EXISTS partial_split_part          VARCHAR(12),     -- PREPARED | REMAINDER
  ADD COLUMN IF NOT EXISTS partial_requested_at        TIMESTAMP,
  ADD COLUMN IF NOT EXISTS partial_requested_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partial_decided_at          TIMESTAMP,
  ADD COLUMN IF NOT EXISTS partial_decided_by          INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_partial_status        ON tasks(partial_preparation_status);
CREATE INDEX IF NOT EXISTS idx_tasks_partial_origin        ON tasks(partial_origin_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_partial_parent_order  ON tasks(partial_parent_order_code);
