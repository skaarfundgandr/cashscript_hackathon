import { useCallback, useEffect, useState } from 'react';

import { shopApi, ShopApiError, type ShopOrder } from '../../infrastructure/api-client.js';

const POLL_INTERVAL_MS = 2_000;
const ATTACH_TIMEOUT_MS = 30_000;

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
        setOrder(nextOrder);
        setError(null);
        setIsLoading(false);

        if (nextOrder.status !== 'approved' || nextOrder.parcelId !== null) {
          setTimedOut(false);
          return;
        }

        if (Date.now() - startedAt >= ATTACH_TIMEOUT_MS) {
          setTimedOut(true);
          return;
        }

        timer = window.setTimeout(() => void load(), POLL_INTERVAL_MS);
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
