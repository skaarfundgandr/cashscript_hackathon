import { Elysia, t } from 'elysia';
import { container } from '../di/container.js';
import { ParcelController } from './controllers/parcel.controller.js';

const parcelController = new ParcelController(container);

export const routes = new Elysia()
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
