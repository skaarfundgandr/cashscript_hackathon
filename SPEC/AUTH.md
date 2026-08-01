# Authentication & Wallet Integration — ParcelTracker

> How all four actors (Merchant, Courier A, Courier B, Recipient) prove identity, sign transactions, and connect their wallets.

---

## 1. Identity Model

**BCH address = account.** No usernames, no emails, no passwords. Every actor proves ownership of a BCH private key via ECDSA challenge-response. The derived CashAddress IS their identity.

```
private key
 └─ secp256k1 → public key (33 bytes, compressed)
    └─ sha256 → 32 bytes
       └─ ripemd160 → 20 bytes (pubkeyHash)
          └─ base32 + checksum → "bitcoincash:qrz..."
```

The server stores only the public address. This is NOT a secret — addresses are public on the blockchain. Hashing it again in the DB is redundant (unlike passwords, which ARE secrets).

---

## 2. Challenge-Response Flow

Auth proves identity without spending any BCH. Signing is pure local math — 0 sats.

```
┌─ Frontend (browser wallet) ──────────── Backend (Elysia) ─┐
│                                                            │
│  1. User clicks "Connect Wallet"                           │
│     → wallet popup opens                                   │
│     → user approves connection                             │
│     → frontend gets address                                │
│                                                            │
│  2. GET /auth/challenge?address=bitcoincash:qr...          │
│     ─────────────────────────────────────────────►         │
│                                                            │
│  3.                          Server generates random nonce │
│                              Stores: { address, nonce,     │
│                                        expiresAt }         │
│     ◄─────────────────────────────────────────────         │
│     { challenge: "Sign this message:\nNonce: <random>" }   │
│                                                            │
│  4. Wallet signs challenge with ECDSA                      │
│     → produces 65-byte DER signature                       │
│                                                            │
│  5. POST /auth/verify                                      │
│     { address, challenge, signature }                      │
│     ─────────────────────────────────────────────►         │
│                                                            │
│  6.                          Recover pubkey from signature │
│                              Derive address from pubkey    │
│                              Compare derived vs claimed    │
│                              If match → ✅                 │
│                              Upsert user row               │
│                              Issue JWT token               │
│                                                            │
│     ◄─────────────────────────────────────────────         │
│     { token: "eyJ...", expires: "..." }                    │
│                                                            │
│  7. All subsequent API calls use:                          │
│     Authorization: Bearer <JWT>                            │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Server-side verification (Libauth)

```ts
import { secp256k1, hash256, hash160 } from '@bitauth/libauth';
import { encodeCashAddress } from '@bitauth/libauth';

function verifyChallenge(address: string, challenge: string, signature: string): boolean {
  // 1. Hash the challenge message (Bitcoin Signed Message format)
  const messageHash = hash256(new TextEncoder().encode(challenge));

  // 2. Recover public key from signature + message hash
  const sigBytes = hexToBin(signature);
  const pubkey = secp256k1.recoverPublicKeyCompressed(sigBytes, messageHash);

  // 3. Derive address from pubkey
  const pubkeyHash = hash160(pubkey);
  const derived = encodeCashAddress({ prefix: 'bitcoincash', type: 'p2pkh', payload: pubkeyHash });

  // 4. Compare — if Mallory signed with her key, the math produces Mallory's address
  return derived === address;
}
```

**Key security property:** You cannot forge a signature that recovers to someone else's address. Doing so is equivalent to breaking ECDSA on secp256k1.

---

## 3. Registration = Login

There is no separate registration flow. First successful challenge-response **is** registration.

| | Login | Registration |
|---|---|---|
| Challenge-response | Same | Same |
| DB lookup | Address found → existing user | Address not found → new user |
| Server action | Issue JWT | INSERT user + issue JWT |
| UX difference | None | None |

Address squatting is harmless: Mallory can insert Alice's address into the DB, but she can never sign a challenge that recovers to that address. The account is cryptographically coupled to the keypair, not the DB row.

---

## 4. Wallet Connection — WalletConnect V2 for BCH

### The protocol: `wc2-bch-bcr`

BCH wallets don't use MetaMask's `window.ethereum`. Instead, they use **WalletConnect V2** with a BCH-specific message layer: [`mainnet-pat/wc2-bch-bcr`](https://github.com/mainnet-pat/wc2-bch-bcr).

WalletConnect V2 is transport-agnostic (QR code, deep link, browser extension). The BCH layer adds CashAddress-aware methods:

| Method | Use in ParcelTracker |
|---|---|
| `bch_getAddresses` | Get actor's BCH address (identity) |
| `bch_signMessage` | Sign auth challenge (0 sats) |
| `bch_signTransaction` | Sign parcel state transitions (handoff, accept, deliver, etc.) |
| `bch_getPubKeys` | Get public key for CashScript contract functions |

### Supported wallets

Both major BCH browser extension wallets implement this protocol:

| Wallet | Type | Protocol | Status |
|---|---|---|---|
| **Paytaca** | Browser extension + mobile | WalletConnect V2 BCH | Production, used by TapSwap, Emerald DAO |
| **Zapit** | Browser extension | Same `wc2-bch-bcr` protocol | Active development |

Because they share the same protocol, the frontend does NOT need separate adapters. One `IWalletConnector` implementation works with both.

---

## 5. IWalletConnector Port

The frontend defines a port that abstracts the wallet layer. Swap implementations without touching any use case or UI code.

```ts
// packages/frontend/src/application/ports/wallet-connector.ts

