#!/bin/sh
set -e

echo "==> Running Prisma Database Migrations (db push)..."
npx prisma db push --accept-data-loss

echo "==> Starting Node.js Server..."
exec "$@"
