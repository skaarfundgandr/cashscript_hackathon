import { ForbiddenError, NotFoundError } from '../errors.js';
import { CustodyGateway, OrderRepository } from '../ports/index.js';
import { ApproveOrderUseCase } from './approve-order.js';
import { OrderView } from './get-order.js';

/** Access-token compatibility route for the merchant approval workflow. */
export class DispatchOrderUseCase {
  private readonly approveOrder: ApproveOrderUseCase;

  constructor(
    private readonly orders: OrderRepository,
    custody: CustodyGateway,
  ) {
    this.approveOrder = new ApproveOrderUseCase(orders, custody);
  }

  async execute(params: { orderId: string; accessToken: string; courierId: string }): Promise<OrderView> {
    const order = await this.orders.findById(params.orderId);
    if (!order) throw new NotFoundError(`Unknown order: ${params.orderId}`);
    if (order.accessToken !== params.accessToken) {
      throw new ForbiddenError(`Invalid access token for order ${params.orderId}`);
    }
    return this.approveOrder.execute(params.orderId, params.courierId);
  }
}
