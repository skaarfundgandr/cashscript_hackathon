import { OrderRepository } from '../ports/index.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../errors.js';

export interface RevealCodeResult {
  secret: string;
  revealedAt: number;
}

/**
 * The only path by which the delivery code plaintext leaves this server. The reveal is an
 * auditable server event, not a localStorage flag a refresh could forge.
 */
export class RevealCodeUseCase {
  constructor(private readonly orders: OrderRepository) {}

  async execute(params: { orderId: string; accessToken: string }): Promise<RevealCodeResult> {
    const order = await this.orders.findById(params.orderId);
    if (!order) throw new NotFoundError(`Unknown order: ${params.orderId}`);
    if (order.accessToken !== params.accessToken) {
      throw new ForbiddenError(`Invalid access token for order ${params.orderId}`);
    }
    if (!order.parcelId) {
      throw new ConflictError(`Order ${params.orderId} has no delivery code yet — custody is not attached`);
    }

    // Idempotent: the first call stamps the time, later calls return the same one. Per
    // FRONTEND-FLOW step 18 the reveal time has to stay on screen.
    if (order.revealedAt !== null) {
      return { secret: order.deliverySecret, revealedAt: order.revealedAt };
    }

    const revealedAt = Date.now();
    await this.orders.markRevealed(order.orderId, revealedAt);
    return { secret: order.deliverySecret, revealedAt };
  }
}
