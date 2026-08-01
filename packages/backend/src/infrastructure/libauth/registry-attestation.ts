import { secp256k1, sha256 } from '@bitauth/libauth';
import { REGISTRY } from '../fixtures.js';

export function signRegistryAttestation(nextCustodianPkh: Uint8Array): Uint8Array {
  const digest = sha256.hash(nextCustodianPkh);
  const sig = secp256k1.signMessageHashSchnorr(REGISTRY.privateKey, digest);
  if (typeof sig === 'string') throw new Error(sig);
  return sig;
}
