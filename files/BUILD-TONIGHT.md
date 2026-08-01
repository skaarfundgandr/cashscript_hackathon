# ParcelTracker — Build Brief

**Ship by:** 2 PM tomorrow. Everything below is anchored to that.

Read this whole file before writing code. It is short on purpose. The full design lives in
`parcel-tracker-v2.md` — do not read that tonight unless you are blocked on a detail.

---

## 1. The pitch, in one sentence

> Every custody handoff is signed on-chain by the courier accepting the parcel, and delivery
> requires both the marketplace's signature **and** a secret only the recipient holds — so no
> single party can fake a delivery.

That is the whole product. Anything you build that does not serve that sentence is out of scope.

---

## 2. Scope — read this twice

### IN — nothing else ships tonight

- Four contract functions: `handoff`, `acceptHandoff`, `requestDelivery`, `confirmDelivery`
- Server-side delivery-secret generation (32 random bytes, hash it, delete the plaintext)
- Three screens: create order, courier scan/handoff, public tracking page
- Deployed and spending on **chipnet**

### OUT — say "roadmap" if a judge asks

`reject` / `returnToSender` / `confirmReturn` · tenant dashboards · courier enrolment funnel ·
webhooks · multi-tenancy · API keys · fiat billing · client-side secret generation · PIN escrow ·
cross-device recovery · timeouts · mainnet

**If you find yourself building something in the OUT list, stop.** These are all real and all
designed. They are one roadmap slide, not code.

---

## 3. Contract — the four functions

Save as `contracts/ParcelTracker.cash`. Constructor params are **bare** — `recipientPkh`, never
`this.recipientPkh`. `this.` is only for `activeInputIndex`, `activeBytecode`, `age`.

```cashscript
pragma cashscript ^0.13.0;

contract ParcelTracker(
    bytes20 recipientPkh,
    bytes20 merchantPkh,
    bytes32 deliveryCodeHash,
    pubkey  registryPk
) {
    // ---------- current courier proposes a handoff ----------
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

    // ---------- incoming courier accepts liability ----------
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
        // custodian PRESERVED — the courier still physically holds the parcel
        require(tx.outputs[0].nftCommitment  == 0x02 + custodian + reason);
        require(tx.outputs[0].value >= tx.inputs[idx].value - 2000);
    }

    // ---------- recipient accepts: signature AND delivery code ----------
    function confirmDelivery(sig recipientSig, pubkey recipientPk, bytes deliveryCode) {
        int idx = this.activeInputIndex;
        bytes1 state, bytes21 tail = tx.inputs[idx].nftCommitment.split(1);

        require(state == 0x02);                                   // DeliveryPending
        require(hash160(recipientPk) == recipientPkh);
        require(checkSig(recipientSig, recipientPk));
        require(sha256(deliveryCode) == deliveryCodeHash);        // the recipient-held factor

        // strip the capability byte → the receipt NFT becomes immutable
        bytes32 category, bytes capability = tx.inputs[idx].tokenCategory.split(32);

        // exits the covenant to the recipient's address: terminal by construction
        require(tx.outputs[0].lockingBytecode == new LockingBytecodeP2PKH(recipientPkh));
        require(tx.outputs[0].tokenCategory  == category);
        require(tx.outputs[0].nftCommitment  == 0x04 + tail);     // 0x04 Delivered
    }
}
```

### Four ways to break this — check each one before you commit

1. **Read state from the input, never from an argument.** `tx.inputs[idx].nftCommitment` is
   correct. If state ever comes in as a function parameter, any stranger can claim any state and
   hijack the custody chain. This is the single worst bug available to you.
2. **Every function needs all four output requires.** Miss `lockingBytecode` and the NFT escapes
   the covenant. Miss `value` and a courier drains the satoshis. Miss `tokenCategory` and the
   mutable capability is lost mid-chain.
3. **`split` returns a tuple.** Verify the exact syntax against the CashScript docs for your
   installed version before assuming the above compiles as written.
4. **Verify `LockingBytecodeP2PKH`'s constructor signature** the same way.

### Commitment layout — 22 bytes

```
byte 0      state      0x00 InCustody · 0x01 HandoffPending · 0x02 DeliveryPending
                       0x04 Delivered (terminal, lives at a plain address)
bytes 1-20  custodian  hash160 of the courier holding or expected to hold the parcel
byte 21     reason     0x00 for everything we ship tonight
```

---

## 4. Work split — three people

Person A owns the critical path. B and C build against mocks until A unblocks them.

| | Owner | Deliverable |
|---|---|---|
| **A** | Contract | The four functions compiling and spending on chipnet |
| **B** | Backend | Mint, commitment codec, chain reconstruction, secret generation, tx building |
| **C** | Frontend | Three screens + the deck |

