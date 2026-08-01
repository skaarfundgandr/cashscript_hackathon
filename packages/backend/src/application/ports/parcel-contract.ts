import { ParcelState } from '../../domain/index.js';

export interface ParcelHistoryEntry {
  txid: string;
  state: ParcelState;
  custodian: string;
  timestamp?: number;
}

export interface IParcelContract {
  deploy(merchantPk: Uint8Array, recipientPkh: Uint8Array, initialCustodian: Uint8Array, fundingSatoshis: bigint, deliveryCodeHash: Uint8Array, registryPk: Uint8Array): Promise<{ contractId: string; address: string; txid: string; deliverySecret?: Uint8Array }>;
  handoff(contractId: string, courierSig: Uint8Array, courierPk: Uint8Array, nextCustodian: Uint8Array, registryAttestation: Uint8Array): Promise<string>;
  acceptHandoff(contractId: string, courierSig: Uint8Array, courierPk: Uint8Array): Promise<string>;
  requestDelivery(contractId: string, courierSig: Uint8Array, courierPk: Uint8Array): Promise<string>;
  confirmDelivery(contractId: string, recipientSig: Uint8Array, recipientPk: Uint8Array, deliveryCode: Uint8Array): Promise<string>;
  getParcelHistory(contractId: string): Promise<Array<ParcelHistoryEntry>>;
}
