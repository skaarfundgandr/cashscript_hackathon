import { ApproveOrderUseCase, CheckoutResult, CheckoutUseCase, GetOrderUseCase, OrderView, RetryCustodyUseCase, RevealCodeResult, RevealCodeUseCase } from '../../application/use-cases/index.js';
import { NotFoundError } from '../../application/errors.js';
import { Courier, Product } from '../../domain/index.js';
import { COURIERS, getProduct, PRODUCTS } from '../../infrastructure/seed.js';

export interface ShopControllerDeps {
  approveOrder: ApproveOrderUseCase;
  checkout: CheckoutUseCase;
  getOrder: GetOrderUseCase;
  revealCode: RevealCodeUseCase;
  retryCustody: RetryCustodyUseCase;
}

export class ShopController {
  constructor(private readonly deps: ShopControllerDeps) {}

  listProducts(): Array<Product> {
    return PRODUCTS;
  }

  getProduct(id: string): Product {
    const product = getProduct(id);
    if (!product) throw new NotFoundError(`Unknown product: ${id}`);
    return product;
  }

  listCouriers(): Array<Courier> {
    return COURIERS;
  }

  checkout(body: { productId: string }): Promise<CheckoutResult> {
    return this.deps.checkout.execute({ productId: body.productId });
  }

  getOrder(orderId: string): Promise<OrderView> {
    return this.deps.getOrder.execute(orderId);
  }

  listPendingOrders(): Promise<Array<OrderView>> {
    return this.deps.getOrder.executePending();
  }

  approveOrder(orderId: string, body: { courierId: string }): Promise<OrderView> {
    return this.deps.approveOrder.execute(orderId, body.courierId);
  }

  revealCode(orderId: string, body: { accessToken: string }): Promise<RevealCodeResult> {
    return this.deps.revealCode.execute({ orderId, accessToken: body.accessToken });
  }

  retryCustody(orderId: string, body: { accessToken: string }): Promise<OrderView> {
    return this.deps.retryCustody.execute({ orderId, accessToken: body.accessToken });
  }
}
