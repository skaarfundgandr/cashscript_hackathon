# Frontend Flow & Build Phases

> Scope: **frontend only**. Contract, backend, and chain reading are owned elsewhere.
> Supersedes the flow sections of `FRONTEND-PLAN.md` and `FRONTEND-DESIGN.md`.
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
| Surfaces | Three: merchant console · courier app · tracking page |

**States in scope — four.** Anything else renders as a neutral grey badge rather than breaking.

| Byte | Label shown to users |
|---|---|
| `0x00` | In custody |
| `0x01` | Awaiting acceptance |
| `0x02` | Out for delivery |
| `0x04` | Delivered |

---

## The three surfaces

| Surface | Route | Who uses it | Built for |
|---|---|---|---|
| Merchant console | `#/new` | Marketplace operator | Desktop |
| Courier app | `#/courier` | Courier A and Courier B — same app, two browser sessions | Phone width |
| Tracking page | `#/p/:id` | Public | Any |
| Tracking page, recipient view | `#/p/:id?k=<token>` | The recipient | Phone width |

The recipient does **not** get a fourth surface. Their view is the tracking page plus one extra block that appears when the URL carries their token. One screen fewer to build, and it matches the spec's "recipient view is the marketplace application."

### Flow decision: where the delivery code lives

The merchant's result screen shows the **recipient link**, not the code itself. The code appears only on the tracking page opened with the recipient token.

Two reasons. It keeps the demo honest — the platform is never seen holding the secret it claims not to keep. And it gives you a real transport for the code in a video where you have no email or SMS: the merchant copies a link, the recipient opens it.

---

## State machine

What the four states are and what moves between them. Every transition is one action by one person.

```
  ┌────────────┐              ┌─────────────┐            ┌────────────┐
  │  MINT      │              │  0x01       │            │  0x02      │
  │  (created) │              │  AWAITING   │            │  OUT FOR   │
  └─────┬──────┘              │  ACCEPTANCE │            │  DELIVERY  │
        │                     │  next = B   │            │  held by B │
        │                     └──┬───────▲──┘            └─────┬──────┘
        ▼                        │       │                     │
  ┌─────────────┐    handoff     │       │  accept             │  confirm
  │  0x00       │    ───────────►┘       └──────────┐          │  + recipient
  │  IN CUSTODY │    signed by A          signed by B          │    code
  │  held by A  │                                   │          │
  └─────┬───────┘◄──────────────────────────────────┘          │
        │                                                       │
        │  ┌─────────────┐                                      │
        └─►│  0x00       │──── requestDelivery ─────────────────┘
           │  IN CUSTODY │     signed by B
           │  held by B  │                              ┌──────────────┐
           └─────────────┘                              │  0x04        │
                                                        │  DELIVERED   │
                                                        │  ★ terminal  │
                                                        └──────────────┘
```

Read as a straight line, which is how the video plays it:

```
 0x00 ──handoff──► 0x01 ──accept──► 0x00 ──requestDelivery──► 0x02 ──confirm──► 0x04
 IN CUSTODY        AWAITING         IN CUSTODY                OUT FOR          DELIVERED
 held by A         ACCEPTANCE       held by B                 DELIVERY         ★ terminal
                   next is B                                  held by B
   ▲                  ▲                 ▲                        ▲                ▲
 signed by         signed by         signed by                signed by      signed by B
 marketplace          A                 B                        B          + recipient's
 at mint                                                                        code
```

---

## THE FLOW

`W1` merchant · `W2` Courier A · `W3` Courier B · `W4` recipient.

```
    W1 MERCHANT            W2 COURIER A          W3 COURIER B         W4 RECIPIENT
    ═══════════            ════════════          ════════════         ════════════

╔══ STAGE 1 · CREATE ═══════════════════════════════════════════════════════════════╗

  ① open #/new
                          ② tap My identity
                             ┌─── QR ───┐
  ③ scan / paste ◄───────────┘
  ④ Create parcel
       │ generating code
       │ deploying contract
       │ minting NFT
       ▼
  ⑤ result panel
     recipient link ─────────────────────────────────────────────────►  (held)

  ░░░░░░░░░░░░░░░░ 0x00  IN CUSTODY  ·  held by A ░░░░░░░░░░░░░░░░

╔══ STAGE 2 · HANDOFF  A ──► B ═════════════════════════════════════════════════════╗

                          ⑥ In custody
                             [Hand off]  [Request delivery]
                          ⑦ scanner opens
                                                ⑧ tap My identity
                                                   ┌─── QR ───┐
                          ⑨ scan ◄─────────────────┘
                             confirm: "you remain liable
                                       until they accept"
                          ⑩ Release → sign → broadcast

  ░░░░░░░░░░░░ 0x01  AWAITING ACCEPTANCE  ·  next custodian B ░░░░░░░░░░░░

                          ⑪ Awaiting acceptance   ⑫ parcel appears
                             no actions              (highlighted)
                             "you remain liable"  ⑬ Accept handoff
                                                     → sign → broadcast

  ░░░░░░░░░░░░░░░░ 0x00  IN CUSTODY  ·  held by B ░░░░░░░░░░░░░░░░

╔══ STAGE 3 · DELIVERY ═════════════════════════════════════════════════════════════╗

                          (drops off A's           ⑭ Request delivery
                           active list)               → sign → broadcast

  ░░░░░░░░░░░░░░░ 0x02  OUT FOR DELIVERY  ·  still held by B ░░░░░░░░░░░░░░░

                                                ⑮ [Scan delivery code]
                                                                        ⑯ opens
                                                                           recipient
                                                                           link
                                                                        ⑰ Reveal code
                                                                           ┌── QR ──┐
                                                ⑱ scan ◄──────────────────┘
                                                   confirm sheet
                                                ⑲ → sign → broadcast

  ░░░░░░░░░░░░░░░░░░░ 0x04  DELIVERED  ·  ★ terminal ░░░░░░░░░░░░░░░░░░░

╔══ STAGE 4 · PROOF ════════════════════════════════════════════════════════════════╗

                                                ⑳ ✓ Delivered
                                                                        ㉑ Delivered
                                                                        ㉒ receipt
                                                                        ㉓ full chain,
                                                                           4 rows
                                                                        ㉔ public link,
                                                                           fresh window
                                                                        ㉕ click txid →
                                                                           block explorer
```

