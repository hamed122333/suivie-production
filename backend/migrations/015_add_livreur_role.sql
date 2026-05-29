-- Migration 015: Add 'livreur' (delivery driver) to the users role enum constraint
-- This allows creating users with role='livreur' who can mark tasks as DELIVERED.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin', 'planner', 'commercial', 'user', 'livreur'));
