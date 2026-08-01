# SPEC · P0 + P3 — The Shop's Post-Checkout Surfaces

> Implements phases **P0 (Setup)** and **P3 (Shop)** of `FRONTEND-FLOW.md`.
> Scope is the frontend package only. The shop backend is already built and is treated as fixed.
> Out of scope: P1 fixture layer, P2 design system, P4 scanner, P5 public page.

---

## 1. Objective

Today the shop can take an order and lose it. `POST /shop/checkout` fires, returns
`{ orderId, accessToken }`, and the frontend renders both into React state that dies on the next
refresh. There is no route to return to, no custody panel, no shipping label, no delivery code, and
no chain.

This spec closes that. When it is done, a viewer can watch a parcel be bought, see the custody
layer attach itself to an ordinary order, print a label, and later read the full chain back — and
the component that renders that chain is reusable, unmodified, by P5.

**Target users.** Two, and they are not the same person:

| | Who | What they need from this |
|---|---|---|
| **The buyer** (Ana Reyes, seeded) | Bought something | An order that survives a refresh, and a delivery code only she can release |
| **The demo viewer** | Watching a 10-minute video | To see the integration point fire, and to be shown proof rather than told about it |

**The one non-negotiable.** The custody timeline component is built here and reused verbatim by
P5. `FRONTEND-FLOW.md:372-377` names the risk: the public tracking page is the only load-bearing
proof in the video, it is scheduled last, and it is therefore what gets cut. The mitigation is
structural — if the timeline stays chrome-free, P5 is a wrapper. If it absorbs shop styling here,
P5 becomes a rebuild and the proof is lost. Every review of this work should check that first.

---

## 2. Decisions taken

| | Decision | Consequence |
|---|---|---|
| **Scope** | P0 + P3 bundled | The router ships with the surfaces, so P3's exit criterion is reachable on landing |
| **Data source** | Straight to the shop backend | No `ParcelApi` port, no `fixture-api.ts`. `GET /shop/orders/:orderId` already returns everything the surfaces need |
| **Recording fallback** | `packages/custody-fixture` (:3002) | P1's `?fixture=1` is not needed — the fallback already exists one layer down, selected by URL (`http-custody-gateway.ts:6-11`) |
| **Hop timestamps** | Optional field, rendered when present | The timeline degrades cleanly today and improves for free when the backend populates them. Two dependency tickets, §8 |
| **Rendering** | React 19, single root | The legacy vanilla `App` is deleted, not ported |

---

## 3. What gets built

### 3.1 · P0 — Router and teardown

**Delete.** `src/presentation/app.ts`; the `ApiClient` class and its interfaces in
`src/infrastructure/api-client.ts` (the `shopApi` object in the same file stays and grows); the
wallet-connect and legacy form markup in `index.html:10-69`; `src/style.css` if nothing survives it.

`FRONTEND-FLOW.md:272-273` also lists `infrastructure/api-client.ts` for deletion wholesale. That
predates the shop backend existing. The file stays; only the direct-to-chain client inside it goes.

**index.html** reduces to a single `<div id="root">` plus the module script.

**Hash router.** Minimal and hand-rolled — no routing dependency. Five entries; three are built
here, two are declared so P4 and P5 have a home:

| Route | Surface | This spec |
|---|---|---|
| `#/shop` | Catalogue | Existing marketplace, re-mounted |
| `#/shop/product/:productId` | Product detail | Existing detail view, re-mounted |
| `#/shop/order/:orderId` | Order confirmation | **New** |
| `#/shop/my-order/:orderId` | My order | **New** |
| `#/courier` · `#/p/:id` | Scanner, public page | Declared, renders a stub |

Unknown hash → `#/shop`. Empty hash → `#/shop`.

> **Documented deviation.** `FRONTEND-FLOW.md:63` lists three shop routes, not four, because it
> specifies one product page and no catalogue. A catalogue was built anyway and is worth keeping —
> it makes the "ordinary shop gains a custody layer" point more credibly than a hardcoded product
> would. `#/shop/product/:productId` exists to give it an addressable detail view, replacing the
> current `?product=` query. The catalogue is **frozen** at its present feature set.

### 3.2 · Buyer identity

The missing piece that blocks Stage 3. `reveal-code` and `retry-custody` both require
`accessToken`, and nothing currently keeps it.

```ts
// localStorage key: "parcel-tracker/orders"
type StoredOrders = Record<string /* orderId */, { accessToken: string; createdAt: number }>;
```

Written on checkout success, before navigation. Read by both new pages.

