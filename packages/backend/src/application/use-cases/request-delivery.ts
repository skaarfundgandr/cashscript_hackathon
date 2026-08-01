import { IParcelContract } from '../ports/parcel-contract.js';

export class RequestDeliveryUseCase {
  constructor(private readonly parcelContract: IParcelContract) {}

  execute(params: { contractId: string; courierPk: Uint8Array; courierSig: Uint8Array }): Promise<string> {
    return this.parcelContract.requestDelivery(params.contractId, params.courierSig, params.courierPk);
  }
}
