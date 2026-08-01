import { IParcelContract } from '../ports/parcel-contract.js';

export class ConfirmDeliveryUseCase {
  constructor(private readonly parcelContract: IParcelContract) {}

  execute(params: { contractId: string; recipientPk: Uint8Array; recipientSig: Uint8Array }): Promise<string> {
    return this.parcelContract.confirmDelivery(params.contractId, params.recipientSig, params.recipientPk);
  }
}
