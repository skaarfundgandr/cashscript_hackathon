import { CourierKeyStore, ParcelStore } from '../ports/index.js';
import { ParcelState } from '../../domain/parcel.js';
import { fakeParcelId, fakeTxid, randomHex } from '../../infrastructure/keys.js';
import { latency } from '../../infrastructure/latency.js';
import { RECIPIENT_PKH } from '../../infrastructure/fixture-keys.js';

export interface CreateParcelResult {
  contractId: string;
  address: string;
  txid: string;
  deliverySecret: string;
}

export class CreateParcelUseCase {
  constructor(
    private readonly parcels: ParcelStore,
    private readonly couriers: CourierKeyStore,
  ) {}

  async execute(params: { courierId: string; recipientPkh?: string }): Promise<CreateParcelResult> {
    await latency();

    const custodian = await this.couriers.pkhOf(params.courierId);
    const id = fakeParcelId();
    const txid = fakeTxid();
    const deliverySecret = randomHex(32);

    await this.parcels.create({
      id,
      recipientPkh: params.recipientPkh ?? RECIPIENT_PKH,
      deliverySecret,
      hops: [{ txid, state: ParcelState.InCustody, custodian }],
    });

    // contractId === address: the real controller returns the same value twice.
    return { contractId: id, address: id, txid, deliverySecret };
  }
}
