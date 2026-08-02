import { CustodyGateway, OrderRepository } from '../ports/index.js';
import { ConflictError, CustodyUnavailableError, NotFoundError } from '../errors.js';
import { attachCustody } from './checkout.js';
import { OrderView, toOrderView } from './get-order.js';
import { getCourier } from '../../infrastructure/seed.js';

/**
 * The merchant's processing step. Claim the order before minting so two dashboard clicks cannot
 * create two parcels; a failed mint returns it to the pending queue for a later retry.
 */
export class ApproveOrderUseCase {
  constructor(
    private readonly orders: OrderRepository,
    private readonly custody: CustodyGateway,
  ) {}

  async execute(orderId: string, courierId: string): Promise<OrderView> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError(`Unknown order: ${orderId}`);
    if (order.status === 'approved') return toOrderView(this.custody, order);
    if (order.status === 'processing') throw new ConflictError(`Order ${orderId} is already being processed`);
    const courier = getCourier(courierId);
    if (!courier) throw new NotFoundError(`Unknown courier: ${courierId}`);

    const claimed = await this.orders.transitionStatus(orderId, 'pending', 'processing');
    if (!claimed) throw new ConflictError(`Order ${orderId} is no longer pending`);

    try {
      await this.orders.assignCourier(orderId, courier.id);
      const assignedOrder = { ...order, courierId: courier.id };
      const attached = await attachCustody(this.orders, this.custody, assignedOrder);
      await this.orders.transitionStatus(orderId, 'processing', 'approved');
      return toOrderView(this.custody, { ...attached, status: 'approved' });
    } catch (cause) {
      await this.orders.assignCourier(orderId, null);
      await this.orders.transitionStatus(orderId, 'processing', 'pending');
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new CustodyUnavailableError(`Could not approve order ${orderId}: ${message}`);
    }
  }
}
