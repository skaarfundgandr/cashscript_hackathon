import { useCallback, useEffect, useState } from 'react';

import { shopApi, ShopApiError, type ShopOrder } from '../../infrastructure/api-client.js';

const POLL_INTERVAL_MS = 2_000;
const ATTACH_TIMEOUT_MS = 30_000;
/** Chain updates are courier-paced, not mint-paced — a slower tick is plenty. */
const CHAIN_POLL_INTERVAL_MS = 5_000;
const DELIVERED = 0x04;

export function useOrder(orderId: string, accessToken: string | null) {
  const [order, setOrder] = useState<ShopOrder | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const startedAt = Date.now();

    const load = async () => {
      try {
        const nextOrder = await shopApi.getOrder(orderId);
        if (cancelled) return;
        // Only publish a genuinely different order. The payload is freshly parsed JSON every
        // poll, so identity always changes while the content usually does not — and handing
        // React a new object re-renders the timeline and its layout animations underneath
        // whatever the buyer is doing.
        setOrder((current) => JSON.stringify(current) === JSON.stringify(nextOrder) ? current : nextOrder);
        setError((current) => current === null ? current : null);
        setIsLoading(false);

        // Approved but unattached: the mint is in flight, poll fast and give up loudly.
        if (nextOrder.status === 'approved' && nextOrder.parcelId === null) {
          if (Date.now() - startedAt >= ATTACH_TIMEOUT_MS) {
            setTimedOut(true);
            return;
          }
          timer = window.setTimeout(() => void load(), POLL_INTERVAL_MS);
          return;
        }

        setTimedOut(false);
        // Everything else keeps a slow poll going until the chain is terminal, so the page
        // follows the parcel on its own — approval landing, hops appearing, and the
        // delivery-code section unlocking at 0x02 — without the buyer refreshing.
        if (nextOrder.chain.at(-1)?.state !== DELIVERED) {
          timer = window.setTimeout(() => void load(), CHAIN_POLL_INTERVAL_MS);
        }
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause : new Error(String(cause)));
        setIsLoading(false);
      }
    };

    setIsLoading(true);
    setTimedOut(false);
    void load();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [orderId, revision]);

  const retryCustody = useCallback(async () => {
    if (!accessToken) {
      return { ok: false as const, message: 'Open this on the device you ordered from to retry custody.' };
    }
    setRetrying(true);
    try {
      await shopApi.retryCustody(orderId, accessToken);
      setRevision((current) => current + 1);
      return { ok: true as const };
    } catch (cause) {
      const message = cause instanceof ShopApiError && cause.status === 403
        ? 'Open this on the device you ordered from to retry custody.'
        : cause instanceof Error ? cause.message : String(cause);
      return { ok: false as const, message };
    } finally {
      setRetrying(false);
    }
  }, [accessToken, orderId]);

  return { order, error, isLoading, timedOut, retrying, retryCustody };
}
