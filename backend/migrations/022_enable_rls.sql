-- Sécurité (Supabase Security Advisor) : activer Row Level Security sur TOUTES
-- les tables du schéma public.
--
-- Contexte : Supabase expose les tables public via PostgREST (clé anon). Cette
-- application n'utilise PAS l'API/Auth Supabase — le backend Express se connecte
-- en direct via pg en tant que PROPRIÉTAIRE des tables (postgres), qui CONTOURNE
-- la RLS (on ne met pas FORCE). Activer la RLS sans policy ferme donc l'accès
-- anon/authenticated (API publique) sans impacter le backend.
--
-- Idempotent : ENABLE ROW LEVEL SECURITY est sans effet si déjà actif.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
  END LOOP;
END $$;
