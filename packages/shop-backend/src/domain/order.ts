/**
 * Merchant processing is shop state; custody state is chain state. They deliberately remain
 * separate: an order cannot have a custody state until a merchant has approved it for dispatch.
 *
 * `createdAt` and `revealedAt` are order metadata, not custody timestamps. They record what the
 * shop did. They never belong on a custody row — the chain knows no times (see B-2).
 */
export type OrderStatus = 'pending' | 'processing' | 'approved';

export interface Order {
  orderId: string;
  accessToken: string;
  productId: string;
  buyerId: string;
<<<<<<< HEAD
  merchantId: string;
  /** Chosen by the merchant when approving the order, before custody is minted. */
  courierId: string | null;
  /** The merchant workflow. Only approved orders may receive a parcel. */
  status: OrderStatus;
=======
  /** Null until the merchant explicitly dispatches the order. */
  courierId: string | null;
>>>>>>> 932c435 (feat: separate order dispatch from checkout, allowing merchant to assign courier post-checkout)

  /**
   * Custody attachment — null until the mint lands. The mint is the slowest, most failure-prone
   * call in the system, so checkout persists the order without it rather than losing the order.
   */
  parcelId: string | null;
  contractAddress: string | null;
  mintTxid: string | null;

  /**
   * Hex. Never leaves the server except through reveal-code. Empty until custody is attached —
   * the custody backend generates it at mint, so `parcelId === null` is the check for "no code
   * yet", never a test on this field.
   */
  deliverySecret: string;
  revealedAt: number | null;
  createdAt: number;
}
