import { encodeCashAddress, hash160, hash256, hexToBin, secp256k1, utf8ToBin } from '@bitauth/libauth';
import type { RecoveryId } from '@bitauth/libauth';
import { IAuthService } from '../../application/ports/auth.js';

const MESSAGE_PREFIX = 'Bitcoin Signed Message:\nParcelTracker Login\nNonce: ';
const BCH_TEST_PREFIX = 'bchtest';

export class LibauthAuthService implements IAuthService {
  generateChallenge(address: string): { nonce: string; message: string } {
    const nonceBytes = new Uint8Array(16);
    crypto.getRandomValues(nonceBytes);
    const nonce = Array.from(nonceBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return { nonce, message: this.formatMessage(nonce) };
  }

  verifySignature(address: string, nonce: string, signature: string): boolean {
    try {
      const digest = hash256(utf8ToBin(this.formatMessage(nonce)));
      const sig = hexToBin(signature);
      if (sig.length !== 65) {
        return false;
      }
      const recoveryByte = sig[64];
      const recoveryId = recoveryByte >= 31 ? recoveryByte - 31 : recoveryByte - 27;
      if (recoveryId < 0 || recoveryId > 3) {
        return false;
      }
      const pubkey = secp256k1.recoverPublicKeyCompressed(sig.slice(0, 64), recoveryId as RecoveryId, digest);
      if (typeof pubkey === 'string') {
        return false;
      }
      const derived = encodeCashAddress({
        prefix: BCH_TEST_PREFIX,
        type: 'p2pkh',
        payload: hash160(pubkey),
      }).address;
      return derived.toLowerCase() === address.toLowerCase();
    } catch {
      return false;
    }
  }

  private formatMessage(nonce: string): string {
    return `${MESSAGE_PREFIX}${nonce}`;
  }
}
