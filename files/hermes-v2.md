# Hermes v2 — Custody Attestation Layer for E-Commerce Delivery

> Hackathon spec. A CashScript/CashTokens utility layer that existing marketplaces and
> logistics providers can integrate **without asking any end user to own a wallet**.
> Custody handoffs and delivery confirmation become publicly verifiable, cross-organisation
> attestations instead of entries in one company's private database.

---

## 1. What changed from v1, and why

v1 assumed every actor held their own keys. That is cryptographically ideal and
commercially dead: a marketplace with 10 million accounts will not migrate its userbase
to self-custody wallets to adopt a tracking layer.

v2 makes the system an **integration target**, not a destination app:

| Concern | v1 | v2 |
|---|---|---|
| Recipient keys | User-held wallet | **Custodial** — marketplace derives a key per delivery |
| Courier keys | Individually held | **Provisioned** by the logistics company at onboarding |
| Recipient action | Install wallet, scan, sign | Show a QR from the app they already use |
| Recipient needs Bitcoin Cash | No | No |
| Recipient-held secret | Private key | **Per-delivery delivery code (hash-locked on-chain)** |
| Wallet software | WalletConnect + browser extension | **None** — every key is held by the party running the signing code |
| Onboarding cost | Per user | Per **company** |

### The trust model, stated honestly

Custodial keys move non-repudiation from **person-level** to **organisation-level**.
The chain no longer proves "this human signed." It proves "this organisation's system
signed, and cannot later deny it."

That is still the guarantee that matters commercially, because **the expensive disputes are
between companies**, not between a company and its own employee. Specifically:

- Courier company B cannot forge courier company A's signature.
- No courier can forge the marketplace's signature.
- The marketplace cannot retroactively edit or reorder a custody chain.
- No party can produce a custody record that another party did not sign.

The delivery code then restores a **person-level factor at the single most-disputed event**:
the delivery confirmation itself. See §5.

### What we explicitly do not claim

The chain does not prove a physical box moved. It proves that an attested key consented to
take responsibility at a specific moment, alongside the key giving it up. That is
**liability attribution** — which is the product, and which no single courier's private
database can offer.

---

## 2. Actors and key custody

| Actor | Has a key? | Held by whom | Needs Bitcoin Cash |
|---|---|---|---|
| **Marketplace / Merchant** | Yes | Own backend — one master seed, one key derived per delivery | **Yes** — pre-funds every parcel |
| **Recipient** | **Yes — registered, custodial** | Marketplace, derived per delivery | No |
| **Courier (employee)** | Yes | **Provisioned to their device** at onboarding | No |
| **Logistics company** | Yes (registry-adjacent) | Own backend | No |
| **Courier Registry** | Yes | Consortium key (demo: single key) | No |

### Recipient key derivation

Never reuse a key across deliveries. Derive each one from the marketplace's single master
seed, using the standard derivation path scheme so the whole set is recoverable from that one
seed:

```
m/44'/145'/<accountIndex>'/0/<deliveryIndex>
```

Gives you: a distinct public key hash per parcel (so one compromise is contained to one
parcel), no key-reuse linkability across a user's order history, and a single backup artifact.

**Why the recipient needs a registered key at all.** They never install a wallet or manage a
seed, but they are a named party in the contract, not a passive observer. Their public key hash is
committed at mint as `recipientPkh`, which is what makes delivery confirmation
attributable — and it is what lets them verify their own parcel on our public tracking site
independently of the marketplace's dashboard. A buyer can check the chain directly and see a
custody record the seller cannot edit. Without a registered key there is nothing on-chain
that identifies them, and the "verify it yourself" property that justifies the whole layer
disappears.

Note the deliberate privacy consequence of per-delivery derivation: the buyer (and anyone
they share a parcel ID with) can verify one parcel end-to-end, but a third-party observer
cannot link separate parcels back to one buyer, because no public key hash is ever reused. Public
verifiability per parcel, without a public purchase history.

### Courier key provisioning — a decision to confirm

You said the logistics company "generates their own pkh." Two readings, and they differ:

- **Recommended: company generates, provisions the private key to the employee's device,
  retains only the pubkey.** Employee-level non-repudiation survives — the company cannot
  forge a specific driver's handoff. Stronger, and the same onboarding effort.
- **Fallback: company retains all keys and signs server-side.** Simpler, but you drop to
  company-level attribution only; internal disputes ("which driver lost it?") become
  unanswerable on-chain.

