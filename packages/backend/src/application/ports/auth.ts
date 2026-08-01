export interface IAuthService {
  generateChallenge(address: string): { nonce: string; message: string };
  verifySignature(address: string, nonce: string, signature: string): boolean;
}
