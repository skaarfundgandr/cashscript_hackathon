# Authentication — Hermes (Couriers, Hub Operators, and Merchant)

> Companion to the Hermes v2 specification. Covers how **couriers, hub operators, and
> the merchant** prove identity and sign parcel state transitions.
>
> **Recipients are deliberately out of scope.** They authenticate with their existing
> marketplace login and never sign anything. Their factor at delivery is the hash-locked
> delivery secret. See §5 of the main specification.

---

## 1. What changed from the previous draft

The earlier version of this document assumed all four actors connected an external Bitcoin
Cash wallet — Paytaca or Zapit — over WalletConnect version 2, and listed "actor needs a
Bitcoin Cash wallet (barrier to entry)" as an accepted drawback.

That barrier is exactly what the v2 pivot exists to remove, so the two documents contradicted
each other. This version resolves the contradiction.

| Concern | Previous draft | Now |
|---|---|---|
| Recipient authentication | Wallet connect + challenge-response | **Existing marketplace login.** Signs nothing. |
| Courier authentication | External wallet over WalletConnect | **Device signing key**, provisioned at onboarding |
| Merchant authentication | External wallet over WalletConnect | Backend service credentials |
| WalletConnect version 2 | Required | **Removed** |
| Paytaca / Zapit support | Required | Not used |
| Wallet abstraction port | `IWalletConnector` | `ISigner` |

### Why WalletConnect is no longer needed

WalletConnect exists to bridge an application to a wallet it does not control. In v2 that
situation never arises:

| Actor | Who holds the private key | Who runs the signing code |
|---|---|---|
| Recipient | Marketplace (custodial) | Marketplace backend — recipient never signs |
| Courier / hub operator | The courier's own device | **Your courier application** |
| Merchant | Marketplace backend | Marketplace backend |
| Registry | Registry backend | Registry backend |

The courier row is the one that misleads. A key your own onboarding flow provisions into your
own application is not an external wallet — **your application is the wallet.** You do not
need a session-negotiation protocol to talk to yourself; you need a thin wrapper around a key
in device secure storage.

### What removing it buys

Gone: session negotiation, pairing flows, relay configuration, mobile deep links, and
cross-testing against two browser extensions with differing behaviour. Realistically several
hours, and they are the kind of hours that disappear into someone else's undocumented protocol
at 3 AM.

It also eliminates two whole classes of bug. The Bitcoin Signed Message prefix problem existed
only because we were interoperating with third-party wallet conventions; controlling both ends
means picking one message format and using it consistently. Likewise the recoverable-versus-DER
signature problem disappears once the client can simply send its public key alongside the
signature.

---

## 2. Identity model

A courier's credential is a **signing key, not a wallet.** This distinction is worth stating
explicitly to logistics operations staff, who will otherwise assume you are asking their
drivers to manage cryptocurrency:

- No balance. No funds at risk. Nothing to fund — the marketplace pre-funds every parcel.
- No seed phrase to write down or lose.
- Not portable and not meant to be. It is a work credential, scoped to one employer.
- Lost or wiped device is a **support ticket**, not a catastrophe: the logistics company
  revokes the registry attestation and enrols a replacement key.

Identity is the public key hash. The server stores only public values — the public key, its
hash, the enrolling company, and the attestation. None of these are secrets; the public key
hash is already published on-chain in every parcel commitment the courier touches. Do not
hash them again in the database as though they were passwords.

```
device-generated private key   (never leaves secure storage)
 └─ secp256k1 → public key (33 bytes, compressed)
    └─ sha256 → 32 bytes
       └─ ripemd160 → 20 bytes  ← the courier's on-chain identity
```

---

## 3. Enrolment (onboarding)

Enrolment happens once per courier device, supervised by the logistics company. It is the only
moment a key is created.

