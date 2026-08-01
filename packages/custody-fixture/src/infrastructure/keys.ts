import { Database } from 'bun:sqlite';
import { binToHex, hash160, hexToBin, secp256k1 } from '@bitauth/libauth';
import { CourierKeyStore } from '../application/ports/index.js';
import { SEEDED_COURIERS } from './fixture-keys.js';

const COURIER_SCHEMA = `
CREATE TABLE IF NOT EXISTS courier_keys (
  courier_id   TEXT PRIMARY KEY,
  private_key  TEXT NOT NULL,
  pkh          TEXT NOT NULL
)`;

/**
 * A signing keypair per courier, minted on first use and persisted so a courier's pkh survives a
 * restart. Ids are arbitrary — `jnt-mgl` is as valid as `A`, which is the point: `A`/`B` are a
 * limit of the real backend's two hardcoded keys, not a fact about couriers.
 */
export class SqliteCourierKeys implements CourierKeyStore {
  constructor(private readonly db: Database) {
    this.db.run(COURIER_SCHEMA);
  }

  async pkhOf(courierId: string): Promise<string> {
    const existing = this.db.query('SELECT pkh FROM courier_keys WHERE courier_id = $id').get({ $id: courierId }) as { pkh: string } | null;
    if (existing) return existing.pkh;

    // Known demo ids get the custody backend's fixture keys so their pkhs match the identity
    // table the frontend labels actors from; everyone else is onboarded with a fresh key.
    const privateKey = SEEDED_COURIERS[courierId] ?? randomPrivateKey();
    const pkh = pkhOf(privateKey);
    this.db.query('INSERT INTO courier_keys (courier_id, private_key, pkh) VALUES ($id, $key, $pkh)').run({ $id: courierId, $key: privateKey, $pkh: pkh });
    return pkh;
  }
}

function pkhOf(privateKeyHex: string): string {
  const publicKey = secp256k1.derivePublicKeyCompressed(hexToBin(privateKeyHex));
  if (typeof publicKey === 'string') throw new Error(publicKey);
  return binToHex(hash160(publicKey));
}

function randomPrivateKey(): string {
  for (;;) {
    const candidate = randomHex(32);
    if (secp256k1.validatePrivateKey(hexToBin(candidate))) return candidate;
  }
}

export function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return binToHex(bytes);
}

/** 64 lowercase hex chars, so `tx-link` renders at realistic width. */
export function fakeTxid(): string {
  return randomHex(32);
}

/**
 * Shaped like a chipnet p2sh contract address so nothing downstream learns to expect short ids.
 * It is not a valid cashaddr — anything that *validates* an address will fail on it (D-5).
 */
export function fakeParcelId(): string {
  const charset = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const bytes = new Uint8Array(62);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (b) => charset[b % charset.length]).join('');
  return `bchtest:p${body}`;
}
