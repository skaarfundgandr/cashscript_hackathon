import { CustodyGateway, CustodyHop, CustodyMint } from '../application/ports/index.js';
import { Courier } from '../domain/index.js';

/**
 * The only adapter for the custody API. Selecting the fixture (:3002) or the real backend (:3000)
 * is a URL, not a class.
 *
 * The A/B translation lives here because it is an infrastructure detail of this one adapter, not
 * a domain fact. `packages/custody-fixture` accepts any courier id and ignores this map; the real
 * backend's `getCourier` (fixtures.ts:22) is a hardcoded `{ A, B }` and throws on anything else,
 * because it holds only those two private keys.
 */
const CUSTODY_KEY: Record<string, 'A' | 'B'> = {
  'jnt-mgl': 'A',
  'ninjavan-rey': 'B',
};

export class HttpCustodyGateway implements CustodyGateway {
  constructor(private readonly baseUrl: string) {}

  async createParcel(courier: Courier): Promise<CustodyMint> {
    const res = await fetch(`${this.baseUrl}/parcel/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ courierId: custodyKeyOf(courier) }),
    });
    if (!res.ok) throw new Error(`create failed (${res.status}): ${await res.text()}`);

    // `create` is the one route that returns JSON. The four mutations return a bare text/plain
    // txid — this gateway never calls them, the couriers' scanner does.
    const body = (await res.json()) as { contractId: string; address: string; txid: string; deliverySecret: string };
    return {
      // contractId === address; the controller returns the same value twice. The contract address
      // is the parcel id, verbatim — never a short id.
      parcelId: body.contractId,
      address: body.address,
      mintTxid: body.txid,
      deliverySecret: body.deliverySecret,
    };
  }

  async getChain(parcelId: string): Promise<Array<CustodyHop>> {
    // The id is a cashaddr and contains a colon. It is legal raw in a path segment (RFC 3986
    // §3.3), but encoding is the safe side of that bet against both servers.
    const res = await fetch(`${this.baseUrl}/parcel/${encodeURIComponent(parcelId)}`);
    if (!res.ok) throw new Error(`getChain failed (${res.status}): ${await res.text()}`);

    // Oldest → newest, as returned. Never re-sorted here: the order is the chain's, not ours.
    const body = (await res.json()) as Array<{ txid: string; state: number; custodian: string }>;
    return body.map((hop) => ({ txid: hop.txid, state: hop.state, custodian: hop.custodian }));
  }
}

/**
 * Falls back to the raw id so the fixture — which accepts arbitrary courier ids — still works for
 * couriers outside the map. Against the real backend an unmapped id is rejected server-side, which
 * is D-1 in the divergence audit and a limitation of code we are not touching.
 */
function custodyKeyOf(courier: Courier): string {
  return CUSTODY_KEY[courier.id] ?? courier.id;
}
