import { CourierKeyStore, ParcelStore } from '../ports/index.js';
import { currentHop, ParcelState } from '../../domain/parcel.js';
import { fakeTxid } from '../../infrastructure/keys.js';
import { latency } from '../../infrastructure/latency.js';
import { requireParcel } from './get-parcel.js';

/**
 * Only from 0x00, only by the current custodian. The commitment moves to HandoffPending with the
 * *next* courier as custodian — the parcel is claimed but not yet accepted.
 */
export class HandoffUseCase {
  constructor(
    private readonly parcels: ParcelStore,
    private readonly couriers: CourierKeyStore,
  ) {}

  async execute(contractId: string, params: { courierId: string; nextCourierId: string }): Promise<string> {
    await latency();

    const parcel = await requireParcel(this.parcels, contractId);
    const current = currentHop(parcel);
    const courierPkh = await this.couriers.pkhOf(params.courierId);

    if (current.state !== ParcelState.InCustody) {
      throw new Error(`handoff requires state ${ParcelState.InCustody}, parcel is ${current.state}`);
    }
    if (current.custodian !== courierPkh) {
      throw new Error(`handoff requires the current custodian; ${params.courierId} is not holding this parcel`);
    }

    const txid = fakeTxid();
    const nextCustodian = await this.couriers.pkhOf(params.nextCourierId);
    await this.parcels.appendHop(contractId, { txid, state: ParcelState.HandoffPending, custodian: nextCustodian });
    return txid;
  }
}
