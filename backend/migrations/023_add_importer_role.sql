-- Migration 023: Add 'importer' role to the users role enum constraint.
-- Rôle dédié aux imports Excel (commandes, stock, commerciaux) + correction des
-- anomalies des commandes. Le super_admin devient observateur (lecture seule) et
-- ne réalise plus les imports.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin', 'planner', 'commercial', 'user', 'livreur', 'importer'));
