import jtExpressLogo from '../../assets/couriers/jt-express-demo.png';
import ninjaVanLogo from '../../assets/couriers/ninja-van-demo.png';
import type { ShopCustodyHop } from '../../infrastructure/api-client.js';

const COURIER_A_PKH = '06afd46bcdfd22ef94ac122aa11f241244a37ecc';
const COURIER_B_PKH = '7dd65592d0ab2fe0d0257d571abf032cd9db93dc';

/** Company marks only — no individual is pictured, so this stays inside the labelling policy. */
export const COURIER_LOGOS: Record<string, string> = {
  [COURIER_A_PKH]: jtExpressLogo,
  [COURIER_B_PKH]: ninjaVanLogo,
};

export function logoOf(hop: ShopCustodyHop): string | null {
  return COURIER_LOGOS[hop.custodian] ?? null;
}

/**
 * Every hop's custodian is a courier — the covenant keeps the delivering courier's pkh even in
 * the 0x04 commitment — so an unlabelled hop is an unknown courier, never the recipient.
 */
export function actorOf(hop: ShopCustodyHop): string {
  return hop.actorLabel ?? `Courier ${truncate(hop.custodian)}`;
}

/** What each transition required. */
export const STATE_PROOF: Record<number, string> = {
  0x00: 'Signed by the courier taking custody',
  0x01: 'Signed by the releasing courier, with a registry attestation of the next',
  0x02: 'Signed by the courier holding the parcel',
  0x04: 'Signed by the recipient, with the delivery code',
};

export function truncate(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 9)}…${value.slice(-7)}`;
}

export function explorerTx(txid: string): string {
  return `https://chipnet.imaginary.cash/tx/${txid}`;
}

export function explorerAddress(address: string): string {
  return `https://chipnet.imaginary.cash/address/${address}`;
}

export function clockOf(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

/**
 * The 22-byte NFT commitment: state(1) + custodian(20) + reason(1).
 *
 * Derived, not fetched. `shared/encodeCommitment` builds exactly these bytes, and `reason` is
 * 0x00 for everything in scope today — so the frontend can reconstruct the on-chain commitment
 * from data the chain response already carries. If `reason` ever becomes non-zero this display
 * goes wrong, and the honest fix is for the backend to return the commitment it actually read
 * rather than us rebuilding it.
 */
export function commitmentOf(hop: ShopCustodyHop): string {
  return `${hop.state.toString(16).padStart(2, '0')}${hop.custodian}00`;
}
