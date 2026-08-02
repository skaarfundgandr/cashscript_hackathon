import { ParcelStore } from '../ports/index.js';
import { currentHop, ParcelState } from '../../domain/parcel.js';
import { fakeTxid } from '../../infrastructure/keys.js';
import { latency } from '../../infrastructure/latency.js';
import { requireParcel } from './get-parcel.js';

/**
 * Only from 0x02, and only with the matching secret. `courierId` is accepted and discarded — the
 * real backend always signs with the recipient key, and so does the story: the buyer's scan is
 * what ends the chain.
 *
 * On success the NFT leaves the covenant for the recipient, which is what makes 0x04 terminal.
 */
export class ConfirmDeliveryUseCase {
  constructor(private readonly parcels: ParcelStore) {}

  async execute(contractId: string, params: { courierId: string; deliveryCode: string }): Promise<string> {
    await latency();

    const parcel = await requireParcel(this.parcels, contractId);
    const current = currentHop(parcel);

    if (current.state !== ParcelState.DeliveryPending) {
      throw new Error(`confirmDelivery requires state ${ParcelState.DeliveryPending}, parcel is ${current.state}`);
    }
    if (params.deliveryCode.toLowerCase() !== parcel.deliverySecret) {
      throw new Error('confirmDelivery rejected: delivery code does not match');
    }

    const txid = fakeTxid();
    // The courier's pkh, not the recipient's: the covenant requires the 0x04 commitment to be
    // `0x04 + tail`, i.e. it keeps the delivering courier. The recipient signs but is never
    // named in the commitment, and the fixture must read the same as chipnet does.
    await this.parcels.appendHop(contractId, { txid, state: ParcelState.Delivered, custodian: current.custodian });
    return txid;
  }
}
