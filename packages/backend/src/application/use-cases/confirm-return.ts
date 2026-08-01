import { IParcelContract } from '../ports/parcel-contract.js';

export class ConfirmReturnUseCase {
  constructor(private readonly parcelContract: IParcelContract) {}

  execute(params: { contractId: string; merchantPk: Uint8Array; merchantSig: Uint8Array }): Promise<string> {
    return this.parcelContract.confirmReturn(params.contractId, params.merchantSig, params.merchantPk);
  }
}
