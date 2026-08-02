# Hermes — BCH Delivery Tracking Smart Contract

> Hackathon build scope: four contract functions, one parcel, chipnet.
> Full design with rationale and attack analysis: `files/hermes-v2.md`.
> Build brief with checkpoints and demo script: `files/BUILD-TONIGHT.md`.

---

## 1. Overview

A CashScript/CashTokens utility layer that existing marketplaces and logistics providers
integrate **without asking any end user to own a wallet**. Every custody handoff is signed
on-chain by the courier accepting the parcel. Delivery requires both the marketplace's
signature **and** a secret only the recipient holds — so no single party can fake a delivery.

Each parcel gets one unique CashToken NFT locked by a CashScript covenant. The covenant
enforces a linear state machine; terminal states exit the covenant entirely to a plain
P2PKH address, so finality is enforced by construction.

### Hackathon scope

- Four functions: `handoff`, `acceptHandoff`, `requestDelivery`, `confirmDelivery`
- Server-side delivery-secret generation (Path B: generate → hash → delete plaintext)
- Three screens: create order, courier scan/handoff, public tracking page
- Deployed and spending on chipnet

### Deferred (roadmap)

`reject` · `returnToSender` · `confirmReturn` · client-side secret generation (Path A) ·
courier enrolment funnel · key revocation · auth layer · timeouts · multi-tenancy ·
mainnet. All designed in `files/hermes-v2.md`; none built tonight.

---

## 2. Actors

| Actor | Has a key? | Held by | Needs BCH? |
|---|---|---|---|
| **Marketplace / Merchant** | Yes | Own backend — master seed, one key per delivery | **Yes** — pre-funds every parcel |
| **Recipient** | Yes — custodial | Marketplace, derived per delivery | No |
| **Courier (employee)** | Yes | Provisioned to device at onboarding (demo: fixture) | No |
| **Courier Registry** | Yes | Consortium key (demo: single fixture key) | No |

For the demo, all keys are fixtures seeded at startup. Nobody installs a wallet.

---

## 3. Contract

### Constructor

```cashscript
contract Hermes(
    bytes20 recipientPkh,      // custodial, derived per-delivery by the marketplace
    bytes20 merchantPkh,       // marketplace settlement / return destination
    bytes32 deliveryCodeHash,  // sha256(deliverySecret) — plaintext held ONLY by recipient
    pubkey  registryPk         // courier consortium attestation key
)
```

One deployment per parcel. All four values are immutable, baked into the locking bytecode.

### Mint

A `mint` function is included in the contract for hackathon simplicity — one contract does
everything, deploy is a single transaction. The v2 spec describes minting as a plain wallet
send (no covenant function); that is the production design. The `mint` function is a
demo-scope convenience, not a spec violation.

```cashscript
function mint(sig merchantSig, pubkey merchantPk, bytes20 initialCustodian) {
    // Merchant signs; creates the parcel NFT with commitment 0x00 + initialCustodian + 0x00
    // NFT goes to the contract address; merchant pre-funds with 25,000 sats
}
```

### State machine

Four covenant states. Terminal states exit the covenant to a plain P2PKH address.

```
                    handoff()              acceptHandoff()
  ┌──────────────┐  courier A sig     ┌──────────────────┐  courier B sig
  │ InCustody(0) │─────────────────►  │ HandoffPending(1)│──────────────┐
  │ custodian=A  │  + registry attest │ custodian=B      │              │
  └──────┬───────┘                    └──────────────────┘              │
         │  ▲                                                          │
         │  └──────────────────────────────────────────────────────────┘
         │                                              (loops: N hops)
         │ requestDelivery()  courier sig
         ▼
  ┌────────────────────────┐
  │ DeliveryPending(2)     │   custodian STAYS = the courier holding the parcel
  └───────────┬────────────┘
              │ confirmDelivery()  recipient sig + DELIVERY CODE
              ▼
  NFT → recipient P2PKH
  commitment[0] = 0x04 (Delivered)
  ★ immutable receipt, out of covenant ★
```

