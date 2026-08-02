# Tickets · P0 + P3 — The Shop's Post-Checkout Surfaces

> Breakdown of `SPEC-P3-SHOP.md`. Seven implementation tickets, two dependency tickets on other
> packages, three checkpoints.
> Every ticket is a vertical slice: it ends at something you can put on screen, not at a layer.

---

## Dependency graph

```
  T1 ──► T2 ──┬──► T3 ──► T4 ─────────────► T7
   │          │                              ▲
   │          └──► T5 ──► T6 ────────────────┘
   │                ▲
   │                │
   └────────────────┘  (T5 needs the router from T1)

  D-1 ─┐  other packages, non-blocking
  D-2 ─┘  land any time; T5 improves for free when they do

  CHECKPOINT A after T1   · P0 exit
  CHECKPOINT B after T4   · Stage 1 of the flow is recordable
  CHECKPOINT C after T6   · P3 exit criterion
```

**Parallelisable:** `{T3, T4}` and `{T5}` are independent once T2 lands — T3/T4 need `parcelId`,
T5 needs `chain`, and both arrive in the same `GET /shop/orders/:orderId` response. One person
should still run them in the order below, because T3 is where the response shape gets proven.

**Critical path for the video:** T1 → T2 → T5 → T6. T3 and T4 are what make Stage 1 worth
recording, but the chain renders without them.

---

## T1 · Router and v1 teardown

**Why.** P3's exit criterion is a three-route journey and no router exists. Everything downstream is
blocked on this. It is also where the v1 wallet UI — which spec v2 explicitly rules out — finally
leaves the build.

**Depends on:** nothing.
**Size:** M.
**Spec:** §3.1.

### Scope

Delete:
- `src/presentation/app.ts`
- the `ApiClient` class and its interfaces in `src/infrastructure/api-client.ts` — **keep and grow
  the `shopApi` object in the same file**
- the wallet-connect and legacy form markup, `index.html:10-69`
- `src/style.css` if nothing in it survives the above

Build:
- `src/main.tsx` — one React root, replacing `main.ts` and its `pathname === '/marketplace'` branch
- `src/router.tsx` — hand-rolled hash router, no routing dependency, ~60 lines
- Re-mount the existing marketplace at `#/shop`; convert its `?product=` query into
  `#/shop/product/:productId`
- Stub routes for `#/shop/order/:orderId`, `#/shop/my-order/:orderId`, `#/courier`, `#/p/:id` —
  each a labelled placeholder
- Unknown and empty hashes → `#/shop`

Do **not** change any marketplace behaviour beyond the route change. The catalogue is frozen.

### Acceptance

- [ ] Spec criterion 1 — `#/shop` lists products from `GET /shop/products`
- [ ] Spec criterion 2 — opening a product deep-links to `#/shop/product/:productId`; reload holds
- [ ] All six routes resolve; the four unbuilt ones render a labelled placeholder
- [ ] `#/nonsense` and a bare `#` both land on `#/shop`
- [ ] No reference to `ApiClient`, `connect-btn`, or `wallet-address` survives anywhere
- [ ] `bun run build` passes

### Verify

```bash
bun run dev:demo
# visit each: #/shop  #/shop/product/field-notebook-a5  #/shop/order/x
#             #/shop/my-order/x  #/courier  #/p/x
# then: browser back/forward across three of them
grep -rn "ApiClient\|connect-btn\|wallet-address" packages/frontend/src packages/frontend/index.html
# expect: no matches
```

---

## ▍CHECKPOINT A — P0 exit

`FRONTEND-FLOW.md:275` — *every route resolves to a blank labelled page.* The catalogue still works.
Nothing is provably better yet; this is the phase that stops the build fighting itself.

---

## T2 · Checkout persists identity and lands on the order

**Why.** The bug that currently loses every order. `checkout` returns `{orderId, accessToken}` into
React state that dies on refresh, and both `reveal-code` and `retry-custody` need that token. Until
this lands, Stage 3 of the flow is unreachable.

**Depends on:** T1.
**Size:** S.
**Spec:** §3.2, §3.4 (shell only).

### Scope

