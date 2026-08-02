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
    detail: { tags: ['Merchant'], summary: 'List couriers available for assignment' },
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
      summary: 'Place an order and mint its parcel',
      description: 'Creates a pending order. A merchant must approve it before custody is attached.',
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
      description: 'The courier terminal\'s work list. Carries no state and no delivery secret — custody is the chain\'s to answer, and the terminal reads it per parcel. Not filtered by courier: the shop stamps courierId once at checkout and a handoff moves custody on chain, not here.',
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
      description: 'The escape hatch when a mint fails mid-demo. 409 if the order already has a parcel, 502 if the custody gateway is still down.',
    },
  });
