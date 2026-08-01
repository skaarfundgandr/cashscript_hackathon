import { hash160, secp256k1 } from '@bitauth/libauth';
import { IKeyStore } from '../../application/ports/key-store.js';

export function derivePublicKey(privateKey: Uint8Array): Uint8Array {
  const publicKey = secp256k1.derivePublicKeyCompressed(privateKey);
  if (typeof publicKey === 'string') {
    throw new Error(publicKey);
  }
  return publicKey;
}

export class LibauthKeyStore implements IKeyStore {
  generateKeypair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
    const privateKey = this.generatePrivateKey();
    return { privateKey, publicKey: derivePublicKey(privateKey) };
  }

  getPublicKeyHash(publicKey: Uint8Array): Uint8Array {
    return hash160(publicKey);
  }

  private generatePrivateKey(): Uint8Array {
    while (true) {
      const privateKey = new Uint8Array(32);
      crypto.getRandomValues(privateKey);
      if (secp256k1.validatePrivateKey(privateKey)) {
        return privateKey;
      }
    }
  }
}
