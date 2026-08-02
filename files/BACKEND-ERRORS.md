# Backend Errors — what `packages/backend` throws, and why

> Scope: `packages/backend` as it exists on `feat/specs`. Read against the source, not from memory —
> every claim below carries a line reference.
> Two of these are operational and clear on their own. One is a defect and blocks Stage 4.

Three errors stand between a working demo and the real chain. In the order you hit them:

| | Error | Kind | Clears by |
|---|---|---|---|
| 1 | `No spendable BCH UTXO available at …` | operational | Funding the merchant address |
| 2 | `Unknown contract …; deploy the parcel in this process…` | operational | Not restarting custody mid-flow |
| 3 | `No parcel NFT UTXO found for contract …` | **defect · B-1** | A backend read-path change |

---

## 1 · The mint has no money

```
No spendable BCH UTXO available at bchtest:qp63uahgrxged4z5jswyt5dn5v3lzsem6cq85x00dt; fund the merchant address first
```

`ParcelTracker.ts:206-211`. Every `POST /parcel/create` funds a fresh covenant with
`PARCEL_FUNDING_SATOSHIS` (25 000) + `FEE_SATS` (2 000) from the merchant fixture address, derived
from private key `0x00…01`.

As of writing that address holds **0 sats**, so every mint fails. Fund it from a chipnet faucet.

**What the shop does about it:** nothing breaks. `POST /shop/checkout` still returns `201`, the
order persists with `parcelId: null`, and `retry-custody` re-attempts once the address has coins.
That degradation is deliberate — see `SHOP-BACKEND.md`, *Checkout*.

---

## 2 · The contract cache is in-memory

```
Unknown contract bchtest:p…; deploy the parcel in this process before transitioning it
```

`ParcelTracker.ts:215-221`. `deploy` caches the `Contract` instance in a `Map` keyed by address
(`ParcelTracker.ts:70`), and all four transitions read from that map. It is never rehydrated from
chain state.

So a parcel minted before a restart is **alive on chain but untransitionable** — the covenant
exists, the NFT exists, and the process that knew how to unlock it is gone.

**The trap:** `bun dev` runs custody under `--watch`. Save any file mid-flow and every in-flight
parcel is orphaned. Run `bun run packages/backend/src/main.ts` instead while recording.

Filed as **D-6** in `packages/custody-fixture/DIVERGENCE.md` — the fixture persists to SQLite and
does not share this failure, which makes it a divergence the fixture hides.

---

## 3 · A delivered parcel cannot be read — **B-1**

```
No parcel NFT UTXO found for contract bchtest:p…
```

`ParcelTracker.ts:99-104`. `getParcelHistory` locates the live NFT **at the contract address** and
walks backwards from it:

```ts
const utxos = await this.network.getUtxos(contractId);
const nftUtxo = utxos.find(isNftUtxo);
if (!nftUtxo || !nftUtxo.token?.nft) {
  throw new Error(`No parcel NFT UTXO found for contract ${contractId}`);
}
```

`confirmDelivery` sends that NFT out of the covenant to the recipient's P2PKH address
(`ParcelTracker.ts:143-159`):

```ts
const recipientAddress = encodeCashAddress({ prefix: BCH_TEST_PREFIX, type: 'p2pkh', payload: recipientPkh }).address;
return this.sendNftTransition(nftUtxo, unlocker, contract, …, recipientAddress, 'none');
```

The contract address is now empty of the NFT, so the read throws.

**The move is correct.** Leaving the covenant is exactly what makes `0x04` terminal and what puts
the token in the buyer's hands. The defect is on the read path, which assumes the token never
leaves.

### Why it costs more than the last hop

The walk starts at the tip and `unshift`s backwards through `getRawTransaction` (`ParcelTracker.ts:105-113`).
The tip is not merely the newest row — it is the **entry point to every row**. Lose it and the
whole reconstruction has no starting point.

So delivery does not cost the fifth hop. It costs the entire chain, in one transaction:

| Before `confirm-delivery` | After |
|---|---|
| `GET /parcel/:id` → 4 hops | `500`, no hops at all |

The record becomes unreadable at precisely the moment it is needed as proof of delivery. That is
what makes this Stage 4's blocker rather than a cosmetic gap — `FRONTEND-FLOW` calls Stage 4
*"the only part of the video that proves anything."*

### What it costs downstream

- the delivered receipt
- the five-row timeline
- the public tracking page opened cold after delivery
- `GET /shop/orders/:id` degrades to `custodyAvailable: false`, `chain: []` — the order still
  renders, but with nothing to show

### The fix

**A read-path change. Nothing about the covenant or the contract needs to move.** The NFT still
exists, still carries commitment `0x04`, still has the same category — it is simply at the
recipient's address now. Two workable routes:

1. Look for the NFT at the recipient's P2PKH address when the contract address has none, and walk
   back from there.
2. Persist the delivery txid at `confirmDelivery` and walk back from that txid instead of from a
   live UTXO.

Either restores the full five-hop read. The frontend cannot close this — doing so would mean
reading the chain directly, which the locked decisions forbid.

### Until then

`packages/custody-fixture` serves `0x04` by default so Stage 4 can be built at all, and
`B1=throw` replays this exact failure — same text — for building the unreadable-parcel path
deliberately. Filed as **D-2** in `DIVERGENCE.md`.

The fixture is, in effect, an executable statement of what `packages/backend` must be fixed to do.

---

## Not an error, but it shapes the UI: B-2

`ParcelHistoryEntry.timestamp` is declared (`application/ports/parcel-contract.ts`) and never
populated. Nothing exposes block height either.

Custody rows carry actor, state and txid — nothing else. This is why `createdAt` and `revealedAt`
live on the **order** in `packages/shop-backend` and are labelled as local on screen: putting them
on a custody row would imply the chain knows a time it does not.
