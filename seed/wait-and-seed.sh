#!/bin/sh
set -e

BASE_URL="${BASE_URL:-http://host.docker.internal:8090}"

echo "Waiting for app at ${BASE_URL}..."
until wget -qO- "${BASE_URL}/api/healthcheck" >/dev/null 2>&1; do
  echo "  not ready, retrying in 3s..."
  sleep 3
done

echo "App is up. Running seed script..."
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f /seed.sql

echo "Seeding complete."
