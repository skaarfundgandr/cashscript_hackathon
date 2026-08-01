export const MIN_LATENCY_MS = 400;
export const MAX_LATENCY_MS = 900;

/**
 * Artificial latency on the mint and the four transitions, so `Signing… → Broadcasting…` has
 * somewhere to live. Reads are not delayed — the tracking pages poll them every 2s.
 *
 * Chipnet is seconds, not milliseconds. See DIVERGENCE.md, D-4.
 */
export function latency(): Promise<void> {
  const span = MAX_LATENCY_MS - MIN_LATENCY_MS;
  const ms = MIN_LATENCY_MS + Math.floor(Math.random() * (span + 1));
  return new Promise((resolve) => setTimeout(resolve, ms));
}
