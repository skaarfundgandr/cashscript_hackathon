/**
 * The courier roster.
 *
 * Two facts about the same person live here because two systems name couriers differently:
 * `id` is the shop's id (`packages/shop-backend/src/infrastructure/seed.ts`), `custodyKey` is what
 * the custody API accepts (`packages/backend/src/infrastructure/fixtures.ts` holds exactly two
 * private keys, `A` and `B`, and throws on anything else). `pkh` is the hash160 those keys derive
 * to — it is what the chain records in every commitment, so it is how this app answers
 * "am I the one holding this?".
 *
 * The demo has no login. A courier types their id and that is the whole session.
 */
export interface CourierIdentity {
  id: string;
  custodyKey: string;
  name: string;
  company: string;
  /** hash160 of the courier's public key, lowercase hex. Matches `custodian` on a custody hop. */
  pkh: string;
}

export const COURIER_ROSTER: CourierIdentity[] = [
  {
    id: 'jnt-mgl',
    custodyKey: 'A',
    name: 'Miguel Santos',
    company: 'J&T Express',
    pkh: '06afd46bcdfd22ef94ac122aa11f241244a37ecc',
  },
  {
    id: 'ninjavan-rey',
    custodyKey: 'B',
    name: 'Rey Delgado',
    company: 'Ninja Van',
    pkh: '7dd65592d0ab2fe0d0257d571abf032cd9db93dc',
  },
];

const norm = (value: string) => value.trim().toLowerCase();

/** Accepts the shop id, the custody key, or the courier's first name. Case and spacing are free. */
export function resolveCourier(input: string): CourierIdentity | null {
  const key = norm(input);
  if (!key) return null;
  return (
    COURIER_ROSTER.find((courier) =>
      norm(courier.id) === key ||
      norm(courier.custodyKey) === key ||
      norm(courier.pkh) === key ||
      norm(courier.name) === key ||
      norm(courier.name.split(' ')[0]!) === key) ?? null
  );
}

export function courierByPkh(pkh: string): CourierIdentity | null {
  const key = norm(pkh);
  return COURIER_ROSTER.find((courier) => courier.pkh === key) ?? null;
}

/** What to call whoever holds a parcel, when it is not the signed-in courier. */
export function labelForPkh(pkh: string): string {
  const known = courierByPkh(pkh);
  return known ? `${known.name} · ${known.company}` : `Courier ${shortHash(pkh)}`;
}

/** Middle-truncated hex, the one place hashes are allowed to be shortened. */
export function shortHash(value: string, lead = 6, tail = 4): string {
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

/** A cashaddr is long and its prefix carries no information on a phone. Drop it, keep the tail. */
export function shortParcelId(parcelId: string): string {
  const body = parcelId.includes(':') ? parcelId.slice(parcelId.indexOf(':') + 1) : parcelId;
  return shortHash(body, 8, 6);
}
