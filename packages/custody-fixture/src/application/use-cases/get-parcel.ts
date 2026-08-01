import { ParcelStore } from '../ports/index.js';
import { CustodyHop, currentHop, Parcel, ParcelState } from '../../domain/parcel.js';

export type B1Mode = 'serve' | 'throw';

/** The real backend's text, verbatim. Everything downstream keys off it, so it must match. */
export function noParcelNftError(contractId: string): Error {
  return new Error(`No parcel NFT UTXO found for contract ${contractId}`);
}

/** Shared by the five transitions. An unknown id reads the same as an unreadable one. */
export async function requireParcel(parcels: ParcelStore, contractId: string): Promise<Parcel> {
  const parcel = await parcels.find(contractId);
  if (!parcel) throw noParcelNftError(contractId);
  return parcel;
}

/**
 * Returns the chain oldest → newest, exactly as the real API does.
 *
 * B-1: the real backend queries UTXOs at the *contract* address, so once confirmDelivery moves the
 * NFT to the recipient it throws and 0x04 becomes unreachable. `B1=throw` replays that failure so
 * the unreadable-parcel path can be built deliberately; `B1=serve` (default) returns the delivered
 * hop, which is what lets Stage 4 exist at all. See DIVERGENCE.md, D-2.
 */
export class GetParcelUseCase {
  constructor(
    private readonly parcels: ParcelStore,
    private readonly b1: B1Mode,
  ) {}

  async execute(contractId: string): Promise<Array<CustodyHop>> {
    const parcel = await requireParcel(this.parcels, contractId);
    if (this.b1 === 'throw' && currentHop(parcel).state === ParcelState.Delivered) {
      throw noParcelNftError(contractId);
    }
    return parcel.hops;
  }
}
