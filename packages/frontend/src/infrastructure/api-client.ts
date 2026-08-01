export interface ChallengeDto {
  nonce: string;
  message: string;
}

export interface AuthDto {
  token: string;
  address?: string;
}

export interface ParcelDto {
  contractId: string;
  state: number;
  custodian: string;
  recipientPkh: string;
  merchantPkh: string;
  createdAt?: string;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly tokenKey = 'parcel_tracker_token';

  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  setToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
  }

  clearToken(): void {
    localStorage.removeItem(this.tokenKey);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Content-Type', 'application/json');
    const token = this.getToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      throw new Error(await this.errorMessage(response));
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  private async errorMessage(response: Response): Promise<string> {
    const body = await response.text();
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      if (typeof parsed.error === 'string') {
        return parsed.error;
      }
      if (typeof parsed.message === 'string') {
        return parsed.message;
      }
    } catch {
      // fall through to status message
    }
    return `Request failed with status ${response.status}`;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  getChallenge(address: string): Promise<ChallengeDto> {
    return this.get<ChallengeDto>(`/challenge?address=${encodeURIComponent(address)}`);
  }

  verifyAuth(address: string, nonce: string, signature: string): Promise<AuthDto> {
    return this.post<AuthDto>('/auth/verify', { address, nonce, signature });
  }

  createParcel(merchantPk: string, recipientPkh: string, courierPkh: string): Promise<ParcelDto> {
    return this.post<ParcelDto>('/parcels', { merchantPk, recipientPkh, courierPkh });
  }

  getParcel(contractId: string): Promise<ParcelDto> {
    return this.get<ParcelDto>(`/parcels/${encodeURIComponent(contractId)}`);
  }

  handoff(
    contractId: string,
    courierSig: string,
    courierPk: string,
    nextCustodian: string,
  ): Promise<ParcelDto> {
    return this.post<ParcelDto>(`/parcels/${encodeURIComponent(contractId)}/handoff`, {
      courierSig,
      courierPk,
      nextCustodian,
    });
  }

  acceptHandoff(contractId: string, courierSig: string, courierPk: string): Promise<ParcelDto> {
    return this.post<ParcelDto>(`/parcels/${encodeURIComponent(contractId)}/accept-handoff`, {
      courierSig,
      courierPk,
    });
  }

  requestDelivery(contractId: string, courierSig: string, courierPk: string): Promise<ParcelDto> {
    return this.post<ParcelDto>(`/parcels/${encodeURIComponent(contractId)}/request-delivery`, {
      courierSig,
      courierPk,
    });
  }

  confirmDelivery(contractId: string, recipientSig: string, recipientPk: string): Promise<ParcelDto> {
    return this.post<ParcelDto>(`/parcels/${encodeURIComponent(contractId)}/confirm-delivery`, {
      recipientSig,
      recipientPk,
    });
  }

  rejectDelivery(contractId: string, recipientSig: string, recipientPk: string): Promise<ParcelDto> {
    return this.post<ParcelDto>(`/parcels/${encodeURIComponent(contractId)}/reject-delivery`, {
      recipientSig,
      recipientPk,
    });
  }

  returnToSender(contractId: string, courierSig: string, courierPk: string): Promise<ParcelDto> {
    return this.post<ParcelDto>(`/parcels/${encodeURIComponent(contractId)}/return-to-sender`, {
      courierSig,
      courierPk,
    });
  }

  confirmReturn(contractId: string, merchantSig: string, merchantPk: string): Promise<ParcelDto> {
    return this.post<ParcelDto>(`/parcels/${encodeURIComponent(contractId)}/confirm-return`, {
      merchantSig,
      merchantPk,
    });
  }
}
