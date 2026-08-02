# Data Layer — Phase 1

> Scope: **frontend only**, `packages/frontend`. Implements P1 of `FRONTEND-FLOW.md`.
> `packages/backend` is a **fixed input**. Nothing in this document changes it.
> Placeholder name `APP` throughout — one string to change later.

---

## ⚠ Partially superseded by `SHOP-BACKEND.md`

This document's analysis of the custody backend — its API, its ten quirks, its blockers, and the
derived pkh table — **stands and is verified.** Read it for those.

But six of its decisions were made when there was no shop server to ask. There is one now
(`packages/shop-backend`, Phase 1b). Do not build the following from this document:

| Section | This document says | `SHOP-BACKEND.md` says |
|---|---|---|
| Locked decisions · Orders | Owned by the shop, **client-side** | Owned by `packages/shop-backend`, server-side |
| Locked decisions · Delivery secret | Stored in the buyer's `localStorage` | Held by the shop backend; released only via `POST /shop/orders/:id/reveal-code` |
| The port | `revealDeliveryCode` is **local only**, in `order-store.ts` | It is a server endpoint, and it stamps `revealedAt` server-side |
| The two implementations | `infrastructure/fixture-api.ts`, a `localStorage` state machine | Became `packages/custody-fixture`, a server on `:3002` |
| The two implementations | `select-api.ts` picks between two classes | `config.ts` picks a base URL |
| Fixture fidelity | The fixture **reproduces B-1** faithfully | The fixture serves `0x04`; `B1=throw` replays the failure |

Consequently `infrastructure/order-store.ts`, `infrastructure/fixture-api.ts` and
`infrastructure/select-api.ts` are **not built.** Everything else in the file layout stands:
`parcel.ts`, `identity.ts`, `qr-payloads.ts`, `role-store.ts`, `api-error.ts` and the `ParcelApi`
port are unchanged.

---

## The framing

P1's job is to remove every dependency on other people. It does that by naming one seam and
putting a fixture behind it — not by inventing capability the backend does not have.

So this document is written **against the backend as it exists on `feat/specs`**. Where the flow
asks for something the API cannot supply, the gap is recorded as a fact and filed as a blocker.
It is not papered over with local caching or a frontend chain read.

Two consequences worth stating up front, because they cost UI copy:

- **There are no timestamps.** The backend declares `timestamp?` and never populates it. Custody
  rows show actor, state and txid. The flow's `Released 13:47` and `Delivered 14:03` copy goes.