### Transition table (tonight)

| # | From | To | Function | Signer | Second factor |
|---|---|---|---|---|---|
| 1 | InCustody | HandoffPending | `handoff` | Current courier | Registry attestation of next courier |
| 2 | HandoffPending | InCustody | `acceptHandoff` | Incoming courier | — |
| 3 | InCustody | DeliveryPending | `requestDelivery` | Current courier | — |
| 4 | DeliveryPending | **Delivered** (exits) | `confirmDelivery` | Recipient (custodial) | **Delivery code preimage** |

### Key design properties

- **`requestDelivery` preserves `custodian`.** The courier still physically holds the parcel.
  v1 overwrote it with `recipientPkh`, which broke `returnToSender`. Fixed.
- **`confirmDelivery` is 2-of-2.** Marketplace signature AND a secret only the recipient holds.
  A courier cannot self-confirm under any circumstance.
- **Terminal by construction.** `confirmDelivery` moves the NFT to a plain P2PKH address.
  There is no covenant state to re-enter; the receipt is immutable.

### Deferred transitions

| # | From | To | Function | Signer | Second factor |
|---|---|---|---|---|---|
| 5 | DeliveryPending | ReturnPending | `reject` | Recipient | Delivery code preimage |
| 6 | DeliveryPending | ReturnPending | `returnToSender` | Current courier | — |
| 7 | ReturnPending | **Returned** (exits) | `confirmReturn` | Merchant | — |

Designed in `files/hermes-v2.md` §4. Not built tonight.

---

## 4. Commitment encoding — 22 bytes

```
Byte 0     state       uint8    0x00 InCustody | 0x01 HandoffPending
                                0x02 DeliveryPending | 0x04 Delivered (exited)
Byte 1-20  custodian   bytes20  hash160 of the courier holding or expected to take the parcel
Byte 21    reason      uint8    0x00 for everything shipped tonight
```

Fixed 22 bytes so every `split` is uniform. No reserved padding.

```ts
export function encodeCommitment(state: number, custodian: Uint8Array, reason = 0): Uint8Array {
  const buf = new Uint8Array(22);
  buf[0] = state;
  buf.set(custodian, 1);
  buf[21] = reason;
  return buf;
}

export function decodeCommitment(buf: Uint8Array) {
  return { state: buf[0], custodian: buf.slice(1, 21), reason: buf[21] };
}
```

---

## 5. The delivery code

### Why it must be on-chain

If the backend merely looks up the code in a database before signing, a compromised backend
skips the lookup and confirms delivery alone. The check must be a consensus rule:

```cashscript
require(sha256(deliveryCode) == deliveryCodeHash);
```

### Entropy

`deliveryCodeHash` is public in the locking bytecode. A 6-digit code is brute-forced in
milliseconds. The preimage is **32 cryptographically random bytes**.

### Lifecycle — Path B (tonight)

```
1. Backend generates 32 cryptographically random bytes → deliverySecret
2. Backend computes sha256(deliverySecret) → deliveryCodeHash
3. deliveryCodeHash goes into the contract constructor
4. deliverySecret is transmitted to the recipient's account, once
5. Backend DELETES the plaintext, retaining only the hash
```

This is an **operational and auditable** commitment, not a mathematical one. A dishonest
platform could retain the plaintext. Path A (client-side generation) makes it mathematical
and is on the roadmap. The contract is identical for both paths.

### What the hash does and does not buy

- Does **not** add entropy — `sha256(weak)` is as weak as `weak`.
- Does **not** create freshness — replay is prevented by per-delivery uniqueness and terminal exit.
- **Does** buy secret-at-rest separation — the marketplace commits to a secret it cannot read.

The preimage becomes permanently public the instant `confirmDelivery` is broadcast. Per-delivery
key derivation prevents cross-parcel linkage.

---

