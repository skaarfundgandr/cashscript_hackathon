import { binToHex, hash160, hexToBin, secp256k1 } from '@bitauth/libauth';

export interface FixtureKey {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  publicKeyHash: Uint8Array;
}

function makeKey(privateKeyHex: string): FixtureKey {
  const privateKey = hexToBin(privateKeyHex);
  const publicKey = secp256k1.derivePublicKeyCompressed(privateKey);
  if (typeof publicKey === 'string') throw new Error(publicKey);
  return { privateKey, publicKey, publicKeyHash: hash160(publicKey) };
}

export const MERCHANT = makeKey('0000000000000000000000000000000000000000000000000000000000000001');
export const COURIER_A = makeKey('0000000000000000000000000000000000000000000000000000000000000002');
export const COURIER_B = makeKey('0000000000000000000000000000000000000000000000000000000000000003');
export const REGISTRY = makeKey('0000000000000000000000000000000000000000000000000000000000000004');
export const RECIPIENT = makeKey('0000000000000000000000000000000000000000000000000000000000000005');

const COURIERS: Record<string, FixtureKey> = { A: COURIER_A, B: COURIER_B };

export function getCourier(id: string): FixtureKey {
  const key = COURIERS[id.toUpperCase()];
  if (!key) throw new Error(`Unknown courier: ${id}`);
  return key;
}