The my-order route accepts an optional token in the hash query — `#/shop/my-order/4471?t=<token>` —
so the link is portable between windows during a demo. Precedence: URL token wins, then
localStorage, then the recovery state below.

This is the shop's own account, not a magic link, which is what `parcel-tracker-auth.md` §8
specifies and what `FRONTEND-FLOW.md:26` is defending.

### 3.3 · The custody timeline component

The reusable core. **Takes a `ParcelView` and renders. Nothing more.** No shop imports, no shop
class names, no knowledge of orders, products or buyers.

```ts
// src/domain/parcel.ts
export interface ParcelHop {
  txid: string;
  state: number;          // raw commitment byte; unknown values must render, never throw
  custodian: string;      // hex pkh, 20 bytes
  actorLabel?: string;    // resolved name when the backend can supply one
  timestamp?: number;     // absent today — see §8
}

export interface ParcelView {
  parcelId: string | null;
  contractAddress: string | null;
  mintTxid: string | null;
  hops: ParcelHop[];      // oldest → newest, exactly as returned; never re-sorted
  custodyAvailable: boolean;
}
```

Four render states, all required — the public page opens cold, so loading and not-found are on the
demo path:

1. **Loading** — skeleton, no layout shift.
2. **Not found** — neutral, no shop chrome.
3. **Pending mint** (`parcelId === null`) — "Custody attaching…", not an error.
4. **Chain** — current-state card, then one row per hop, newest first.

Plus **custody unavailable** (`custodyAvailable === false`): the order still renders with a quiet
band saying the chain could not be read. Never an error page — the backend goes out of its way to
avoid a 502 here (`get-order.ts:44-46`) and the frontend must not reintroduce one.

**Hop row.** State badge · actor · timestamp (when present) · txid as a `tx-link`.

**Delivered receipt** — shown when the terminal hop is `0x04`: who delivered, when, block height,
txid. Two of those four are backend-dependent (§8); render what exists.

**State labels**, per `FRONTEND-FLOW.md:48-53`. Anything else is a neutral grey badge with the raw
byte in hex — never a crash, never "Unknown" alone:

| Byte | Label |
|---|---|
| `0x00` | In custody |
| `0x01` | Awaiting acceptance |
| `0x02` | Out for delivery |
| `0x04` | Delivered |

**Note on the terminal hop.** `confirm-delivery` appends a hop whose custodian is the *recipient's*
pkh, not a courier's (`custody-fixture/.../confirm-delivery.ts:31`). The Delivered row's actor is
the buyer. Label it accordingly rather than hunting for a courier that isn't there.

**Primitives.** P2 is not in scope, so this spec defines the minimum it needs, locally and
unstyled-by-shop: `state-badge`, `hash-value` (mono, middle-truncated, click-to-copy), `tx-link`.
These are P2's candidates when P2 happens; keep them in `src/components/custody/` so promoting them
is a move, not a rewrite.

### 3.4 · Order confirmation — `#/shop/order/:orderId`

Flow steps ③④⑤.

**Custody panel.** *"Custody tracking enabled"* + contract address + mint txid, both as
`hash-value`. `FRONTEND-FLOW.md:197` — this panel is doing the pitch work; it is the one frame
where an ordinary shop visibly gains a custody layer. Give it weight.

It must **poll**, because `checkout` returns 201 with `parcelId: null` when the mint hasn't landed —
that is deliberate, so a slow chipnet mint never loses an order (`checkout.ts:38-44`).

```
poll GET /shop/orders/:orderId every 2s
  until parcelId !== null
  or 30s elapsed → show "Custody didn't attach" + [ Retry ]
                   → POST /shop/orders/:orderId/retry-custody { accessToken }
```

The retry endpoint already exists and is described as the mid-demo escape hatch
(`routes.ts:53-61`). Wire it; do not build a new one.

**Shipping label panel.** A QR encoding `{ t: "parcel", id: parcelId }`, styled as something a
merchant prints and sticks on a box — order number and product name beside it.

This is the artifact Stages 2 and 3 run on. Every courier scan in the demo is a scan of this label.
Without it there is no P4. It must be **scannable off a screen by a phone**: minimum 240px,
quiet zone intact, high contrast, no animation on or behind it.

**[ Track my order ]** → `#/shop/my-order/:orderId`.

### 3.5 · My order — `#/shop/my-order/:orderId`

Flow steps ⑮⑯ and ⑲⑳㉑.

**Header** — order number, product, current state drawn from the timeline's current-state card.

**Delivery-code block.** Visible from `0x02` onward. Collapsed by default behind an explicit
**[ Reveal code ]**.

