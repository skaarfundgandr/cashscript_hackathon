import { CourierKeyStore, ParcelStore } from '../ports/index.js';
import { currentHop, ParcelState } from '../../domain/parcel.js';
import { fakeTxid } from '../../infrastructure/keys.js';
import { latency } from '../../infrastructure/latency.js';
import { requireParcel } from './get-parcel.js';

/**
 * Only from 0x01, only by the named courier. This signature is the liability transfer — it is why
 * the chain can say who was holding the parcel at any point without anyone being asked.
 */
export class AcceptHandoffUseCase {
  constructor(
    private readonly parcels: ParcelStore,
    private readonly couriers: CourierKeyStore,
  ) {}

  async execute(contractId: string, params: { courierId: string }): Promise<string> {
    await latency();

    const parcel = await requireParcel(this.parcels, contractId);
    const current = currentHop(parcel);
    const courierPkh = await this.couriers.pkhOf(params.courierId);

    if (current.state !== ParcelState.HandoffPending) {
      throw new Error(`acceptHandoff requires state ${ParcelState.HandoffPending}, parcel is ${current.state}`);
    }
    if (current.custodian !== courierPkh) {
      throw new Error(`acceptHandoff requires the named custodian; this parcel was handed to someone else`);
    }

    const txid = fakeTxid();
    await this.parcels.appendHop(contractId, { txid, state: ParcelState.InCustody, custodian: courierPkh });
    return txid;
  }
}
