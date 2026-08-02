import { CustodyGateway, OrderRepository } from '../ports/index.js';
import { ConflictError, CustodyUnavailableError, ForbiddenError, NotFoundError } from '../errors.js';
import { attachCustody } from './checkout.js';
import { OrderView, toOrderView } from './get-order.js';

/**
 * The escape hatch for an order whose mint failed. Without it, a failed mint mid-recording means
 * restarting the whole demo.
 */
export class RetryCustodyUseCase {
  constructor(
    private readonly orders: OrderRepository,
    private readonly custody: CustodyGateway,
  ) {}

  async execute(params: { orderId: string; accessToken: string }): Promise<OrderView> {
    const order = await this.orders.findById(params.orderId);
    if (!order) throw new NotFoundError(`Unknown order: ${params.orderId}`);
    if (order.accessToken !== params.accessToken) {
      throw new ForbiddenError(`Invalid access token for order ${params.orderId}`);
    }
    if (order.status !== 'approved') {
      throw new ConflictError(`Order ${params.orderId} is waiting for merchant approval`);
    }
    if (order.parcelId) {
      throw new ConflictError(`Order ${params.orderId} already has a parcel: ${order.parcelId}`);
    }
    if (!order.courierId) {
      throw new ConflictError(`Order ${params.orderId} has not been dispatched yet`);
    }

    try {
      const attached = await attachCustody(this.orders, this.custody, order);
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
