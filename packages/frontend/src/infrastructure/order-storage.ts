const STORAGE_KEY = 'parcel-tracker/orders';

export interface StoredOrder {
  accessToken: string;
  createdAt: number;
}

type StoredOrders = Record<string, StoredOrder>;

function readOrders(): StoredOrders {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    const value: unknown = JSON.parse(stored);
    return typeof value === 'object' && value !== null ? value as StoredOrders : {};
  } catch {
    return {};
  }
}

export function storeOrder(orderId: string, accessToken: string): void {
  const orders = readOrders();
  orders[orderId] = { accessToken, createdAt: Date.now() };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

export function storedAccessToken(orderId: string): string | null {
  return readOrders()[orderId]?.accessToken ?? null;
}

/** Every order this device has placed, newest first. Tokens stay in storage — ids only. */
export function storedOrderIds(): Array<{ orderId: string; createdAt: number }> {
  return Object.entries(readOrders())
    .map(([orderId, { createdAt }]) => ({ orderId, createdAt }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function accessTokenForOrder(orderId: string, urlToken: string | null): string | null {
  return urlToken || storedAccessToken(orderId);
}
