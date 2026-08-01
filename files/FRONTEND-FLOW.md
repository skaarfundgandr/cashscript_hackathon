# Frontend Flow & Build Phases

> Scope: **frontend only**. Contract, backend, and chain reading are owned elsewhere.
> Supersedes `FRONTEND-PLAN.md` and the flow sections of `FRONTEND-DESIGN.md`.
> Placeholder name `APP` throughout — one string to change later.

---

## Locked decisions

| | Decision |
|---|---|
| Spec version | **v2** — nobody connects a wallet, delivery needs the recipient's code |
| Demo format | **10-minute video** |
| Scope | **Happy path only. No failed transactions on screen.** |
| Alternate endings | `reject` / `returnToSender` / `confirmReturn` — deferred |
| Data source | Backend reads the chain. Frontend never touches the chain directly |
| Merchant surface | **A mock e-commerce shop**, not an admin console |
| Courier surface | **A scanner**, not a parcel list |

### Why a shop and not an admin console

The product is an integration — *"merchants integrate this into systems they already run, one
endpoint plus an embeddable tracking page."* A standalone admin form quietly contradicts that; a
shop demonstrates it. It also gives the delivery code a truthful home: the buyer's own account,
which is what `parcel-tracker-auth.md` §8 specifies, rather than a tokenised magic link.

The shop is **thin**: one product page, an order confirmation, and a my-order page. No cart, no
catalogue, no login, no payment.

### Why a scanner and not a list

Real couriers scan; they don't browse parcels and pick actions from a list. Scanning ties every
action to the physical object, which is the entire premise of a custody system. It also removes
the need to poll for changes on the courier surface — B scans the box they were handed and the
app tells them where it stands.

It requires one new artifact: a **parcel label QR**, produced by the shop on the order
confirmation. Every real parcel already carries a barcode, so this is realistic rather than
invented.

---

## States in scope

Four. Anything else renders a neutral grey badge rather than breaking.

| Byte | Label shown to users |
|---|---|
| `0x00` | In custody |
| `0x01` | Awaiting acceptance |
| `0x02` | Out for delivery |
| `0x04` | Delivered |

---

## The three surfaces

They should look like three different products.

| # | Surface | Routes | Identity |
|---|---|---|---|
| 1 | **Shop** — the customer's existing e-commerce | `#/shop` · `#/shop/order/:id` · `#/shop/my-order/:id` | Its own chrome. Looks like a shop |
| 2 | **Courier scanner** | `#/courier` | Utilitarian, phone width |
| 3 | **Public tracking** | `#/p/:id` | Your product. Neutral, document-like |

The shop's my-order page embeds the **same custody timeline component** the public page uses.
That embedding *is* the "embeddable tracking page" from the pitch — the same component in
someone else's chrome. Build it once, use it twice.

---

## QR payloads

Three types. The scanner switches on `t` and rejects anything it doesn't recognise.

| Type | Payload | Shown by | Scanned by |
|---|---|---|---|
| **Parcel label** | `{ t: "parcel", id }` | Shop order confirmation — the label the merchant prints | Either courier |
| **Courier badge** | `{ t: "courier", pkh, attestation }` | Courier scanner, *My badge* mode | The outgoing courier |
| **Delivery code** | `{ t: "delivery", id, secret }` | Buyer's my-order page, after an explicit reveal | Last-mile courier |

Secrecy differs and the UI should say so. The badge is **inert** — both values are public, and a
stranger holding it still cannot produce that courier's signature. The delivery code **is a
bearer secret** — anyone holding it can confirm. Hence the explicit reveal and the visible
timestamp.

---

## State machine

```
 0x00 ──handoff──► 0x01 ──accept──► 0x00 ──requestDelivery──► 0x02 ──confirm──► 0x04
 IN CUSTODY        AWAITING         IN CUSTODY                OUT FOR          DELIVERED
 held by A         ACCEPTANCE       held by B                 DELIVERY         ★ terminal
                   next is B                                  held by B
   ▲                  ▲                 ▲                        ▲                ▲
 created by        signed by         signed by                signed by      signed by the
 the shop             A                 B                        B           marketplace
 at checkout                                                                 + the buyer's
                                                                                 code
```