```
┌─ Courier app ──────────────────── Logistics backend ── Registry ─┐
│                                                                   │
│  1. Operator authenticates the employee out-of-band               │
│     (employee record, HR identity, physical presence)             │
│                                                                   │
│  2. App generates a keypair locally                               │
│     → private key into device secure storage                      │
│       (Keychain on iOS, Keystore on Android, never exported)      │
│                                                                   │
│  3. POST /couriers/enrol                                          │
│     { employeeId, publicKey, deviceLabel }                        │
│     ──────────────────────────────────────►                       │
│                                                                   │
│  4.                    Backend verifies the employee record,      │
│                        derives publicKeyHash = hash160(publicKey) │
│                        stores { employeeId, publicKey,            │
│                                 publicKeyHash, company, status }  │
│                                                                   │
│  5.                        Requests a registry attestation ──────►│
│                        ◄── signature over publicKeyHash           │
│                                                                   │
│     ◄──────────────────────────────────────                       │
│     { publicKeyHash, registryAttestation }                        │
│                                                                   │
│  6. App stores the attestation for use in handoff QR codes        │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

The attestation is the reusable, parcel-agnostic membership badge consumed by `handoff` in the
contract. It is issued once and presented on every handoff for the life of the key. See §6 of
the main specification.

**Private key never leaves the device.** The backend receives only the public key. If your
platform cannot guarantee this — for example a web-based courier console — that is the
company-held-key fallback discussed in §2 of the main specification, and you drop from
employee-level to company-level attribution. Note which you chose.

---

## 4. Login (challenge-response)

Login proves the courier still controls the enrolled key. It spends nothing — signing is local
mathematics.

```
┌─ Courier app ─────────────────────── Logistics backend ─┐
│                                                          │
│  1. GET /auth/challenge?publicKeyHash=<hex>              │
│     ────────────────────────────────────►                │
│                                                          │
│  2.              Look up the enrolled key. If revoked,   │
│                  refuse here — do not issue a challenge. │
│                  Generate 32 random bytes as the nonce.  │
│                  Store { nonce, publicKeyHash,           │
│                          expiresAt, consumed: false }    │
│     ◄────────────────────────────────────                │
│     { challenge: "<canonical string, see below>" }        │
│                                                          │
│  3. Sign the challenge with the device key                │
│                                                          │
│  4. POST /auth/verify                                     │
│     { publicKey, challenge, signature }                   │
│     ────────────────────────────────────►                │
│                                                          │
│  5.   ATOMICALLY, in one transaction:                     │
│         a. load nonce; reject if missing, expired,        │
│            or consumed                                    │
│         b. mark consumed = true                           │
│         c. verify the challenge string matches byte-for-  │
│            byte what was issued                           │
│         d. verify hash160(publicKey) == enrolled hash     │
│         e. verify the signature over the challenge        │
│         f. reject if the key is revoked                   │
│       Issue a session token                               │
│     ◄────────────────────────────────────                │
│     { token, expiresAt }                                  │
│                                                          │
│  6. Subsequent calls: Authorization: Bearer <token>      │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Challenge format

Canonical, domain-bound, and address-bound, so a signature harvested by another site cannot be
replayed against this one:

```
Hermes courier login
Domain: tracker.example.com
Key: <publicKeyHash hex>
Nonce: <32 random bytes, hex>
Expires: <ISO 8601 timestamp>
```

Verify the submitted challenge string equals the issued one exactly. Do not reconstruct it
from the submitted fields — that reintroduces the substitution the binding is there to prevent.

### The nonce must be consumed

The previous draft stored `{ address, nonce, expiresAt }` and never consumed it, so a captured
signature was replayable for the whole expiry window. Mark it consumed inside the same
transaction that validates it. Single-use is the point of a nonce; an unconsumed nonce is just
a short-lived password.

### Signature format — pick one and control both ends

Because we no longer interoperate with third-party wallets, choose the simple path:

```ts
import {
  secp256k1, sha256, hash160, binToHex, hexToBin,
} from '@bitauth/libauth';

// Client sends its public key, so no recovery identifier is needed.
function verifyCourierLogin(
  publicKeyHex: string,
  challenge: string,
  signatureHex: string,
  enrolledPublicKeyHash: string,
): boolean {
  const publicKey = hexToBin(publicKeyHex);

  // 1. The key must be the enrolled one.
  if (binToHex(hash160(publicKey)) !== enrolledPublicKeyHash) return false;

  // 2. One agreed digest scheme, used identically on both sides.
  const digest = sha256.hash(new TextEncoder().encode(challenge));

  // 3. Verify. Check the exact method names against your installed libauth version.
  return secp256k1.verifySignatureDERLowS(hexToBin(signatureHex), publicKey, digest);
}
```

