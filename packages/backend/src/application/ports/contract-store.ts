import { ParcelUtxo } from '../../domain/index.js';

export interface ContractRecord {
  contractAddress: string;
  recipientPkh: string;
  merchantPkh: string;
  deliveryCodeHash: string;
  registryPk: string;
}

export interface IContractStore {
  getContractAddress(contractId: string): string;
  getParcelUtxo(contractId: string): Promise<ParcelUtxo | null>;
  save(record: ContractRecord): void;
  find(contractId: string): ContractRecord | null;
}
