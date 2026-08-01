# ParcelTracker — BCH Delivery Tracking Smart Contract

> Hackathon demo: on-chain custody tracking for e-commerce parcels using CashScript state machines and CashToken NFTs. Covers successful delivery, recipient rejection, and courier-initiated returns.

---

## 1. Overview

A shared, tamper-resistant tracking system for individual e-commerce parcels. Each parcel gets one unique CashToken NFT locked by a CashScript covenant. The contract enforces a linear state machine where each custody handoff is an on-chain transaction. Only the final recipient can confirm or reject delivery. Couriers can initiate a return if the recipient is unresponsive — but only the merchant can close the return.

### Hackathon scope

- Demonstrate **one individual parcel** through the full lifecycle
- Merchant → Courier A → Courier B → Recipient
- Three possible endings: Delivered, Rejected, Returned
- Chipnet (BCH testnet)

---

## 2. Actors

| Actor | Role | Needs |
|---|---|---|
| **Merchant / Seller** | Creates parcel, mints tracking NFT, assigns first courier, pre-funds gas, confirms returns | BCH (chipnet) + keypair |
| **Courier A** | First custodian, hands off to Courier B | Keypair only |
| **Courier B** | Second custodian, hands off to Recipient; can initiate return | Keypair only |
| **Recipient** | Final customer, confirms or rejects delivery | Keypair only |

---

## 3. State Machine

```
                           ┌──────────────────────────────────────────┐
                           │              DELIVERED (3)               │
                           │              ★ TERMINAL ★                │
                           └──────────────────────────────────────────┘
                                                ▲
                                                │ confirmDelivery()
                                                │ (recipient signs)
                           ┌────────────────────┴─────────────────────┐
  ┌──────────┐  handoff()  │              DELIVERYPENDING (2)          │
  │INCUSTODY │────────────►│              pending = recipient          │
  │  (0)     │             └──┬────────────────────┬──────────────────┘
  │ holds=A  │                │                    │
  └────▲─────┘                │ reject()           │ returnToSender()
       │                      │ (recipient signs)  │ (courier signs)
       │ acceptHandoff()      ▼                    ▼
       │ (B signs)    ┌──────────────┐    ┌──────────────────┐
  ┌────┴──────────┐   │  REJECTED (4)│    │ RETURN_PENDING (5)│
  │HANDOFFPENDING │   │  ★ TERMINAL ★│    │ pending = merchant │
  │     (1)       │   └──────────────┘    └────────┬─────────┘
  │ pending = B   │                                │
  └───────────────┘                                │ confirmReturn()
                                                   │ (merchant signs)
                                                   ▼
                                          ┌──────────────────┐
                                          │  RETURNED (6)    │
                                          │  ★ TERMINAL ★    │
                                          └──────────────────┘
```

Seven states:

| State | Value | Meaning | Can be spent by |
|---|---|---|---|
| InCustody | 0 | Parcel held by custodian in commitment | Commitment's `custodian` field |
| HandoffPending | 1 | Courier proposed handoff to next courier | Commitment's `custodian` field (the NEXT courier) |
| DeliveryPending | 2 | Courier proposed delivery to recipient | **Recipient** (via `confirmDelivery` or `reject`) **or Courier** (via `returnToSender`) |
| Delivered | 3 | Terminal — recipient accepted | Nobody |
| Rejected | 4 | Terminal — recipient refused | Nobody |
| ReturnPending | 5 | Courier initiated return, awaiting merchant | **Merchant** (constructor `merchantPkh`) |
| Returned | 6 | Terminal — merchant confirmed return | Nobody |

### Transitions

