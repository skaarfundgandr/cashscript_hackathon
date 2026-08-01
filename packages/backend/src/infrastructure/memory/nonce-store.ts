export class MemoryNonceStore {
  private readonly nonces = new Map<string, { address: string; expiresAt: number }>();
  private readonly cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupInterval = setInterval(() => this.deleteExpired(), 60_000);
  }

  store(address: string, nonce: string, ttlMs: number): void {
    this.nonces.set(nonce, { address, expiresAt: Date.now() + ttlMs });
  }

  consume(address: string, nonce: string): boolean {
    const entry = this.nonces.get(nonce);
    if (!entry) {
      return false;
    }
    this.nonces.delete(nonce);
    if (entry.address !== address || entry.expiresAt <= Date.now()) {
      return false;
    }
    return true;
  }

  dispose(): void {
    clearInterval(this.cleanupInterval);
  }

  private deleteExpired(): void {
    const now = Date.now();
    for (const [nonce, entry] of this.nonces) {
      if (entry.expiresAt <= now) {
        this.nonces.delete(nonce);
      }
    }
  }
}
