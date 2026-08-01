import { CustodyGateway, OrderRepository } from '../ports/index.js';
import { Order } from '../../domain/index.js';
import { BUYER, COURIERS, getCourier, getProduct } from '../../infrastructure/seed.js';
import { NotFoundError } from '../errors.js';

export const ORDER_ID_ATTEMPTS = 50;

export interface CheckoutResult {
  orderId: string;
  accessToken: string;
}

export class CheckoutUseCase {
  constructor(
    private readonly orders: OrderRepository,
    private readonly custody: CustodyGateway,
  ) {}

  async execute(params: { productId: string }): Promise<CheckoutResult> {
    const product = getProduct(params.productId);
    if (!product) throw new NotFoundError(`Unknown product: ${params.productId}`);

    const order: Order = {
      orderId: await this.nextOrderId(),
      accessToken: randomHex(32),
      productId: product.id,
      buyerId: BUYER.id,
      courierId: COURIERS[0]!.id,
      parcelId: null,
      contractAddress: null,
      mintTxid: null,
      deliverySecret: '',
      revealedAt: null,
      createdAt: Date.now(),
    };
    await this.orders.save(order);

    // The order is already durable. A slow or failed mint must not lose it, so the failure is
    // logged and the nulls stay — the frontend polls, and `retry-custody` is the escape hatch.
    try {
      await attachCustody(this.orders, this.custody, order);
    } catch (err) {
      console.error(`[shop] custody mint failed for order ${order.orderId}:`, err);
    }

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
 * Step 5 of checkout, shared with `retry-custody`: mint the parcel and attach it to the order.
 * Throws when the gateway fails — checkout swallows that, retry-custody turns it into a 502.
 */
export async function attachCustody(orders: OrderRepository, custody: CustodyGateway, order: Order): Promise<Order> {
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
