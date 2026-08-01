export interface IWalletConnector {
  connect(): Promise<string>;
  disconnect(): Promise<void>;
  signMessage(message: string): Promise<string>;
  signTransaction(txHex: string): Promise<string>;
  getPublicKey(): Promise<string>;
  getAddress(): Promise<string>;
}
