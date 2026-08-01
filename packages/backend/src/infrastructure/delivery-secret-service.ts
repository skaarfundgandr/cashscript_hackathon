import { generateDeliverySecret, hashDeliveryCode } from '@parcel-tracker/shared';

export interface DeliverySecretResult {
  hash: Uint8Array;
  secret: Uint8Array;
}

export function createDeliverySecret(): DeliverySecretResult {
  const secret = generateDeliverySecret();
  const hash = hashDeliveryCode(secret);
  return { hash, secret };
}
