# Authentication — Hermes

> **Status: DEFERRED — post-hackathon feature.**
> The demo ships without an auth layer. All signing uses fixture keypairs injected at startup.
> This document records the target design so the feature can be picked up without re-deriving it.
> Full specification: `files/hermes-auth.md`.

---

## 1. What the demo uses instead

No authentication. No sessions. No challenge-response. Four fixture keypairs (merchant,
courier A, courier B, registry) are seeded at startup and injected into the signing paths.
The role selector in the UI picks which fixture key signs. This is deliberate — the hackathon
thesis is that **nobody needs a wallet**, and demonstrating a wallet popup would argue
against the pitch.

The auth code that existed in v1 (`IWalletConnector`, WalletConnect adapter, Libauth
challenge-response, nonce store, JWT guard) has been **deleted**, not stubbed. It is
reconstructed from this spec when the feature is built.

---

## 2. Target design (v2)

### 2.1 Identity model

A courier's credential is a **signing key, not a wallet**:

- No balance, no seed phrase, no funds at risk.
- Provisioned to the device at supervised onboarding; not portable.
- Lost device = support ticket (revoke + re-enrol), not a lost-seed catastrophe.
- Identity = `hash160(publicKey)`, hex-encoded. The server stores only public values.

```
device-generated private key   (never leaves secure storage)
 └─ secp256k1 → public key (33 bytes, compressed)
    └─ sha256 → ripemd160 → 20 bytes  ← on-chain identity
```

### 2.2 Enrolment (onboarding)

Once per courier device, supervised by the logistics company:

1. Operator authenticates the employee out-of-band (HR record, physical presence).
2. App generates a keypair locally → private key into device secure storage.
3. `POST /couriers/enrol { employeeId, publicKey, deviceLabel }`
4. Backend verifies employee, derives `publicKeyHash = hash160(publicKey)`, stores
   `{ employeeId, publicKey, publicKeyHash, company, status }`.
5. Backend requests a registry attestation (signature over `publicKeyHash`).
6. App stores the attestation for use in handoff QR codes.

**Login is not registration.** An unenrolled key must be rejected.

### 2.3 Login (challenge-response)

```
GET /auth/challenge?publicKeyHash=<hex>
  → server looks up enrolled key; refuses if revoked
  → generates 32 random bytes as nonce
  → stores { nonce, publicKeyHash, expiresAt, consumed: false }
  → returns canonical challenge string

POST /auth/verify { publicKey, challenge, signature }
  → ATOMICALLY: load nonce → reject if missing/expired/consumed → mark consumed
    → verify challenge byte-for-byte → verify hash160(publicKey) == enrolled
    → verify signature → reject if revoked
  → returns { token, expiresAt }
```

**Challenge format** (domain-bound, key-bound):

```
Hermes courier login
Domain: tracker.example.com
Key: <publicKeyHash hex>
Nonce: <32 random bytes, hex>
Expires: <ISO 8601 timestamp>
```

**Signature scheme:** DER Low-S over `sha256(challenge)`. Client sends its public key —
no recovery identifier needed. One digest scheme, identical on both ends.

### 2.4 Two layers on every state transition

```
1. Session token  → proves the request comes from a logged-in, non-revoked courier
2. Tx signature   → proves that courier's key authorises this specific state transition
```

Transaction signatures are replay-proof by construction (they commit to a specific UTXO).
Nonces are needed for login precisely because there is no output to bind to.

### 2.5 Key revocation

| Event | Action |
|---|---|
| Device lost / wiped | Set key status to revoked; refuse challenges and sessions |
| Employee leaves | Same |
| Suspected compromise | Same + audit every parcel the key touched |
| Replacement issued | Enrol a fresh keypair; old attestation never reused |

Enforced at the backend, not on-chain. Production hardening: sign
`publicKeyHash + expiryHeight` and add `require(tx.locktime < expiryHeight)` to `handoff`.

### 2.6 The signer port

```ts
// packages/shared/src/application/ports/signer.ts
export interface ISigner {
  getPublicKey(): Promise<string>;       // compressed, 33 bytes, hex
  getPublicKeyHash(): Promise<string>;   // hash160, hex — on-chain identity
  signMessage(message: string): Promise<string>;
  signTransaction(unsignedTransactionHex: string): Promise<string>;
}
```

Three implementations:

| Implementation | Used by | Key location |
|---|---|---|
| `DeviceKeySigner` | Courier app | Device secure storage (Keychain / Keystore) |
| `BackendSigner` | Marketplace, merchant, registry | Server-side, one key derived per delivery |
| `MockSigner` | Tests and demo | In-memory fixture keypair |

No `connect` / `disconnect`. No WalletConnect. No browser extension.

### 2.7 Recipient authentication

**Out of scope for signing.** Recipients authenticate with their existing marketplace login
and never sign anything. Their factor at delivery is the hash-locked delivery secret.

---

## 3. What was deleted from v1

| Removed | Reason |
|---|---|
| `IWalletConnector` port | Replaced by `ISigner` (no session to negotiate) |
| `WalletConnectBchConnector` | WalletConnect removed entirely |
| `MockWalletConnector` | Replaced by `MockSigner` |
| `LibauthAuthService` (recoverable sig, hash256, BSM prefix) | Replaced by DER-Low-S + sha256 + client-supplied pubkey |
| `MemoryNonceStore` (delete-before-validate ordering) | Rebuilt with atomic consume-in-transaction |
| `AuthController` (address-keyed challenge) | Re-keyed to `publicKeyHash`; rejects revoked/unenrolled at issuance |
| JWT guard (address subject) | Subject becomes `publicKeyHash`; adds custodian-match check |
| WalletConnect deps in `package.json` | Must remain absent |

---

## 4. Build checklist (when this feature is picked up)

- [ ] Nonce consumed inside the verification transaction, not merely expired
- [ ] Challenge string is domain-bound and key-bound, compared byte-for-byte
- [ ] Unenrolled keys rejected — login is not registration
- [ ] Revoked keys refused at challenge issuance, not only at verification
- [ ] `hash160(publicKey)` checked against enrolled value on every verification
- [ ] One digest scheme (sha256), identical client and server
- [ ] Private keys never in a request body, log line, or error message
- [ ] No WalletConnect dependency in either package manifest
- [ ] `IWalletConnector` and its adapter deleted, not merely unused
- [ ] Session guard checks JWT subject == current on-chain custodian before building tx

---

## 5. Reference

Full design with rationale, attack analysis, and trade-offs: `files/hermes-auth.md`.
Integration surface and per-actor auth table: `files/hermes-v2.md` §9.
