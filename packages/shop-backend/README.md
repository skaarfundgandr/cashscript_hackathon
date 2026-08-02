# `@hermes/shop-backend` · :3001

Northbay Supply's own e-commerce backend. It owns **products, orders, the buyer, couriers and the
delivery-code plaintext**. It does not own custody — it consumes `packages/backend` (or
`packages/custody-fixture`) as an integration, which is what makes `FRONTEND-FLOW` step ② a real
server-to-server call rather than a browser holding merchant credentials.

Built from `files/SHOP-BACKEND.md` (Phase 1b), following `packages/backend`'s layering:
`domain/` → `application/ports` + `application/use-cases` → `infrastructure/` →
`presentation/controllers` + `routes`, wired in `di/container.ts`.

## Run

```
bun dev:shop                     # from the repo root
```

| Variable | Default | |
|---|---|---|
| `SHOP_PORT` | `3001` | |
| `CUSTODY_URL` | `http://localhost:3002` | `packages/custody-fixture`. Point it at `:3000` for real chipnet |
| `SHOP_DB` | `.shop.db` | `bun:sqlite`, gitignored |

`:3001/swagger` lists every route.

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/shop/products` | — | `Product[]` |
| `GET` | `/shop/products/:id` | — | `Product` |
| `GET` | `/shop/couriers` | — | `Courier[]` |
| `POST` | `/shop/checkout` | `{ productId }` | `201 { orderId, accessToken }` |
| `GET` | `/shop/orders/:orderId` | — | `OrderView` |
| `POST` | `/shop/orders/:orderId/dispatch` | `{ accessToken, courierId }` | `OrderView` |
| `POST` | `/shop/orders/:orderId/reveal-code` | `{ accessToken }` | `{ secret, revealedAt }` |
| `POST` | `/shop/orders/:orderId/retry-custody` | `{ accessToken }` | `OrderView` |

| Status | When |
|---|---|
| `404` | Unknown product or order |
| `403` | `accessToken` mismatch |
| `409` | Dispatching an assigned order; retrying an unassigned/minted order; revealing before custody is attached |
| `502` | The custody gateway failed on a call that requires it |

Four properties are load-bearing:

- **Checkout does not dispatch.** It creates an order with `courier: null` and `parcelId: null`.
  The merchant chooses a courier in a separate dispatch call.
- **Dispatch persists assignment before minting.** A failed mint leaves the selected courier in
  place with `parcelId: null`; `retry-custody` is the manual escape hatch.
- **`GET /shop/orders/:orderId` never returns `502`.** A custody failure is reported as
  `custodyAvailable: false`, `chain: []`, and the order still renders.
- **`deliverySecret` never appears in `OrderView`.** Only `reveal-code` returns it, only with a
  matching `accessToken`, and the reveal is stamped once server-side.

The order carries **no status column**. Status is the custody chain's state, read through the
gateway on every request, so there is nothing to drift.

## The curl sequence

`$SHOP` is `http://localhost:3001`, `$CUSTODY` is `http://localhost:3002`. The four mutations are
custody's, not the shop's — in the demo they come from the courier's scanner.

```sh
SHOP=http://localhost:3001
CUSTODY=http://localhost:3002

# checkout → order is durable but unassigned
curl -s -X POST $SHOP/shop/checkout -H 'content-type: application/json' \
  -d '{"productId":"field-notebook-a5"}'
#   → 201 {"orderId":"4471","accessToken":"…"}
ORDER=4471; TOKEN=…

curl -s $SHOP/shop/orders/$ORDER            # courier null, parcelId null, chain []

# merchant dispatches to the initial courier → parcel is minted
curl -s -X POST $SHOP/shop/orders/$ORDER/dispatch -H 'content-type: application/json' \
  -d "{\"accessToken\":\"$TOKEN\",\"courierId\":\"jnt-mgl\"}"

curl -s $SHOP/shop/orders/$ORDER            # parcelId, chain [0x00], courier Miguel Santos
PARCEL=$(curl -s $SHOP/shop/orders/$ORDER | grep -o '"parcelId":"[^"]*"' | cut -d'"' -f4)

# handoff  jnt-mgl → ninjavan-rey            → chain is 0x00, 0x01
curl -s -X POST $CUSTODY/parcel/$PARCEL/handoff -H 'content-type: application/json' \
  -d '{"courierId":"jnt-mgl","nextCourierId":"ninjavan-rey"}'

# accept-handoff  ninjavan-rey               → chain is 0x00, 0x01, 0x00
curl -s -X POST $CUSTODY/parcel/$PARCEL/accept-handoff -H 'content-type: application/json' \
  -d '{"courierId":"ninjavan-rey"}'

# request-delivery  ninjavan-rey             → … 0x02
curl -s -X POST $CUSTODY/parcel/$PARCEL/request-delivery -H 'content-type: application/json' \
  -d '{"courierId":"ninjavan-rey"}'

# reveal-code with the accessToken           → secret + revealedAt
SECRET=$(curl -s -X POST $SHOP/shop/orders/$ORDER/reveal-code -H 'content-type: application/json' \
  -d "{\"accessToken\":\"$TOKEN\"}" | grep -o '"secret":"[^"]*"' | cut -d'"' -f4)

# reveal-code again                          → SAME revealedAt
# reveal-code with a wrong token             → 403
curl -s -X POST $SHOP/shop/orders/$ORDER/reveal-code -H 'content-type: application/json' \
  -d '{"accessToken":"deadbeef"}'

# confirm-delivery with the secret           → … 0x04
curl -s -X POST $CUSTODY/parcel/$PARCEL/confirm-delivery -H 'content-type: application/json' \
  -d "{\"courierId\":\"ninjavan-rey\",\"deliveryCode\":\"$SECRET\"}"

# GET /shop/orders/:id                       → five hops, courier name, no secret
curl -s $SHOP/shop/orders/$ORDER
```

Against `packages/backend` (`CUSTODY_URL=http://localhost:3000`) the courier ids on the four
custody calls are `A` and `B`, not `jnt-mgl` / `ninjavan-rey` — that translation is a hard limit of
the custody backend's two fixture keys and it lives in `infrastructure/http-custody-gateway.ts`,
nowhere else. The fifth hop is also unreachable there: see **B-1** in `files/SHOP-BACKEND.md`.

## Notes on the build

- **Courier ids are arbitrary and seeded.** `A`/`B` are illustrative only. The seeded pkhs are
  `packages/backend`'s `COURIER_A` / `COURIER_B`, verified against its `fixtures.ts`.
- **`courierId === null` means awaiting dispatch.** A non-null courier with `parcelId === null`
  means assignment succeeded but minting failed; only that second state can use `retry-custody`.
- **`deliverySecret` is `''` until the mint lands**, matching the database's `NOT NULL` column.
  The check for "no code yet" is always `parcelId === null`, never a test on the secret.
- **`custodyAvailable` stays `true` when `parcelId` is null** — there is no chain read to fail.
  Use `courierId`/`courier` to distinguish awaiting dispatch from a mint awaiting retry.
- **No timestamps on custody hops** (B-2). `createdAt` and `revealedAt` belong to the order and are
  shop chrome only; putting them on a custody row would imply the chain knows a time it does not.
