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

<<<<<<< HEAD
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
=======
export interface ShopCourier {
  id: string;
  name: string;
  company: string;
  pkh: string;
>>>>>>> 932c435 (feat: separate order dispatch from checkout, allowing merchant to assign courier post-checkout)
}

/**
 * One minted parcel from the shop's dispatch manifest. Carries no custody state on purpose — the
 * courier terminal reads each chain itself, so what it shows is the chain's answer rather than a
 * status column that could disagree with it.
 */
export interface ManifestEntry {
  orderId: string;
  createdAt: number;
  parcelId: string;
  contractAddress: string | null;
  mintTxid: string | null;
  product: { id: string; name: string; imageUrl: string; priceCents: number; currency: string };
  buyer: { id: string; name: string; address: string };
  assignedCourier: ShopCourier | null;
}

/** A hop as the custody service reports it, read straight from the chain. */
export interface ParcelChainEntry {
  txid: string;
  state: number;
  custodian: string;
}

<<<<<<< HEAD
/** A hop as the shop reports it, with the actor and timing it can resolve on the buyer's behalf. */
export interface ShopCustodyHop {
  txid: string;
  state: number;
  custodian: string;
  actorLabel?: string;
  timestamp?: number;
  blockHeight?: number;
=======
export interface ShopOrderView {
  orderId: string;
  createdAt: number;
  product: ShopProduct;
  buyer: { id: string; name: string; address: string };
  courier: ShopCourier | null;
  parcelId: string | null;
  contractAddress: string | null;
  mintTxid: string | null;
  chain: ParcelChainEntry[];
  custodyAvailable: boolean;
  revealedAt: number | null;
>>>>>>> 932c435 (feat: separate order dispatch from checkout, allowing merchant to assign courier post-checkout)
}

export interface CreateParcelResponse {
  contractId: string;
  address: string;
  txid: string;
  deliverySecret: string;
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

/**
 * A parcel id is a cashaddr and contains a colon. It is legal raw in a path segment (RFC 3986
 * §3.3), but encoding is the safe side of that bet — `HttpCustodyGateway` takes the same view.
 */
const parcelPath = (parcelId: string) => `${BASE_URL}/parcel/${encodeURIComponent(parcelId)}`;

/**
 * The four transition routes return the txid as a bare `text/plain` string, not JSON — the
 * controller's return type is `Promise<string>`. Reading it as JSON throws on a valid response, so
 * the text is taken first and only parsed if it actually looks like a payload.
 */
async function readTxid(res: Response): Promise<{ txid: string }> {
  const text = (await res.text()).trim();
  if (text.startsWith('{')) {
    try {
      const body = JSON.parse(text) as { txid?: string };
      if (typeof body.txid === 'string') return { txid: body.txid };
    } catch {
      // Fall through: an unparseable body is still more useful reported verbatim.
    }
  }
  return { txid: text.replace(/^"|"$/g, '') };
}

async function post(url: string, body: unknown): Promise<{ txid: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return readTxid(res);
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

  handoff(parcelId: string, courierId: string, nextCourierId: string): Promise<{ txid: string }> {
    return post(`${parcelPath(parcelId)}/handoff`, { courierId, nextCourierId });
  }

  acceptHandoff(parcelId: string, courierId: string): Promise<{ txid: string }> {
    return post(`${parcelPath(parcelId)}/accept-handoff`, { courierId });
  }

  requestDelivery(parcelId: string, courierId: string): Promise<{ txid: string }> {
    return post(`${parcelPath(parcelId)}/request-delivery`, { courierId });
  }

  confirmDelivery(parcelId: string, courierId: string, deliveryCode: string): Promise<{ txid: string }> {
    return post(`${parcelPath(parcelId)}/confirm-delivery`, { courierId, deliveryCode });
  }

  async getParcel(parcelId: string): Promise<ParcelChainEntry[]> {
    const res = await fetch(parcelPath(parcelId));
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
  throw new ShopApiError(message || 'The shop request failed', response.status);
}

export const shopApi = {
  getProducts: () => shopJson<ShopProduct[]>('/shop/products'),
  getCouriers: () => shopJson<ShopCourier[]>('/shop/couriers'),
  getManifest: () => shopJson<ManifestEntry[]>('/shop/manifest'),
  getOrder: (orderId: string) => shopJson<ShopOrderView>(`/shop/orders/${encodeURIComponent(orderId)}`),
  checkout: (productId: string) => shopJson<CheckoutResponse>('/shop/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId }),
  }),
<<<<<<< HEAD
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
=======
  dispatch: (orderId: string, accessToken: string, courierId: string) => shopJson<ShopOrderView>(
    `/shop/orders/${encodeURIComponent(orderId)}/dispatch`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken, courierId }),
    },
  ),
>>>>>>> 932c435 (feat: separate order dispatch from checkout, allowing merchant to assign courier post-checkout)
};
