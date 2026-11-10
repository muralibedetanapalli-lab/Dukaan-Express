#!/bin/sh
set -e

if [ "$1" = "node" ] && [ "$2" = "server.js" ]; then
  # Apply pending database migrations before starting (idempotent; Prisma uses an advisory lock,
  # so several replicas starting together are safe). Disable with RUN_MIGRATIONS=false.
  if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
    echo "Applying database migrations…"
    (cd /app/tools && node node_modules/prisma/build/index.js migrate deploy)
  fi
  # Optional idempotent setup (roles, default categories, admin from ADMIN_EMAIL/ADMIN_PASSWORD).
  # Never deletes data; a failure is logged but does not stop the app.
  if [ "${RUN_SETUP:-false}" = "true" ]; then
    echo "Running setup…"
    node /app/scripts/setup.mjs || echo "Setup failed — see the message above. The app will still start."
  fi
fi

exec "$@"
