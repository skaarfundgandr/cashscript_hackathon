# Shop Backend — Phase 1b

> Scope: two **new** packages — `packages/shop-backend` and `packages/custody-fixture` — plus a
> revision of the frontend data layer.
> `packages/backend` is a **fixed input**. Nothing in this document changes it.
> Supersedes six decisions in `DATA-LAYER.md`; see [What this supersedes](#what-this-supersedes).
> Placeholder name `APP` throughout — one string to change later.

---

## The framing

`FRONTEND-FLOW` step ② marks the shop's parcel creation as **★ THE INTEGRATION POINT** — *"the
shop's backend creates the parcel."* `DATA-LAYER.md` locked orders as client-side, which means the
**browser** would call `/parcel/create` directly.

Those cannot both be true, and the difference is visible to a technical judge. Client-side, the
merchant's integration credentials and the returned `deliverySecret` both land in a webpage. The
integration the pitch describes — *"merchants integrate this into systems they already run, one
endpoint plus an embeddable tracking page"* — never actually happens on screen.

So the shop gets a real backend. It is a **separate system** that owns shop data and consumes
custody as an integration:

| System | Owns | Package |
|---|---|---|
| **Custody** | parcel state, the custody chain, txids, the delivery-code *hash* | `packages/backend` — untouched |
| **Shop** | products, orders, buyer, couriers, the delivery-code *plaintext* | `packages/shop-backend` — new |

The shop is Northbay Supply's own e-commerce. It integrates custody; it does not own it.

---

## Locked decisions

| | Decision | Because |
|---|---|---|
| Shop data | A real server, `packages/shop-backend` | Makes step ② a genuine server-to-server integration rather than a browser calling the custody API |
| Delivery secret | Held by the shop backend, released only through `reveal-code` | Gives the code the "truthful home in the buyer's own account" `FRONTEND-FLOW` asks for; the reveal becomes an auditable server event, not a `localStorage` flag a refresh could forge |
| Buyer identity | An opaque `accessToken` in the my-order URL | `FRONTEND-FLOW` forbids a shop login, and order ids are `'4471'`-shaped. Without a token the reveal gate is decorative |
| Aggregation | Shop pages read the custody chain **through** the shop; the public page reads custody **directly** | The buyer's browser only talks to the merchant's system — that is the integration story. The public page's whole claim is *"read from the chain, not from our database"*, so it must not come through the shop |
| The fixture | Its own server, `packages/custody-fixture` | Three independent consumers (shop backend, scanner, public page) need to share one parcel. A fixture inside any one of them is unreachable by the other two |
| Courier ids | Arbitrary, seeded. `A`/`B` are illustrative only | `A`/`B` are a hard limit of `packages/backend`'s fixture keys, not a domain fact |
| `A`/`B` translation | A config map inside `HttpCustodyGateway` | It is an infrastructure detail of one adapter. It does not belong on a domain entity |
| Order status | **Derived from the custody chain. Never stored** | A duplicated status column drifts out of sync with the chain, which quietly undermines the entire pitch |
| Dispatch | Checkout creates an unassigned order; a separate merchant action chooses the initial courier | The buyer does not choose logistics, and parcel minting requires a real initial custodian |
| Custody attachment | `parcelId` / `contractAddress` / `mintTxid` are **nullable** | Dispatch persists assignment before minting, so a failed custody call can be retried without losing either the order or courier choice |
| Persistence | `bun:sqlite`, both packages | Zero install, survives `--watch` restarts and reboots mid-recording |
| B-1 | Fixture serves `0x04` by default, `B1=throw` replays the real failure | B-1 is a backend bug, not a design fact. Hiding it in the fixture does not fix it — it just blocks Stage 4 from being built at all |

---

## Architecture

```
packages/
  shared/            existing
  backend/           existing · UNTOUCHED · :3000 · real chipnet
  custody-fixture/   NEW      · :3002 · the six custody routes, faked
  shop-backend/      NEW      · :3001 · products, orders, buyer, couriers
  frontend/          existing · :5173
```

```
                       ┌─────────────────┐
   shop pages ────────►│  shop-backend   │────► CUSTODY_URL
                       │      :3001      │        │
                       └─────────────────┘        │
                                                  ▼
   scanner    ──────────────────────────►  :3002 custody-fixture   (default)
   public page ─────────────────────────►  :3000 packages/backend  (P6)
```

Both new packages follow `packages/backend`'s layering exactly: `domain/` → `application/ports` +
`application/use-cases` → `infrastructure/` → `presentation/controllers` + `routes`, wired in
`di/container.ts`. Elysia with `@elysiajs/cors` and `@elysiajs/swagger`.

---

## Domain model

### `packages/shop-backend/src/domain/`

```ts
export interface Product {
  id: string;
  name: string;              // 'Field notebook'
  description: string;       // the product-page body copy
  priceCents: number;
  currency: string;          // 'PHP'
  imageUrl: string;
}

export interface Courier {
  id: string;                // 'jnt-mgl' — arbitrary. Never a letter
  name: string;              // 'Miguel Santos'
  pkh: string;               // 20-byte hash160, lowercase hex, no prefix
  company: string;           // 'J&T Express'
}

export interface Buyer {
  id: string;
  name: string;
  address: string;
}

export interface Order {
  orderId: string;           // '4471' — human-readable, printed on the page
  accessToken: string;       // 32 random bytes, hex. The buyer's only credential
  productId: string;
  buyerId: string;
  courierId: string | null;  // null until merchant dispatch; then the initial custodian

  // Custody attachment — null until the mint lands. See Checkout.
  parcelId: string | null;         // the contract address, verbatim
  contractAddress: string | null;  // === parcelId
  mintTxid: string | null;

  deliverySecret: string;    // hex. Never leaves the server except via reveal-code
  revealedAt: number | null; // epoch ms. Stamped once, never cleared
  createdAt: number;         // epoch ms
}
```

**`Order` carries no status field.** The order's state is the custody chain's state, read through
the gateway on every request. Nothing to drift.

`createdAt` and `revealedAt` are **order metadata, not custody timestamps.** They record what the
shop did. They appear on shop chrome only and never on a custody row — that would imply the chain
knows a time it does not know (see B-2).

### Seed data

Products, couriers and the buyer are seeded rows. There is no admin surface and no runtime
registration.

| | |
|---|---|
| Merchant | Northbay Supply |
| Product | Field notebook, A5 |
| Buyer | one, seeded |

Couriers — two, one per hop in the demo flow. The pkhs are the custody backend's fixture keys,
**verified** against `packages/backend/src/infrastructure/fixtures.ts`:

| id | name | company | pkh |
|---|---|---|---|
| `jnt-mgl` | Miguel Santos | J&T Express | `06afd46bcdfd22ef94ac122aa11f241244a37ecc` |
| `ninjavan-rey` | Rey Delgado | Ninja Van | `7dd65592d0ab2fe0d0257d571abf032cd9db93dc` |

This is what earns the timeline real copy. `Accepted · Courier B` becomes:

```
● Accepted     Rey Delgado · Ninja Van · liable from this signature     a144…f8b52
```

---

## The shop API · :3001

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/shop/products` | — | `Product[]` |
| `GET` | `/shop/products/:id` | — | `Product` |
| `GET` | `/shop/couriers` | — | `Courier[]` |
| `POST` | `/shop/checkout` | `{ productId }` | `{ orderId, accessToken }` |
| `GET` | `/shop/orders/:orderId` | — | `OrderView` |
| `POST` | `/shop/orders/:orderId/dispatch` | `{ accessToken, courierId }` | `OrderView` |
| `POST` | `/shop/orders/:orderId/reveal-code` | `{ accessToken }` | `{ secret, revealedAt }` |
| `POST` | `/shop/orders/:orderId/retry-custody` | `{ accessToken }` | `OrderView` |

### `OrderView`

```ts
export interface OrderView {
  orderId: string;
  createdAt: number;
  product: Product;
  buyer: Buyer;
  courier: Courier | null;

  parcelId: string | null;
  contractAddress: string | null;
  mintTxid: string | null;

  chain: CustodyHop[];          // [] when parcelId is null or custody is unreachable
  custodyAvailable: boolean;    // false when the gateway failed this request

  revealedAt: number | null;    // whether the code has been revealed — NOT the code
}
```

**`deliverySecret` never appears in this response.** Only `reveal-code` returns it.

`revealedAt` is present so the my-order page can render the reveal timestamp without holding the
secret — per `FRONTEND-FLOW` step 18, the reveal time has to *stay* on screen.

### Checkout

```
1. Resolve the product. 404 if unknown or missing.
2. Generate orderId (4 digits, unique) and accessToken (32 random bytes, hex).
3. Write the order with courierId/parcelId/contractAddress/mintTxid NULL.
4. Return { orderId, accessToken } — 201.
```

### Dispatch

```
1. Validate order, accessToken and courierId.
2. Atomically assign the courier only if courierId is still NULL.
3. Attempt CustodyGateway.createParcel(courier).
   ├─ success → store parcelId, contractAddress, mintTxid, deliverySecret
   └─ failure → return 502, preserving the courier assignment for retry
```

Checkout never guesses a courier. The order confirmation renders `Order #4471 placed` immediately
and shows that it is awaiting merchant dispatch.

`retry-custody` re-runs dispatch step 3 only when `courierId` is non-null and `parcelId` is null.
It cannot assign a courier; it only recovers a failed mint.

### `reveal-code`

- Requires an `accessToken` matching the order's. Mismatch → `403`, and the secret is not read.
- **Idempotent.** The first call stamps `revealedAt`; later calls return the same timestamp.
- Returns `{ secret, revealedAt }`.

The frontend turns this into the delivery-code QR payload
`{ t: 'delivery', id: parcelId, secret }` per `DATA-LAYER.md`'s `qr-payloads.ts`. The parcel-label
QR on the order confirmation is `{ t: 'parcel', id: parcelId }` and needs no secret.

### Errors

Elysia's default error shape, with the status carrying the meaning:

| Status | When |
|---|---|
| `404` | Unknown product or order |
| `403` | `accessToken` mismatch |
| `409` | Dispatching an assigned order; retrying an unassigned order or one that already has a parcel |
| `502` | The custody gateway failed on a call that requires it |

`GET /shop/orders/:orderId` **never** returns `502`. A custody failure sets
`custodyAvailable: false` and `chain: []`, and the order still renders. An order that 500s because
the chain is briefly unreachable is a worse demo than one that says so.

---

## The custody gateway

### `application/ports/custody-gateway.ts`

```ts
export interface CustodyGateway {
  createParcel(courier: Courier): Promise<{
    parcelId: string;
    address: string;
    mintTxid: string;
    deliverySecret: string;
  }>;

  getChain(parcelId: string): Promise<CustodyHop[]>;   // oldest → newest
}
```

One implementation: `infrastructure/http-custody-gateway.ts`, pointed at `CUSTODY_URL`. Selecting
the fixture or the real backend is a **URL**, not a class.

It carries the `A`/`B` translation the real backend needs, as a config map and nowhere else:

```ts
const CUSTODY_KEY: Record<string, 'A' | 'B'> = {
  'jnt-mgl': 'A',
  'ninjavan-rey': 'B',
};
```

Against `custody-fixture` this map is unused — the fixture accepts any courier id. Against
`packages/backend` an unmapped courier throws, because `getCourier` in `fixtures.ts:22` is a
hardcoded `{ A, B }` and the backend holds only those two private keys. That is a limitation of
code we are not touching, recorded here rather than hidden.

The gateway must respect every quirk `DATA-LAYER.md` observed: `create` returns JSON, the four
mutations return a **bare `text/plain` string**, and the chain is oldest → newest.

---

## `packages/custody-fixture` · :3002

Serves `packages/backend`'s six routes with **identical shapes**:

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/parcel/create` | `{ courierId, recipientPkh? }` | JSON `{ contractId, address, txid, deliverySecret }` |
| `POST` | `/parcel/:id/handoff` | `{ courierId, nextCourierId }` | **bare string** txid |
| `POST` | `/parcel/:id/accept-handoff` | `{ courierId }` | **bare string** txid |
| `POST` | `/parcel/:id/request-delivery` | `{ courierId }` | **bare string** txid |
| `POST` | `/parcel/:id/confirm-delivery` | `{ courierId, deliveryCode }` | **bare string** txid |
| `GET` | `/parcel/:id` | — | JSON `Array<{ txid, state, custodian, timestamp? }>` |

A real state machine over SQLite, with the same guards as the contract:

- `handoff` only from `0x00`, only by the current custodian
- `accept` only from `0x01`, only by the named courier
- `requestDelivery` only from `0x00`, custodian preserved
- `confirm` only from `0x02`, and only with the matching secret

And the same surface characteristics, so nothing downstream learns a habit it has to unlearn:

- Chain oldest → newest
- **No timestamps** on hops
- Artificial latency, 400–900 ms, so `Signing… → Broadcasting…` has somewhere to live
- Fake txids: 64 lowercase hex chars
- Fake parcel ids shaped like a chipnet address — never short ids
- **Arbitrary courier ids.** A keypair is generated per courier on first use and its pkh becomes
  the `custodian` on the chain. This is the *"device signing key provisioned at onboarding"*
  model from `parcel-tracker-auth.md` §1

### The B-1 flag

`B1=serve` (default) returns the full five-hop chain including `0x04 Delivered`.
`B1=throw` reproduces the real backend's failure: `No parcel NFT UTXO found for contract …`.

See [B-1](#b-1--a-delivered-parcel-cannot-be-read) for why the default is `serve`.

### `packages/custody-fixture/DIVERGENCE.md`

**Required, not optional.** An enumerated list of every point where this fixture differs from
`packages/backend`, so P6 is a checklist rather than a surprise. At minimum:

| # | Divergence | Consequence at P6 |
|---|---|---|
| D-1 | Arbitrary courier ids vs hardcoded `A`/`B` | Any courier outside the `CUSTODY_KEY` map fails against the real backend |
| D-2 | `B1=serve` returns `0x04`; the real backend throws | Stage 4 screens break until B-1 is fixed |
| D-3 | No real signatures, no chain, no contract | Nothing proves a transaction was valid |
| D-4 | Latency is 400–900 ms; chipnet is seconds | The shop's patience UI is untested against real timings |
| D-5 | Parcel ids are shaped like chipnet addresses but are not valid cashaddrs | Anything that *validates* an address, rather than echoing it, will fail |

Add a row whenever the fixture takes a shortcut. An undocumented shortcut is a P6 bug with a
delayed fuse.

---

## Storage

`bun:sqlite`, one file per package, both gitignored.

```sql
-- shop-backend
CREATE TABLE orders (
  order_id          TEXT PRIMARY KEY,
  access_token      TEXT NOT NULL,
  product_id        TEXT NOT NULL,
  buyer_id          TEXT NOT NULL,
  courier_id        TEXT NOT NULL,
  parcel_id         TEXT,
  contract_address  TEXT,
  mint_txid         TEXT,
  delivery_secret   TEXT NOT NULL,
  revealed_at       INTEGER,
  created_at        INTEGER NOT NULL
);
```

Products, couriers and the buyer are a seeded static module, not tables. They never change at
runtime and a table for three constant rows is ceremony.

Behind an `OrderRepository` port in `application/ports`, so the store is swappable and the use
cases are testable without a database.

---

## Frontend — revised P1

| | Files |
|---|---|
| **unchanged** | `domain/parcel.ts`, `domain/identity.ts`, `domain/qr-payloads.ts`, `infrastructure/api-error.ts`, `infrastructure/role-store.ts`, `application/ports/parcel-api.ts` |
| **new** | `domain/shop.ts`, `application/ports/shop-api.ts`, `infrastructure/http-shop-api.ts`, `infrastructure/http-parcel-api.ts`, `infrastructure/config.ts` |
| **dropped** | `infrastructure/order-store.ts`, `infrastructure/fixture-api.ts`, `infrastructure/select-api.ts`, `infrastructure/api-client.ts`, `presentation/app.ts` |

Two clients, each with an honest reason to exist:

```
shop pages              → ShopApi   → SHOP_URL     (:3001)
scanner, public page    → ParcelApi → CUSTODY_URL  (:3002 or :3000)
```

`config.ts` replaces `select-api.ts`. Selecting the fixture is now a base URL, so there is no
second implementation to keep faithful.

**Type collision, worth stating.** `@parcel-tracker/shared` exports `type Pkh = Uint8Array`.
`domain/parcel.ts` needs `type Pkh = string`. Named imports only — the frontend must never
`export *` from shared.

No router and no screens. Those are P0 and P3.

---

## Configuration

| Package | Variable | Default |
|---|---|---|
| `shop-backend` | `SHOP_PORT` | `3001` |
| | `CUSTODY_URL` | `http://localhost:3002` |
| | `SHOP_DB` | `.shop.db` |
| `custody-fixture` | `FIXTURE_PORT` | `3002` |
| | `FIXTURE_DB` | `.custody-fixture.db` |
| | `B1` | `serve` |
| `frontend` | `VITE_SHOP_URL` | `http://localhost:3001` |
| | `VITE_CUSTODY_URL` | `http://localhost:3002` |

Root scripts:

```json
"dev:shop":    "bun run --filter '@parcel-tracker/shop-backend' dev",
"dev:fixture": "bun run --filter '@parcel-tracker/custody-fixture' dev",
"dev:demo":    "<fixture + shop + frontend, concurrently>"
```

All three services enable CORS, so the frontend uses direct origins. The existing `/api` Vite
proxy stays as a fallback; pick one at P6 and delete the other.

---

## Blockers

### B-1 · A delivered parcel cannot be read — **backend-owned**

Restated from `DATA-LAYER.md` because this document changes how we respond to it.

`confirmDelivery` moves the NFT **out of the covenant** to the recipient's P2PKH address — which
is correct and is what makes `0x04` terminal. But `getParcelHistory`
(`ParcelTracker.ts:99-104`) only queries UTXOs at the *contract* address:

```ts
const utxos = await this.network.getUtxos(contractId);
const nftUtxo = utxos.find(isNftUtxo);
if (!nftUtxo) throw new Error(`No parcel NFT UTXO found for contract ${contractId}`);
```

The token is at the buyer's address, so it throws. `0x04` is unreachable through the real API.

**What changed:** `DATA-LAYER.md` had the fixture reproduce this faithfully, on the reasoning that
a fixture more capable than the backend moves the failure to P6. That reasoning is sound but its
cost is total — Stage 4, *"the only part of the video that proves anything"*, cannot be **built**
at all, and `packages/backend` is out of scope for this work.

So the fixture serves `0x04` by default and B-1 is filed as D-2 in the divergence audit. The
fixture becomes an executable statement of what `packages/backend` must be fixed to do.

**The consequence, stated so it is not discovered later:** until that fix lands, the delivered
receipt, the fifth timeline row and the public proof page work **in fixture mode only**.
`B1=throw` exists to build and test the unreadable-parcel path deliberately.

**The fix is backend-side:** locate the NFT at the recipient address, or walk back from the stored
delivery txid, instead of requiring a live UTXO at the contract.

### B-2 · No timestamps, no block height

`ParcelHistoryEntry.timestamp` is declared and never populated; nothing exposes block height. The
fixture reproduces this — hops carry no time. Custody rows show actor, state and txid.

This is why `createdAt` and `revealedAt` live on the **order**, not the chain, and are labelled as
local on screen.

---

## What this supersedes

`DATA-LAYER.md` remains the authority on the custody backend's observed behaviour, its quirks, and
its blockers. Six of its decisions are overridden here:

| `DATA-LAYER.md` said | Now |
|---|---|
| Orders owned entirely by the shop, **client-side** | Owned by `packages/shop-backend`, server-side |
| Delivery secret stored in the buyer's `localStorage` | Held by the shop backend; released only via `reveal-code` |
| `revealDeliveryCode` is **local only**, no endpoint | It is an endpoint, and it stamps `revealedAt` server-side |
| `infrastructure/fixture-api.ts` — a `localStorage` state machine | Became `packages/custody-fixture`, a server |
| `select-api.ts` picks between two classes | `config.ts` picks a base URL |
| The fixture reproduces B-1 faithfully | The fixture serves `0x04`; `B1=throw` replays the failure |

Everything else in `DATA-LAYER.md` stands, including `parcel.ts`, `identity.ts` (whose pkh table
is **verified correct**), `qr-payloads.ts`, `role-store.ts` and the `ParcelApi` port.

---

## Verification

Focused Bun tests cover checkout/dispatch separation, credential and courier validation,
single-assignment behavior, and failed-mint retry recovery. The full cross-service custody sequence
is also verified manually.

1. **Swagger.** Both packages mount `@elysiajs/swagger`. `:3001/swagger` and `:3002/swagger` are
   clickable proof of every route.
2. **The pkh assertion.** `custody-fixture` asserts the five derived fixture pkhs at startup
   against the table in `DATA-LAYER.md` and refuses to boot on a mismatch. If a key moves,
   everything downstream is wrong and this is the cheapest place to learn it.
3. **The curl sequence.** A documented run through all five transitions, checked in beside the
   package:

```
checkout → order has courier null and parcelId null
dispatch      jnt-mgl                     → order has a parcelId; chain is 0x00
handoff       jnt-mgl → ninjavan-rey     → chain is 0x00, 0x01
accept-handoff ninjavan-rey              → chain is 0x00, 0x01, 0x00
request-delivery ninjavan-rey            → … 0x02
reveal-code   with the accessToken       → secret + revealedAt
reveal-code   again                      → SAME revealedAt
reveal-code   with a wrong token         → 403
confirm-delivery with the secret         → … 0x04
GET /shop/orders/:id                     → five hops, courier names, no secret
```

---

## Exit criteria

- [ ] `bun dev:fixture` and `bun dev:shop` start with **no other process running** and no chipnet.
- [ ] `POST /shop/checkout` returns an order with `courier: null` and `parcelId: null`.
- [ ] Dispatch selects the requested courier and mints the parcel exactly once.
- [ ] With `custody-fixture` **stopped**, dispatch preserves the courier with `parcelId: null`.
      `retry-custody` attaches it once the fixture is back.
- [ ] `GET /shop/orders/:orderId` returns the custody chain, courier name and company, and
      **never** the delivery secret.
- [ ] With `custody-fixture` stopped, `GET /shop/orders/:orderId` returns `200` with
      `custodyAvailable: false` — not a `502`.
- [ ] `reveal-code` is idempotent and rejects a wrong `accessToken` with `403`.
- [ ] The full five transitions run end to end against the fixture, ending at `0x04`.
- [ ] `B1=throw` makes `GET /parcel/:id` fail after delivery with the real backend's exact text.
- [ ] Restarting both packages loses nothing.
- [ ] `DIVERGENCE.md` exists and lists at least D-1 through D-5.

---

## File layout

```
packages/shop-backend/src/
  domain/
    product.ts · courier.ts · buyer.ts · order.ts
  application/
    ports/
      order-repository.ts
      custody-gateway.ts
    use-cases/
      checkout.ts · dispatch-order.ts · get-order.ts · reveal-code.ts · retry-custody.ts
  infrastructure/
    sqlite/order-repository.ts
    http-custody-gateway.ts
    seed.ts                        products, couriers, buyer
  presentation/
    controllers/shop.controller.ts
    routes.ts
  di/container.ts
  main.ts

packages/custody-fixture/src/
  domain/parcel.ts
  application/
    ports/parcel-store.ts
    use-cases/                     create · handoff · accept · request-delivery · confirm · get
  infrastructure/
    sqlite/parcel-store.ts
    keys.ts                        per-courier keypair generation
    latency.ts
  presentation/routes.ts
  di/container.ts
  main.ts
  DIVERGENCE.md

packages/frontend/src/
  domain/           parcel.ts · identity.ts · qr-payloads.ts · shop.ts
  application/ports/ parcel-api.ts · shop-api.ts
  infrastructure/   http-parcel-api.ts · http-shop-api.ts · api-error.ts
                    role-store.ts · config.ts
```
