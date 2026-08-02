import { ConflictError, CustodyUnavailableError, ForbiddenError, NotFoundError } from '../errors.js';
import { CustodyGateway, OrderRepository } from '../ports/index.js';
import { getCourier } from '../../infrastructure/seed.js';
import { attachCustody } from './checkout.js';
import { OrderView, toOrderView } from './get-order.js';

/** Assigns the first courier, then mints the parcel with that courier as initial custodian. */
export class DispatchOrderUseCase {
  constructor(
    private readonly orders: OrderRepository,
    private readonly custody: CustodyGateway,
  ) {}

  async execute(params: { orderId: string; accessToken: string; courierId: string }): Promise<OrderView> {
    const order = await this.orders.findById(params.orderId);
    if (!order) throw new NotFoundError(`Unknown order: ${params.orderId}`);
    if (order.accessToken !== params.accessToken) {
      throw new ForbiddenError(`Invalid access token for order ${params.orderId}`);
    }
    if (order.courierId) {
      throw new ConflictError(`Order ${params.orderId} is already assigned to courier ${order.courierId}`);
    }

    const courier = getCourier(params.courierId);
    if (!courier) throw new NotFoundError(`Unknown courier: ${params.courierId}`);

    const assigned = await this.orders.assignCourier(order.orderId, courier.id);
    if (!assigned) throw new ConflictError(`Order ${params.orderId} was already dispatched`);

    const dispatchedOrder = { ...order, courierId: courier.id };
    try {
      const attached = await attachCustody(this.orders, this.custody, dispatchedOrder);
      return toOrderView(this.custody, attached);
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      throw new CustodyUnavailableError(`Custody mint failed: ${message(err)}`);
    }
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