| # | From | To | Function | Signs | Key check |
|---|---|---|---|---|---|
| 1 | InCustody (A) | HandoffPending (B) | `handoff` | Courier A | `hash160(pk) == commitment.custodian` |
| 2 | HandoffPending (B) | InCustody (B) | `acceptHandoff` | Courier B | `hash160(pk) == commitment.custodian` |
| 3 | InCustody (B) | DeliveryPending | `requestDelivery` | Courier B | `hash160(pk) == commitment.custodian` |
| 4 | DeliveryPending | Delivered | `confirmDelivery` | **Recipient** | `hash160(pk) == this.recipientPkh` |
| 5 | DeliveryPending | Rejected | `reject` | **Recipient** | `hash160(pk) == this.recipientPkh` |
| 6 | DeliveryPending | ReturnPending | `returnToSender` | **Courier** | `hash160(pk) == commitment.custodian` |
| 7 | ReturnPending | Returned | `confirmReturn` | **Merchant** | `hash160(pk) == this.merchantPkh` |

### Key design property: three exits from DeliveryPending

Only one state has branching: `DeliveryPending`. From here, three actors can act — but each has **exactly one path**:

| Actor | Can call | Goes to | Constraint |
|---|---|---|---|
| Recipient | `confirmDelivery()` | Delivered | Must match `this.recipientPkh` |
| Recipient | `reject()` | Rejected | Must match `this.recipientPkh` |
| Courier | `returnToSender()` | ReturnPending | Must match commitment's `custodian` |
| Merchant | — | — | Cannot act directly on DeliveryPending; only on ReturnPending |

The recipient has two choices (accept/reject). The courier has one (initiate return). The merchant has one (confirm return) — but only after the courier has already initiated it. No actor can unilaterally close the loop.

---

## 4. Contract Design

### Constructor

```cashscript
contract ParcelTracker(bytes20 recipientPkh, bytes20 merchantPkh) {
    // recipientPkh — IMMUTABLE. Only this address can confirm/reject delivery.
    // merchantPkh — IMMUTABLE. Only this address can confirm a return.
}
```

One contract deployment per parcel. Both recipient and merchant are fixed at creation — neither can be changed mid-lifecycle.

### Functions

```cashscript
function handoff(sig courierSig, pubkey courierPk, bytes20 nextCustodian) {
    require(this.state == STATE_INCUSTODY);                     // must be in InCustody
    require(hash160(courierPk) == this.commitment.custodian);   // must be current holder
    require(checkSig(courierSig, courierPk));
    // Enforce output: state=HandoffPending, custodian=nextCustodian
}

function acceptHandoff(sig courierSig, pubkey courierPk) {
    require(this.state == STATE_HANDOFF_PENDING);               // must be awaiting handoff
    require(hash160(courierPk) == this.commitment.custodian);   // must be the intended courier
    require(checkSig(courierSig, courierPk));
    // Enforce output: state=InCustody, custodian=same pk (the accepter)
}

function requestDelivery(sig courierSig, pubkey courierPk) {
    require(this.state == STATE_INCUSTODY);                     // must be holding parcel
    require(hash160(courierPk) == this.commitment.custodian);   // must be current holder
    require(checkSig(courierSig, courierPk));
    // Enforce output: state=DeliveryPending, custodian=this.recipientPkh
    // NOTE: recipientPkh read from CONSTRUCTOR — courier cannot redirect delivery
}

function confirmDelivery(sig recipientSig, pubkey recipientPk) {
    require(this.state == STATE_DELIVERY_PENDING);              // must be pending delivery
    require(hash160(recipientPk) == this.recipientPkh);         // ★ MUST BE RECIPIENT ★
    require(checkSig(recipientSig, recipientPk));
    // Enforce output: state=Delivered, custodian=0x00...00
}

function reject(sig recipientSig, pubkey recipientPk) {
    require(this.state == STATE_DELIVERY_PENDING);              // must be pending delivery
    require(hash160(recipientPk) == this.recipientPkh);         // ★ MUST BE RECIPIENT ★
    require(checkSig(recipientSig, recipientPk));
    // Enforce output: state=Rejected, custodian=0x00...00
}

function returnToSender(sig courierSig, pubkey courierPk) {
    require(this.state == STATE_DELIVERY_PENDING);              // must be pending delivery
    require(hash160(courierPk) == this.commitment.custodian);   // must be the courier
    require(checkSig(courierSig, courierPk));
    // Enforce output: state=ReturnPending, custodian=this.merchantPkh
    // NOTE: merchantPkh read from CONSTRUCTOR — courier cannot redirect return
}

function confirmReturn(sig merchantSig, pubkey merchantPk) {
    require(this.state == STATE_RETURN_PENDING);                 // must be pending return
    require(hash160(merchantPk) == this.merchantPkh);            // ★ MUST BE MERCHANT ★
    require(checkSig(merchantSig, merchantPk));
    // Enforce output: state=Returned, custodian=0x00...00
}
```

