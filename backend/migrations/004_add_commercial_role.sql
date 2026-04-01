-- Migration 004: Ajout du rôle commercial
-- Le rôle 'commercial' peut créer des tâches (POST /tasks).
-- Le super_admin reste l'administrateur principal.
-- Le rôle 'super_admin' conserve aussi la capacité de créer des tâches.

BEGIN;

-- S'assurer que la contrainte de rôle (si elle existe) inclut 'commercial'
-- PostgreSQL: modifier la contrainte CHECK si elle existe
DO $$
BEGIN
  -- Vérifie si une contrainte role_check existe sur users
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'users'
      AND constraint_name = 'users_role_check'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('super_admin', 'planner', 'commercial', 'user'));
  END IF;
END;
$$;

COMMIT;
