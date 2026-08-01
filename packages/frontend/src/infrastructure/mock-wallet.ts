import { binToHex, hash160, hash256, hexToBin, secp256k1, utf8ToBin } from '@bitauth/libauth';
import type { IWalletConnector } from '../application/ports/wallet-connector.js';
import { encodeCashaddr } from '../application/utils/cashaddr.js';

export class MockWalletConnector implements IWalletConnector {
  private readonly privateKey: Uint8Array;
  private readonly publicKey: Uint8Array;
  private readonly address: string;

  constructor(options?: { privateKey: Uint8Array; publicKey: Uint8Array }) {
    this.privateKey =
      options?.privateKey ??
      hexToBin('0000000000000000000000000000000000000000000000000000000000000001');
    this.publicKey = options?.publicKey ?? this.derivePublicKey(this.privateKey);
    this.address = encodeCashaddr('bchtest', hash160(this.publicKey));
  }

  connect(): Promise<string> {
    return Promise.resolve(this.address);
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }

  async signMessage(message: string): Promise<string> {
    const digest = hash256(utf8ToBin(message));
    const sig = secp256k1.signMessageHashCompact(this.privateKey, digest);
    if (typeof sig === 'string') {
      throw new Error(sig);
    }
    const recoveryId = this.findRecoveryId(sig, digest);
    const full = new Uint8Array(65);
    full.set(sig);
    full[64] = recoveryId + 27;
    return binToHex(full);
  }

  signTransaction(txHex: string): Promise<string> {
    return this.signMessage(txHex);
  }

  getPublicKey(): Promise<string> {
    return Promise.resolve(binToHex(this.publicKey));
  }

  getAddress(): Promise<string> {
    return Promise.resolve(this.address);
  }

  private derivePublicKey(privateKey: Uint8Array): Uint8Array {
    const pubkey = secp256k1.derivePublicKeyCompressed(privateKey);
    if (typeof pubkey === 'string') {
      throw new Error(pubkey);
    }
    return pubkey;
  }

  private findRecoveryId(sig: Uint8Array, digest: Uint8Array): number {
    for (let recoveryId = 0; recoveryId < 2; recoveryId++) {
      const recovered = secp256k1.recoverPublicKeyCompressed(
        sig,
        recoveryId as 0 | 1 | 2 | 3,
        digest,
      );
      if (typeof recovered !== 'string' && binToHex(recovered) === binToHex(this.publicKey)) {
        return recoveryId;
      }
    }
    throw new Error('Failed to determine signature recovery id');
  }
}
