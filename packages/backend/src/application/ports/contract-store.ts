import { ParcelUtxo } from '../../domain/index.js';

export interface IContractStore {
  getContractAddress(contractId: string): string;
  getParcelUtxo(contractId: string): Promise<ParcelUtxo | null>;
}