On tap: `POST /shop/orders/:orderId/reveal-code { accessToken }` → render a QR of
`{ t: "delivery", id: parcelId, secret }`, and print **`Revealed 14:02`** beside it. That timestamp
comes from the server's `revealedAt` and **stays for the rest of the order's life** — including
after a refresh, where `GET /shop/orders/:orderId` returns `revealedAt` without the secret.

`FRONTEND-FLOW.md:229` is unusually direct about why this exists: it is the answer to *"what stops
a courier phoning ahead for the code?"* The reveal is a deliberate, timestamped, irreversible act,
and in the video you point at it instead of explaining a threat model. The backend already makes it
idempotent and server-stamped so a refresh cannot forge or reset it (`reveal-code.ts:26-34`).

Caption it as a bearer secret — *"Anyone holding this code can confirm delivery. Show it only to
the courier at your door."* Contrast with the courier badge, which is inert. The UI should say so.

**The embedded timeline.** Same component, shop chrome. `FRONTEND-FLOW.md:67-69` — that embedding
*is* the "embeddable tracking page" from the pitch. Demonstrated, not asserted.

**Recovery state.** No token in URL or localStorage → the page renders the order read-only from
`GET /shop/orders/:orderId` (which needs no token) with the delivery-code block replaced by a short
"open this on the device you ordered from" note. Never a blank page, never a login form.

---

## 4. Acceptance criteria

P3's exit criterion, expanded. Every line is a thing to click.

1. `#/shop` lists products from `GET /shop/products`.
2. Opening a product deep-links to `#/shop/product/:productId`; reload holds.
3. **Buy now** → checkout → navigates to `#/shop/order/:orderId`. The token is in localStorage
   before navigation.
4. The confirmation shows *"Custody tracking enabled"* with contract address and mint txid, both
   copy-on-click, within a few seconds of a successful mint — no manual refresh.
5. With the shop backend's custody gateway pointed at nothing, the same page shows "Custody didn't
   attach" and **[ Retry ]** after 30s, and retry succeeds once the gateway is back.
6. The shipping-label QR decodes to `{"t":"parcel","id":"<parcelId>"}` **when scanned off the
   screen with a phone camera.**
7. **Track my order** → `#/shop/my-order/:orderId`, showing the chain with one row per hop.
8. Each hop row shows its own txid, and clicking it opens a block explorer in a new tab.
9. Before `0x02` there is no reveal control. At `0x02` it appears, collapsed.
10. **Reveal code** returns a scannable QR plus a visible reveal time. Hard-refresh: the QR is gone,
    **the reveal time is still there**, sourced from the server.
11. Reveal twice → same secret, same timestamp.
12. At `0x04` the receipt renders with whatever of {actor, time, block height, txid} the backend
    supplies, and no empty rows for the rest.
13. Killing the custody backend mid-order leaves the my-order page rendering the order with a
    "chain unreadable" band. **No error page, no 502 surfaced to the user.**
14. `#/shop/my-order/9999` renders not-found, not a crash.
15. The timeline component's module imports nothing from `presentation/marketplace/` — checked by
    reading its import list. This is the P5 precondition.

---

## 5. Project structure

```
packages/frontend/src/
├── main.tsx                       ← replaces main.ts; mounts one React root
├── router.tsx                     ← hash router, ~60 lines, no dependency
├── domain/
│   └── parcel.ts                  ← ParcelView, ParcelHop, state labels
├── infrastructure/
│   └── api-client.ts              ← shopApi grows: getOrder, revealCode, retryCustody
├── components/
│   ├── ui/                        ← existing shadcn primitives
│   └── custody/                   ← ★ P5 reuses this whole directory unchanged
│       ├── custody-timeline.tsx
│       ├── state-badge.tsx
│       ├── hash-value.tsx
│       ├── tx-link.tsx
│       └── qr-code.tsx
└── presentation/
    ├── marketplace/               ← existing, frozen
    └── shop/
        ├── order-confirmation.tsx
        ├── my-order.tsx
        └── use-order.ts           ← polling hook
```

`components/custody/` is the boundary. Nothing in it may import from `presentation/`.

**New dependency:** one QR *encoder*. `qrcode` (renders to canvas/data-URI, framework-agnostic)
behind a thin `<QrCode>` wrapper, so the decoder P4 needs is a separate, independent choice.
Bundled, never a CDN — `FRONTEND-FLOW.md:298-299` on why a demo must not depend on a network
request to look right.

---

## 6. Commands

```bash
bun run dev:demo        # custody fixture :3002 + shop backend :3001 + frontend :5173
bun run dev:frontend    # frontend alone
bun run dev:shop        # shop backend alone
bun run build           # tsc + vite build, all packages
```

