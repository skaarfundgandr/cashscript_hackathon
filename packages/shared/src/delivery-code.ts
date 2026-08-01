import { sha256 } from '@bitauth/libauth';

export function generateDeliverySecret(): Uint8Array {
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  return secret;
}

export function hashDeliveryCode(secret: Uint8Array): Uint8Array {
  return sha256.hash(secret);
}