The loop `0x00 → 0x01 → 0x00` repeats for every hop. Tonight's flow runs it once.

---

## THE FLOW

`W1` shop, as the buyer · `W2` Courier A · `W3` Courier B.

```
    W1 SHOP (buyer)            W2 COURIER A           W3 COURIER B
    ═══════════════            ════════════           ════════════

╔══ STAGE 1 · ORDER PLACED ═══════════════════════════════════════════════════╗

  ① product page
     [ Buy now ]
  ② ─── shop backend creates the parcel ───►   ★ THE INTEGRATION POINT
  ③ order confirmation
     "Custody tracking enabled"
     contract · mint txid
  ④ ┌─ SHIPPING LABEL ─┐
     │       QR         │ ────────────────►  printed, stuck on the box
     └──────────────────┘
  ⑤ [ Track my order ]

  ░░░░░░░░░░░░░ 0x00  IN CUSTODY  ·  held by A ░░░░░░░░░░░░░

╔══ STAGE 2 · HANDOFF  A ──► B ═══════════════════════════════════════════════╗

                             ⑥ scan BOX LABEL
                                → In custody
                                → [ Hand off ]
                             ⑦ scanner arms
                                                    ⑧ My badge
                                                       ┌── QR ──┐
                             ⑨ scan ◄──────────────────┘
                                confirm: "you remain liable
                                          until they accept"
                             ⑩ Release → sign → broadcast

  ░░░░░░░ 0x01  AWAITING ACCEPTANCE  ·  next custodian B ░░░░░░░

                             ⑪ Awaiting acceptance   ⑫ scan BOX LABEL
                                no action available     → Awaiting your
                                                          acceptance
                                                        → [ Accept ]
                                                     ⑬ sign → broadcast

  ░░░░░░░░░░░░░ 0x00  IN CUSTODY  ·  held by B ░░░░░░░░░░░░░

╔══ STAGE 3 · DELIVERY ═══════════════════════════════════════════════════════╗

                                                     ⑭ [ Request delivery ]
                                                        → sign → broadcast

  ░░░░░░░░ 0x02  OUT FOR DELIVERY  ·  still held by B ░░░░░░░░

  ⑮ my order
     "arriving now"
  ⑯ [ Reveal code ]
     ┌── QR ──┐
     └────────┘ ─────────────────────────────────────► ⑰ scan
                                                     ⑱ confirm → sign
                                                        → broadcast

  ░░░░░░░░░░░░ 0x04  DELIVERED  ·  ★ terminal ░░░░░░░░░░░░

╔══ STAGE 4 · PROOF ══════════════════════════════════════════════════════════╗

  ⑲ my order: Delivered
     + receipt
  ⑳ full chain, 4 rows,
     each with its own txid
  ㉑ open the PUBLIC link
     in a fresh window —
     no login, no session
  ㉒ click any txid
     → block explorer
```

### Stage 1 — Order placed · W1

| # | User does | Screen shows |
|---|---|---|
| 1 | Opens `#/shop`, taps **Buy now** | One product. No cart, no checkout form |
| 2 | — | The shop's backend creates the parcel. **This is the integration point** |
| 3 | — | `Order #4471 placed`, and beneath it a panel: *"Custody tracking enabled"* with the contract address and mint txid |
| 4 | — | **Shipping label** panel with a QR — what the merchant prints and sticks on the box |
| 5 | Taps **Track my order** | Goes to the my-order page |

Courier A is assigned server-side. Nobody scans a courier identity to place an order — a real
integration wouldn't work that way.

Panel 3 is doing pitch work: it's the moment a viewer sees an ordinary shop gain a custody layer.

### Stage 2 — Handoff, Courier A → Courier B · W2, W3

