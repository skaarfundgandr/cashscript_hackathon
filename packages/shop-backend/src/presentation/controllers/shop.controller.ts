import { ApproveOrderUseCase, CheckoutResult, CheckoutUseCase, DispatchOrderUseCase, GetOrderUseCase, GetPublicParcelUseCase, ListManifestUseCase, ManifestEntry, OrderView, PublicParcel, RetryCustodyUseCase, RevealCodeResult, RevealCodeUseCase } from '../../application/use-cases/index.js';
import { NotFoundError } from '../../application/errors.js';
import { Courier, Product } from '../../domain/index.js';
import { COURIERS, getProduct, PRODUCTS } from '../../infrastructure/seed.js';

export interface ShopControllerDeps {
  approveOrder: ApproveOrderUseCase;
  checkout: CheckoutUseCase;
  dispatchOrder: DispatchOrderUseCase;
  getOrder: GetOrderUseCase;
  listManifest: ListManifestUseCase;
  getPublicParcel: GetPublicParcelUseCase;
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

  dispatchOrder(orderId: string, body: { accessToken: string; courierId: string }): Promise<OrderView> {
    return this.deps.dispatchOrder.execute({ orderId, accessToken: body.accessToken, courierId: body.courierId });
  }

  getOrder(orderId: string): Promise<OrderView> {
    return this.deps.getOrder.execute(orderId);
  }

  listPendingOrders(): Promise<Array<OrderView>> {
    return this.deps.getOrder.executePending();
  }

  getPublicParcel(parcelId: string): Promise<PublicParcel> {
    return this.deps.getPublicParcel.execute(parcelId);
  }

  approveOrder(orderId: string, body: { courierId: string }): Promise<OrderView> {
    return this.deps.approveOrder.execute(orderId, body.courierId);
  }

  listManifest(): Promise<Array<ManifestEntry>> {
    return this.deps.listManifest.execute();
  }

  revealCode(orderId: string, body: { accessToken: string }): Promise<RevealCodeResult> {
    return this.deps.revealCode.execute({ orderId, accessToken: body.accessToken });
  }

  retryCustody(orderId: string, body: { accessToken: string }): Promise<OrderView> {
    return this.deps.retryCustody.execute({ orderId, accessToken: body.accessToken });
  }
}
