export interface IKeyStore {
  generateKeypair(): { privateKey: Uint8Array; publicKey: Uint8Array };
  getPublicKeyHash(publicKey: Uint8Array): Uint8Array;
}