| # | Where | User does | Screen shows |
|---|---|---|---|
| 6 | W2 | Scans the **box label** | `● In custody · You are holding this` · action **Hand off** |
| 7 | W2 | Taps **Hand off** | Scanner arms, waiting for a badge |
| 8 | W3 | Switches to **My badge** | B's QR. Caption: *"Safe to show anyone."* |
| 9 | W2 | Scans B's badge | Confirm sheet: *"Release custody to `3f8a…c21b`? You remain liable until they accept."* |
| 10 | W2 | Taps **Release** | `Signing…` → `Broadcasting…` → txid |
| 11 | W2 | — | `● Awaiting acceptance · Released 13:47. You remain liable until Courier B accepts.` **No action available** |
| 12 | W3 | Scans the **box label** | `● Awaiting your acceptance` · action **Accept** |
| 13 | W3 | Taps **Accept** | *"Accept custody? You become liable from this moment."* → signs → txid |
| 14 | W3 | — | `● In custody · You are holding this` |

**Two separate signatures by two people.** Never collapse this into one action — a system where
one party can move a parcel alone is just a database.

The liability wording is not decoration. The window between steps 10 and 13 is a real product
property, and naming it on screen is what distinguishes this from a status field.

### Stage 3 — Delivery · W3, W1

| # | Where | User does | Screen shows |
|---|---|---|---|
| 15 | W3 | Taps **Request delivery** | *"Mark as out for delivery?"* → signs → txid |
| 16 | W3 | — | `● Out for delivery` · action **Scan delivery code** |
| 17 | W1 | Opens my order | `● Out for delivery — arriving now`, plus a delivery-code block |
| 18 | W1 | Taps **Reveal code** | QR renders. `Revealed 14:02` appears and stays |
| 19 | W3 | Scans the code QR | Confirm sheet → signs → `✓ Delivered` + txid |

The reveal sits behind an explicit tap with a visible timestamp. One line of UI, and it's the
answer to *"what stops a courier phoning ahead for the code?"* — you point at it rather than
describing it.

### Stage 4 — Proof · W1

| # | User does | Screen shows |
|---|---|---|
| 20 | — | `● Delivered 14:03` + **receipt**: who delivered, when, block height, txid |
| 21 | Scrolls | Full custody chain — four rows, each with actor, timestamp, own txid |
| 22 | Opens the **public** link in a fresh window | Identical chain. No login, no session |
| 23 | Clicks any txid | A public block explorer opens on that transaction |

**Stage 4 is the only part of the video that proves anything.** Everything before it is the UI
describing itself. Give it real screen time.

> Open item, **not frontend-owned**: confirm a chipnet explorer that visibly renders the parcel's
> custody data. A generic transaction view proves a transaction happened, not that custody moved.
> Flag this to whoever owns the chain work — if no explorer shows it, step 23 needs rethinking.

### What the flow does not include

No failed transactions. No `reject`, `returnToSender`, or `confirmReturn`. No courier enrolment.
No cart, catalogue, shop login, or payment. No timeouts — if a courier never accepts a handoff
the parcel sits at `0x01`, shown as a state with no UI to resolve it.

---

## BUILD PHASES

```
  P0 ──► P1 ──► P2 ──► P3 ──► P4 ──► P5 ──► P6
 setup  data  design  shop scanner track  wire

  P0–P5   no backend or contract needed
  P6      needs the backend
```

Built in story order: place an order and get a label → move it through custody → anyone can
verify. Every phase ends at a coherent slice you could show someone.

### P0 · Setup

- Delete the v1 wallet files: `application/ports/wallet-connector.ts`,
  `infrastructure/mock-wallet.ts`, `infrastructure/api-client.ts`, `presentation/app.ts`
- Keep `utils/cashaddr.ts` — it is correct as written
- Hash router for the five routes

**Exit:** every route resolves to a blank labelled page.

### P1 · Data layer

The most valuable phase. It removes every dependency on other people.

