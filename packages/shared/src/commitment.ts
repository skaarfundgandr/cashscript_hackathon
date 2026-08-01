import { ParcelState } from './types.js';
import type { Commitment } from './types.js';

export function encodeCommitment(state: ParcelState | number, custodian: Uint8Array): Uint8Array {
  const buf = new Uint8Array(40);
  buf[0] = state;
  buf.set(custodian, 1);
  return buf;
}

export function decodeCommitment(buf: Uint8Array): Commitment {
  return {
    state: buf[0] as ParcelState,
    custodian: buf.slice(1, 21),
  };
}
