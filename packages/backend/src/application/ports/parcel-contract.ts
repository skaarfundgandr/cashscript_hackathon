export interface IParcelContract {
  deploy(merchantPk: Uint8Array, recipientPkh: Uint8Array, initialCustodian: Uint8Array, fundingSatoshis: bigint): Promise<{ contractId: string; address: string; txid: string }>;
  handoff(contractId: string, courierSig: Uint8Array, courierPk: Uint8Array, nextCustodian: Uint8Array): Promise<string>;
  acceptHandoff(contractId: string, courierSig: Uint8Array, courierPk: Uint8Array): Promise<string>;
  requestDelivery(contractId: string, courierSig: Uint8Array, courierPk: Uint8Array): Promise<string>;
  confirmDelivery(contractId: string, recipientSig: Uint8Array, recipientPk: Uint8Array): Promise<string>;
  reject(contractId: string, recipientSig: Uint8Array, recipientPk: Uint8Array): Promise<string>;
  returnToSender(contractId: string, courierSig: Uint8Array, courierPk: Uint8Array): Promise<string>;
  confirmReturn(contractId: string, merchantSig: Uint8Array, merchantPk: Uint8Array): Promise<string>;
}
