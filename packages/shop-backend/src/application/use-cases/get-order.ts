import { CustodyGateway, CustodyHop, OrderRepository } from '../ports/index.js';
import { Buyer, Courier, Order, Product } from '../../domain/index.js';
import { COURIERS, getBuyer, getCourier, getProduct } from '../../infrastructure/seed.js';
import { NotFoundError } from '../errors.js';
import { OrderStatus } from '../../domain/order.js';

/** The buyer-facing order. `deliverySecret` is deliberately absent — only reveal-code returns it. */
export interface OrderView {
  orderId: string;
  createdAt: number;
  product: Product;
  buyer: Buyer;
  courier: Courier | null;
<<<<<<< HEAD
  status: OrderStatus;
=======
>>>>>>> 932c435 (feat: separate order dispatch from checkout, allowing merchant to assign courier post-checkout)

  parcelId: string | null;
  contractAddress: string | null;
  mintTxid: string | null;

  /** Oldest → newest. Empty when `parcelId` is null or custody is unreachable. */
  chain: Array<CustodyHop>;
  /** False when the gateway failed on this request. Never a 502 — the order still renders. */
  custodyAvailable: boolean;

  /** Whether the code has been revealed, and when — never the code itself. */
  revealedAt: number | null;
}

export class GetOrderUseCase {
  constructor(
    private readonly orders: OrderRepository,
    private readonly custody: CustodyGateway,
  ) {}

  async execute(orderId: string): Promise<OrderView> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError(`Unknown order: ${orderId}`);
    return toOrderView(this.custody, order);
  }

  async executePending(): Promise<Array<OrderView>> {
    const orders = await this.orders.findPending();
    return Promise.all(orders.map((order) => toOrderView(this.custody, order)));
  }
}

/**
 * Projects an order plus the live custody chain. Shared with `retry-custody`.
 * A gateway failure is reported as data, not as an error: an order that 500s because the chain is
 * briefly unreachable is a worse demo than one that says so.
 */
export async function toOrderView(custody: CustodyGateway, order: Order): Promise<OrderView> {
  const product = getProduct(order.productId);
  if (!product) throw new NotFoundError(`Unknown product: ${order.productId}`);
  const buyer = getBuyer(order.buyerId);
  if (!buyer) throw new NotFoundError(`Unknown buyer: ${order.buyerId}`);
  const courier = order.courierId ? getCourier(order.courierId) ?? null : null;
  if (order.courierId && !courier) throw new NotFoundError(`Unknown courier: ${order.courierId}`);

  let chain: Array<CustodyHop> = [];
  // No parcel means nothing was asked of custody, so nothing failed: `custodyAvailable` stays
  // true and `parcelId: null` is what tells the frontend the mint is still pending.
  let custodyAvailable = true;

  if (order.parcelId) {
    try {
      chain = (await custody.getChain(order.parcelId)).map((hop) => ({
        ...hop,
        actorLabel: actorLabelFor(hop.custodian, buyer),
      }));
    } catch (err) {
      console.error(`[shop] custody chain unreadable for order ${order.orderId}:`, err);
      custodyAvailable = false;
    }
  }

  return {
    orderId: order.orderId,
    createdAt: order.createdAt,
    product,
    buyer,
    courier,
    status: order.status,
    parcelId: order.parcelId,
    contractAddress: order.contractAddress,
    mintTxid: order.mintTxid,
    chain,
    custodyAvailable,
    revealedAt: order.revealedAt,
  };
}

function actorLabelFor(custodian: string, buyer: Buyer): string | undefined {
  if (custodian === buyer.pkh) return buyer.name;
  const courier = COURIERS.find((candidate) => candidate.pkh === custodian);
  return courier ? `${courier.name} · ${courier.company}` : undefined;
}
