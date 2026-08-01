import { Courier } from '../../domain/index.js';

/**
 * One hop of the custody chain, exactly as the custody API returns it.
 *
 * `state` is the raw commitment byte (0x00 InCustody, 0x01 HandoffPending, 0x02 DeliveryPending,
 * 0x04 Delivered). It is typed as a number on purpose: the shop never interprets it, and an
 * unknown byte must reach the UI to be rendered, not throw here.
 *
 * There is no timestamp. The custody backend declares one and never populates it (B-2).
 */
export interface CustodyHop {
  txid: string;
  state: number;
  custodian: string;
}

export interface CustodyMint {
  parcelId: string;
  address: string;
  mintTxid: string;
  deliverySecret: string;
}

export interface CustodyGateway {
  createParcel(courier: Courier): Promise<CustodyMint>;
  getChain(parcelId: string): Promise<Array<CustodyHop>>;
}
