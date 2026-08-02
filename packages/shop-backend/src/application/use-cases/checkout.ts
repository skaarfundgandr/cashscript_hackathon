import { CustodyGateway, OrderRepository } from '../ports/index.js';
import { Order } from '../../domain/index.js';
import { BUYER, MERCHANT, getCourier, getProduct } from '../../infrastructure/seed.js';
import { NotFoundError } from '../errors.js';

export const ORDER_ID_ATTEMPTS = 50;

export interface CheckoutResult {
  orderId: string;
  accessToken: string;
}

export class CheckoutUseCase {
  constructor(private readonly orders: OrderRepository) {}

  async execute(params: { productId: string }): Promise<CheckoutResult> {
    const product = getProduct(params.productId);
    if (!product) throw new NotFoundError(`Unknown product: ${params.productId}`);

    const order: Order = {
      orderId: await this.nextOrderId(),
      accessToken: randomHex(32),
      productId: product.id,
      buyerId: BUYER.id,
      merchantId: MERCHANT.id,
      courierId: null,
      status: 'pending',
      parcelId: null,
      contractAddress: null,
      mintTxid: null,
      deliverySecret: '',
      revealedAt: null,
      createdAt: Date.now(),
    };
    await this.orders.save(order);

    return { orderId: order.orderId, accessToken: order.accessToken };
  }

  private async nextOrderId(): Promise<string> {
    for (let attempt = 0; attempt < ORDER_ID_ATTEMPTS; attempt++) {
      const orderId = String(1000 + randomInt(9000));
      if (!(await this.orders.exists(orderId))) return orderId;
    }
    throw new Error(`Could not allocate a free order id in ${ORDER_ID_ATTEMPTS} attempts`);
  }
}

/**
 * Shared by approval, compatibility dispatch, and `retry-custody`: mint the parcel and attach it
 * to an assigned order. The caller decides how gateway failures affect the merchant workflow.
 */
export async function attachCustody(orders: OrderRepository, custody: CustodyGateway, order: Order): Promise<Order> {
  if (!order.courierId) throw new NotFoundError(`Order ${order.orderId} has no assigned courier`);
  const courier = getCourier(order.courierId);
  if (!courier) throw new NotFoundError(`Unknown courier: ${order.courierId}`);

  const mint = await custody.createParcel(courier);
  const attachment = {
    parcelId: mint.parcelId,
    contractAddress: mint.address,
    mintTxid: mint.mintTxid,
    deliverySecret: mint.deliverySecret,
  };
  await orders.attachCustody(order.orderId, attachment);
  return { ...order, ...attachment };
}

function randomInt(bound: number): number {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0]! % bound;
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
