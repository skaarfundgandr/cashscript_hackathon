/**
 * An order carries no status field. The order's state is the custody chain's state, read through
 * the CustodyGateway on every request. A duplicated status column would drift out of sync with
 * the chain, which is the one thing this system claims cannot happen.
 *
 * `createdAt` and `revealedAt` are order metadata, not custody timestamps. They record what the
 * shop did. They never belong on a custody row — the chain knows no times (see B-2).
 */
export interface Order {
  orderId: string;
  accessToken: string;
  productId: string;
  buyerId: string;
  courierId: string;

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