Two mistakes the previous draft made, both now structurally impossible:

- It signed with a DER method and then attempted public-key recovery. **DER signatures cannot
  be recovered from** — recovery needs the compact recoverable format carrying a recovery
  identifier, which is where the "65 bytes" figure came from. DER is variable length, roughly
  70–72 bytes, and has no recovery identifier. Sending the public key removes the need for
  recovery entirely.
- It hashed the bare challenge string, while real wallets follow the Bitcoin Signed Message
  standard, which prefixes `\x18Bitcoin Signed Message:\n` and a length varint before hashing.
  Verification would have failed against every real wallet while passing against the mock —
  the worst possible failure mode. Controlling both ends means one scheme, used consistently.

### Enrolment is not login

Unlike the previous draft, first successful challenge-response is **not** registration. An
unenrolled key must be rejected. Self-registration would let anyone mint a courier identity,
and the registry attestation in §3 is precisely the check that must not be bypassable.

---

## 5. Two layers on every state transition

```
1. Session token  → proves the request comes from a logged-in, non-revoked courier
2. Signature      → proves that courier's key authorises this specific state transition
```

Both are required and neither substitutes for the other. The session token says who is
calling; the transaction signature is what the Bitcoin Cash network actually enforces.

Courier B calling `requestDelivery`:

```
Courier app                              Logistics backend
───────────                              ─────────────────
POST /parcels/:id/request-delivery
Authorization: Bearer <token>
                                    → guard verifies token, extracts publicKeyHash
                                    → checks it equals the parcel's current custodian
                                      in the on-chain commitment
                                    → builds the unsigned transaction, returns it

App signs locally with the device key
POST /parcels/:id/broadcast  { signedTransaction }
                                    → broadcasts, returns the transaction identifier
```

**Transaction signatures are inherently replay-proof**, more strongly than any nonce scheme. A
Bitcoin Cash signature commits to a specific unspent output; once that output is spent the
signature can never be replayed. Nonces are needed for login precisely because there is no
output to bind to there. For state transitions, the binding is free — do not add a second
nonce layer on top of it.

---

## 6. Key revocation

The previous draft had no revocation story. Minimum viable version:

| Event | Action |
|---|---|
| Device lost or wiped | Set key status to revoked; refuse challenges and reject sessions |
| Employee leaves | Same |
| Suspected compromise | Same, plus audit every parcel the key touched |
| Replacement issued | Enrol a fresh keypair; the old attestation is never reused |

Revocation is enforced at the backend, not on-chain: the registry attestation itself cannot be
withdrawn once signed, which is the limitation recorded in §6 of the main specification. The
production fix is signing `publicKeyHash + expiryHeight` and adding
`require(tx.locktime < expiryHeight)` to `handoff`. Designed, not built.

Practical consequence to state plainly: a revoked key can still satisfy the contract's
attestation check if someone reaches the chain directly, bypassing your backend. Parcels in
flight to a revoked courier should be resolved through `returnToSender`.

---

## 7. The signer port

The abstraction from the previous draft was sound architecture. It just had the wrong name and
the wrong implementations. Rename it and delete the adapter nothing calls — unused code counts
against the "well-done" judging criterion rather than earning credit for it.

```ts
// packages/shared/src/application/ports/signer.ts

export interface ISigner {
  /** The compressed public key, 33 bytes, hex encoded. */
  getPublicKey(): Promise<string>;

  /** hash160 of the public key, hex encoded — the on-chain identity. */
  getPublicKeyHash(): Promise<string>;

  /** Sign an arbitrary message. Used for the login challenge only. */
  signMessage(message: string): Promise<string>;

  /** Sign an unsigned transaction. Returns the signed transaction, hex encoded. */
  signTransaction(unsignedTransactionHex: string): Promise<string>;
}
```

