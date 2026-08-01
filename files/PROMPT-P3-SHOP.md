# One-shot implementation prompt — P0 + P3

Paste everything below the line into a fresh session at the repo root.

---

Implement tickets **T1 through T6** from `files/TICKETS-P3-SHOP.md`, then prepare T7 for me to run
by hand. This is the frontend's P0 (setup) and P3 (shop) phases.

## Read first, in this order

1. `files/SPEC-P3-SHOP.md` — the spec. Sections 3 (what gets built), 4 (acceptance criteria) and
   10 (boundaries) are the ones you will keep returning to.
2. `files/TICKETS-P3-SHOP.md` — the breakdown, with per-ticket scope and verification.
3. `files/FRONTEND-FLOW.md` — background only. The spec supersedes it wherever they disagree, and
   the spec documents each deviation and why.

Do not re-derive the design. It is settled. If you think something in the spec is wrong, say so in
one paragraph and keep going under the spec's assumption — do not silently substitute your own.

## How to work

Ticket order is **T1 → T2 → T3 → T4 → T5 → T6**. Do not start a ticket until the previous one's
acceptance criteria actually pass.

After each ticket:

1. Run `bun run build` — it must pass before you move on.
2. Run that ticket's **Verify** block from the tickets doc.
3. Commit. Stage explicit paths only — never `git add -A`, `.`, or `-a`. One commit per ticket,
   message `feat(frontend): <ticket title>`. Do not push.
4. Tell me in two lines what landed and what you verified.

Work on the current branch (`feat/shop`).

Stop and ask me if: a ticket's acceptance criteria cannot be met without changing a backend package;
you need a dependency beyond the one QR encoder; or the spec and the code disagree about something
load-bearing.

## The check that matters most

Ticket T5 builds `src/components/custody/`. **Nothing in that directory — or anything it imports —
may reference `presentation/`.** After T5 and again after T6, run:

```bash
grep -rn "presentation/" packages/frontend/src/components/custody/
```

It must return nothing. This is spec criterion 15 and it is the precondition for P5. If the timeline
component absorbs shop-specific styling or imports, the public tracking page stops being a thin
wrapper and becomes a rebuild — and the public page is the only part of the demo that proves
anything.

## Hard rules

**Always**

- Read state from `GET /shop/orders/:orderId`. The server owns `revealedAt`, the chain, and mint
  status. Never mirror them client-side.
- Render unknown custody state bytes as a neutral grey badge showing the raw hex. Never throw.
- Treat `custodyAvailable: false` and `parcelId: null` as ordinary render branches, not errors.
- Match the existing code style: TypeScript strict, ESM with explicit `.js` extensions on relative
  imports, comments that explain *why* and not *what*. `packages/shop-backend/src/domain/order.ts`
  is the model — match that comment density, no more.

**Never**

- Store the delivery secret in localStorage, the URL, or state that outlives the reveal panel. It is
  a bearer secret; it lives on screen and nowhere else.
- Reveal the delivery code without an explicit tap, or hide the reveal timestamp once stamped.
- Reintroduce a wallet connection anywhere. Spec v2: nobody connects a wallet.
- Call the custody backend (`:3000`) from the shop surfaces. The shop talks to the shop backend
  (`:3001`) only.
- Re-sort the custody chain. The order is the chain's, not ours.
- Modify anything under `packages/shop-backend/` or `packages/backend/`. Those are tickets D-1 and
  D-2, they belong to someone else, and T1–T6 are designed to land without them.
- Extend the marketplace catalogue. It is frozen at its current feature set. You are re-mounting it
  at a new route in T1 and otherwise not touching it.
- Add P1's `ParcelApi` port or fixture layer, P2's token system, P4's scanner, or P5's public page.
  Out of scope, deliberately.

## Known traps

These cost an hour each if you find them the hard way.

- `src/infrastructure/api-client.ts` is **partially** deleted in T1 — the `ApiClient` class goes, the
  `shopApi` object stays and grows. `FRONTEND-FLOW.md:272` says delete the whole file; that predates
  the shop backend existing. The spec is right, the flow doc is stale.
- `parcelId` is a cashaddr and contains a colon. URL-encode it in every path segment.
- The shop backend's `CUSTODY_URL` defaults to `http://localhost:3002` — the **fixture**, not the
  real backend on `:3000` (`shop-backend/src/di/container.ts:5`).
- At the custody layer, courier ids are `A` and `B`. `HttpCustodyGateway` translates the shop's
  `jnt-mgl` / `ninjavan-rey` into them.
- The Delivered hop's custodian is the **recipient's** pkh, not a courier's. Label that row as the
  buyer; don't go looking for a courier that isn't there.
- Hops carry no `timestamp` and no `actorLabel` today. Both are optional fields in the domain type
  by design (tickets D-1 and D-2). Render them when present; render cleanly without them. Do **not**
  synthesise times client-side — the public page in a fresh window would not have them, which is
  exactly where the proof happens.
- `motion` is already in the bundle. Keep animation off and behind the QR codes — an animated
  backdrop can break a phone scan.

## Verification you can do, and what you can't

Run the stack with `bun run dev:demo` (custody fixture `:3002` + shop backend `:3001` + frontend
`:5173`).

To drive a parcel through custody states — necessary for T5 and T6, since no scanner exists yet —
use the curl sequence in **Appendix A** of the tickets doc.

Three criteria you **cannot** verify yourself. Do not claim them:

- **Criterion 6** and the T6 QR check — a QR must be scanned off a screen *by a phone*. Rendering is
  not scanning. Build to the spec's constraints (min 240px, quiet zone, high contrast, no animation)
  and flag both as unverified.
- **Criterion 5's retry path** if you cannot restart the shop backend with a different `CUSTODY_URL`
  — say so rather than assuming it works.

Report honestly. A criterion you did not test is untested, not passed.

## Finish with

1. A checklist of all 15 spec criteria: passed / failed / not verifiable by you, each with the
   evidence or the reason.
2. Anything you had to decide that the spec didn't cover, and what you chose.
3. Anything you think the spec got wrong, now that you have built it.
4. The exact steps left for me in T7 — the three-window pass, the two refresh paths, and the phone
   checks — as a list I can work through without rereading anything.
