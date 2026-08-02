export * from '@hermes/shared';

/** One hop, in the exact shape `packages/backend` returns. No timestamp — it has none (B-2). */
export interface CustodyHop {
  txid: string;
  state: number;
  custodian: string;
}

export interface Parcel {
  id: string;
  /** Where the NFT goes on delivery. Defaults to the RECIPIENT fixture, as the real backend does. */
  recipientPkh: string;
  /** Hex. The real backend keeps only the hash; this fixture keeps the plaintext (see D-3). */
  deliverySecret: string;
  /** Oldest → newest. The mint is hops[0], current state is the last. */
  hops: Array<CustodyHop>;
}

export function currentHop(parcel: Parcel): CustodyHop {
  const hop = parcel.hops[parcel.hops.length - 1];
  if (!hop) throw new Error(`Parcel ${parcel.id} has no hops`);
  return hop;
}