Either works for the demo. Say which one you chose in the pitch — a judge will ask.

---

## 3. Contract parameters

One deployment per parcel. All four values are immutable, baked into the locking bytecode,
and therefore publicly auditable at the contract address.

```cashscript
contract Hermes(
    bytes20 recipientPkh,      // custodial, derived per-delivery by the marketplace
    bytes20 merchantPkh,       // marketplace settlement / return destination
    bytes32 deliveryCodeHash,  // sha256(deliverySecret) — plaintext held ONLY by recipient
    pubkey  registryPk         // courier consortium attestation key
)
```

**Why `deliveryCodeHash` is a constructor param and not commitment state:** the commitment
caps at 40 bytes and already spends 22 on state + custodian + reason; a 32-byte hash will
not fit. The constraint is fortunate — immutability means the marketplace cannot rotate in
a code it knows after minting. Cost: a lost code is unrecoverable and the parcel must be
returned (§7). That is the correct trade for this use case.

---

## 4. State machine

Four covenant states. Terminal states are **not** encoded as unspendable covenant
states — the token leaves the covenant entirely to a plain pay-to-public-key-hash address, so
terminality is
enforced by construction rather than by a state check.

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
  │                        │   recipient is read from the CONSTRUCTOR
  └───┬──────────┬─────────┘
      │          │                                  ┌──────────────────────────┐
      │          │ returnToSender()  courier sig ───►│ ReturnPending(3)         │
      │          │ (recipient unresponsive)          │ custodian = courier      │
      │          │                                   │ reason = 0x02            │
      │ reject() recipient sig + CODE ──────────────►│ reason = 0x01            │
      │                                              └───────────┬──────────────┘
      │ confirmDelivery()                                        │ confirmReturn()
      │ recipient sig + CODE                                     │ merchant sig
      ▼                                                          ▼
  NFT → recipient P2PKH                                   NFT → merchant P2PKH
  commitment[0] = 0x04 (Delivered)                         commitment[0] = 0x06 (Returned)
  ★ immutable receipt, out of covenant ★                   ★ out of covenant ★
```

### Bug fixed from v1

v1's `requestDelivery` overwrote `custodian` with `recipientPkh`. That made
`returnToSender` — which checks the **courier's** signature against `commitment.custodian` —
unsatisfiable. In v2, `custodian` always means *the courier physically holding the parcel
or expected to take it*. The recipient never appears in the commitment; they are read from
the constructor. Every check stays consistent.

### Why the two-step handoff is now correct

An earlier design collapsed each hop into one atomic transaction co-signed by both couriers.
That is stronger, but with custodial backends at **different companies**, atomic co-signing
requires a live inter-company API handshake. Two sequential single-signer transactions are
the right call here — both parties still sign, just in sequence.

Accepted cost: a window where the parcel sits in `HandoffPending`, released by A but not yet
accepted by B. Resolve contractually — **A remains liable until B accepts** — and note that
the on-chain timestamps bound the window precisely, which is more than any current system offers.

### Transition table

| # | From | To | Function | Signer | Second factor |
|---|---|---|---|---|---|
| 1 | InCustody | HandoffPending | `handoff` | Current courier | Registry attestation of next courier |
| 2 | HandoffPending | InCustody | `acceptHandoff` | Incoming courier | — |
| 3 | InCustody | DeliveryPending | `requestDelivery` | Current courier | — |
| 4 | DeliveryPending | **Delivered** (exits) | `confirmDelivery` | Recipient (custodial) | **Delivery code preimage** |
| 5 | DeliveryPending | ReturnPending | `reject` | Recipient (custodial) | **Delivery code preimage** |
| 6 | DeliveryPending | ReturnPending | `returnToSender` | Current courier | — |
| 7 | ReturnPending | **Returned** (exits) | `confirmReturn` | Merchant | — |

`reject` requires the code because a rejection must prove the recipient was actually present
and declined. Without it, the marketplace could unilaterally cancel a delivery in transit.
`returnToSender` deliberately requires no code — it is the escape hatch for exactly the case
where no code is forthcoming.

**There is no `mint` function.** Creation is not a spend, so the covenant has nothing to
constrain. The marketplace holds a minting NFT in its own wallet and sends a new NFT
directly to the parcel contract address with commitment `0x00 + courierAPkh + 0x00`. The
attestation check on Courier A happens in the marketplace backend and is verifiable by
anyone after the fact, since courier A's public key hash is public in the first commitment.

---

## 5. The delivery code — the part that must be on-chain

### Why an app-level check is worthless

If the backend merely looks up the code in a database before signing, a compromised or
dishonest backend skips the lookup and confirms delivery alone. The safety net does not
exist. The check must be a consensus rule.

```cashscript
require(sha256(deliveryCode) == deliveryCodeHash);
```

Now `confirmDelivery` is provably **2-of-2**: the marketplace's signature *and* a secret that
only the recipient's copy holds. Anyone auditing the chain sees both were present.

### Entropy requirement — do not get this wrong

`deliveryCodeHash` is in the locking bytecode and therefore public from the moment the
contract address exists. **A 6-digit code is brute-forced from that hash in milliseconds.**

- **On-chain preimage: 16–32 cryptographically random bytes**, carried in the QR payload.
- If you also want a human-typeable short code for a fallback UX, it must be a *backend
  lookup key* that maps to the real secret. It must never itself be the preimage.

### Lifecycle — where the secret is generated is the whole guarantee

Two paths. Prefer path A; you need B anyway for browser checkout.

**Path A — app checkout (device-generated, cryptographically strong).**

```
At order placement, inside the recipient's marketplace app:
  1. App generates 32 cryptographically random bytes  → deliverySecret
  2. App stores deliverySecret in device secure storage (Keychain / Keystore)
  3. App sends ONLY sha256(deliverySecret) to the marketplace backend
  4. Backend uses that value as deliveryCodeHash in the contract constructor
     → the plaintext never existed on the server
