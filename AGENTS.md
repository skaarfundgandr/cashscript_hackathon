# AGENTS.md

## Commands

```bash
bun install                          # all workspaces
bun run compile                      # .cash → artifacts/ (required before backend runs)
bun run --filter '@parcel-tracker/shared' build   # MUST run before building/testing dependents
bun run build                        # build all packages (shared first via filter order)

# Per-package
cd packages/backend && bun test      # run backend tests (bun built-in runner)
cd packages/backend && bun run build # tsc only; tests excluded from compilation

# Dev servers
bun run dev                          # backend on :3000 (chipnet)
bun run dev:fixture                  # offline custody fake on :3002
bun run dev:shop                     # shop-backend on :3001
bun run dev:frontend                 # vite on :5173
bun run dev:demo                     # fixture + shop + frontend together

# Docker
bun run deploy                       # docker compose up --build (backend + shop + frontend)
```

No linter or formatter is configured. Verification is `bun test` + `bun run build` (tsc).

## Build order

`@parcel-tracker/shared` emits `dist/` that every other package imports at runtime. Always build it first. The root `build` script handles this, but running `bun test` or `bun run build` inside a package directly will fail with missing module errors if shared hasn't been built.

## Architecture

- **packages/backend** — real custody service on chipnet (ElectrumNetworkProvider, cashscript contracts). Port 3000.
- **packages/custody-fixture** — offline fake with identical HTTP API, SQLite persistence. Port 3002. Dev-only; not containerized.
- **packages/shop-backend** — e-commerce API. Port 3001. Connects to custody via `CUSTODY_URL` env (default `http://localhost:3002`).
- **packages/frontend** — Vite SPA. Calls backend directly via `VITE_API_URL` (default `http://localhost:3000`, CORS-enabled). No reverse proxy.
- **packages/shared** — pure library: commitment encoding, delivery-code hashing, types.
- **contracts/** — CashScript covenant source. Compiled to `artifacts/` by `bun run compile`.
- **files/** — design specs and flow docs (BUILD-TONIGHT.md is the master plan).

## Key conventions

- TypeScript strict, ES2022, NodeNext resolution. All relative imports use `.js` extensions.
- Backend tests live in `src/test/` and are excluded from `tsc` compilation (`tsconfig.json` exclude).
- `bun:sqlite` is used in backend but `@types/bun` is not installed; an ambient declaration at `src/types/bun-sqlite.d.ts` covers it.
- The backend's `ParcelTracker.ts` constructor accepts optional `(provider?, store?)` for testability. Tests use a fake provider with real libauth-encoded transactions — no module mocking.
- `contractId === contract.address` everywhere. The same string is used as both identifiers.

## Gotchas

- `artifacts/` is gitignored. Run `bun run compile` after cloning or the backend crashes on startup.
- The backend's in-memory contract cache is now backed by SQLite (`parcel-tracker.db`, also gitignored). Deleting the DB orphans on-chain parcels.
- `bun dev` uses `--watch`; saving any file restarts the process. Use `bun run packages/backend/src/main.ts` for stable runs.
- The custody-fixture diverges from the real backend in documented ways — see `packages/custody-fixture/DIVERGENCE.md` before wiring frontend to the real backend.
- Docker builds copy all 5 workspace manifests before `bun install --frozen-lockfile`; adding a new package requires updating all three Dockerfiles.