### Terminal states

All functions begin with a state check. Terminal states (3, 4, 6) are never valid inputs, so the UTXO is permanently locked:

```cashscript
// No function accepts state >= 3 as input
// Delivered=3, Rejected=4, Returned=6 are dead ends
```

### Covenant enforcement

Every function enforces that the NFT output goes back to the **same contract** (same locking bytecode). This is the "single lock" pattern — one contract address, many states encoded in the NFT commitment.

---

## 5. NFT Commitment Encoding (40 bytes)

Both recipient and merchant live in constructor params (immutable). The commitment only needs state + current custodian:

```
Byte 0:     state       uint8    (0-6, see state table above)
Byte 1-20:  custodian   bytes20  (hash160 of current or pending custodian)
Byte 21-39: reserved    bytes19  (zero-filled — future-proof for timestamps, GPS, etc.)
```

### TypeScript encode/decode

```ts
function encodeCommitment(state: number, custodian: Uint8Array): Uint8Array {
  const buf = new Uint8Array(40);
  buf[0] = state;
  buf.set(custodian, 1);  // bytes 1-20
  return buf;             // bytes 21-39 remain zero
}

function decodeCommitment(buf: Uint8Array): { state: number; custodian: Uint8Array } {
  return {
    state: buf[0],
    custodian: buf.slice(1, 21),
  };
}
```

---

## 6. Transaction Flow

### TX1 — Mint (Merchant creates parcel)

| | Detail |
|---|---|
| **Inputs** | Minting NFT UTXO (contract) + Merchant BCH UTXO (funding) |
| **Unlocks with** | `mint(merchantSig, merchantPk, courierAPkh)` |
| **Creates** | Parcel NFT UTXO with **10,000 sats** + commitment `[state=0, custodian=A]` |
| **Outputs** | Parcel NFT → contract addr, Minting NFT passthrough → contract addr, BCH change → merchant |
| **Signer** | Merchant |

### TX2 — Handoff (Courier A → Courier B pending)

| | Detail |
|---|---|
| **Input** | Parcel NFT UTXO (from TX1) |
| **Unlocks with** | `handoff(courierASig, courierAPk, courierBPkh)` |
| **Creates** | Parcel NFT UTXO with ~9,600 sats + commitment `[state=1, custodian=B]` |
| **Signer** | Courier A |
| **After** | Courier A cannot spend this UTXO anymore |

### TX3 — Accept Handoff (Courier B accepts)

| | Detail |
|---|---|
| **Input** | Parcel NFT UTXO (from TX2) |
| **Unlocks with** | `acceptHandoff(courierBSig, courierBPk)` |
| **Creates** | Parcel NFT UTXO with ~9,200 sats + commitment `[state=0, custodian=B]` |
| **Signer** | Courier B |

### TX4 — Request Delivery (Courier B → Recipient pending)

| | Detail |
|---|---|
| **Input** | Parcel NFT UTXO (from TX3) |
| **Unlocks with** | `requestDelivery(courierBSig, courierBPk)` |
| **Creates** | Parcel NFT UTXO with ~8,800 sats + commitment `[state=2, custodian=recipientPkh]` |
| **Signer** | Courier B |
| **Key detail** | Recipient PKH comes from **constructor** — courier cannot redirect |

