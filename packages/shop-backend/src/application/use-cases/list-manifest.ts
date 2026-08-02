import { OrderRepository } from '../ports/index.js';
import { Buyer, Courier, Product } from '../../domain/index.js';
import { getBuyer, getCourier, getProduct } from '../../infrastructure/seed.js';

/**
 * One dispatchable parcel, as a courier's terminal needs to see it before it reads the chain.
 *
 * Deliberately absent: any notion of state, and the delivery secret. State is the chain's to
 * answer — the courier app reads it per parcel and works out whose hands the parcel is in. An
 * order-side status column would be the one thing this system claims cannot drift.
 *
 * `assignedCourier` is who the shop selected at dispatch. It is the *origin* of the parcel,
 * not its current custodian, and stops being the answer the moment a handoff lands.
 */
export interface ManifestEntry {
  orderId: string;
  createdAt: number;
  parcelId: string;
  contractAddress: string | null;
  mintTxid: string | null;
  product: Product;
  buyer: Buyer;
  assignedCourier: Courier | null;
}

/**
 * The dispatch manifest: every parcel the shop has minted.
 *
 * Not filtered by courier, and that is the point. The shop stamps `courierId` once at dispatch and
 * never revises it, so filtering here would leave the second courier with an empty screen after a
 * handoff — custody moves on chain, not in this database. Unassigned orders are absent because
 * they have no parcel label or custody chain for a courier to act on.
 */
export class ListManifestUseCase {
  constructor(private readonly orders: OrderRepository) {}

  async execute(): Promise<Array<ManifestEntry>> {
    const orders = await this.orders.listWithParcels();

    return orders.flatMap((order) => {
      const product = getProduct(order.productId);
      const buyer = getBuyer(order.buyerId);
      // A row whose seed data has gone is dropped rather than thrown: one bad row must not take
      // the whole manifest — and with it the courier's only screen — down with it.
      if (!product || !buyer || !order.parcelId) return [];

      return [{
        orderId: order.orderId,
        createdAt: order.createdAt,
        parcelId: order.parcelId,
        contractAddress: order.contractAddress,
        mintTxid: order.mintTxid,
        product,
        buyer,
        // Null until a merchant approves the order and picks who carries it.
        assignedCourier: order.courierId ? getCourier(order.courierId) ?? null : null,
      }];
    });
  }
}
