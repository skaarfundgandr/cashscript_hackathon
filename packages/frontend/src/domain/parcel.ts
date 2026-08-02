export interface ParcelHop {
  txid: string;
  state: number;
  custodian: string;
  actorLabel?: string;
  timestamp?: number;
  blockHeight?: number;
}

export interface ParcelView {
  parcelId: string | null;
  contractAddress: string | null;
  mintTxid: string | null;
  hops: ParcelHop[];
  custodyAvailable: boolean;
}

export const PARCEL_STATE_LABELS: Record<number, string> = {
  0x00: 'In custody',
  0x01: 'Awaiting acceptance',
  0x02: 'Out for delivery',
  0x04: 'Delivered',
};

export function parcelStateLabel(state: number): string {
  return PARCEL_STATE_LABELS[state] ?? `0x${state.toString(16).padStart(2, '0')}`;
}

export function parcelViewFromOrder(order: {
  parcelId: string | null;
  contractAddress: string | null;
  mintTxid: string | null;
  chain: ParcelHop[];
  custodyAvailable: boolean;
}): ParcelView {
  return {
    parcelId: order.parcelId,
    contractAddress: order.contractAddress,
    mintTxid: order.mintTxid,
    hops: order.chain,
    custodyAvailable: order.custodyAvailable,
  };
}
