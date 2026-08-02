# Hermes

Parcel custody tracking on Bitcoin Cash. Each parcel is a CashTokens NFT held by a CashScript
covenant; every handover is a signed transaction that moves the NFT's state. The chain is the
record — the shop's database stores orders, not custody.

Monorepo on Bun workspaces. TypeScript throughout, strict, ES2022, NodeNext resolution (all
relative imports carry `.js` extensions).

| Package | Port | What it is |
|---|---|---|
| `packages/backend` | 3000 | Real custody service. Signs and broadcasts to chipnet. |
| `packages/custody-fixture` | 3002 | Offline fake with the identical HTTP API. Dev only. |
| `packages/shop-backend` | 3001 | E-commerce API. Orders, checkout, delivery codes. |
| `packages/frontend` | 5173 | Vite SPA. Buyer, merchant, courier, and public surfaces. |
| `packages/shared` | — | Pure library: commitment encoding, delivery-code hashing. |

---

## Setup

Requires [Bun](https://bun.sh) 1.3+. No other runtime is needed.

```bash
bun install
bun run compile                            # contracts/*.cash → artifacts/*.json
bun run --filter '@hermes/shared' build    # everything else imports its dist/
```

All three steps are mandatory on a fresh clone. `artifacts/` and `packages/shared/dist/` are
both gitignored, and the backend cannot start without them.

### Run offline (recommended first)

```bash
bun run dev:demo
```

Starts the custody fixture, the shop, and the frontend. Nothing touches the network, so parcel
operations return instantly and cannot fail on chain conditions. Open http://localhost:5173.

The fixture implements the same six routes as the real backend, but it does not sign or
broadcast anything — there is no chain behind it. See
[`packages/custody-fixture/DIVERGENCE.md`](packages/custody-fixture/DIVERGENCE.md) for every
point where its behaviour differs before trusting a test against it.

### Run against chipnet

```bash
bun run dev:chipnet
```

Runs the real backend on :3000 in place of the fixture, with the shop pointed at it. Minting and
every transition now build, sign, and broadcast real transactions.

Two things this needs that the fixture does not:

**A funded merchant address.** Minting spends a real UTXO. The default merchant key is the test
value `0x…01`, whose address is `bchtest:qp63uahgrxged4z5jswyt5dn5v3lzsem6cq85x00dt` — fund it
from a chipnet faucet, or supply your own key (see below).

**Patience.** Reading a parcel's history walks the NFT backwards one transaction at a time
against a public Electrum server. A five-hop chain takes roughly six seconds. This is latency,
not a hang.

### Environment

Every variable has a working default; none are required for local development.

| Variable | Default | Applies to |
|---|---|---|
| `MERCHANT_PRIVATE_KEY` | `0x…01` | backend — funds and signs mints |
| `COURIER_A_PRIVATE_KEY` | `0x…02` | backend — courier A signatures |
| `COURIER_B_PRIVATE_KEY` | `0x…03` | backend — courier B signatures |
| `REGISTRY_PRIVATE_KEY` | `0x…04` | backend — signs handoff attestations |
| `RECIPIENT_PRIVATE_KEY` | `0x…05` | backend — signs delivery confirmation |
| `CUSTODY_URL` | `http://localhost:3002` | shop-backend — which custody service to call |
| `SHOP_PORT`, `SHOP_DB` | `3001`, `.shop.db` | shop-backend |
| `FIXTURE_PORT`, `FIXTURE_DB` | `3002`, `.custody-fixture.db` | fixture |
| `B1` | `serve` | fixture — `throw` replays the real backend's delivered-parcel failure |
| `VITE_API_URL` | `http://localhost:3000` | frontend — custody service |
| `VITE_SHOP_API_URL` | *(same origin)* | frontend — shop API, proxied by Vite in dev |

The private-key defaults are the lowest valid secp256k1 scalars. They are fine for chipnet and
must never be used anywhere else.

### Verify

```bash
cd packages/backend && bun test    # 11 tests, no network required
bun run build                      # tsc across all packages
```

There is no linter or formatter. `bun test` plus `bun run build` is the whole gate.

### Docker

```bash
bun run deploy                     # docker compose up --build
```

Builds the backend, shop, and frontend. The fixture is not containerised — compose always runs
against real chipnet.

---

## The contract

[`contracts/Hermes.cash`](contracts/Hermes.cash) is a covenant parameterised at deploy time with
`recipientPkh`, `merchantPkh`, `deliveryCodeHash`, and `registryPk`. Those four values fix the
contract address, so the address *is* the parcel id — the codebase uses `contractId === address`
everywhere and never mints a short id.

Custody lives in the NFT's 22-byte commitment:

```
  state(1) │ custodian(20) │ reason(1)
```

`state` is the current position in the lifecycle, `custodian` is the hash160 of whoever the state
points at, and `reason` is reserved and always `0x00` today. Encoding and decoding live in
`packages/shared/src/commitment.ts` — the only place those bytes are assembled.

### States

| Byte | Name | Meaning |
|---|---|---|
| `0x00` | InCustody | A courier holds the parcel and is liable for it. |
| `0x01` | HandoffPending | Released to a named courier who has not yet accepted. |
| `0x02` | DeliveryPending | Out for delivery. The buyer may now reveal their code. |
| `0x04` | Delivered | Terminal. The NFT has left the covenant. |

### Transitions

Each function verifies the current state, checks a signature against the custodian the
commitment names, and constrains the output commitment. Nothing else can move a parcel.

| Function | Transition | Who signs | Also required |
|---|---|---|---|
| `mint` | → `0x00` | merchant | Sets the initial custodian. |
| `handoff` | `0x00` → `0x01` | current courier | A registry attestation over the next custodian. |
| `acceptHandoff` | `0x01` → `0x00` | the named next courier | Custodian carries over unchanged. |
| `requestDelivery` | `0x00` → `0x02` | current courier | Custodian stays the courier. |
| `confirmDelivery` | `0x02` → `0x04` | **recipient** | `sha256(deliveryCode) == deliveryCodeHash`. |

Three consequences worth knowing before reading the code:

**There is no path out of `0x01` except accepting.** A courier who does not want a parcel simply
never accepts; it sits pending with the releasing courier still liable. The UI's "decline" is a
local list action that signs nothing, and says so.

**The delivery code is a bearer secret.** The covenant checks only that its preimage hashes
correctly — whoever holds it can close the parcel. The shop never returns it except through
`POST /shop/orders/:id/reveal-code`, and the buyer's page warns accordingly.

**`0x04` keeps the courier's pkh, not the recipient's.** `confirmDelivery` requires the output
commitment to be `0x04 + tail`, which preserves the existing custodian bytes. The recipient signs
but is never named on chain, so the delivered hop reads "delivered *by*", not "delivered to".

### Reading history

`getParcelHistory` finds the current NFT UTXO and walks its inputs backwards, decoding one
commitment per hop, oldest-first. After delivery the NFT is no longer at the contract address, so
the reader falls back to the recipient's address using the contract record in SQLite — which is
why that database matters (see below).

---

## Troubleshooting

**`Cannot find module '@hermes/shared'`** — the shared package has not been built, or its
workspace symlink is stale after a rename. Run `bun run --filter '@hermes/shared' build`; if that
does not fix it, `bun install --force` to relink workspaces.

**`ENOENT … artifacts/Hermes.json`** — `artifacts/` is gitignored. Run `bun run compile`. If the
contract file was renamed, delete stale artifacts first; the loader reads one exact filename.

**`No spendable BCH UTXO available at bchtest:… ; fund the merchant address first`** — chipnet
minting needs real coins. Fund the merchant address from a faucet.

**`Unknown contract …; deploy the parcel in this process before transitioning it`** — the backend
rehydrates contracts from `hermes.db`. Deleting or renaming that file orphans every parcel already
on chain: their constructor arguments are gone, so the address cannot be reconstructed. The file
is gitignored, so it never arrives with a clone — parcels minted elsewhere are not readable here.

**`No parcel NFT UTXO found for contract …`** on a delivered parcel — same cause. Reading a
terminal parcel needs `recipientPkh` from that database to know where the NFT went.

**Chain reads take ~6 seconds** — expected. The history walk is sequential against a public
Electrum server. The provider is created once with `manualConnectionManagement` and connected at
startup (`packages/backend/src/di/container.ts`); without that it reconnects per request and the
same read takes closer to 30 seconds.

**A dev server restarts on every keystroke** — `bun dev` runs with `--watch`. For a stable
process during a demo, run the entry point directly: `bun run packages/backend/src/main.ts`.

**Adding a workspace package** — all three Dockerfiles copy the five manifests explicitly before
`bun install --frozen-lockfile`. A sixth package requires editing each of them.
