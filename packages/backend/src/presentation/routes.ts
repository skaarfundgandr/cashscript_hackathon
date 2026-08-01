import { jwt } from '@elysiajs/jwt';
import { Elysia, status, t } from 'elysia';
import { container } from '../di/container.js';
import { AuthController } from './controllers/auth.controller.js';
import { ParcelController } from './controllers/parcel.controller.js';

const parcelController = new ParcelController(container);
const authController = new AuthController(container.auth);

const publicRoutes = new Elysia()
  .use(jwt({ name: 'jwt', secret: process.env.JWT_SECRET ?? 'dev-secret' }))
  .get('/auth/challenge', ({ query }) => authController.getChallenge(query.address), {
    query: t.Object({
      address: t.String(),
    }),
  })
  .post('/auth/verify', async ({ jwt: signer, body }) => {
    if (!authController.verify(body.address, body.nonce, body.signature)) {
      throw status(401, 'Invalid signature');
    }
    const token = await signer.sign({ sub: body.address });
    return { token };
  }, {
    body: t.Object({
      address: t.String(),
      nonce: t.String(),
      signature: t.String(),
    }),
  });

const protectedRoutes = new Elysia()
  .use(jwt({ name: 'jwt', secret: process.env.JWT_SECRET ?? 'dev-secret' }))
  .derive(async ({ headers, jwt: signer }) => {
    const auth = headers['authorization'];
    if (!auth?.startsWith('Bearer ')) {
      throw status(401, 'Missing or invalid authorization header');
    }
    const token = auth.slice(7);
    const payload = await signer.verify(token);
    if (!payload) {
      throw status(401, 'Invalid or expired token');
    }
    return { user: { address: (payload as { sub: string }).sub } };
  })
  .post('/parcel/create', async ({ body }) => parcelController.create(body), {
    body: t.Object({
      merchantPk: t.String(),
      recipientPkh: t.String(),
      courierPkh: t.String(),
    }),
  })
  .post('/parcel/:id/handoff', async ({ params, body }) => parcelController.handoff(params.id, body), {
    body: t.Object({
      courierSig: t.String(),
      courierPk: t.String(),
      nextCustodian: t.String(),
    }),
  })
  .post('/parcel/:id/accept-handoff', async ({ params, body }) => parcelController.acceptHandoff(params.id, body), {
    body: t.Object({
      courierSig: t.String(),
      courierPk: t.String(),
    }),
  })
  .post('/parcel/:id/request-delivery', async ({ params, body }) => parcelController.requestDelivery(params.id, body), {
    body: t.Object({
      courierSig: t.String(),
      courierPk: t.String(),
    }),
  })
  .post('/parcel/:id/confirm-delivery', async ({ params, body }) => parcelController.confirmDelivery(params.id, body), {
    body: t.Object({
      recipientSig: t.String(),
      recipientPk: t.String(),
    }),
  })
  .post('/parcel/:id/reject', async ({ params, body }) => parcelController.reject(params.id, body), {
    body: t.Object({
      recipientSig: t.String(),
      recipientPk: t.String(),
    }),
  })
  .post('/parcel/:id/return-to-sender', async ({ params, body }) => parcelController.returnToSender(params.id, body), {
    body: t.Object({
      courierSig: t.String(),
      courierPk: t.String(),
    }),
  })
  .post('/parcel/:id/confirm-return', async ({ params, body }) => parcelController.confirmReturn(params.id, body), {
    body: t.Object({
      merchantSig: t.String(),
      merchantPk: t.String(),
    }),
  });

export const routes = new Elysia()
  .use(jwt({ name: 'jwt', secret: process.env.JWT_SECRET ?? 'dev-secret' }))
  .use(publicRoutes)
  .use(protectedRoutes);