```

**Path B — web checkout (server-generated, operationally strong).**

```
  1. Backend generates 32 cryptographically random bytes  → deliverySecret
  2. Backend computes sha256(deliverySecret)              → deliveryCodeHash
  3. deliveryCodeHash goes into the contract constructor
  4. deliverySecret is transmitted to the recipient's account, once
  5. Backend DELETES the plaintext, retaining only the hash
```

**The two paths give guarantees of different strength, and you should say which is which.**

Under path A the marketplace's inability to confirm a delivery alone is a **mathematical
fact** — it never held the preimage and cannot derive it from the hash. Under path B it is an
**operational and auditable** commitment: step 5 is a promise enforced by code review, not by
mathematics, and a dishonest platform could retain the plaintext. Path B still reduces
unilateral confirmation from trivial and invisible to deliberate, code-auditable misconduct,
which is a real improvement — but do not describe it as impossible. Overclaiming this will
cost you more with a sharp judge than admitting it plainly.

Note that the contract is **identical** for both paths. `require(sha256(deliveryCode) ==
deliveryCodeHash)` does not care who generated the preimage. Provenance is an
application-layer decision, which is why you can ship path B and upgrade to path A later
without touching a line of CashScript.

### What hashing does and does not buy you

Worth being precise here, because it is easy to credit the hash with properties it lacks:

- **It does not add entropy.** `sha256(weak)` is exactly as weak as `weak`, because
  `deliveryCodeHash` is public in the locking bytecode and can be attacked offline. Any
  scheme where the preimage is human-chosen or human-memorable — a personal identification
  number, an order number, a security answer — is broken regardless of hashing.
- **It does not create freshness.** Replay is prevented by two other properties entirely:
  per-delivery uniqueness (a secret for parcel A cannot satisfy parcel B's hash) and terminal
  exit (`confirmDelivery` moves the token out of the covenant, so there is no second spend to
  replay against).
- **It does buy secret-at-rest separation.** The marketplace can commit to a secret it cannot
  read, which is the entire basis of path A.

**The preimage becomes permanently public the instant `confirmDelivery` is broadcast** — it is
an argument in a public transaction. This is why per-delivery derivation is not a
nice-to-have: a reused "account code" would be worthless after the buyer's first parcel, and
anyone watching the chain could then confirm all their future deliveries.

### The three problems you wanted solved

**1. Courier self-signing — solved.** `recipientPkh` is fixed at mint by the marketplace, and
`confirmDelivery` additionally requires a preimage the courier never receives until the
recipient hands it over. A courier cannot mark a parcel delivered under any circumstance.

**2. Proxy receiving — solved, and be precise about what it means.** The recipient forwards
the code to a neighbour or building concierge, who shows it at the door. The chain records
"a party holding the recipient's code accepted the parcel at time T," which is exactly the
correct claim — the recipient delegated authority and the delegation is their choice. Do not
claim it proves the named recipient was physically present. It doesn't, and it isn't
supposed to.

**3. Defence against a leaked key — solved, with the premise corrected.** A leaked *public key
hash* is a non-event; it is public on-chain by design, and presenting one proves nothing on
the first use or the thousandth. The code defends against compromise of the **private key**,
which after this pivot means the marketplace's own signing infrastructure. An attacker with
full backend key access still cannot confirm delivery: under path A the preimage was never on
the server at all, and under path B it was destroyed at generation.

### Residual weakness to have an answer for

A courier can phish the code before handing over the parcel ("read me your code to confirm
you're home"), then mark it delivered and keep the box. Mitigations: reveal the code only on
an explicit in-app tap, logged with a timestamp; keep the code single-use and
parcel-scoped so it is worthless elsewhere; surface a "was this actually delivered?" dispute
window. Note that mainstream one-time-password-based delivery (Amazon, Flipkart, Shopee) carries the exact
same weakness and is considered acceptable — you are matching the industry baseline while
adding public verifiability on top.

---

## 6. Courier authorisation — registry attestation

`handoff` names the next custodian. Something must prove that public key hash belongs to a real courier,
or Courier A can hand a parcel to any keyholder.

The registry signs a courier's public key hash **once at onboarding**. The credential is a reusable,
parcel-agnostic membership badge:

```cashscript
require(checkDataSig(registryAttestation, nextCustodian, registryPk));
```

Chosen over the alternatives deliberately:

- **vs. a hardcoded allowlist:** the courier set need not be known at mint time, so dynamic
  routing survives and new couriers join without redeploying anything.
- **vs. a Merkle root:** CashScript has no loops, so a Merkle proof means manually unrolling
  every level and getting sibling ordering right. `checkDataSig` is one line.

**Scope the registry's power precisely in the pitch:** it can admit members; it cannot forge
custody. Every hop still requires the outgoing courier's signature and the incoming
courier's signature. A rogue registry can invent a fake courier and still cannot make anyone
hand a parcel over, or move a parcel it does not hold.

The attestation is only needed in two places — at mint (off-chain, on Courier A) and in
`handoff`. Everywhere else the public key hash being trusted was already validated upstream by the
covenant when it was written into the commitment, so re-checking proves nothing.

**Production hardening, designed but not built:** a bare public key hash attestation never expires and
cannot be revoked. Sign `nextCustodian + expiryHeight` and add
`require(tx.locktime < expiryHeight)`. Mention it; don't build it tonight.

---

## 7. Commitment encoding — 22 bytes

```
Byte 0     state       uint8    0x00 InCustody | 0x01 HandoffPending
                                0x02 DeliveryPending | 0x03 ReturnPending
                                0x04 Delivered | 0x05 Rejected | 0x06 Returned  (exited)