- `application/ports/parcel-api.ts` — the one seam:
  `createOrder · getParcel · handoff · accept · requestDelivery · confirm · revealDeliveryCode · subscribe`
- `domain/parcel.ts` — `ParcelView` carries the **whole custody chain**, not just current state:
  every hop's state, actor label, actor key hash, timestamp, txid
- `domain/qr-payloads.ts` — the three payload types plus a type guard each
- `infrastructure/fixture-api.ts` — a real state machine with artificial latency, backed by
  `localStorage` so all three windows share it
- `subscribe(id, cb)` polls `getParcel` every 2s. Used by the tracking views only, **not** the
  scanner

**Exit:** `getParcel` returns a four-hop chain; two browser windows see the same data.

### P2 · Design system

- Tokens: colour, type, spacing, radius, motion. **System font stacks — no CDN fonts.** A demo
  should not depend on a network request to look right
- One colour per state, locked and used everywhere
- Two chromes: shop and custody
- Primitives: `state-badge`, `hash-value` (mono, middle-truncated, click-to-copy), `tx-link`,
  `button`, `panel`, `qr-panel`

**Exit:** a scratch page showing all four state badges and a hash that copies on click.

### P3 · Shop

- Product page with a Buy button — static content, no cart
- Order confirmation: custody panel + shipping-label QR
- My-order page: reveal-code block

The **custody timeline component is built here** — current-state card, one row per hop, delivered
receipt, loading and not-found states. P5 reuses it as-is in different chrome, so keep it free of
shop-specific styling: it takes a `ParcelView` and renders, nothing more.

**Exit:** buy → order confirmation with a scannable label QR → my order showing the chain.

### P4 · Courier scanner

One screen, two modes: **Scan** and **My badge**. Role switcher `Courier A | Courier B`.

- Camera **plus a paste box**. The paste path is insurance — cameras need HTTPS off localhost,
  and a camera that won't open mid-recording ends the session
- On a parcel-label scan, show the state plus the one action available to this role.
  **Never a disabled button** — show nothing, or show what they should do instead
- Confirm sheets carry the liability wording from steps 9 and 13
- Progress: `Signing…` → `Broadcasting…` → txid

| State | Custodian sees | Other courier sees |
|---|---|---|
| `0x00` | Hand off · Request delivery | "Held by the other courier" |
| `0x01` | "Released. Awaiting acceptance." | **Accept** |
| `0x02` | **Scan delivery code** | — |
| `0x04` | receipt, read-only | receipt, read-only |

**Exit:** the full happy path is clickable across two windows against the fixture.

### P5 · Public tracking

`#/p/:id` — the P3 timeline component in neutral chrome, no login, no session, plus the
"read from the chain, not our database" band and the contract address.

Should be thin by this point: the component already exists and is already rendering the same
data inside the shop.

**Exit:** opens cold in a fresh incognito window and renders the full chain.

### P6 · Wire the real backend

Only when the backend can actually move a parcel on chain.

- `infrastructure/http-api.ts` implementing the same interface
- Fix the dev proxy to match the routes the backend really serves
- Swap the implementation in one line
- **Keep the fixture behind `?fixture=1` permanently** — the fallback if the chain is unreachable
  while recording

**Exit:** the happy path runs against the real thing, twice.

---

## Why this order

P1 before anything visual, because retrofitting a data shape across three surfaces is the most
expensive mistake available.

Then story order. The shop comes first because it is where a parcel is *created*, so the data
layer gets exercised through its real path rather than against a hardcoded fixture.

P6 last and separable: if the chain isn't ready, P0–P5 still produce a complete, recordable flow.

**One risk this order carries.** With no failed transactions in the video, the public tracking
page is the only load-bearing proof — and it is last, so it is what gets cut if time runs out.
The mitigation is structural rather than hopeful: because the timeline component is built in P3
and merely re-chromed in P5, the public page is a thin wrapper by the time you reach it. Keep it
that way. If the component starts absorbing shop-specific styling in P3, that risk stops being
theoretical.
