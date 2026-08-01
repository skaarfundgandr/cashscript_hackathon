import { IParcelContract } from '../ports/parcel-contract.js';

export class HandoffUseCase {
  constructor(private readonly parcelContract: IParcelContract) {}

  execute(params: { contractId: string; courierPk: Uint8Array; courierSig: Uint8Array; nextCustodian: Uint8Array; registryAttestation: Uint8Array }): Promise<string> {
    return this.parcelContract.handoff(params.contractId, params.courierSig, params.courierPk, params.nextCustodian, params.registryAttestation);
  }
}
