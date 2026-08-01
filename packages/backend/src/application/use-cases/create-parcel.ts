import { IParcelContract } from '../ports/parcel-contract.js';

export const PARCEL_FUNDING_SATOSHIS = 10000n;

export class CreateParcelUseCase {
  constructor(private readonly parcelContract: IParcelContract) {}

  execute(params: { merchantPk: Uint8Array; recipientPkh: Uint8Array; courierPkh: Uint8Array }): Promise<{ contractId: string; address: string; txid: string }> {
    return this.parcelContract.deploy(params.merchantPk, params.recipientPkh, params.courierPkh, PARCEL_FUNDING_SATOSHIS);
  }
}