- `shopApi.getOrder(orderId)` → `GET /shop/orders/:orderId`, typed against the backend's `OrderView`
- Order storage module over `localStorage`, key `hermes/orders`:
  `Record<orderId, { accessToken: string; createdAt: number }>`
- **Buy now** writes the entry *before* navigating, then navigates to `#/shop/order/:orderId`
- `#/shop/order/:orderId` renders a real shell: order number, product, buyer. No custody panel yet
- Remove the inline receipt block from `marketplace.tsx:187-201`, including the hardcoded
  `Parcel — minting…` and the access token printed on screen
- Token resolution helper used by both new pages: URL `?t=` → localStorage → none

### Acceptance

- [ ] Spec criterion 3 — buy → checkout → navigate, with the token in localStorage before navigation
- [ ] Hard-refresh on `#/shop/order/:orderId` re-renders the order from the server
- [ ] The access token is no longer displayed anywhere in the UI
- [ ] A second purchase adds a second localStorage entry without clobbering the first
- [ ] `#/shop/order/9999` renders not-found rather than throwing

### Verify

```bash
bun run dev:demo
# buy something; in devtools:
JSON.parse(localStorage.getItem('hermes/orders'))
# expect: { "<orderId>": { accessToken: "<64 hex>", createdAt: <ms> } }
# hard-refresh the confirmation page — order still renders
```

---

## T3 · The custody panel

**Why.** `FRONTEND-FLOW.md:197` — *"Panel 3 is doing pitch work."* This is the one frame in the video
where an ordinary shop visibly gains a custody layer. It is also where the polling contract gets
proven, because checkout deliberately returns 201 with `parcelId: null` when the mint hasn't landed.

**Depends on:** T2.
**Size:** M.
**Spec:** §3.4 (panel + polling), §3.3 (domain + two primitives).

### Scope

- `src/domain/parcel.ts` — `ParcelView`, `ParcelHop`, state labels, and the mapping from the
  backend's `OrderView`. `timestamp` and `actorLabel` are optional and absent today (D-1, D-2)
- `src/components/custody/hash-value.tsx` — mono, middle-truncated, click-to-copy
- `src/components/custody/tx-link.tsx` — txid → block explorer, new tab
- `src/presentation/shop/use-order.ts` — polls `GET /shop/orders/:orderId` every 2s until
  `parcelId !== null`, stops at 30s
- The panel, in three states:
  - **attaching** — `parcelId === null`, under 30s. *"Custody attaching…"*. Not an error
  - **attached** — *"Custody tracking enabled"* + contract address + mint txid, both `hash-value`
  - **failed** — past 30s. *"Custody didn't attach"* + **[ Retry ]** →
    `POST /shop/orders/:orderId/retry-custody { accessToken }`

Wire the existing retry endpoint (`shop-backend routes.ts:53-61`). Do not build a new one.

### Acceptance

- [ ] Spec criterion 4 — contract address and mint txid appear within seconds of a successful mint,
      no manual refresh, both copy-on-click
- [ ] Spec criterion 5 — with the custody gateway down, the panel shows the failure and **[ Retry ]**
      after 30s, and retry succeeds once the gateway is back
- [ ] Polling stops on success, on failure, and on unmount — no orphaned interval
- [ ] `hash-value` copies the **full** value, not the truncated display string

### Verify

```bash
# happy path
bun run dev:demo   # buy; watch "attaching" become contract + txid

# failure path — start the shop backend pointed at a dead custody URL
CUSTODY_URL=http://localhost:9999 bun run dev:shop
# buy; wait 30s; expect the retry affordance
# restart the shop backend normally, tap Retry, expect the panel to fill in
```

> `CUSTODY_URL` defaults to `http://localhost:3002` — the fixture, not the real backend
> (`shop-backend/src/di/container.ts:5`). Point it at `:3000` to run against chipnet.

---

## T4 · The shipping-label QR

**Why.** The artifact everything downstream scans. Stages 2 and 3 are five scans of this label —
without it there is no P4 at all. `FRONTEND-FLOW.md:38`: every real parcel already carries a
barcode, so this is realistic rather than invented.

