#!/bin/sh
set -e

APP_URL="${APP_URL:-http://host.docker.internal:8090}"

echo "Waiting for app at ${APP_URL}..."
until wget -qO- "${APP_URL}/api/healthcheck" >/dev/null 2>&1; do
  echo "  not ready, retrying in 3s..."
  sleep 3
done

echo "App is up. Running seed script..."
psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" -f /seed.sql

echo "Seeding complete."
