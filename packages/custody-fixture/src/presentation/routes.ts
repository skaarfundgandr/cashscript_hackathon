import { Elysia, t } from 'elysia';
import { container } from '../di/container.js';

/**
 * The six routes of `packages/backend`, with identical shapes. `create` returns JSON; the four
 * transitions return a **bare string** txid, which Elysia serialises as text/plain — call
 * `res.text()`, not `res.json()`. Errors are thrown, so they surface exactly as the real backend's
 * do: default Elysia handling, node text verbatim.
 */
export const routes = new Elysia()
  .post('/parcel/create', async ({ body }) => container.createParcel.execute(body), {
    body: t.Object({
      courierId: t.String(),
      recipientPkh: t.Optional(t.String()),
    }),
    detail: {
      tags: ['Parcel'],
      summary: 'Mint a parcel',
      description: 'Returns the delivery secret once. Courier ids are arbitrary — a keypair is minted per courier on first use.',
    },
  })
  .post('/parcel/:id/handoff', async ({ params, body }) => container.handoff.execute(params.id, body), {
    body: t.Object({
      courierId: t.String(),
      nextCourierId: t.String(),
    }),
    detail: { tags: ['Parcel'], summary: 'Hand off to the next courier · 0x00 → 0x01' },
  })
  .post('/parcel/:id/accept-handoff', async ({ params, body }) => container.acceptHandoff.execute(params.id, body), {
    body: t.Object({
      courierId: t.String(),
    }),
    detail: { tags: ['Parcel'], summary: 'Accept custody · 0x01 → 0x00' },
  })
  .post('/parcel/:id/request-delivery', async ({ params, body }) => container.requestDelivery.execute(params.id, body), {
    body: t.Object({
      courierId: t.String(),
    }),
    detail: { tags: ['Parcel'], summary: 'Go out for delivery · 0x00 → 0x02' },
  })
  .post('/parcel/:id/confirm-delivery', async ({ params, body }) => container.confirmDelivery.execute(params.id, body), {
    body: t.Object({
      courierId: t.String(),
      deliveryCode: t.String(),
    }),
    detail: {
      tags: ['Parcel'],
      summary: 'Confirm delivery with the code · 0x02 → 0x04',
      description: 'courierId is accepted and discarded — the recipient key signs. The code is the hex secret create returned.',
    },
  })
  .get('/parcel/:id', async ({ params }) => container.getParcel.execute(params.id), {
    detail: {
      tags: ['Parcel'],
      summary: 'The custody chain, oldest → newest',
      description: 'Hops carry no timestamp — the real backend declares one and never sets it (B-2). Under B1=throw this fails after delivery, exactly as the real backend does.',
    },
  });