Vite already proxies `/shop` → `:3001` (`vite.config.ts:27-30`). The `/api` → `:3000` proxy becomes
unused when the legacy client goes; leave it for P4.

---

## 7. Code style

Follow what the shop backend already does — it is the cleanest code in the repo.

- TypeScript strict. ESM with explicit `.js` extensions on relative imports.
- Layering: `domain` knows nothing; `infrastructure` knows `domain`; `presentation` knows both.
- **Comments explain why, not what.** The existing code is a good model — `order.ts:1-8` explains
  why an order has no status field. Match that density; do not narrate.
- No `any`. Unknown state bytes are `number` and are rendered, never coerced or thrown on.
- Errors are data where the user is concerned. `custodyAvailable: false` is a render branch, not an
  exception.
- No automated tests are authored in this repo. See §9.

---

## 8. Dependencies on other packages

Neither blocks this work. Both make it better, and both are small.

**D-1 · Hop timestamps.** `ParcelHistoryEntry` already declares `timestamp?: number`
(`backend/src/application/ports/parcel-contract.ts:7`) and never populates it. `CustodyHop` in the
shop backend drops the field entirely (`custody-gateway.ts:11-16`).

Needed for: step ⑪ *"Released 13:47"*, step ⑳ the receipt time, step ㉑ *"four rows, each with
actor, timestamp, own txid"*.

This cannot be solved client-side. `FRONTEND-FLOW.md:239` requires the **public page in a fresh
window** to show the identical chain — locally-recorded times would be absent exactly where the
proof happens. It has to come from the backend resolving block time per txid.

**D-2 · Actor labels.** `custodian` is a raw hex pkh. The shop backend already holds the mapping —
`COURIERS` in `seed.ts:40-43` carries both couriers' pkhs, and `BUYER` covers the terminal hop. A
small projection in `toOrderView` would populate `actorLabel` per hop. Without it the chain reads as
four hex strings, which proves custody moved but does not show *between whom*.

Until both land: the timeline renders hex `hash-value`s and omits times. Correct, just thinner.

---

## 9. Testing strategy

This repo authors no automated tests, so verification is a written manual pass — §4 is that list,
and it is the definition of done.

Run it against the demo stack (`bun run dev:demo`) in **three browser windows**, because that is how
the video is recorded and it is where shared-state bugs surface. Two paths get run twice, since they
are the ones a demo cannot recover from:

- **Refresh at every route.** Especially my-order after a reveal — criterion 10.
- **The degraded paths.** Kill the custody backend, then the shop backend, and confirm criteria 5
  and 13 rather than assuming them.

A phone is required for criterion 6. A QR that renders is not a QR that scans.

---

## 10. Boundaries

**Always**

- Keep `components/custody/` free of shop imports. It is the P5 precondition and the reason this
  phase is ordered where it is.
- Read state from `GET /shop/orders/:orderId`. The server is the source of truth for `revealedAt`,
  the chain, and mint status.
- Render unknown state bytes as neutral badges.
- Treat `custodyAvailable: false` and `parcelId: null` as ordinary render branches.

**Ask first**

- Adding a dependency beyond the one QR encoder.
- Changing anything under `packages/shop-backend/` or `packages/backend/` — those are D-1 and D-2,
  and they are separate tickets against separate owners.
- Extending the catalogue. It is frozen; it already exceeds what the flow asks for.
- Changing the shop API's shape rather than consuming it.

**Never**

- Store the delivery secret in localStorage, the URL, or component state that outlives the reveal
  panel. It is a bearer secret; it lives on screen and nowhere else.
- Reveal the code without an explicit tap, or hide the reveal timestamp once stamped.
- Reintroduce a wallet connection. Spec v2: nobody connects a wallet (`FRONTEND-FLOW.md:13`).
- Call the custody backend (:3000) from the shop surfaces. The shop talks to the shop backend.
- Re-sort the chain. The order is the chain's, not ours.
- Collapse two signatures into one action anywhere this touches. Not applicable in P3, but it is the
  rule the whole system rests on.
- Show a failed transaction in the happy path. Scope is happy-path only.

---

## 11. Not in this spec

P1's `ParcelApi` port and localStorage fixture. P2's token system and second chrome. P4's scanner,
courier badge QR, and QR decoder. P5's public page. `reject` / `returnToSender` / `confirmReturn`.
Courier enrolment. Cart, shop login, payment. Timeouts — a parcel nobody accepts sits at `0x01` with
no UI to resolve it, by design.