export interface IWalletConnector {
  /** Open wallet connection (QR or extension popup). Returns BCH address. */
  connect(): Promise<string>;

  /** Close the wallet session. */
  disconnect(): Promise<void>;

  /** Sign an arbitrary message (for auth challenge). Returns hex-encoded DER signature. */
  signMessage(message: string): Promise<string>;

  /** Sign a BCH transaction hex. Returns signed transaction hex. */
  signTransaction(txHex: string): Promise<string>;

  /** Get the compressed public key (33 bytes hex). Needed for CashScript contract args. */
  getPublicKey(): Promise<string>;

  /** Get the current BCH CashAddress. */
  getAddress(): Promise<string>;
}
```

### Production adapter: WalletConnect BCH

```ts
// packages/frontend/src/infrastructure/walletconnect-connector.ts

import type { IWalletConnector } from '../application/ports/wallet-connector.js';

/**
 * WalletConnect V2 adapter using wc2-bch-bcr protocol.
 * Works with Paytaca, Zapit, and any BCH wallet that implements the spec.
 */
export class WalletConnectBchConnector implements IWalletConnector {
  private wcClient: BchWalletConnectClient;
  private currentAddress: string = '';

  async connect(): Promise<string> {
    // 1. Initialize WalletConnect V2 session
    // 2. Request bch_getAddresses
    // 3. Store address + session
    return this.currentAddress;
  }

  async signMessage(message: string): Promise<string> {
    // → bch_signMessage({ message, address: this.currentAddress })
  }

  async signTransaction(txHex: string): Promise<string> {
    // → bch_signTransaction({ transaction: txHex })
  }

  async getPublicKey(): Promise<string> {
    // → bch_getPubKeys({ address: this.currentAddress })
  }

  async getAddress(): Promise<string> {
    return this.currentAddress;
  }

  async disconnect(): Promise<void> {
    // Close WalletConnect session
  }
}
```

### Dev adapter: Mock wallet

For hackathon demos and development without a browser extension:

```ts
// packages/frontend/src/infrastructure/mock-wallet.ts

import { secp256k1, hash256 } from '@bitauth/libauth';
import type { IWalletConnector } from '../application/ports/wallet-connector.js';

/**
 * In-memory wallet that signs with a hardcoded Libauth keypair.
 * Perfect for hackathon demos — no browser extension needed.
 */
export class MockWalletConnector implements IWalletConnector {
  constructor(private readonly keypair: { privKey: Uint8Array; pubKey: Uint8Array }) {}

  async connect(): Promise<string> {
    // Derive CashAddress from pubkey, return immediately — no popup
  }

  async signMessage(message: string): Promise<string> {
    const msgHash = hash256(new TextEncoder().encode(message));
    return secp256k1.signMessageHashDER(this.keypair.privKey, msgHash);
  }

  async signTransaction(txHex: string): Promise<string> {
    // Sign with keypair
  }

  async getPublicKey(): Promise<string> {
    return binToHex(this.keypair.pubKey);
  }

  async getAddress(): Promise<string> {
    // Derived from keypair at construction
  }

  async disconnect(): Promise<void> {
    // No-op — nothing to disconnect
  }
}
```

The DI container decides which implementation to inject:

```ts
// packages/frontend/src/main.ts (or di/container.ts)
const walletConnector: IWalletConnector = import.meta.env.DEV
  ? new MockWalletConnector(DEV_KEYPAIR)
  : new WalletConnectBchConnector();
