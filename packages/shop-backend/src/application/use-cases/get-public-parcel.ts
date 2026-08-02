import { CustodyGateway, CustodyHop } from '../ports/index.js';
import { COURIERS } from '../../infrastructure/seed.js';
import { NotFoundError } from '../errors.js';

/**
 * The public custody record for a parcel. No buyer, no product, no delivery secret — this is the
 * shape anyone holding the parcel address may read, the same way a courier tracking number works.
 */
export interface PublicParcel {
  parcelId: string;
  contractAddress: string;
  /** The chain's first hop, or null if the chain is empty. */
  mintTxid: string | null;
  /** Oldest → newest. Couriers are labelled; the recipient hop deliberately is not. */
  chain: Array<CustodyHop>;
}

export class GetPublicParcelUseCase {
  constructor(private readonly custody: CustodyGateway) {}

  /**
   * Unlike `GetOrderUseCase`, there is no order to fall back to if the chain can't be read: a
   * public lookup has nothing else to key off of, so any `getChain` failure surfaces as 404. This
   * collapses "no such parcel" with "chain temporarily unreachable" into the same response, which
   * mirrors an ambiguity already accepted at the custody layer itself (an unknown contract id and
   * an unreadable one throw the same error there today).
   */
  async execute(parcelId: string): Promise<PublicParcel> {
    let chain: Array<CustodyHop>;
    try {
      chain = await this.custody.getChain(parcelId);
    } catch {
      throw new NotFoundError(`Unknown parcel: ${parcelId}`);
    }

    return {
      parcelId,
      contractAddress: parcelId,
      mintTxid: chain[0]?.txid ?? null,
      chain: chain.map((hop) => ({ ...hop, actorLabel: publicActorLabelFor(hop.custodian) })),
    };
  }
}

/** Couriers are named; the recipient is not. `Ana Reyes` must never appear on this surface. */
function publicActorLabelFor(custodian: string): string | undefined {
  const courier = COURIERS.find((candidate) => candidate.pkh === custodian);
  return courier ? `${courier.name} · ${courier.company}` : undefined;
}
