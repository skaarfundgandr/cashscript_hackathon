import type { IWalletConnector } from '../application/ports/wallet-connector.js';
import { encodeCashaddr, hexToBytes } from '../application/utils/cashaddr.js';

export class MockWalletConnector implements IWalletConnector {
  private readonly mockPkh = 'aabbccddeeff00112233445566778899aabbccdd';
  private readonly mockPubkey =
    '03aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899aa';
  private readonly address = encodeCashaddr('bchtest', hexToBytes(this.mockPkh));

  connect(): Promise<string> {
    return Promise.resolve(this.address);
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }

  signMessage(message: string): Promise<string> {
    return Promise.resolve(`mock-signature:${message}`);
  }

  signTransaction(txHex: string): Promise<string> {
    return Promise.resolve(`mock-signature:${txHex}`);
  }

  getPublicKey(): Promise<string> {
    return Promise.resolve(this.mockPubkey);
  }

  getAddress(): Promise<string> {
    return Promise.resolve(this.address);
  }
}