- **A delivered parcel is unreadable.** See [Blockers](#blockers-backend-owned). This is B-1 and
  it is load-bearing for Stage 4.

---

## Locked decisions

| | Decision | Because |
|---|---|---|
| Parcel `id` | The **contract address** (`bchtest:…`), verbatim | A short-id map would live in `localStorage`, which incognito does not share — step 22's cold public link would not resolve |
| Delivery secret | Returned once from `create`, stored in the buyer's `localStorage` | The backend retains only the hash and has no endpoint to re-read it. This makes "the plaintext exists only on the buyer's device" literally true |
| `revealDeliveryCode` | **Local only.** No endpoint, no round trip | Nothing to ask the server for |
| Orders | Owned entirely by the shop, client-side | The backend has no order concept and we are not adding one. It stays the thing a merchant integrates |
| Timestamps | Omitted from custody rows | No source |
| Actor labels | Derived from the fixture keys via libauth at module load | One source of truth with `infrastructure/fixtures.ts`; no hand-copied hex to mistype |
| Implementations | Two behind one port, selected by `?fixture=1` | Insurance for recording |
| Fixture fidelity | Mirrors the real API's shapes **and its limitations** | Anything that works against the fixture works wired |
| Courier role | `sessionStorage`, per tab | `localStorage` is shared across the three windows — role must not be |
| Errors | Typed, carrying the node's text verbatim | The data layer does not decide what is shown |

---

## The backend, as observed

Source: `packages/backend/src/presentation/routes.ts` and `controllers/parcel.controller.ts`.

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/parcel/create` | `{ courierId, recipientPkh? }` | JSON `{ contractId, address, txid, deliverySecret }` |
| `POST` | `/parcel/:id/handoff` | `{ courierId, nextCourierId }` | **bare string** txid |
| `POST` | `/parcel/:id/accept-handoff` | `{ courierId }` | **bare string** txid |
| `POST` | `/parcel/:id/request-delivery` | `{ courierId }` | **bare string** txid |
| `POST` | `/parcel/:id/confirm-delivery` | `{ courierId, deliveryCode }` | **bare string** txid |
| `GET` | `/parcel/:id` | — | JSON `Array<{ txid, state, custodian, timestamp? }>` |

### Quirks the client must respect

1. **`contractId === address`.** The controller returns the same value twice. Treat `contractId`
   as the id and ignore `address`, or vice versa — but do not assume they can diverge.
2. **Mutations return a bare string**, not `{ txid }`. The use cases are typed `Promise<string>`
   and Elysia serialises that as `text/plain`. Call `res.text()`, not `res.json()`.
   *The existing `infrastructure/api-client.ts` calls `res.json()` on all five and types them
   `{ txid: string }`. It would throw on every mutation. P0 deletes that file; this replaces it.*
3. **The chain is oldest → newest.** `getParcelHistory` walks backwards and `unshift`s, so
   `chain[0]` is the mint and `chain[chain.length - 1]` is current state.
4. **`timestamp?` is declared and never set.** Do not read it.
5. **No block height anywhere.** The Stage 4 receipt cannot show one.
6. **`courierId` is `"A"` or `"B"`**, uppercased server-side. Unknown ids throw.
7. **`deliveryCode` is hex**, decoded with `hexToBin`. Send exactly what `create` returned.
8. **`confirm-delivery` ignores `courierId` for signing.** It always signs with the recipient
   fixture key. The field is accepted and discarded.
9. **`recipientPkh` is optional** and defaults to the `RECIPIENT` fixture. We never send it.
10. **The id in the path contains a colon.** `:` is legal in a path segment (RFC 3986 §3.3), so
    send the address raw. If the router mis-parses, `encodeURIComponent` is the fallback —
    verify once at P6 and record which one works.

### What the backend does not have

No `subscribe`. No order resource. No secret re-read. No courier registry endpoint — the
attestation is signed server-side in `signRegistryAttestation` from `nextCourierId`, so the
frontend never handles one.

---

## Domain model

### `domain/parcel.ts`

`ParcelState` is **imported from `@hermes/shared`**, not redeclared. The frontend adds
only its own labels.

```ts
import { ParcelState } from '@hermes/shared';

export type ParcelId = string;   // the contract address, e.g. 'bchtest:qq…'
export type Pkh = string;        // 20-byte hash160, lowercase hex, no prefix
export type Txid = string;       // 32-byte, lowercase hex
export type CourierId = 'A' | 'B';

export interface CustodyHop {
  txid: Txid;
  state: ParcelState | number;   // number: unknown states must render, not throw
  custodian: Pkh;
  actor: ActorRole;              // derived locally — never present on the wire
  label: string;                 // 'Courier A'
}

export interface ParcelView {
  id: ParcelId;
  address: string;               // === id; carried because the UI labels it 'contract address'
  chain: CustodyHop[];           // oldest → newest, as returned
  current: CustodyHop;           // chain[chain.length - 1]
  state: ParcelState | number;   // current.state
  custodian: Pkh;                // current.custodian
}
```

`ParcelView` carries the **whole chain**, per P1. Views derive current state from it rather than
holding a separate field the two could disagree on — `state` and `custodian` are conveniences
computed in the mapper, never assigned independently.

State labels, matching *States in scope*:

| Byte | `ParcelState` | Label |
|---|---|---|
| `0x00` | `InCustody` | In custody |
| `0x01` | `HandoffPending` | Awaiting acceptance |
| `0x02` | `DeliveryPending` | Out for delivery |
| `0x04` | `Delivered` | Delivered |
| other | — | neutral grey badge, raw byte shown |

### `domain/identity.ts`

The backend's fixture keys are the private keys `0x00…01` through `0x00…05`
(`packages/backend/src/infrastructure/fixtures.ts`). Derive the pkhs at module load rather than
pasting hex — if a key changes, this stays correct.

```ts
import { hash160, hexToBin, secp256k1 } from '@bitauth/libauth';

export type ActorRole =
  | 'merchant' | 'courierA' | 'courierB' | 'registry' | 'recipient' | 'unknown';

export function roleOf(pkh: Pkh): ActorRole;
export function labelOf(role: ActorRole): string;      // 'Courier A', 'Unknown actor'
export function pkhOf(role: ActorRole): Pkh;
export function courierIdOf(pkh: Pkh): CourierId | null;
```

`courierIdOf` is what turns a scanned badge into the `nextCourierId` the endpoint wants.

**Verification table.** These are the derived values as of writing. If the module produces
anything else, the fixture keys moved and everything downstream is wrong — assert this in a
scratch check rather than debugging it through the UI at 3am.

| Role | pkh |
|---|---|
| merchant | `751e76e8199196d454941c45d1b3a323f1433bd6` |
| courierA | `06afd46bcdfd22ef94ac122aa11f241244a37ecc` |
| courierB | `7dd65592d0ab2fe0d0257d571abf032cd9db93dc` |
| registry | `c42e7ef92fdb603af844d064faad95db9bcdfd3d` |
| recipient | `4747e8746cddb33b0f7f95a90f89f89fb387cbb6` |

### `domain/qr-payloads.ts`

```ts
export interface ParcelLabelPayload  { t: 'parcel';   id: ParcelId }
export interface CourierBadgePayload { t: 'courier';  pkh: Pkh; attestation?: string }
export interface DeliveryCodePayload { t: 'delivery'; id: ParcelId; secret: string }

export type QrPayload =
  | ParcelLabelPayload | CourierBadgePayload | DeliveryCodePayload;

export function isParcelLabel(v: unknown): v is ParcelLabelPayload;
export function isCourierBadge(v: unknown): v is CourierBadgePayload;
export function isDeliveryCode(v: unknown): v is DeliveryCodePayload;

/** Parses scanned or pasted text. Returns null for anything unrecognised — never throws. */
export function parseQrPayload(raw: string): QrPayload | null;
```

Each guard checks `t` **and** the shape of its own fields. `parseQrPayload` wraps `JSON.parse` in
a try — the scanner feeds it arbitrary camera output and a malformed frame must not break a
recording.

`attestation` is **optional and not consumed.** `FRONTEND-FLOW` lists it on the badge, but the
backend signs its own registry attestation server-side from `nextCourierId`. The field is kept
for fidelity with that document and marked here so nobody wires load-bearing logic to it. The
badge's real payload is `pkh`, which `courierIdOf` resolves to `"A"` or `"B"`.

---

## The port

### `application/ports/parcel-api.ts`

```ts
export interface CreateOrderResult {
  parcelId: ParcelId;
  address: string;
  mintTxid: Txid;
  deliverySecret: string;   // hex. The only time this value is ever transmitted.
}

export interface ParcelApi {
  createOrder(courierId: CourierId): Promise<CreateOrderResult>;
  getParcel(id: ParcelId): Promise<ParcelView>;

  handoff(id: ParcelId, from: CourierId, to: CourierId): Promise<Txid>;
  accept(id: ParcelId, courier: CourierId): Promise<Txid>;
  requestDelivery(id: ParcelId, courier: CourierId): Promise<Txid>;
  confirm(id: ParcelId, courier: CourierId, deliveryCode: string): Promise<Txid>;

  /** Polls getParcel every 2s. Returns an unsubscribe fn. Tracking views only, never the scanner. */
  subscribe(
    id: ParcelId,
    onView: (view: ParcelView) => void,
    onError?: (err: ApiError) => void,
  ): () => void;
}
```

**Deviation from `FRONTEND-FLOW` P1, stated rather than buried:** `revealDeliveryCode` is *not*
on this port. It never touches the API — it reads `localStorage` and stamps a reveal time — so
both implementations would carry identical code. It lives in `infrastructure/order-store.ts`
instead. The port stays the network seam, which is the thing P6 swaps.

---

## Storage

Two stores, deliberately different scopes. Getting this backwards is the bug that eats an hour:
share what must be shared, isolate what must not.

| Store | Key | Holds | Why this scope |
|---|---|---|---|
| `localStorage` | `APP.orders` | `Record<OrderId, OrderRecord>` | The shop window writes it; my-order reads it. Shared across windows on purpose |
| `localStorage` | `APP.fixture` | Fixture state machine | All three windows must see the same fixture parcel |
| `sessionStorage` | `APP.courierRole` | `'A' \| 'B'` | **Per tab.** In `localStorage` this would flip both courier windows at once |

```ts
export interface OrderRecord {
  orderId: string;          // '4471' — generated client-side, never sent to the backend
  parcelId: ParcelId;
  address: string;
  mintTxid: Txid;
  productName: string;
  courierId: CourierId;     // initial custodian, assigned at create
  createdAt: number;        // epoch ms, local
  deliverySecret: string;   // hex
  revealedAt: number | null; // set by revealDeliveryCode, never cleared
}
```

`createdAt` and `revealedAt` are **order metadata, not custody timestamps.** They record what
this browser did, and they are shown on shop chrome only. They never appear on a custody row —
that would imply the chain knows a time it does not know.

`order-store.ts` exposes:

```ts
export function saveOrder(record: OrderRecord): void;
export function getOrder(orderId: string): OrderRecord | null;
export function getOrderByParcel(id: ParcelId): OrderRecord | null;
export function revealDeliveryCode(orderId: string): { secret: string; revealedAt: number };
```

`revealDeliveryCode` is idempotent: the first call stamps `revealedAt`, later calls return the
same timestamp. The reveal time has to *stay* on screen, per step 18.

`role-store.ts` exposes `getRole(): CourierId` (defaults `'A'`) and `setRole(r: CourierId): void`.

---

## Errors

### `infrastructure/api-error.ts`

```ts
export class ApiError extends Error {
  constructor(
    readonly operation: string,   // 'handoff', 'getParcel', …
    readonly status: number,      // 0 for network failure
    readonly rawMessage: string,  // the response body, verbatim
  ) { super(`${operation} failed (${status}): ${rawMessage}`); }
}

/** True when the backend cannot see a parcel NFT at the contract address. See B-1. */
export function isParcelUnreadable(err: unknown): boolean;
```

The data layer **never** rewrites `rawMessage`. Whether the node's rejection text reaches the
screen is a UI decision per phase — this layer only guarantees it survives the trip. That is what
keeps `BUILD-TONIGHT` §6 step 5 available without building it now, and it is why a failed call
during recording shows something instead of a blank panel.

`isParcelUnreadable` matches the backend's `No parcel NFT UTXO found for contract …`. It exists
because after delivery that error *is* the normal response, and the UI must be able to tell it
apart from a real fault.

---

## Polling

`subscribe` calls `getParcel` immediately, then every **2000 ms**. It returns an unsubscribe
function; views call it on teardown.

- Used by the shop's my-order page and the public tracking page. **Never the scanner** — the
  scanner reads on scan, which is the whole point of scanning.
- Errors do **not** stop the loop. `onError` fires and polling continues, so a transient chipnet
  hiccup recovers on its own.
- The loop keeps the last successful `ParcelView` in memory for the lifetime of the subscription,
  so one failed poll does not blank a rendered timeline. This is **not** persisted and it never
  invents a state: after delivery the view stays at `0x02` and `onError` keeps firing. It does
  not fake `0x04`.

---

## The two implementations

Selected in one place, `infrastructure/select-api.ts`:

```ts
export const parcelApi: ParcelApi =
  new URLSearchParams(location.search).has('fixture')
    ? new FixtureApi()
    : new HttpApi();
```

### `infrastructure/http-api.ts`

Thin. Its only jobs are transport, the `res.text()` / `res.json()` split, and mapping the wire
array into a `ParcelView` — resolving `actor` and `label` from `identity.ts` as it goes.

Base URL from `import.meta.env.VITE_API_URL ?? 'http://localhost:3000'`. The backend enables CORS,
so the direct origin works; the `/api` Vite proxy is the fallback. Pick one at P6 and delete the
other.

### `infrastructure/fixture-api.ts`

A real state machine over `localStorage`, **mirroring the real API including its limitations**:

- Same transitions, same guards. `handoff` only from `0x00` by the current custodian; `accept`
  only from `0x01` by the named courier; `requestDelivery` only from `0x00`; `confirm` only from
  `0x02` and only with the matching secret.
- Chain returned **oldest → newest**.
- **No timestamps** on hops.
- Artificial latency, 400–900 ms, so `Signing… → Broadcasting…` has somewhere to live.
- Fake txids: 64 lowercase hex chars, so `tx-link` renders at realistic width.
- Fake parcel ids shaped like a chipnet address, so nothing downstream learns to expect short ids.
- **Reproduces B-1:** once a parcel reaches `0x04`, `getParcel` throws the same `ApiError` with
  the same `No parcel NFT UTXO found` text.

That last point is deliberate and it will feel wrong while building. It is the price of the
guarantee that anything working against the fixture works wired — a fixture that is more capable
than the backend moves the failure to P6, which is the one phase with no slack.

---

## Blockers (backend-owned)

### B-1 · A delivered parcel cannot be read — **blocks Stage 4**

`confirmDelivery` moves the NFT **out of the covenant** to the recipient's P2PKH address
(`Hermes.ts:143-159`, and the contract's `LockingBytecodeP2PKH(recipientPkh)` require).
`getParcelHistory` (`Hermes.ts:99-104`) only queries UTXOs at the *contract* address:

```ts
const utxos = await this.network.getUtxos(contractId);
const nftUtxo = utxos.find(isNftUtxo);
if (!nftUtxo) throw new Error(`No parcel NFT UTXO found for contract ${contractId}`);
```

So the moment the parcel is delivered, `GET /parcel/:id` throws. State `0x04` is unreachable
through the API.

**What that costs:** Stage 4 in full — the delivered receipt, the four-row chain with the
delivery hop, and the public tracking page opened cold. `FRONTEND-FLOW` calls Stage 4 *"the only
part of the video that proves anything."*

**The fix is backend-side**, roughly: locate the NFT at the recipient address (or walk back from
the stored delivery txid) instead of requiring a live UTXO at the contract. The frontend cannot
close it without reading the chain directly, which the locked decisions forbid.

**Raise this today, not at P6.**

### B-2 · No timestamps, no block height

`ParcelHistoryEntry.timestamp` is declared and never populated, and nothing exposes block height.
Costs the flow's per-hop times and the block height in the step-20 receipt. Lower severity than
B-1 — the timeline reads fine without them — but the video script needs updating either way.

---

## To verify at P6

Small, cheap, and each one is a silent failure if wrong.

1. Does Elysia match `/parcel/:id` with a raw `bchtest:…` in the path, or does it need
   `encodeURIComponent`? Record the answer.
2. Confirm mutations really do arrive as `text/plain`; adjust if Elysia wraps them.
3. Confirm `create` mint latency — chipnet round trips may exceed the shop's patience UI.
4. Direct origin vs `/api` proxy: pick one, delete the other.

---

## Exit criteria

P1 is done when:

- [ ] `getParcel` returns a **four-hop chain** — mint `0x00` → handoff `0x01` → accept `0x00` →
      requestDelivery `0x02` — against both implementations. *(Four hops are readable; only the
      fifth is lost to B-1, so the flow's stated exit criterion still holds as written.)*
- [ ] Two browser windows see the same parcel data.
- [ ] A third window with `?fixture=1` runs the whole state machine with no backend at all.
- [ ] Switching the role in one courier tab does not change the other.
- [ ] Every hop carries a resolved `actor` and `label`; no raw pkh reaches a view unlabelled.
- [ ] `parseQrPayload` returns `null` — never throws — for empty, malformed, and wrong-`t` input.
- [ ] A failed mutation surfaces an `ApiError` whose `rawMessage` is the backend's text verbatim.

---

## File layout

```
packages/frontend/src/
  domain/
    parcel.ts            ParcelView, CustodyHop, ids, state labels
    identity.ts          pkh → role, role → label, pkh → courierId
    qr-payloads.ts       three payloads, three guards, parseQrPayload
  application/ports/
    parcel-api.ts        the one network seam
  infrastructure/
    http-api.ts          real backend
    fixture-api.ts       localStorage state machine, backend-faithful
    order-store.ts       OrderRecord + revealDeliveryCode (local only)
    role-store.ts        sessionStorage courier role
    api-error.ts         ApiError, isParcelUnreadable
    select-api.ts        ?fixture=1 switch
```

`infrastructure/api-client.ts` is deleted by P0 and replaced by `http-api.ts`. Do not port its
`res.json()` handling — that is quirk 2 above, and it is broken.
