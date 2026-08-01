export enum ParcelState {
  InCustody = 0,
  HandoffPending = 1,
  DeliveryPending = 2,
  Delivered = 4,
}

export interface Commitment {
  state: ParcelState;
  custodian: Uint8Array;
  reason: number;
}

export interface ParcelUtxo {
  txid: string;
  vout: number;
  satoshis: bigint;
  category: string;
  commitment: Commitment;
}

export type Pkh = Uint8Array;

export type Hex = string;
