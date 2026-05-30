-- Ajoute le code client (« Tiers » / CL000XXX) sur les tâches,
-- pour conserver l'identifiant client lors de l'import des commandes
-- (cohérent avec stock_import.client_code).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS client_code VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_tasks_client_code ON tasks(client_code);
