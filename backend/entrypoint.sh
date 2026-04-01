#!/bin/sh
set -e

# Attendre que la base soit prête
until PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c '\q' 2>/dev/null; do
  echo "Waiting for postgres..."
  sleep 2
done

# Migration (optionnelle)
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  node run-setup.js
fi

# Seed (optionnel)
if [ "${RUN_SEED:-false}" = "true" ]; then
  PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -f seed.sql
elif [ "${AUTO_SEED_IF_EMPTY:-false}" = "true" ]; then
  USERS_EXIST=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 1 FROM users LIMIT 1" 2>/dev/null || true)
  if [ -z "$USERS_EXIST" ]; then
    echo "No users found, running seed.sql..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -f seed.sql
  else
    echo "Users already exist, skipping seed."
  fi
fi

# Lancer le serveur (ou une commande personnalisée)
START_CMD="${START_CMD:-node src/server.js}"
exec sh -c "$START_CMD"
