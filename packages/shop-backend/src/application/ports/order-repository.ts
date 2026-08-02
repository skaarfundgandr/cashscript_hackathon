import { Order, OrderStatus } from '../../domain/index.js';

export interface CustodyAttachment {
  parcelId: string;
  contractAddress: string;
  mintTxid: string;
  deliverySecret: string;
}

export interface OrderRepository {
  save(order: Order): Promise<void>;
  findById(orderId: string): Promise<Order | null>;
  findPending(): Promise<Array<Order>>;
  /** Every order whose mint landed, newest first. Orders still waiting on a parcel are excluded. */
  listWithParcels(): Promise<Array<Order>>;
  exists(orderId: string): Promise<boolean>;
<<<<<<< HEAD
  /** Atomically moves an order through merchant processing. */
  transitionStatus(orderId: string, from: OrderStatus, to: OrderStatus): Promise<boolean>;
  assignCourier(orderId: string, courierId: string | null): Promise<void>;
=======
  /** Assigns only an unassigned order. False means another dispatch won the race. */
  assignCourier(orderId: string, courierId: string): Promise<boolean>;
>>>>>>> 932c435 (feat: separate order dispatch from checkout, allowing merchant to assign courier post-checkout)
  attachCustody(orderId: string, custody: CustodyAttachment): Promise<void>;
  /** Stamps the reveal time. Callers must only call this when `revealedAt` is still null. */
  markRevealed(orderId: string, revealedAt: number): Promise<void>;
}