**B: do not wait for A.** Write the commitment encoder/decoder and chain reconstruction against
hand-crafted fixtures first. They are pure functions and they are on the critical path too.

**C: do not wait for anyone.** Build all three screens against a hardcoded JSON fixture of a
finished custody chain. Wire to the real backend last.

---

## 5. Checkpoints — anchored to the 2 PM deadline

| Time | Must be true | If not |
|---|---|---|
| **T−14h** | `handoff` compiles and spends on chipnet | **Spend the hackathon ticket now** |
| **T−10h** | `acceptHandoff` works — the loop is proven | Cut to a single hop, demo 1 courier |
| **T−7h** | `requestDelivery` + `confirmDelivery` with the hash lock | This is the pitch. Do not cut it. |
| **T−5h** | End-to-end run on chipnet, screens wired | Freeze features, demo what works |
| **T−4h** | **Feature freeze.** Deck + rehearsal only | — |
| **T−2h** | Two clean full rehearsals done | — |

Spend the hackathon ticket **early**, not at noon. A ticket unused at the deadline is a ticket
wasted, and everything downstream is blocked on `handoff`.

---

## 6. Demo script — rehearse this exactly

Three windows: marketplace, Courier A, Courier B.

```
1. Marketplace creates an order → parcel NFT minted, Courier A named as custodian
2. Courier B shows an identity QR → A scans it → A broadcasts handoff
3. B broadcasts acceptHandoff        → B is now the custodian on-chain
4. B broadcasts requestDelivery      → parcel is at the door

5. ★ B TRIES TO CONFIRM DELIVERY THEMSELVES → THE NETWORK REJECTS IT ON SCREEN ★

6. Recipient opens their tracking link, reveals the code, B scans it
7. confirmDelivery → the NFT exits to the recipient as an immutable receipt
8. Public tracking page shows the whole custody chain — read from the chain alone
```

**Step 5 wins the pitch.** It is the only moment that makes the architecture legible to a
non-technical judge. Rehearse it until it is clean, and make the rejection *visible* — show the
node's error, do not swallow it in a try/catch.

Step 8 matters nearly as much: show the chain being read without your backend, or the whole
trust claim is just a database with extra steps.

---

## 7. Pitch structure — 4 slides

Judging is 25 points each for: addresses the problem · works properly · well-done ·
well-presented. Map slides to that.

1. **Problem.** Cross-carrier disputes have no shared source of truth. Whoever owns the
   database owns the story. Lead with the cost of a "never received it" dispute.
2. **Solution.** The one-sentence pitch from §1, plus the dual-lock diagram.
3. **Live demo.** §6. Land step 5.
4. **Platform + roadmap.** Merchants integrate this into systems they already run — one
   endpoint plus an embeddable tracking page. Everything in the OUT list goes here as designed
   future work.

Nobody needs a wallet. No courier, no recipient, no merchant holds Bitcoin Cash — the platform
pre-funds every parcel. Say this explicitly; it is the reason the thing is adoptable.

---

## 8. Honest answers to the questions you will get

Volunteer these before a judge digs them out. Getting caught overclaiming costs more than the
limitation does.

| Question | Answer |
|---|---|
| Could the platform fake a delivery? | Not alone. Tonight's build deletes the plaintext secret at generation — that is operational and auditable. Client-side generation makes it mathematical, and it is on the roadmap. |
| Could a courier phish the code at the door? | Yes. Same weakness as every one-time-password delivery in use today. We do not claim to fix it. |
| What if nobody accepts a handoff? | It sits. No timeouts tonight. Fix is a `CHECKLOCKTIMEVERIFY` branch returning custody after N blocks — designed, not built. |
| Who runs the courier registry? | We do, at launch. `checkDataSig` verifies that the platform approved a courier. Consortium governance is roadmap. |
| Does this prove the parcel physically moved? | **No.** It proves attested keys accepted responsibility at recorded times. That is what liability attribution needs. |
| Can a revoked courier still act? | Attestations cannot be revoked on-chain once signed. Production fix is signing `pkh + expiryHeight` and checking `tx.locktime`. |

---

## 9. Definition of done

- [ ] Four functions compile and spend on chipnet
- [ ] Full happy path runs end to end, twice, without manual intervention
- [ ] The self-confirm rejection is visible on screen
- [ ] Public tracking page renders a chain read from chipnet, not from a database
- [ ] Public GitHub repo, pushed, with a README containing the one-sentence pitch
- [ ] Deck exists, four slides
- [ ] Two clean rehearsals completed

Ignore everything not on this list.
