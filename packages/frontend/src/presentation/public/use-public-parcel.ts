import { useEffect, useState } from 'react';

import { shopApi, type PublicParcel } from '../../infrastructure/api-client.js';

const POLL_INTERVAL_MS = 5_000;
const TERMINAL_STATE = 0x04;

/**
 * Polls the public record every 5s and keeps the last good view: a failed refresh never blanks a
 * rendered timeline — it flips `isStale` and keeps showing what was last read, per DATA-LAYER's
 * polling contract. `checkedAt` is the time of the last *successful* read, so "Last checked" never
 * claims a check that failed.
 *
 * Polling stops once the chain reaches 0x04: the terminal hop exits the covenant, so the record
 * cannot change again and re-reading it would only spend Electrum round-trips.
 */
export function usePublicParcel(parcelId: string) {
  const [parcel, setParcel] = useState<PublicParcel | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStale, setIsStale] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let hasView = false;

    setIsLoading(true);
    setError(null);
    setParcel(null);
    setIsStale(false);
    setCheckedAt(null);

    const load = async () => {
      try {
        const next = await shopApi.getPublicParcel(parcelId);
        if (cancelled) return;
        hasView = true;
        setParcel(next);
        setError(null);
        setIsStale(false);
        setCheckedAt(Date.now());
        setIsLoading(false);

        if (next.chain.at(-1)?.state === TERMINAL_STATE) return;
        timer = window.setTimeout(() => void load(), POLL_INTERVAL_MS);
      } catch (cause) {
        if (cancelled) return;
        setIsLoading(false);
        // A cold-open failure is a real error state; a failed refresh is staleness. The backend
        // reports both as 404 (see get-public-parcel.ts), so which one it was depends entirely on
        // whether a view was already rendered.
        if (hasView) {
          setIsStale(true);
          timer = window.setTimeout(() => void load(), POLL_INTERVAL_MS);
        } else {
          setError(cause instanceof Error ? cause : new Error(String(cause)));
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [parcelId]);

  return { parcel, error, isLoading, isStale, checkedAt };
}
