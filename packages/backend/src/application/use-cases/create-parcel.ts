import { IParcelContract } from '../ports/parcel-contract.js';
import { REGISTRY } from '../../infrastructure/fixtures.js';

export const PARCEL_FUNDING_SATOSHIS = 25000n;

export class CreateParcelUseCase {
  constructor(private readonly parcelContract: IParcelContract) {}

  execute(params: { merchantPk: Uint8Array; recipientPkh: Uint8Array; courierPkh: Uint8Array; deliveryCodeHash: Uint8Array }): Promise<{ contractId: string; address: string; txid: string }> {
    return this.parcelContract.deploy(params.merchantPk, params.recipientPkh, params.courierPkh, PARCEL_FUNDING_SATOSHIS, params.deliveryCodeHash, REGISTRY.publicKey);
  }
}
