import { CheckoutUseCase, GetOrderUseCase, RetryCustodyUseCase, RevealCodeUseCase } from '../application/use-cases/index.js';
import { HttpCustodyGateway } from '../infrastructure/http-custody-gateway.js';
import { SqliteOrderRepository } from '../infrastructure/sqlite/order-repository.js';

export const CUSTODY_URL = process.env.CUSTODY_URL ?? 'http://localhost:3002';
export const SHOP_DB = process.env.SHOP_DB ?? '.shop.db';

const orders = new SqliteOrderRepository(SHOP_DB);
const custody = new HttpCustodyGateway(CUSTODY_URL);

export const container = {
  checkout: new CheckoutUseCase(orders, custody),
  getOrder: new GetOrderUseCase(orders, custody),
  revealCode: new RevealCodeUseCase(orders),
  retryCustody: new RetryCustodyUseCase(orders, custody),
};
