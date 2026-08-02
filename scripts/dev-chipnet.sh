#!/usr/bin/env bash
trap 'kill 0' EXIT

bun run packages/backend/src/main.ts &
CUSTODY_URL=http://localhost:3000 bun run packages/shop-backend/src/main.ts &
bun run --filter '@hermes/frontend' dev &

wait