### Stage 1 — Create the parcel

| # | Where | User does | Screen shows |
|---|---|---|---|
| 1 | W1 | Opens `#/new` | **New consignment.** Two fields: *Recipient reference*, *First custodian* |
| 2 | W2 | Taps **My identity** | QR renders. Caption: *"Safe to show anyone."* |
| 3 | W1 | Scans or pastes A's identity | Field resolves to `Courier A · 3f8a…c21b` with `✓ attested` beneath |
| 4 | W1 | Clicks **Create parcel** | Three named steps tick in sequence: `Generating delivery code…` → `Deploying contract…` → `Minting parcel NFT…` |
| 5 | W1 | — | **Parcel created.** Contract address · mint txid · custodian · **recipient link** (copy + QR) · public tracking link |

The First custodian field has **no free-text entry** — scan or paste only. Nobody ever types a key by hand.

The three progress steps are deliberate. One opaque spinner reads as a loading state; three named steps read as real work happening.

### Stage 2 — Handoff, Courier A → Courier B

| # | Where | User does | Screen shows |
|---|---|---|---|
| 6 | W2 | — | Parcel in A's list · `● In custody` · *"You are holding this"* · actions: **Hand off**, **Request delivery** |
| 7 | W2 | Taps **Hand off** | Scanner opens — camera pane plus a paste box beside it |
| 8 | W3 | Taps **My identity** | B's QR renders |
| 9 | W2 | Scans B's QR | Confirm sheet: *"Release custody to `3f8a…c21b`? You remain liable until they accept."* |
| 10 | W2 | Taps **Release** | `Signing…` → `Broadcasting…` → txid |
| 11 | W2 | — | `● Awaiting acceptance` · *"Released 13:47. You remain liable until Courier B accepts."* **No actions available** |
| 12 | W3 | — | Parcel appears in B's list, briefly highlighted · `● Awaiting your acceptance` |
| 13 | W3 | Taps **Accept handoff** | Confirm sheet: *"Accept custody? You become liable from this moment."* → signs → txid |
| 14 | W3 | — | `● In custody` · *"You are holding this"*. Parcel leaves A's active list |

**Two separate actions in two separate windows. Never collapse this into one button.** The two-step handoff with a visible liability window is the product — a system where one party can move a parcel alone is just a database.

### Stage 3 — Delivery

| # | Where | User does | Screen shows |
|---|---|---|---|
| 15 | W3 | Taps **Request delivery** | Confirm: *"Mark as out for delivery?"* → signs → txid |
| 16 | W3 | — | `● Out for delivery` · action: **Scan delivery code** |
| 17 | W4 | Opens the recipient link | `● Out for delivery — arriving now`, plus a block only they see |
| 18 | W4 | Taps **Reveal delivery code** | QR renders. Line appears: `Revealed 14:02`, and stays |
| 19 | W3 | Taps **Scan delivery code**, scans W4 | Confirm sheet: *"Confirm delivery of `pq9x…7k2m`?"* |
| 20 | W3 | Confirms | `Signing…` → `Broadcasting…` → `✓ Delivered` + txid |

The reveal is behind an explicit tap with a visible timestamp. It's one line of UI and it's the answer to "what stops a courier phoning ahead for the code?" — you can point at it rather than describe it.

### Stage 4 — Proof

| # | Where | User does | Screen shows |
|---|---|---|---|
| 21 | W4 | — | Updates to `● Delivered 14:03` |
| 22 | W4 | — | **Receipt**: delivered by Courier B `3f8a…c21b` · time · block height · txid |
| 23 | W4 | Scrolls | Full custody chain — four rows, each with actor, timestamp, own txid |
| 24 | W4 | Opens the **public** link in a fresh window | Identical chain. No login, no session |
| 25 | W4 | Clicks any txid | A public block explorer opens, showing that transaction |

