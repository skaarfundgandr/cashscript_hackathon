import { CustodyHop, Parcel } from '../../domain/parcel.js';

export interface ParcelStore {
  create(parcel: Parcel): Promise<void>;
  find(id: string): Promise<Parcel | null>;
  appendHop(id: string, hop: CustodyHop): Promise<void>;
}

/**
 * Courier ids are arbitrary here. A signing keypair is minted per courier on first use and its
 * pkh becomes the custodian on the chain — the "device signing key provisioned at onboarding"
 * model. Keys are persisted so a courier's pkh survives a restart.
 */
export interface CourierKeyStore {
  pkhOf(courierId: string): Promise<string>;
}