### TX5a — Confirm Delivery (Recipient accepts) ★ HAPPY PATH ★

| | Detail |
|---|---|
| **Input** | Parcel NFT UTXO (from TX4) |
| **Unlocks with** | `confirmDelivery(recipientSig, recipientPk)` |
| **Creates** | Parcel NFT UTXO with ~8,400 sats + commitment `[state=3, custodian=0x00...00]` |
| **Signer** | Recipient **(only!)** |
| **Key check** | `hash160(recipientPk) == this.recipientPkh` |

### TX5b — Reject Delivery (Recipient refuses) ★ ALTERNATE ENDING ★

| | Detail |
|---|---|
| **Input** | Parcel NFT UTXO (from TX4) |
| **Unlocks with** | `reject(recipientSig, recipientPk)` |
| **Creates** | Parcel NFT UTXO with ~8,400 sats + commitment `[state=4, custodian=0x00...00]` |
| **Signer** | Recipient **(only!)** |
| **Key check** | `hash160(recipientPk) == this.recipientPkh` |

### TX5c — Initiate Return (Courier gives up, sends back) ★ ALTERNATE ENDING ★

| | Detail |
|---|---|
| **Input** | Parcel NFT UTXO (from TX4) |
| **Unlocks with** | `returnToSender(courierBSig, courierBPk)` |
| **Creates** | Parcel NFT UTXO with ~8,400 sats + commitment `[state=5, custodian=merchantPkh]` |
| **Signer** | Courier B |
| **Key detail** | Merchant PKH comes from **constructor** — courier cannot redirect return |

### TX6 — Confirm Return (Merchant receives returned parcel)

| | Detail |
|---|---|
| **Input** | Parcel NFT UTXO (from TX5c) |
| **Unlocks with** | `confirmReturn(merchantSig, merchantPk)` |
| **Creates** | Parcel NFT UTXO with ~8,000 sats + commitment `[state=6, custodian=0x00...00]` |
| **Signer** | Merchant **(only!)** |
| **Key check** | `hash160(merchantPk) == this.merchantPkh` |

---

## 7. Gas / Fee Model

### Merchant pre-funds everything

The contract UTXO carries its own gas money. Merchant includes **10,000 sats** in the mint output:

```
TX1 (mint):              10,000 sats
TX2 (handoff):            9,600 sats  (10,000 - 400)
TX3 (accept):             9,200 sats  (9,600 - 400)
TX4 (requestDelivery):    8,800 sats  (9,200 - 400)
TX5a/b/c (deliver/reject/return): 8,400 sats  (8,800 - 400)
TX6 (confirmReturn):      8,000 sats  (8,400 - 400) — terminal
```

The happy path (TX1→TX5a) uses 1,600 sats. The return path (TX1→TX5c→TX6) uses 2,000 sats. 10,000 sats covers either with 5x headroom.

### Who pays what

| Actor | BCH needed? | Pays for |
|---|---|---|
| Merchant | **Yes** | Minting + pre-funding entire tracking chain (~10,000 sats ≈ $0.00025 on chipnet) |
| Courier A | No | Nothing — signs with keypair only |
| Courier B | No | Nothing — signs with keypair only |
| Recipient | **No** | Nothing — signs with keypair only |

### Edge cases

- **Too little BCH**: Transaction fails on-chain. Couriier can top-up by adding a BCH input. TypeScript wrapper detects `inputAmount < dust + fee` and auto-funds.
- **Too much BCH**: Extra sats sit in the UTXO. At terminal states, locked forever. Chipnet dust is irrelevant (< $0.01).
- **Courier payment is separate**: This contract tracks **custody only**. Courier compensation happens off-chain through the e-commerce platform's existing billing. The BCH in the UTXO is gas money for miners, not payment for delivery work.

---

