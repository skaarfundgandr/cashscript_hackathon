import { IAuthService } from '../../application/ports/auth.js';

export class AuthController {
  constructor(private readonly authService: IAuthService) {}

  getChallenge(address: string): { nonce: string; message: string } {
    return this.authService.generateChallenge(address);
  }

  verify(address: string, nonce: string, signature: string): boolean {
    return this.authService.verifySignature(address, nonce, signature);
  }
}
