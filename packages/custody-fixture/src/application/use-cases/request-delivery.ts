import { CourierKeyStore, ParcelStore } from '../ports/index.js';
import { currentHop, ParcelState } from '../../domain/parcel.js';
import { fakeTxid } from '../../infrastructure/keys.js';
import { latency } from '../../infrastructure/latency.js';
import { requireParcel } from './get-parcel.js';

/** Only from 0x00, by the current custodian. Custodian is preserved — only the state moves. */
export class RequestDeliveryUseCase {
  constructor(
    private readonly parcels: ParcelStore,
    private readonly couriers: CourierKeyStore,
  ) {}

  async execute(contractId: string, params: { courierId: string }): Promise<string> {
    await latency();

    const parcel = await requireParcel(this.parcels, contractId);
    const current = currentHop(parcel);
    const courierPkh = await this.couriers.pkhOf(params.courierId);

    if (current.state !== ParcelState.InCustody) {
      throw new Error(`requestDelivery requires state ${ParcelState.InCustody}, parcel is ${current.state}`);
    }
    if (current.custodian !== courierPkh) {
      throw new Error(`requestDelivery requires the current custodian; ${params.courierId} is not holding this parcel`);
    }

    const txid = fakeTxid();
    await this.parcels.appendHop(contractId, { txid, state: ParcelState.DeliveryPending, custodian: courierPkh });
    return txid;
  }
}
