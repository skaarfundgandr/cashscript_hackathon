import { Elysia, t } from 'elysia';
import { container } from '../di/container.js';
import { ParcelController } from './controllers/parcel.controller.js';

const parcelController = new ParcelController(container);

export const routes = new Elysia()
  .post('/parcel/create', async ({ body }) => parcelController.create(body), {
    body: t.Object({
      courierId: t.String(),
      recipientPkh: t.Optional(t.String()),
    }),
  })
  .post('/parcel/:id/handoff', async ({ params, body }) => parcelController.handoff(params.id, body), {
    body: t.Object({
      courierId: t.String(),
      nextCourierId: t.String(),
    }),
  })
  .post('/parcel/:id/accept-handoff', async ({ params, body }) => parcelController.acceptHandoff(params.id, body), {
    body: t.Object({
      courierId: t.String(),
    }),
  })
  .post('/parcel/:id/request-delivery', async ({ params, body }) => parcelController.requestDelivery(params.id, body), {
    body: t.Object({
      courierId: t.String(),
    }),
  })
  .post('/parcel/:id/confirm-delivery', async ({ params, body }) => parcelController.confirmDelivery(params.id, body), {
    body: t.Object({
      courierId: t.String(),
      deliveryCode: t.String(),
    }),
  })
  .get('/parcel/:id', async ({ params }) => parcelController.getParcel(params.id));