**Depends on:** T3 (needs `parcelId` on screen).
**Size:** S.
**Spec:** §3.4 (label panel), §5 (dependency).

### Scope

- Add the `qrcode` dependency. Encoder only — P4's decoder is a separate, independent choice
- `src/components/custody/qr-code.tsx` — thin wrapper, renders to canvas or data-URI
- Shipping-label panel: QR of `{ t: "parcel", id: parcelId }`, styled as something a merchant prints
  and sticks on a box, with the order number and product name beside it
- **[ Track my order ]** → `#/shop/my-order/:orderId`

Scannability is the requirement, not decoration: **minimum 240px, quiet zone intact, high contrast,
no animation on or behind it.** `motion` is already in the bundle and is the likely offender here.

### Acceptance

- [ ] Spec criterion 6 — **scanned off the screen with a phone camera**, decodes to
      `{"t":"parcel","id":"<parcelId>"}`
- [ ] The panel hides entirely while `parcelId === null`
- [ ] **Track my order** navigates to the my-order route
- [ ] The QR is bundled — no network request when rendering it

### Verify

```bash
bun run dev:demo   # buy, then point a phone at the screen
# a QR that renders is not a QR that scans. Use an actual phone.
```

---

## ▍CHECKPOINT B — Stage 1 is recordable

Flow steps ①–⑤ run end to end: buy → integration point fires → custody panel → printable label →
track. This is the first slice worth putting in front of someone.

---

## T5 · The custody timeline, on the my-order page

**Why.** The reusable core, and the highest-leverage ticket in the set. P5's public page is meant to
be this component re-chromed; `FRONTEND-FLOW.md:372-377` names the risk that the public page — the
only load-bearing proof in the video — gets cut for time. It stays cheap only if this component
never learns anything about the shop.

**Depends on:** T2 (T1 for the route). Independent of T3/T4.
**Size:** L.
**Spec:** §3.3, §3.5 (page shell).

### Scope

- `src/components/custody/state-badge.tsx` — the four labels from `FRONTEND-FLOW.md:48-53`; anything
  else is a neutral grey badge showing the raw byte in hex. Never a crash
- `src/components/custody/custody-timeline.tsx` — takes a `ParcelView` and renders. **Nothing more.**
  No shop imports, no shop class names, no knowledge of orders, products or buyers
- Five render branches, all required:
  1. **loading** — skeleton, no layout shift
  2. **not found** — neutral, no shop chrome
  3. **pending mint** (`parcelId === null`) — "Custody attaching…", not an error
  4. **chain** — current-state card, then one row per hop, newest first
  5. **custody unavailable** (`custodyAvailable === false`) — the order still renders, with a quiet
     band saying the chain could not be read
- Hop row: state badge · actor · timestamp when present · txid as `tx-link`
- Delivered receipt when the terminal hop is `0x04`: who delivered, when, block height, txid.
  Render what exists, omit what doesn't — two of the four are blocked on D-1
- `#/shop/my-order/:orderId` — header (order number, product, current state) with the timeline
  embedded in shop chrome. That embedding *is* the pitch's "embeddable tracking page"
- Recovery state: no token in URL or localStorage → render the order read-only (`getOrder` needs no
  token), with a short *"open this on the device you ordered from"* note. Never blank, never a login

**The Delivered hop's actor is the buyer, not a courier** — `confirm-delivery` writes the recipient's
pkh (`custody-fixture/.../confirm-delivery.ts:31`). Label it accordingly; don't hunt for a courier.

### Acceptance

- [ ] Spec criterion 7 — my-order shows the chain, one row per hop
- [ ] Spec criterion 8 — each row's txid opens a block explorer in a new tab
- [ ] Spec criterion 12 — at `0x04` the receipt renders with whatever the backend supplies, and no
      empty rows for the rest
- [ ] Spec criterion 13 — kill the custody backend mid-order: the order still renders with a
      "chain unreadable" band. **No error page, no 502 surfaced**
- [ ] Spec criterion 14 — `#/shop/my-order/9999` renders not-found, not a crash
- [ ] Spec criterion 15 — **`custody-timeline.tsx` and everything it imports reference nothing under
      `presentation/`.** This is the P5 precondition; check it by reading the import lists
