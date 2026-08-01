import { binToHex, encodeCashAddress, hash160, hash256, hexToBin, secp256k1, utf8ToBin } from '@bitauth/libauth';
import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { LibauthAuthService } from '../infrastructure/libauth/auth-service.js';
import { routes } from '../presentation/routes.js';

const PRIVATE_KEY = hexToBin('0000000000000000000000000000000000000000000000000000000000000001');

function deriveAddress(publicKey: Uint8Array): string {
  return encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: hash160(publicKey) }).address;
}

function signChallenge(privateKey: Uint8Array, publicKey: Uint8Array, message: string): string {
  const digest = hash256(utf8ToBin(message));
  const sig = secp256k1.signMessageHashCompact(privateKey, digest);
  if (typeof sig === 'string') throw new Error(sig);
  let recoveryId = 0;
  for (let id = 0; id < 2; id++) {
    const recovered = secp256k1.recoverPublicKeyCompressed(sig, id as 0 | 1, digest);
    if (typeof recovered !== 'string' && binToHex(recovered) === binToHex(publicKey)) {
      recoveryId = id;
      break;
    }
  }
  const full = new Uint8Array(65);
  full.set(sig);
  full[64] = recoveryId + 27;
  return binToHex(full);
}

function flipFirstByte(hex: string): string {
  const flipped = parseInt(hex.slice(0, 2), 16) ^ 0xff;
  return flipped.toString(16).padStart(2, '0') + hex.slice(2);
}

describe('LibauthAuthService', () => {
  const derived = secp256k1.derivePublicKeyCompressed(PRIVATE_KEY);
  if (typeof derived === 'string') throw new Error(derived);
  const publicKey = derived;
  const address = deriveAddress(publicKey);

  test('challenge → sign → verify succeeds', () => {
    const service = new LibauthAuthService();
    const { nonce, message } = service.generateChallenge(address);
    const signature = signChallenge(PRIVATE_KEY, publicKey, message);
    expect(service.verifySignature(address, nonce, signature)).toBe(true);
  });

  test('verify fails with wrong nonce', () => {
    const service = new LibauthAuthService();
    const { message } = service.generateChallenge(address);
    const signature = signChallenge(PRIVATE_KEY, publicKey, message);
    expect(service.verifySignature(address, 'a'.repeat(32), signature)).toBe(false);
  });

  test('verify fails with expired nonce', async () => {
    const service = new LibauthAuthService(1);
    const { nonce, message } = service.generateChallenge(address);
    await Bun.sleep(10);
    const signature = signChallenge(PRIVATE_KEY, publicKey, message);
    expect(service.verifySignature(address, nonce, signature)).toBe(false);
  });

  test('verify fails with tampered signature', () => {
    const service = new LibauthAuthService();
    const { nonce, message } = service.generateChallenge(address);
    const signature = signChallenge(PRIVATE_KEY, publicKey, message);
    expect(service.verifySignature(address, nonce, flipFirstByte(signature))).toBe(false);
  });
});

describe('HTTP routes', () => {
  const app = new Elysia().use(routes);

  test('POST /parcel/create without token → 401', async () => {
    const response = await app.handle(
      new Request('http://localhost/parcel/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ merchantPk: 'aa', recipientPkh: 'bb', courierPkh: 'cc' }),
      }),
    );
    expect(response.status).toBe(401);
  });

  test('full auth flow → JWT works on protected route', async () => {
    const derived2 = secp256k1.derivePublicKeyCompressed(PRIVATE_KEY);
    if (typeof derived2 === 'string') throw new Error(derived2);
    const publicKey = derived2;
    const address = deriveAddress(publicKey);

    const challengeResponse = await app.handle(new Request(`http://localhost/auth/challenge?address=${encodeURIComponent(address)}`));
    expect(challengeResponse.status).toBe(200);
    const { nonce, message } = (await challengeResponse.json()) as { nonce: string; message: string };
    const signature = signChallenge(PRIVATE_KEY, publicKey, message);

    const verifyResponse = await app.handle(
      new Request('http://localhost/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address, nonce, signature }),
      }),
    );
    expect(verifyResponse.status).toBe(200);
    const { token } = (await verifyResponse.json()) as { token: string };

    const createResponse = await app.handle(
      new Request('http://localhost/parcel/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ merchantPk: 'aa', recipientPkh: 'bb', courierPkh: 'cc' }),
      }),
    );
    expect(createResponse.status).not.toBe(401);
  });
});
