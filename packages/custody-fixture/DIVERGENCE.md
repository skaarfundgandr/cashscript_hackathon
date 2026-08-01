# Divergence audit

Every point where `packages/custody-fixture` differs from `packages/backend`, so P6 — wiring the
frontend to the real backend — is a checklist rather than a surprise.

**Add a row whenever this fixture takes a shortcut.** An undocumented shortcut is a P6 bug with a
delayed fuse.

| # | Divergence | Consequence at P6 |
|---|---|---|
| D-1 | Arbitrary courier ids vs hardcoded `A`/`B` | Any courier outside `CUSTODY_KEY` in `shop-backend/src/infrastructure/http-custody-gateway.ts` fails against the real backend — `getCourier` (`fixtures.ts:22`) holds only two private keys |
| D-2 | `B1=serve` returns `0x04`; the real backend throws | Stage 4 screens — the delivered receipt, the fifth timeline row, the public proof page — break until B-1 is fixed |
| D-3 | No real signatures, no chain, no contract | Nothing here proves a transaction was valid. The delivery code is compared as plaintext; the real backend stores only its sha256 and the contract enforces it |
| D-4 | Latency is 400–900 ms; chipnet is seconds | The shop's patience UI is untested against real timings. The mint is the slowest call in the system and this fixture makes it look fast |
| D-5 | Parcel ids are shaped like chipnet addresses but are not valid cashaddrs | Anything that *validates* an address, rather than echoing it, will fail |
| D-6 | Parcels survive a restart; the real backend's contract cache does not | `ParcelTracker.ts:215-221` throws `Unknown contract …; deploy the parcel in this process before transitioning it`. Against the real backend, a restart between the mint and a handoff kills the parcel — here it does not |
| D-7 | Known courier ids are pre-seeded with the backend's fixture keys | `A`, `B`, `jnt-mgl` and `ninjavan-rey` produce the real `COURIER_A` / `COURIER_B` pkhs so actor labels resolve. Any other id gets a freshly generated keypair whose pkh is in no identity table and will render as "Unknown actor" |
| D-8 | Reads are not delayed; only the mint and the four transitions are | Polling feels snappier here than against chipnet |

## What is faithful, deliberately

These are not divergences — they are the real backend's behaviour, reproduced because anything
that works against this fixture must work wired:

- `contractId === address`; the same value twice.
- The four transitions return a **bare `text/plain` string** txid, not `{ txid }`.
- The chain is **oldest → newest**; `chain[0]` is the mint.
- Hops carry **no timestamp** and there is no block height anywhere (B-2).
- `confirm-delivery` accepts `courierId` and discards it — the recipient key signs.
- `recipientPkh` is optional on `create` and defaults to the `RECIPIENT` fixture.
- An unreadable parcel fails with the node's exact text: `No parcel NFT UTXO found for contract …`.
- The five fixture pkhs are asserted at startup against the table in `DATA-LAYER.md`; a mismatch
  refuses to boot.