- [ ] An unrecognised state byte renders a grey badge showing the hex, and does not throw
- [ ] Hops render in the order returned — never re-sorted

### Verify

```bash
bun run dev:demo
# buy, then drive the chain with curl (Appendix A) through 0x01, 0x00, 0x02, 0x04,
# reloading my-order at each step

# the P5 precondition — the check that matters most in this ticket
grep -rn "presentation/" packages/frontend/src/components/custody/
# expect: no matches

# degraded path: kill the custody fixture, reload my-order
```

---

## T6 · The delivery code reveal

**Why.** `FRONTEND-FLOW.md:229` — this is the answer to *"what stops a courier phoning ahead for the
code?"* One line of UI that you point at instead of explaining a threat model. It closes flow steps
⑯ and Stage 3.

**Depends on:** T5, T4 (the QR component).
**Size:** M.
**Spec:** §3.5 (delivery-code block).

### Scope

- `shopApi.revealCode(orderId, accessToken)` → `POST /shop/orders/:orderId/reveal-code`
- Delivery-code block on my-order, visible from `0x02` onward, **collapsed by default** behind an
  explicit **[ Reveal code ]**
- On tap: QR of `{ t: "delivery", id: parcelId, secret }`, plus **`Revealed 14:02`** beside it,
  sourced from the server's `revealedAt`
- That timestamp persists for the life of the order, including after refresh — `getOrder` returns
  `revealedAt` without the secret, so the "already revealed, code not on screen" state is real and
  must be handled
- Caption it as a bearer secret: *"Anyone holding this code can confirm delivery. Show it only to
  the courier at your door."*

The backend is already idempotent and server-stamped (`reveal-code.ts:26-34`), specifically so a
refresh cannot forge or reset the reveal. Consume that; don't re-implement it client-side.

### Acceptance

- [ ] Spec criterion 9 — before `0x02` there is no reveal control at all. At `0x02` it appears,
      collapsed
- [ ] Spec criterion 10 — reveal, then hard-refresh: **the QR is gone, the reveal time is still
      there**, from the server
- [ ] Spec criterion 11 — revealing twice returns the same secret and the same timestamp
- [ ] The secret never reaches localStorage, the URL, or state that outlives the panel
- [ ] Scanned off the screen, the QR decodes to `{"t":"delivery","id":...,"secret":...}`
- [ ] A wrong or missing token surfaces the recovery state, not a raw 403

### Verify

```bash
bun run dev:demo
# drive the parcel to 0x02 (Appendix A), open my-order, reveal
# hard-refresh: timestamp survives, QR does not
# reveal again in a second tab: same secret, same timestamp

# and confirm the secret is not persisted:
JSON.stringify(localStorage).includes('<the secret>')   // expect false
```

---

## ▍CHECKPOINT C — P3 exit criterion

`FRONTEND-FLOW.md:316` — *buy → order confirmation with a scannable label QR → my order showing the
chain.* Plus the delivery code. From here, P4 has a label to scan and P5 has a component to re-chrome.

---

## T7 · The verification pass

**Why.** The spec's §9 says the manual pass *is* the definition of done — this repo authors no
automated tests, so the pass is the only thing standing between "it worked once" and "it works on
camera". The two paths run twice are the two a live demo cannot recover from.

**Depends on:** T6.
**Size:** S.
**Spec:** §9.

### Scope

Run all 15 acceptance criteria against `bun run dev:demo` in **three browser windows** — that is how
the video gets recorded and where shared-state bugs surface. Fix what falls out, or file it.

Run twice:
- **Refresh at every route.** Especially my-order after a reveal
- **The degraded paths.** Kill the custody backend, then the shop backend. Confirm criteria 5 and 13
  rather than assuming them

A phone is required for criteria 6 and the T6 QR check.

### Acceptance

- [ ] All 15 spec criteria pass, recorded as a checked list
- [ ] The full path runs twice, cleanly, without a reload that wasn't part of the script
- [ ] Anything left broken is written down with a ticket, not left in someone's head

---

## Dependency tickets — other packages, non-blocking

