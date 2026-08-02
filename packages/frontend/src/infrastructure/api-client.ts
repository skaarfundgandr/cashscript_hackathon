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

export interface ShopBuyer {
  id: string;
  name: string;
  address: string;
}

export interface ShopCourier {
  id: string;
  name: string;
  pkh: string;
  company: string;
}

export interface ShopCustodyHop {
  txid: string;
  state: number;
  custodian: string;
  actorLabel?: string;
  timestamp?: number;
  blockHeight?: number;
}

export interface ShopOrder {
  orderId: string;
  createdAt: number;
  product: ShopProduct;
  buyer: ShopBuyer;
  courier: ShopCourier | null;
  status: 'pending' | 'processing' | 'approved';
  parcelId: string | null;
  contractAddress: string | null;
  mintTxid: string | null;
  chain: ShopCustodyHop[];
  custodyAvailable: boolean;
  revealedAt: number | null;
}

export class ShopApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ShopApiError';
  }
}

async function shopJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${SHOP_BASE_URL}${path}`, init);
  if (response.ok) return response.json() as Promise<T>;

  const payload: unknown = await response.json().catch(() => undefined);
  const message = typeof payload === 'object' && payload !== null && 'message' in payload
    ? String(payload.message)
    : response.statusText;
  throw new ShopApiError(message || 'The shop request failed', response.status);
}

export const shopApi = {
  getProducts: () => shopJson<ShopProduct[]>('/shop/products'),
  getCouriers: () => shopJson<ShopCourier[]>('/shop/couriers'),
  checkout: (productId: string) => shopJson<CheckoutResponse>('/shop/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId }),
  }),
  getOrder: (orderId: string) => shopJson<ShopOrder>(`/shop/orders/${encodeURIComponent(orderId)}`),
  getPendingOrders: () => shopJson<ShopOrder[]>('/shop/orders/pending'),
  approveOrder: (orderId: string, courierId: string) => shopJson<ShopOrder>(`/shop/orders/${encodeURIComponent(orderId)}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ courierId }),
  }),
  retryCustody: (orderId: string, accessToken: string) => shopJson<ShopOrder>(`/shop/orders/${encodeURIComponent(orderId)}/retry-custody`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken }),
  }),
  revealCode: (orderId: string, accessToken: string) => shopJson<{ secret: string; revealedAt: number }>(`/shop/orders/${encodeURIComponent(orderId)}/reveal-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken }),
  }),
};
