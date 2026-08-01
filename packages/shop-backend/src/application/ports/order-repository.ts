import { Order } from '../../domain/index.js';

export interface CustodyAttachment {
  parcelId: string;
  contractAddress: string;
  mintTxid: string;
  deliverySecret: string;
}

export interface OrderRepository {
  save(order: Order): Promise<void>;
  findById(orderId: string): Promise<Order | null>;
  exists(orderId: string): Promise<boolean>;
  attachCustody(orderId: string, custody: CustodyAttachment): Promise<void>;
  /** Stamps the reveal time. Callers must only call this when `revealedAt` is still null. */
  markRevealed(orderId: string, revealedAt: number): Promise<void>;
}
