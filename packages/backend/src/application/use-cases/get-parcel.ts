import { IParcelContract, ParcelHistoryEntry } from '../ports/parcel-contract.js';

export class GetParcelUseCase {
  constructor(private readonly parcelContract: IParcelContract) {}

  execute(contractId: string): Promise<Array<ParcelHistoryEntry>> {
    return this.parcelContract.getParcelHistory(contractId);
  }
}