Neither blocks T1–T7. Both make the video better, and both are small. Land them whenever their owner
can; T5 picks them up for free because `timestamp` and `actorLabel` are already optional.

### D-1 · Populate hop timestamps · `packages/backend`

`ParcelHistoryEntry` already declares `timestamp?: number`
(`backend/src/application/ports/parcel-contract.ts:7`) and never populates it. `CustodyHop` in the
shop backend drops the field entirely (`custody-gateway.ts:11-16`).

**Needed for:** step ⑪ *"Released 13:47"*, step ⑳ the receipt time and block height, step ㉑
*"four rows, each with actor, timestamp, own txid"*.

**Cannot be solved client-side.** `FRONTEND-FLOW.md:239` requires the public page, in a **fresh
window**, to show the identical chain. Locally-recorded times would be absent exactly where the proof
happens. It has to be the backend resolving block time per txid.

Also carry the field through `HttpCustodyGateway.getChain` (`http-custody-gateway.ts:49-50`), which
currently strips it.

**Acceptance:** `GET /parcel/:id` returns a timestamp per hop; `GET /shop/orders/:orderId` carries
it through; the timeline renders times with no frontend change.

### D-2 · Resolve actor labels · `packages/shop-backend`

`custodian` is a raw hex pkh. The shop backend already holds the mapping — `COURIERS` in
`seed.ts:40-43` carries both couriers' pkhs, and `BUYER` covers the terminal hop.

A projection in `toOrderView` (`get-order.ts:53-65`) would populate `actorLabel` per hop. Without it
the chain reads as four hex strings — which proves custody moved, but not *between whom*.

**Acceptance:** each hop carries `actorLabel` (`"Miguel Santos · J&T Express"`, `"Ana Reyes"`); an
unmatched pkh yields no label and the frontend falls back to the hash, rather than erroring.

---

## Appendix A · Driving the chain without a scanner

P4 doesn't exist yet, so curl against the custody fixture (:3002) is the only way to move a parcel
through the states T5 and T6 need. `parcelId` is a cashaddr and contains a colon — **URL-encode it.**

```bash
PID=$(printf %s "<parcelId>" | jq -sRr @uri)
F=http://localhost:3002

# 0x00 → 0x01  A releases to B
curl -X POST $F/parcel/$PID/handoff \
  -H 'content-type: application/json' -d '{"courierId":"A","nextCourierId":"B"}'

# 0x01 → 0x00  B accepts
curl -X POST $F/parcel/$PID/accept-handoff \
  -H 'content-type: application/json' -d '{"courierId":"B"}'

# 0x00 → 0x02  B marks out for delivery
curl -X POST $F/parcel/$PID/request-delivery \
  -H 'content-type: application/json' -d '{"courierId":"B"}'

# 0x02 → 0x04  needs the revealed code
curl -X POST $F/parcel/$PID/confirm-delivery \
  -H 'content-type: application/json' -d '{"courierId":"B","deliveryCode":"<secret>"}'

# read it back
curl -s $F/parcel/$PID | jq
```

Courier ids are `A` and `B` at this layer — `HttpCustodyGateway` translates the shop's `jnt-mgl` and
`ninjavan-rey` into them (`http-custody-gateway.ts:13-16`), and the real backend holds only those two
private keys.

---

## Summary

| | Ticket | Size | Depends | Spec criteria |
|---|---|---|---|---|
| T1 | Router and v1 teardown | M | — | 1, 2 |
| T2 | Checkout persists identity | S | T1 | 3 |
| T3 | The custody panel | M | T2 | 4, 5 |
| T4 | The shipping-label QR | S | T3 | 6 |
| T5 | The custody timeline | L | T2 | 7, 8, 12, 13, 14, 15 |
| T6 | The delivery code reveal | M | T5, T4 | 9, 10, 11 |
| T7 | The verification pass | S | T6 | all 15 |
| D-1 | Hop timestamps | S | — | improves 12 |
| D-2 | Actor labels | S | — | improves 7 |

Seven tickets, one L, three M, three S. T5 is the one to protect: it is the largest, it is the only
one P5 depends on, and criterion 15 is the check that keeps the public tracking page cheap.
