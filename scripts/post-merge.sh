#!/bin/bash
set -e
pnpm install --frozen-lockfile
# PRRO DDL is journaled, not reconciled with a destructive schema push.
# The command provisions non-fiscal base tables only on a completely empty schema.
# Startup only verifies the schema; Publish owns production schema changes.
pnpm --filter @workspace/scripts run db:migrate-prro
