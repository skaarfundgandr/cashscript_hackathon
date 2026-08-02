import { Elysia, t } from 'elysia';
import { ShopError } from '../application/errors.js';
import { container } from '../di/container.js';
import { ShopController } from './controllers/shop.controller.js';

const shopController = new ShopController(container);

export const routes = new Elysia()
  .onError(({ error, set }) => {
    // The status carries the meaning; the message is the use case's, verbatim.
    if (error instanceof ShopError) {
      set.status = error.status;
      return { message: error.message };
    }
  })
  .get('/shop/products', () => shopController.listProducts(), {
    detail: { tags: ['Shop'], summary: 'List the catalogue' },
  })
  .get('/shop/products/:id', ({ params }) => shopController.getProduct(params.id), {
    detail: { tags: ['Shop'], summary: 'One product' },
  })
  .get('/shop/couriers', () => shopController.listCouriers(), {
<<<<<<< HEAD
    detail: { tags: ['Merchant'], summary: 'List couriers available for assignment' },
=======
    detail: { tags: ['Shop'], summary: 'List couriers available for dispatch' },
>>>>>>> 932c435 (feat: separate order dispatch from checkout, allowing merchant to assign courier post-checkout)
  })
  .post('/shop/checkout', async ({ body, set }) => {
    set.status = 201;
    return shopController.checkout(body);
  }, {
    body: t.Object({
      productId: t.String(),
    }),
    detail: {
      tags: ['Shop'],
<<<<<<< HEAD
      summary: 'Place an order and mint its parcel',
      description: 'Creates a pending order. A merchant must approve it before custody is attached.',
=======
      summary: 'Place an unassigned order',
      description: 'Persists the buyer\'s order without choosing a courier or minting a parcel. Dispatch is a separate merchant action.',
    },
  })
  .post('/shop/orders/:orderId/dispatch', async ({ params, body }) => shopController.dispatchOrder(params.orderId, body), {
    body: t.Object({
      accessToken: t.String(),
      courierId: t.String(),
    }),
    detail: {
      tags: ['Shop'],
      summary: 'Assign a courier and mint the parcel',
      description: 'The custody integration point. Assignment is persisted before minting; if custody is unavailable, retry-custody can re-attempt the mint without changing courier.',
>>>>>>> 932c435 (feat: separate order dispatch from checkout, allowing merchant to assign courier post-checkout)
    },
  })
  .get('/shop/orders/pending', () => shopController.listPendingOrders(), {
    detail: { tags: ['Merchant'], summary: 'List merchant orders awaiting approval' },
  })
  .post('/shop/orders/:orderId/approve', ({ params, body }) => shopController.approveOrder(params.orderId, body), {
    body: t.Object({ courierId: t.String() }),
    detail: { tags: ['Merchant'], summary: 'Assign a courier, approve an order, and attach custody' },
  })
  .get('/shop/manifest', async () => shopController.listManifest(), {
    detail: {
      tags: ['Shop'],
      summary: 'Every parcel the shop has minted',
      description: 'The courier terminal\'s work list. Contains only dispatched orders whose parcels were minted. Carries no state and no delivery secret; the terminal reads custody from the chain.',
    },
  })
  .get('/shop/orders/:orderId', async ({ params }) => shopController.getOrder(params.orderId), {
    detail: {
      tags: ['Shop'],
      summary: 'The buyer\'s order, with the live custody chain',
      description: 'Never 502. If custody is unreachable the order still renders with custodyAvailable: false and chain: []. Never returns the delivery secret.',
    },
  })
  .post('/shop/orders/:orderId/reveal-code', async ({ params, body }) => shopController.revealCode(params.orderId, body), {
    body: t.Object({
      accessToken: t.String(),
    }),
    detail: {
      tags: ['Shop'],
      summary: 'Release the delivery code to the buyer',
      description: 'The only path by which the plaintext leaves this server. Idempotent — the first call stamps revealedAt, later calls return the same one. A wrong accessToken is 403 and the secret is not read.',
    },
  })
  .post('/shop/orders/:orderId/retry-custody', async ({ params, body }) => shopController.retryCustody(params.orderId, body), {
    body: t.Object({
      accessToken: t.String(),
    }),
    detail: {
      tags: ['Shop'],
      summary: 'Re-attempt the mint for an order with no parcel',
      description: 'The escape hatch after dispatch assignment succeeds but minting fails. 409 for an unassigned order or one that already has a parcel; 502 if custody is still down.',
    },
  });