**Stage 4 is the only part of the video that proves anything.** Everything before it is your UI describing itself. Give it real screen time and design it to be legible — this is where a viewer learns the record isn't yours.

> Open item, flagged but **not frontend-owned**: confirm a chipnet explorer that visibly renders the parcel's custody data. If none does, step 25 needs rethinking, and you want to know that early.

### What the flow does not include

No failed transactions. No `reject`, no `returnToSender`, no `confirmReturn`. No courier enrolment. No merchant order list. No timeouts. If a courier never accepts a handoff, the parcel sits at `0x01` — shown as a state, with no UI to resolve it.

---

## BUILD PHASES

Frontend only, start to finish. Each phase ends at something you can look at.

```
  P0 ──► P1 ──► P2 ──► P3 ──► P4 ──► P5 ──► P6
 setup  data  design track  courier merch  wire

  P0–P5    no backend or contract needed
  P6       needs the backend
```

### P0 · Setup

Clear v1 out of the way and get a page rendering.

- Branch `feat/frontend`
- Delete the wallet-connect files: `application/ports/wallet-connector.ts`, `infrastructure/mock-wallet.ts`, the v1 `api-client.ts`, and the old `presentation/app.ts`
- Keep `utils/cashaddr.ts` — it's correct, just move it
- Install a QR generator and a QR scanner
- Hash router: `#/new`, `#/courier`, `#/p/:id`

**Exit:** three routes resolve to three blank labelled pages.

### P1 · Data layer

The most valuable phase. It removes every dependency on other people.

- `application/ports/parcel-api.ts` — the one seam:
  `createParcel · getParcel · handoff · accept · requestDelivery · confirm · revealDeliveryCode · subscribe`
- `domain/parcel.ts` — `ParcelView` carries the **whole custody chain**, not just current state. Every hop: state, actor label, actor key hash, timestamp, txid
- `infrastructure/fixture-api.ts` — an in-memory parcel with a real state machine, artificial latency, backed by `localStorage` so all four windows share it
- `subscribe(id, cb)` polls `getParcel` every 2s and fires on change. Same mechanism against fixture and real backend — build it once

**Exit:** `getParcel('demo')` returns a full four-hop chain; two browser windows see the same data.

### P2 · Design system & shell

- Tokens: colour, type, spacing, radius, motion. **System font stacks — no CDN fonts.** A demo shouldn't depend on a network request to look right
- One colour per state, locked and used everywhere
- App shell: header with wordmark and a network indicator, centred container
- Primitives: `state-badge`, `hash-value` (mono, middle-truncated, click-to-copy), `tx-link`, `button`, `panel`

**Exit:** a scratch page showing all four state badges and a truncated hash that copies on click.

### P3 · Tracking page

Build this **before** the interactive screens. It's read-only, it's the proof surface, and it defines components the other two reuse.

- Current-state card
- Custody timeline — one row per hop: actor, timestamp, txid link
- Recipient block: reveal-code button, QR, reveal timestamp — only when the URL has the token
- Delivered: receipt block
- Loading and not-found states

**Exit:** the fixture chain renders end to end and is legible at arm's length.

### P4 · Courier app

The biggest screen. Mobile-first — it's the only one a real courier would hold.

- Role switcher: `Courier A | Courier B`, each with its own identity
- Identity QR panel
- Scanner: camera **plus a paste box**. The paste path is your insurance — cameras need HTTPS off localhost, and a camera that won't open mid-recording ends the session
- Contextual action panel — render only what this role can do in this state. **Never a disabled button**; show nothing, or show what they should do instead

| State | Custodian sees | Other courier sees |
|---|---|---|
| `0x00` | Hand off · Request delivery | identity QR, waiting |
| `0x01` | "Released. Awaiting acceptance." | **Accept handoff** |
| `0x02` | **Scan delivery code** | — |
| `0x04` | receipt, read-only | receipt, read-only |

- Confirm sheets with the liability wording from steps 9 and 13
- Progress: `Signing…` → `Broadcasting…` → txid

**Exit:** full happy path clickable across two windows against the fixture.

### P5 · Merchant console

- Recipient reference + first custodian by scan/paste only
- Three named progress steps
- Result panel: contract, mint txid, custodian, recipient link + QR, public link

**Exit:** create → land on the tracking page for the new parcel.

### P6 · Wire the real backend

Only when the backend confirms a parcel can actually move on chain.

- `infrastructure/http-api.ts` implementing the same interface
- Fix the dev proxy to match the routes the backend really serves
- Swap the implementation in one line
- **Keep the fixture in the build behind `?fixture=1`** — permanently. It's your fallback if the chain is unreachable while you're recording

**Exit:** the happy path runs against the real thing, twice.

---

## Why this order

P1 before anything visual, because retrofitting a data shape across three screens is the most expensive mistake available.

P3 before P4 and P5, because the tracking page is read-only — no signing, no scanning, no state changes — so it's the cheapest place to get the shared components right, and both interactive screens then reuse them.

P6 last, and separable. If the chain isn't ready, P0–P5 still produce a complete, recordable flow against the fixture. That is a deliberate property of the plan, not a fallback bolted on afterwards.
