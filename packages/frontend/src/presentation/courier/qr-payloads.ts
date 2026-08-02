/**
 * The three QR payloads in the system (FRONTEND-FLOW § "QR payloads"). The scanner switches on
 * `t` and rejects anything it does not recognise.
 *
 * Secrecy differs per type and the UI says so:
 *  - `parcel`   — a shipping label. Public by construction; it is printed on the box.
 *  - `courier`  — a badge. Inert: both values are public and a stranger holding it still cannot
 *                 produce that courier's signature.
 *  - `delivery` — a bearer secret. Anyone holding it can close the parcel.
 */

export interface ParcelLabelPayload {
  t: 'parcel';
  id: string;
}

/**
 * `id` is what the custody API needs (it signs with the fixture key behind that id); `pkh` is what
 * the chain records and what the outgoing courier is shown before releasing. Both travel together
 * so the scanner never has to guess one from the other.
 */
export interface CourierBadgePayload {
  t: 'courier';
  id: string;
  pkh: string;
  name?: string;
  company?: string;
}

export interface DeliveryCodePayload {
  t: 'delivery';
  id: string;
  secret: string;
}

export type QrPayload = ParcelLabelPayload | CourierBadgePayload | DeliveryCodePayload;
export type QrPayloadType = QrPayload['t'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const str = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

export function isParcelLabel(value: unknown): value is ParcelLabelPayload {
  return isRecord(value) && value.t === 'parcel' && str(value.id);
}

export function isCourierBadge(value: unknown): value is CourierBadgePayload {
  return isRecord(value) && value.t === 'courier' && str(value.id) && str(value.pkh);
}

export function isDeliveryCode(value: unknown): value is DeliveryCodePayload {
  return isRecord(value) && value.t === 'delivery' && str(value.id) && str(value.secret);
}

/** A cashaddr parcel id, as minted: `bchtest:p…`. */
const PARCEL_ID = /^(bchtest|bitcoincash|bchreg):[a-z0-9]{20,}$/i;
const HEX_SECRET = /^[0-9a-f]{32,}$/i;

/**
 * Parses one scanned or pasted string.
 *
 * The bare forms are deliberate: cameras need HTTPS off localhost, so the paste box is the
 * insurance path and a courier reading values off a screen should not have to hand-build JSON.
 * `expect` only widens what a bare string may mean — a JSON payload is always taken at its word so
 * a mistyped mode can never reinterpret one payload as another.
 */
export function parseQrPayload(raw: string, expect?: QrPayloadType): QrPayload | null {
  const text = raw.trim();
  if (!text) return null;

  if (text.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    if (isParcelLabel(parsed) || isCourierBadge(parsed) || isDeliveryCode(parsed)) return parsed;
    return null;
  }

  if (PARCEL_ID.test(text)) return { t: 'parcel', id: text };
  if (expect === 'delivery' && HEX_SECRET.test(text)) return { t: 'delivery', id: '', secret: text.toLowerCase() };
  return null;
}

export const encodePayload = (payload: QrPayload): string => JSON.stringify(payload);