```

---

## 6. Actor Key Management for the ParcelTracker Demo

The ParcelTracker contract has four actors, each needing a keypair:

| Actor | Needs BCH? | Keypair for | Wallet type in demo |
|---|---|---|---|
| **Merchant** | Yes (funds gas) | Minting parcel, confirming returns | Real wallet or mock |
| **Courier A** | No | `handoff()` signature | Mock wallet |
| **Courier B** | No | `acceptHandoff()`, `requestDelivery()`, `returnToSender()` | Mock wallet |
| **Recipient** | No | `confirmDelivery()`, `reject()` | Mock wallet (or real for demo UX) |

For the hackathon, all four can use `MockWalletConnector` with pre-generated keypairs. The demo flow:

```
1. Backend starts with 4 keypairs in .env
2. Frontend loads all 4 mock wallets
3. UI has a role selector: "I am: Merchant | Courier A | Courier B | Recipient"
4. Each role's wallet signs their respective transactions
5. Judges see the full flow without installing browser extensions
```

The Recipient is the one actor where a real wallet demo is impactful — scanning a QR code and tapping "Accept Delivery" on a phone. The other three can be mocked.

---

## 7. JWT Session Management

Blockchain auth proves identity once. Subsequent API calls use standard JWT:

```
Auth:   sign challenge → get JWT (once per session)
API:    Bearer <JWT> → fast, no signing
```

JWT issued by `@elysiajs/jwt`:

```ts
// packages/backend/src/presentation/controllers/auth.controller.ts
import { jwt } from '@elysiajs/jwt';

const authJwt = jwt({
  name: 'jwt',
  secret: process.env.JWT_SECRET!,
  exp: '24h',
});

app.post('/auth/verify', async ({ body, jwt }) => {
  const { address } = body;
  // ... verify signature ...

  const token = await jwt.sign({ sub: address, iat: Date.now() });
  return { token, expires: Date.now() + 24 * 60 * 60 * 1000 };
});
```

---

## 8. CLEAN Architecture Placement

```
packages/shared/src/domain/models/
└── auth.ts                  # Nonce, Challenge, Signature, AuthToken (value objects)

packages/backend/src/
├── application/ports/
│   └── auth.ts              # IAuthService interface
│       generateChallenge(addr) → Challenge
│       verifySignature(addr, nonce, sig) → boolean
│
├── infrastructure/
│   └── libauth/
│       └── auth-service.ts  # implements IAuthService
│           # Uses: secp256k1.recoverPublicKeyCompressed,
│           #        hash160, encodeCashAddress, hash256
│
├── presentation/
│   ├── controllers/
│   │   └── auth.controller.ts
│   │       GET  /auth/challenge?address=...
│   │       POST /auth/verify  { address, challenge, signature }
│   └── middleware/
│       └── auth-guard.ts     # JWT verification via @elysiajs/jwt

packages/frontend/src/
├── application/
│   ├── ports/
│   │   └── wallet-connector.ts   # IWalletConnector interface
│   └── use-cases/
│       └── authenticate.ts       # Orchestrates challenge → sign → verify
│
└── infrastructure/
    ├── walletconnect-connector.ts # Production: WalletConnect V2 BCH
    └── mock-wallet.ts             # Dev/demo: hardcoded Libauth keypair
```

---

## 9. Trade-offs

| Pro | Con |
|---|---|
| No password to store, leak, or crack | Actor needs a BCH wallet (barrier to entry) |
| No email verification needed | Lose wallet seed phrase → identity gone forever |
| Self-sovereign identity (keypair = account) | Two-step UX: wallet popup + click "Sign" |
| Zero infrastructure for password recovery | Wallet UX varies across providers |
| Identity portable across apps | WalletConnect setup is non-trivial (session negotiation) |
| Mock wallet works for hackathon demo | Production needs real WalletConnect integration |
| 0 sats for auth | Each state transition costs mining fees (merchant pre-funds) |

---

## 10. Session + JWT + ParcelTracker Integration

Every API call that triggers a contract state transition goes through two layers:

```
1. JWT Auth Guard     →  proves the HTTP request comes from a logged-in actor
2. Contract Signature →  proves the actor controls the BCH address authorized for that transition
```

Example: Courier B calling `requestDelivery()`:

```
Frontend                            Backend
────────                            ───────
POST /parcels/:id/request-delivery
Authorization: Bearer <JWT>
                                    → auth guard verifies JWT, extracts address
                                    → use case checks: is the JWT's address == current custodian?
                                    → if yes, builds transaction, returns unsigned tx hex

Frontend receives tx hex
                                    → IWalletConnector.signTransaction(txHex)
                                    → frontend POSTs signed tx back

POST /parcels/:id/broadcast
{ signedTx: "..." }
                                    → ITxBroadcaster.send(signedTx)
                                    → returns txid
```

The JWT proves "you are logged in as address X." The transaction signature proves "address X authorizes this state transition." Both are required — the JWT alone doesn't prove BCH key ownership, and the transaction signature alone doesn't prove the HTTP session is valid.