## 6. Courier authorisation — registry attestation

The registry signs a courier's public key hash **once at onboarding**. The credential is a
reusable, parcel-agnostic membership badge consumed by `handoff`:

```cashscript
require(checkDataSig(registryAttestation, nextCustodian, registryPk));
```

**Scope:** the registry can admit members; it cannot forge custody. Every hop still requires
the outgoing courier's signature and the incoming courier's signature.

**Demo:** a single fixture registry keypair. The attestation is generated at startup for each
fixture courier.

**Production hardening (designed, not built):** sign `nextCustodian + expiryHeight` and add
`require(tx.locktime < expiryHeight)` to `handoff`.

---

## 7. Fee model

```
Mint:                 25,000 sats
Per transition:       ~2,000 sats reserved
Happy path (4 spends): ~8,000 sats
Headroom:             ~2.5x
```

The marketplace pre-funds the parcel's UTXO. Nobody else ever needs Bitcoin Cash.
Residual sats ride out to the recipient's P2PKH on the terminal spend.

---

## 8. Integration surface

| Endpoint | Caller | Effect |
|---|---|---|
| `POST /parcels` | Marketplace | Derives recipient key, generates `deliveryCodeHash` (Path B), deploys contract, mints NFT with courier A |
| `GET /parcels/:id` | Anyone | Reconstructed custody chain from unspent-output history |
| `POST /parcels/:id/handoff` | Logistics (courier A) | Builds + signs `handoff` with the scanned attestation |
| `POST /parcels/:id/accept` | Logistics (courier B) | Builds + signs `acceptHandoff` |
| `POST /parcels/:id/request-delivery` | Logistics | Builds + signs `requestDelivery` |
| `POST /parcels/:id/confirm` | Logistics (relays scanned code) | Marketplace verifies preimage, co-signs, broadcasts `confirmDelivery` |

Deferred: `POST /parcels/:id/return`, `POST /parcels/:id/confirm-return`, `POST /couriers/enrol`.

### QR payloads

| QR | Shown by | Scanned by | Contains |
|---|---|---|---|
| Courier identity | Incoming courier's device | Outgoing courier | `{ pkh, registryAttestation }` |
| Delivery code | Recipient's marketplace app | Last-mile courier | `{ parcelId, deliverySecret }` |

---

## 9. Architecture decisions

| Decision | Choice | Rationale |
|---|---|---|
| Recipient / merchant / code hash / registry key | Constructor params | Immutable, publicly auditable at the contract address |
| Custodian / state / reason | NFT commitment (22 bytes) | Mutable per transition; fits the 40-byte cap with room |
| Terminal states | Exit to P2PKH | Terminal by construction, not by state check |
| Mint | Covenant function (demo) | One contract does everything; production uses plain wallet send |
| Fee strategy | Pre-funded UTXO (25,000 sats) | Nobody else needs BCH; UX win |
| Delivery secret | Server-generated, deleted (Path B) | Less app work; contract identical for Path A upgrade |
| Auth | Fixture keys (demo) | Deferred — see `SPEC/AUTH.md` |
| Contract deployment | One per parcel | Each parcel has unique recipient + merchant + code hash |

---

## 10. Load-bearing requires (do not omit)

1. `lockingBytecode == tx.inputs[idx].lockingBytecode` — without it the NFT escapes the covenant.
2. `value >= tx.inputs[idx].value - 2000` — without it a courier pockets the pre-funded sats.
3. `tokenCategory` comparison — without it the NFT can be swapped or downgraded mid-route.
4. State and custodian read from `tx.inputs[idx].nftCommitment`, **never** from a function
   argument. Caller-supplied state makes `custodian == hash160(courierPk)` self-satisfying.

---

## 11. Reference

- Full v2 design: `files/hermes-v2.md`
- Build brief: `files/BUILD-TONIGHT.md`
- Auth (deferred): `SPEC/AUTH.md`, `files/hermes-auth.md`
