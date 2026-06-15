-- Aging WIP : horodatage de la dernière entrée d'une tâche dans sa colonne actuelle.
-- Permet d'afficher « N jours en colonne » sur chaque carte sans requêter task_history
-- à chaque rendu. Renseigné à chaque transition de statut (taskModel.updateStatus) et
-- rétro-rempli ici depuis la dernière transition connue, sinon depuis created_at.
--
-- Aucune logique métier modifiée : colonne d'horodatage en lecture seule pour l'UI/metrics.
-- Run: psql -d suivi_production -f migrations/024_add_status_changed_at.sql

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMP DEFAULT NOW();

-- Backfill : dernière transition de statut enregistrée pour chaque tâche…
UPDATE tasks t
SET status_changed_at = sub.last_change
FROM (
  SELECT task_id, MAX(created_at) AS last_change
  FROM task_history
  WHERE action_type = 'status_changed'
  GROUP BY task_id
) sub
WHERE sub.task_id = t.id
  AND t.status_changed_at IS NULL;

-- …sinon, retomber sur la date de création de la tâche.
UPDATE tasks
SET status_changed_at = COALESCE(updated_at, created_at)
WHERE status_changed_at IS NULL;

-- Aging WIP : tri des cartes actives par ancienneté dans la colonne.
CREATE INDEX IF NOT EXISTS idx_tasks_status_changed_at
  ON tasks (status, status_changed_at);