## 8. QR Code Integration (Off-Chain UX)

| Step | QR generated by | QR payload | Scanned by | Triggers |
|---|---|---|---|---|
| Handoff | Courier A | contract address + `{fn: "acceptHandoff"}` | Courier B | TX3 |
| Delivery | Courier B | contract address + `{fn: "confirmDelivery"}`, `{fn: "reject"}` | Recipient | TX5a or TX5b |
| Return | Courier B | contract address + `{fn: "confirmReturn"}` | Merchant | TX6 |

The delivery QR offers the recipient **two buttons**: Accept and Reject. Both call the same contract but different functions. The wallet constructs and signs either `confirmDelivery()` or `reject()` — the recipient chooses.

The return QR is shown to the merchant when the courier hands the parcel back — same pattern as delivery, but merchant confirms instead of recipient.

---

## 9. Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Recipient storage | Constructor parameter | Immutable, readable in all functions, frees 20 bytes in commitment |
| Merchant storage | Constructor parameter | Immutable, needed for return confirmation |
| Custodian storage | NFT commitment (bytes 1-20) | Mutable per state transition |
| State storage | NFT commitment (byte 0) | 7 states fit in 1 byte |
| Contract deployment | One per parcel | Each parcel has unique recipient + merchant |
| Fee strategy | Pre-funded UTXO | Recipient should not need BCH for any action; UX win |
| Handoff trust model | Trusted push (A initiates, B accepts) | Simpler than dual-signature trustless handoff |
| Return trust model | Courier initiates, merchant confirms | Two-party agreement; courier can't unilaterally "lose" package, merchant can't unilaterally recall |
| BCH network | Chipnet | Testnet with real Electrum protocol, zero cost |
| CashScript version | 0.13 | Current stable; `tx.inputs[x].nftCommitment` available for reading input commitment state |

---

## 10. Limitations

- **Stranded parcels on wrong PKH**: If Courier A sets wrong PKH in `handoff()`, parcel is stuck. No clawback. Mitigation: TypeScript wrapper validates PKH format before building tx.
- **No courier accountability for acceptance**: Courier B can refuse to call `acceptHandoff()` — the parcel sits in `HandoffPending` forever. The contract can't force acceptance. Mitigation: off-chain SLA between courier companies.
- **Unresponsive recipient**: If recipient never scans the delivery QR, the courier's only recourse is `returnToSender()`. There's no automatic timeout. Mitigation: courier company policy (return after N days).
- **No multi-parcel batching**: One contract deployment per parcel.
- **No timestamp/GPS in commitment**: Bytes 21-39 reserved but unused.
- **CashScript 0.13 input commitment**: `tx.inputs[x].nftCommitment` is available and used by the contract to read current state and custodian directly from the input UTXO.
- **No BCH recovery from terminal states**: BCH locked in Delivered/Rejected/Returned UTXOs is permanently inaccessible. Trivial on chipnet (~$0.00025).

---

## 11. References

- **[SPEC/AUTH.md](./AUTH.md)** — Authentication flow, WalletConnect V2 BCH integration, `IWalletConnector` port, mock wallet for dev, actor key management for the demo.

## 12. Projected File Structure

```
cashscript_hackathon/
├── SPEC/
│   └── parcel-tracker.md          ← this file
├── contracts/
│   └── ParcelTracker.cash         ← CashScript state machine (7 states, 7 functions)
├── artifacts/
│   └── ParcelTracker.json         ← compiled, .gitignored
├── packages/
│   ├── shared/
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types.ts           ← State enum (0-6), Commitment type, UTXO shape
│   │       └── commitment.ts      ← encodeCommitment(), decodeCommitment()
│   └── backend/
│       └── src/
│           ├── infrastructure/
│           │   └── ParcelTracker.ts  ← CashScript SDK wrapper (all 7 transitions)
│           └── index.ts
├── bun.lock
├── package.json
└── tsconfig.json
```
