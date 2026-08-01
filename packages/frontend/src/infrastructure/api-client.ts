const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
// Keep shop requests same-origin by default. Vite proxies this path during local
// development, while deployments can provide an absolute API URL explicitly.
const SHOP_BASE_URL = import.meta.env.VITE_SHOP_API_URL ?? '';

export interface ShopProduct {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  imageUrl: string;
  category: string;
  rating: number;
  sold: number;
}

export interface CheckoutResponse {
  orderId: string;
  accessToken: string;
}

export interface ParcelChainEntry {
  txid: string;
  state: number;
  custodian: string;
}

export interface CreateParcelResponse {
  contractId: string;
  address: string;
  txid: string;
  deliverySecret: string;
}

export class ApiClient {
  async createParcel(courierId: string): Promise<CreateParcelResponse> {
    const res = await fetch(`${BASE_URL}/parcel/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courierId }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async handoff(parcelId: string, courierId: string, nextCourierId: string): Promise<{ txid: string }> {
    const res = await fetch(`${BASE_URL}/parcel/${parcelId}/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courierId, nextCourierId }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async acceptHandoff(parcelId: string, courierId: string): Promise<{ txid: string }> {
    const res = await fetch(`${BASE_URL}/parcel/${parcelId}/accept-handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courierId }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async requestDelivery(parcelId: string, courierId: string): Promise<{ txid: string }> {
    const res = await fetch(`${BASE_URL}/parcel/${parcelId}/request-delivery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courierId }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async confirmDelivery(parcelId: string, courierId: string, deliveryCode: string): Promise<{ txid: string }> {
    const res = await fetch(`${BASE_URL}/parcel/${parcelId}/confirm-delivery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courierId, deliveryCode }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async getParcel(parcelId: string): Promise<ParcelChainEntry[]> {
    const res = await fetch(`${BASE_URL}/parcel/${parcelId}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
}

export const apiClient = new ApiClient();

async function shopJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${SHOP_BASE_URL}${path}`, init);
  if (response.ok) return response.json() as Promise<T>;

  const payload: unknown = await response.json().catch(() => undefined);
  const message = typeof payload === 'object' && payload !== null && 'message' in payload
    ? String(payload.message)
    : response.statusText;
  throw new Error(message || 'The shop request failed');
}

export const shopApi = {
  getProducts: () => shopJson<ShopProduct[]>('/shop/products'),
  checkout: (productId: string) => shopJson<CheckoutResponse>('/shop/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId }),
  }),
};
