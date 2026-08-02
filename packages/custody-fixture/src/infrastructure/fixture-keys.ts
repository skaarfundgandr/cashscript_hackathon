import { binToHex, hash160, hexToBin, secp256k1 } from '@bitauth/libauth';

/**
 * The custody backend's five fixture keys, derived rather than pasted. Private keys 0x00…01
 * through 0x00…05, matching `packages/backend/src/infrastructure/fixtures.ts`.
 */
function pkhOfPrivateKey(privateKeyHex: string): string {
  const publicKey = secp256k1.derivePublicKeyCompressed(hexToBin(privateKeyHex));
  if (typeof publicKey === 'string') throw new Error(publicKey);
  return binToHex(hash160(publicKey));
}

const KEY = (n: number) => `${'0'.repeat(63)}${n}`;

function envKey(envVar: string, fallback: string): string {
  return process.env[envVar] ?? fallback;
}

export const MERCHANT_KEY = envKey('MERCHANT_PRIVATE_KEY', KEY(1));
export const COURIER_A_KEY = envKey('COURIER_A_PRIVATE_KEY', KEY(2));
export const COURIER_B_KEY = envKey('COURIER_B_PRIVATE_KEY', KEY(3));
export const REGISTRY_KEY = envKey('REGISTRY_PRIVATE_KEY', KEY(4));
export const RECIPIENT_KEY = envKey('RECIPIENT_PRIVATE_KEY', KEY(5));

export const MERCHANT_PKH = pkhOfPrivateKey(MERCHANT_KEY);
export const COURIER_A_PKH = pkhOfPrivateKey(COURIER_A_KEY);
export const COURIER_B_PKH = pkhOfPrivateKey(COURIER_B_KEY);
export const REGISTRY_PKH = pkhOfPrivateKey(REGISTRY_KEY);
export const RECIPIENT_PKH = pkhOfPrivateKey(RECIPIENT_KEY);

/**
 * The verification table from DATA-LAYER.md. If a fixture key ever moves, every pkh the frontend
 * resolves to an actor label is wrong — this is the cheapest possible place to learn that, so the
 * fixture refuses to boot rather than serving a chain nobody can label.
 */
const EXPECTED: Record<string, string> = {
  merchant: '751e76e8199196d454941c45d1b3a323f1433bd6',
  courierA: '06afd46bcdfd22ef94ac122aa11f241244a37ecc',
  courierB: '7dd65592d0ab2fe0d0257d571abf032cd9db93dc',
  registry: 'c42e7ef92fdb603af844d064faad95db9bcdfd3d',
  recipient: '4747e8746cddb33b0f7f95a90f89f89fb387cbb6',
};

export function assertFixturePkhs(): void {
  if (process.env.MERCHANT_PRIVATE_KEY) return;

  const derived: Record<string, string> = {
    merchant: MERCHANT_PKH,
    courierA: COURIER_A_PKH,
    courierB: COURIER_B_PKH,
    registry: REGISTRY_PKH,
    recipient: RECIPIENT_PKH,
  };

  const drifted = Object.keys(EXPECTED).filter((role) => derived[role] !== EXPECTED[role]);
  if (drifted.length > 0) {
    const detail = drifted.map((role) => `  ${role}: expected ${EXPECTED[role]}, derived ${derived[role]}`).join('\n');
    throw new Error(`Fixture key drift — refusing to boot:\n${detail}`);
  }
}

/**
 * Courier ids the demo actually uses, pre-seeded so their custodian pkhs match the identity table
 * the frontend labels from. Any other id still works — it gets a generated keypair (D-1).
 */
export const SEEDED_COURIERS: Record<string, string> = {
  A: COURIER_A_KEY,
  B: COURIER_B_KEY,
  'jnt-mgl': COURIER_A_KEY,
  'ninjavan-rey': COURIER_B_KEY,
};
