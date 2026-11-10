#!/bin/sh
set -e

# Apply pending database migrations before starting (idempotent; Prisma uses an advisory lock,
# so several replicas starting together are safe). Disable with RUN_MIGRATIONS=false.
if [ "${RUN_MIGRATIONS:-true}" = "true" ] && [ "$1" = "node" ] && [ "$2" = "server.js" ]; then
  echo "Applying database migrations…"
  (cd /app/tools && node node_modules/prisma/build/index.js migrate deploy)
fi

exec "$@"