Byte 1-20  custodian   bytes20  hash160 of the courier holding or expected to take the parcel
Byte 21    reason      uint8    0x00 normal | 0x01 recipient rejected | 0x02 unresponsive
```

Fixed 22 bytes so every `split` is uniform. No reserved padding — 40 is a maximum, not a
required length, and zero-filling bytes you don't use just creates comparisons you have to
get exactly right at 2 AM.

```ts
export function encodeCommitment(state: number, custodian: Uint8Array, reason = 0) {
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

## 8. Contract

Verify `split` tuple syntax and the `LockingBytecodeP2PKH` constructor against the CashScript
docs for your installed version before assuming this compiles as written.

```cashscript
pragma cashscript ^0.13.0;

contract Hermes(
    bytes20 recipientPkh,
    bytes20 merchantPkh,
    bytes32 deliveryCodeHash,
    pubkey  registryPk
) {
    // ---------- hop 1: current courier proposes a handoff ----------
    function handoff(
        sig courierSig,
        pubkey courierPk,
        bytes20 nextCustodian,
        datasig registryAttestation
    ) {
        int idx = this.activeInputIndex;
        bytes1 state, bytes21 tail = tx.inputs[idx].nftCommitment.split(1);
        bytes20 custodian, bytes1 reason = tail.split(20);

        require(state == 0x00);                                   // InCustody
        require(custodian == hash160(courierPk));                 // is the real holder
        require(checkSig(courierSig, courierPk));                 // consents to release
        require(checkDataSig(registryAttestation, nextCustodian, registryPk));

        require(tx.outputs[0].lockingBytecode == tx.inputs[idx].lockingBytecode);
        require(tx.outputs[0].tokenCategory  == tx.inputs[idx].tokenCategory);
        require(tx.outputs[0].nftCommitment  == 0x01 + nextCustodian + reason);
        require(tx.outputs[0].value >= tx.inputs[idx].value - 2000);
    }

    // ---------- hop 2: incoming courier accepts liability ----------
    function acceptHandoff(sig courierSig, pubkey courierPk) {
        int idx = this.activeInputIndex;
        bytes1 state, bytes21 tail = tx.inputs[idx].nftCommitment.split(1);
        bytes20 custodian, bytes1 reason = tail.split(20);

        require(state == 0x01);                                   // HandoffPending
        require(custodian == hash160(courierPk));                 // only the named courier
        require(checkSig(courierSig, courierPk));

        require(tx.outputs[0].lockingBytecode == tx.inputs[idx].lockingBytecode);
        require(tx.outputs[0].tokenCategory  == tx.inputs[idx].tokenCategory);
        require(tx.outputs[0].nftCommitment  == 0x00 + custodian + reason);
        require(tx.outputs[0].value >= tx.inputs[idx].value - 2000);
    }

    // ---------- last-mile courier requests delivery ----------
    function requestDelivery(sig courierSig, pubkey courierPk) {
        int idx = this.activeInputIndex;
        bytes1 state, bytes21 tail = tx.inputs[idx].nftCommitment.split(1);
        bytes20 custodian, bytes1 reason = tail.split(20);

        require(state == 0x00);
        require(custodian == hash160(courierPk));
        require(checkSig(courierSig, courierPk));

        require(tx.outputs[0].lockingBytecode == tx.inputs[idx].lockingBytecode);
        require(tx.outputs[0].tokenCategory  == tx.inputs[idx].tokenCategory);
        // custodian is PRESERVED — the courier still physically holds the parcel
        require(tx.outputs[0].nftCommitment  == 0x02 + custodian + reason);
        require(tx.outputs[0].value >= tx.inputs[idx].value - 2000);
    }

    // ---------- recipient accepts: signature AND delivery code ----------
    function confirmDelivery(sig recipientSig, pubkey recipientPk, bytes deliveryCode) {
        int idx = this.activeInputIndex;
        bytes1 state, bytes21 tail = tx.inputs[idx].nftCommitment.split(1);

        require(state == 0x02);                                   // DeliveryPending
        require(hash160(recipientPk) == recipientPkh);             // custodial recipient key
        require(checkSig(recipientSig, recipientPk));
        require(sha256(deliveryCode) == deliveryCodeHash);         // ★ recipient-held factor

        // strip the capability byte → the receipt NFT becomes immutable
        bytes32 category, bytes capability = tx.inputs[idx].tokenCategory.split(32);

        // exits the covenant to the recipient's own address: terminal by construction
        require(tx.outputs[0].lockingBytecode == new LockingBytecodeP2PKH(recipientPkh));
        require(tx.outputs[0].tokenCategory  == category);
        require(tx.outputs[0].nftCommitment  == 0x04 + tail);      // 0x04 Delivered
    }

    // ---------- recipient refuses: signature AND delivery code ----------
    function reject(sig recipientSig, pubkey recipientPk, bytes deliveryCode) {
        int idx = this.activeInputIndex;
        bytes1 state, bytes21 tail = tx.inputs[idx].nftCommitment.split(1);
        bytes20 custodian, bytes1 reason = tail.split(20);

        require(state == 0x02);
        require(hash160(recipientPk) == recipientPkh);
        require(checkSig(recipientSig, recipientPk));
        require(sha256(deliveryCode) == deliveryCodeHash);         // proves presence

        require(tx.outputs[0].lockingBytecode == tx.inputs[idx].lockingBytecode);
        require(tx.outputs[0].tokenCategory  == tx.inputs[idx].tokenCategory);
        // courier keeps custody and now owes the merchant a return
        require(tx.outputs[0].nftCommitment  == 0x03 + custodian + 0x01);
        require(tx.outputs[0].value >= tx.inputs[idx].value - 2000);
    }

    // ---------- recipient unresponsive: courier initiates return ----------
    function returnToSender(sig courierSig, pubkey courierPk) {
        int idx = this.activeInputIndex;
        bytes1 state, bytes21 tail = tx.inputs[idx].nftCommitment.split(1);
        bytes20 custodian, bytes1 reason = tail.split(20);

        require(state == 0x02);
        require(custodian == hash160(courierPk));                  // the holding courier
        require(checkSig(courierSig, courierPk));

        require(tx.outputs[0].lockingBytecode == tx.inputs[idx].lockingBytecode);
        require(tx.outputs[0].tokenCategory  == tx.inputs[idx].tokenCategory);
        require(tx.outputs[0].nftCommitment  == 0x03 + custodian + 0x02);
        require(tx.outputs[0].value >= tx.inputs[idx].value - 2000);
    }

    // ---------- merchant closes the return ----------
    function confirmReturn(sig merchantSig, pubkey merchantPk) {
        int idx = this.activeInputIndex;
        bytes1 state, bytes21 tail = tx.inputs[idx].nftCommitment.split(1);

        require(state == 0x03);                                    // ReturnPending
        require(hash160(merchantPk) == merchantPkh);
        require(checkSig(merchantSig, merchantPk));

        bytes32 category, bytes capability = tx.inputs[idx].tokenCategory.split(32);

        require(tx.outputs[0].lockingBytecode == new LockingBytecodeP2PKH(merchantPkh));
        require(tx.outputs[0].tokenCategory  == category);
        require(tx.outputs[0].nftCommitment  == 0x06 + tail);      // 0x06 Returned
    }
}
```

### Load-bearing requires, easy to omit

- `lockingBytecode == tx.inputs[idx].lockingBytecode` — without it a courier can spend the
  parcel anywhere, including burning the NFT.
- `value >= inputValue - 2000` — without it a courier pockets the pre-funded sats.
- `tokenCategory` comparison — without it the NFT can be swapped for a different category or
  downgraded to immutable mid-route, freezing the parcel.
- Reading state from `tx.inputs[idx].nftCommitment` and **never** from a function argument.
  If state or custodian are caller-supplied, `custodian == hash160(courierPk)` becomes
  self-satisfying and any stranger can insert themselves into any parcel's custody chain.

### Syntax notes that will bite in the first ten minutes

Constructor parameters are referenced bare — `recipientPkh`, not `this.recipientPkh`. `this.`
is reserved for `activeInputIndex`, `activeBytecode`, and `age`. There is no `this.state`.

---

## 9. Integration surface

The marketplace and logistics providers integrate against an HTTP API. Neither exposes
blockchain concepts to end users.

| Endpoint | Caller | Effect |
|---|---|---|
| `POST /parcels` | Marketplace | Derives recipient key, accepts or generates `deliveryCodeHash`, deploys params, mints the parcel NFT with courier A |
| `GET /parcels/:id` | Anyone | Reconstructed custody chain from the unspent-output history, independently verifiable |
| `POST /parcels/:id/handoff` | Logistics (courier A) | Builds + signs `handoff` with the scanned attestation |
| `POST /parcels/:id/accept` | Logistics (courier B) | Builds + signs `acceptHandoff` |
| `POST /parcels/:id/request-delivery` | Logistics | Builds + signs `requestDelivery` |
| `POST /parcels/:id/confirm` | Logistics (relays scanned code) | Marketplace verifies the preimage, co-signs, broadcasts `confirmDelivery` |
| `POST /parcels/:id/return` | Logistics | Builds + signs `returnToSender` |
| `POST /parcels/:id/confirm-return` | Marketplace | Builds + signs `confirmReturn` |

Under path A, `POST /parcels` receives `deliveryCodeHash` from the recipient's app and the
backend never generates it. Under path B the backend generates it. Same endpoint, one optional
field.

### Authentication per actor — no wallet software anywhere

There is no WalletConnect, no browser extension, and no external wallet in this architecture.
Every private key is held by a party that also runs the software doing the signing, so there
is nothing to bridge to.

| Actor | Authenticates by | Signs how |
|---|---|---|
| **Recipient** | Existing marketplace login | Does not sign. Contributes the hash-locked delivery secret. |
| **Courier / hub operator** | Device signing key enrolled at onboarding, challenge-response, then a session token | Courier app signs locally with the enrolled key |
| **Marketplace / merchant** | Backend service credentials | Backend signs |
| **Registry** | Backend service credentials | Backend signs |

A courier's credential is a **signing key, not a wallet**: no balance, no seed phrase to write
down, no funds at risk, nothing to fund — the marketplace pre-funds every parcel. A lost
device is a support ticket, not a lost-seed catastrophe: the logistics company revokes the
attestation and enrols a replacement key.

Full detail — enrolment, challenge format, session handling, and the signer abstraction — is
in the companion authentication specification.

### QR payloads

| QR | Shown by | Scanned by | Contains |
|---|---|---|---|
| Courier identity | Incoming courier's device | Outgoing courier | `{ pkh, registryAttestation }` |
| Delivery code | **Recipient's marketplace app** | Last-mile courier | `{ parcelId, deliverySecret }` |

The courier-identity QR removes the last place a human could type or mis-tap a public key hash — the
next custodian's public key hash now comes from the device physically present, holding the matching key.
This eliminates the "stranded on a wrong public key hash" failure mode from v1 entirely.

### Anyone can scan a QR — and that is fine

Integrity is not secrecy. The pending on-chain state is public regardless. A courier-identity
QR is inert to a stranger: they can build a syntactically perfect `acceptHandoff` and every
node will reject it at `checkSig`.

The delivery-code QR is different — it **is** a bearer secret, which is precisely what makes
proxy receiving work. Handle it accordingly: reveal on explicit tap, single-use, parcel-scoped,
short-lived in the UI, and never logged in the courier app after relay.

---

## 10. Fee model

The marketplace pre-funds the parcel's unspent output. Nobody else ever needs Bitcoin Cash — now unconditionally
true, since couriers and recipients no longer construct transactions themselves.

```
Mint:                 25,000 sats
Per transition:       ~2,000 sats reserved
Happy path (4 spends): ~8,000 sats
Longest path:         ~10,000 sats
Headroom:             2.5x
```

Budget generously. These transactions carry a large unlocking script plus the full contract
bytecode — plausibly 500–900 bytes each. A fee failure at 2 AM is a miserable way to lose two
hours. Residual sats ride out to the recipient's or merchant's P2PKH on the terminal spend, so
nothing is stranded.

---

## 11. Attacks and why they fail

| Attack | Outcome |
|---|---|
| Courier marks a parcel delivered | Fails — needs `recipientPkh`'s signature **and** the code preimage |
| Marketplace unilaterally confirms delivery | Fails — path A: never held the preimage. Path B: destroyed at generation |
| Marketplace unilaterally cancels in transit | Fails — `reject` also requires the code |
| Courier B forges courier A's handoff | Fails — needs A's key, held by a different company |
| Stranger scans a courier-identity QR | Inert — cannot satisfy `checkSig`; learns only public data |
| Tampering with `nextCustodian` in the mempool | Fails — A's signature commits to the outputs |
| Replaying an old attestation on another parcel | Harmless — proves only "is a courier"; still needs that courier's signature |
| Replaying a delivery secret on another parcel | Fails — each parcel has its own `deliveryCodeHash` |
| Replaying a delivery secret on the same parcel | Nothing to replay against — `confirmDelivery` exits the covenant permanently |
| Rewriting hop 2 after the fact | Impossible — would orphan every later hop in the unspent-output chain |
| Non-courier receives a handoff | Fails — no registry attestation |
| Brute-forcing the code from the public hash | Fails at 32 bytes of entropy; **trivially succeeds at 6 digits** |
| **Courier phishes the code before handing over the box** | **Not prevented.** See §12; matches the mainstream one-time-password baseline |

---

## 12. Limitations

- **Custodial keys mean organisation-level, not person-level, non-repudiation.** Deliberate;
  see §1.
- **Path B's plaintext deletion is operational, not cryptographic.** A malicious marketplace
  could retain the code. Auditable, not provable. Path A has no equivalent weakness.
- **Path A depends on device storage.** An app reinstall, a wiped phone, or a lost device
  destroys the only copy of the delivery secret, and the parcel becomes unconfirmable. Only
  exit is `returnToSender` → `confirmReturn`. Optional mitigation: also escrow the secret in
  the user's account-recovery vault at generation — which trades the mathematical guarantee
  back for the operational one, so choose per product tier rather than globally.
- **Lost delivery code is unrecoverable on either path.** Direct consequence of making
  `deliveryCodeHash` immutable, which is what stops the marketplace rotating in a code it
  knows. Accepted trade.
- **The delivery secret is a bearer token.** Anyone holding it can confirm. That is what makes
  proxy receiving work and is therefore intended, but it means the chain proves "a party
  holding the recipient's code accepted delivery," never "the named recipient was present."
- **Courier can phish the code before handing over the box.** Same weakness as mainstream
  one-time-password delivery; mitigations in §5. The only real fix is a recipient device key
  signing the transaction itself — inherently fresh, because a signature binds to a specific
  unspent output — but that breaks proxy receiving, so the honest end state is both mechanisms
  side by side. Roadmap, not tonight.
- **No timeouts.** An unaccepted handoff or an unresponsive recipient can sit indefinitely.
  Production fix is a `CHECKLOCKTIMEVERIFY` branch returning custody after N blocks —
  designed, out of scope.
- **Attestations cannot be revoked.** §6 has the production fix.
- **Registry is federated.** A courier consortium genuinely is a federation, but say it out
  loud rather than letting a judge find it.
- **One contract deployment per parcel.** No batching.
- **No self-custody path.** A merchant unwilling to hand their treasury key to the backend,
  or a power user wanting the proof-of-delivery receipt in their own wallet, has no route
  today. Both are real post-hackathon cases and both would reintroduce an external wallet
  connector; neither is needed for the demo.
- **The chain cannot prove physical movement.** Only that attested keys accepted
  responsibility at recorded times.

---

## 13. Demo script

Three phones: marketplace, Courier A, Courier B. Recipient shown in a fourth window (or the
marketplace app).

1. Marketplace creates an order — parcel NFT minted with Courier A as custodian.
2. Courier B shows their identity QR; A scans it and broadcasts `handoff`.
3. B scans A's handoff QR and broadcasts `acceptHandoff` — custody now provably B's.
4. B broadcasts `requestDelivery`.
5. **Attack demo — B attempts to self-confirm delivery.** Transaction rejected on screen.
   This is the moment that lands.
6. Recipient opens their app, taps to reveal the delivery code, B scans it.
7. `confirmDelivery` broadcasts — NFT exits to the recipient's address as an immutable
   proof-of-delivery receipt.
8. Public tracking page: full custody chain reconstructed from chain data alone, no
   privileged access.

Rehearse step 5. A failing transaction is more memorable than a succeeding one, and it is the
only way to *show* rather than assert that the guarantee is real.

---

## 14. Build order

The contract is the critical path; nothing else can be tested until a spend succeeds.

1. `handoff` compiles and spends successfully on chipnet. **Nothing else until this works.**
2. `acceptHandoff` — proves the loop.
3. `requestDelivery` + `confirmDelivery` with the hash lock — the core claim.
4. Backend: commitment codec, chain reconstruction, key derivation, code generation.
5. Three UI screens: create order, courier scan/handoff, public tracking.
6. `reject` / `returnToSender` / `confirmReturn` — only if 1–5 are solid.

Spend a hackathon ticket early if `handoff` fights you. Everything downstream is blocked on it,
and a ticket unused at 1 PM tomorrow is a ticket wasted.

---

## 15. Decisions to confirm as a team

**Settled, recorded here so nobody relitigates at 3 AM:**

- No WalletConnect, no browser extension, no external wallet. Every key is held by the party
  running the code that signs with it, so there is nothing to bridge to. Couriers get a
  provisioned device signing key; recipients get their existing marketplace login.
- The delivery code is enforced on-chain via `require(sha256(deliveryCode) ==
  deliveryCodeHash)`, never by a backend database lookup.
- The delivery secret is 32 cryptographically random bytes. Any human-memorable value is
  brute-forceable from the public hash.

**Still open:**

1. **Courier keys — device-held or company-held?** (§2) Changes whether you can claim
   employee-level or only company-level attribution. Say which one on stage.
2. **Path A or path B for the demo?** (§5) Path A is a stronger claim; path B is less app work.
   Shipping B and describing A as the upgrade is a perfectly good answer.
3. **If path A: escrow the secret for recovery, or accept the return path?** (§12) Escrowing
   trades the mathematical guarantee back for an operational one.
4. **Does `reject` require the code?** (§4) Recommended yes; it blocks the marketplace
   unilaterally cancelling a delivery in transit.