Three implementations, one per party that actually holds a key:

| Implementation | Used by | Key location |
|---|---|---|
| `DeviceKeySigner` | Courier application | Device secure storage — Keychain or Keystore |
| `BackendSigner` | Marketplace, merchant, registry | Server-side key management, one key derived per delivery |
| `MockSigner` | Tests and the demo | In-memory keypair from a fixture |

```ts
// packages/frontend/src/infrastructure/device-key-signer.ts

import { secp256k1, sha256, hash160, binToHex } from '@bitauth/libauth';
import type { ISigner } from '@parceltracker/shared';

/**
 * Signs with a key generated on this device at enrolment and held in secure
 * storage. Not a wallet: no balance, no seed phrase, no funds, not portable.
 */
export class DeviceKeySigner implements ISigner {
  constructor(private readonly store: SecureKeyStore) {}

  async getPublicKey(): Promise<string> {
    return binToHex(await this.store.publicKey());
  }

  async getPublicKeyHash(): Promise<string> {
    return binToHex(hash160(await this.store.publicKey()));
  }

  async signMessage(message: string): Promise<string> {
    const digest = sha256.hash(new TextEncoder().encode(message));
    return binToHex(await this.store.signDigest(digest));
  }

  async signTransaction(unsignedTransactionHex: string): Promise<string> {
    // Compute the sighash for our input, sign it, assemble the unlocking script.
    // The private key stays inside the store; only digests cross the boundary.
  }
}
```

Note that `connect` and `disconnect` are gone. There is no session to negotiate with an
external application, so there is nothing to connect to or disconnect from.

---

## 8. Demo configuration

Nothing to install, for you or for the judges.

```
1. Fixture keypairs for merchant, courier A, and courier B seeded at startup
2. Courier application injects MockSigner in development, DeviceKeySigner in production
3. Role selector in the demo interface: "I am: Merchant | Courier A | Courier B"
4. Recipient view is the marketplace application — plain login, no signing
```

The recipient moment is unchanged from the previous plan and remains the strongest beat: they
open the marketplace application, tap to reveal the delivery code, and the courier scans it.
No extension install for anyone in the room.

A real wallet popup would actively **undercut** the pitch. The thesis is that end users need
no wallet, so demonstrating one on stage argues against you.

---

## 9. Trade-offs

| Gained | Given up |
|---|---|
| Recipients need no wallet, no extension, no seed phrase | Recipients cannot self-custody the proof-of-delivery receipt |
| Couriers onboard once per device, supervised | Company must run enrolment and revocation infrastructure |
| No password storage, reset, or leak surface | Lost device needs an operations process, not a seed phrase |
| One message format, both ends controlled | No interoperability with existing Bitcoin Cash wallets |
| No WalletConnect session negotiation to debug | External-wallet support becomes future work |
| Login costs zero satoshis | Each state transition costs mining fees, pre-funded by the merchant |
| Transaction signatures are replay-proof by construction | Login still needs correct nonce consumption |

---

## 10. When to add an external wallet connector back

Two genuine post-hackathon cases, each worth a single roadmap line:

1. **A merchant who will not hand their treasury key to your backend** and wants to approve
   parcel funding from their own wallet.
2. **A power user who wants the proof-of-delivery receipt** delivered to a self-custodied
   address rather than a marketplace-held one.

Both are real. Neither is needed tonight, and building for either now would reintroduce the
onboarding barrier the pivot was designed to remove.

---

## 11. Checklist before demo

- [ ] Nonce is consumed inside the verification transaction, not merely expired
- [ ] Challenge string is domain-bound and key-bound, and compared byte-for-byte
- [ ] Unenrolled keys are rejected — login is not registration
- [ ] Revoked keys are refused at challenge issuance, not only at verification
- [ ] `hash160(publicKey)` is checked against the enrolled value on every verification
- [ ] One digest scheme, identical in the client and the server
- [ ] Private keys never appear in a request body, a log line, or an error message
- [ ] No WalletConnect dependency remains in either package manifest
- [ ] `IWalletConnector` and its adapter are deleted, not merely unused
