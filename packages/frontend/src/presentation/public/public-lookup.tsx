// The `#/p` landing page: paste a parcel address, read its record.
//
// Deliberately NOT a browsable index. It discloses nothing — you must already hold the id, the
// same way a courier tracking number works. No list endpoint, no enumeration.

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState, type FormEvent } from 'react';

import { Button } from '../../components/ui/button.js';
import { SearchIcon, ShieldIcon } from './icons.js';

/** Tolerant on purpose: any cashaddr prefix, p2sh (p) or p2pkh (q) payload. */
const PARCEL_ID = /^[a-z]{2,20}:[qp][0-9a-z]{25,}$/;

/**
 * Accepts a bare address or a full public-record URL, so pasting the link someone sent you works
 * as well as pasting the id out of it.
 */
function normalise(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const fromUrl = trimmed.match(/#\/p\/([^?#\s]+)/);
  const candidate = fromUrl ? decodeURIComponent(fromUrl[1]!) : trimmed;
  return candidate.replace(/^\/+|\/+$/g, '');
}

export function PublicLookup({ onOpen }: { onOpen: (parcelId: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reduced = useReducedMotion();

  /** Same vocabulary as marketplace.tsx: short, easeOut, small offsets. Off entirely if the OS asks. */
  const rise = (delay: number) => reduced
    ? {}
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.24, ease: 'easeOut' as const, delay },
      };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parcelId = normalise(value);
    if (!parcelId) return setError('Paste a parcel address to continue.');
    if (!PARCEL_ID.test(parcelId)) {
      return setError('That does not look like a parcel address. It starts with a network prefix, like bchtest:p…');
    }
    setError(null);
    onOpen(parcelId);
  };

  return <div className="pv">
    <header className="pv-topbar">
      <div className="pv-brand">Hermes</div>
      <span className="pv-brand-sub">Public custody record</span>
    </header>

    <main className="pv-lookup">
      <motion.p className="pv-eyebrow" {...rise(0)}>Look up a parcel record</motion.p>
      <motion.h1 {...rise(0.04)}>Every handover, signed on chain.</motion.h1>
      <motion.p className="pv-lookup-lede" {...rise(0.08)}>
        Paste a parcel address to read its full custody history — who held it, who signed for it,
        and the transaction behind each step. No account, no login.
      </motion.p>

      <motion.form className="pv-card pv-lookup-card" onSubmit={submit} noValidate {...rise(0.12)}>
        <label className="pv-lookup-label" htmlFor="pv-lookup-input">Parcel address</label>
        <div className="pv-lookup-row">
          <div className="pv-search-field">
            <SearchIcon aria-hidden />
            <input
              className="pv-input"
              id="pv-lookup-input"
              type="text"
              spellCheck={false}
              autoComplete="off"
              placeholder="bchtest:p…"
              aria-invalid={error !== null}
              aria-describedby={error ? 'pv-lookup-error' : 'pv-lookup-hint'}
              value={value}
              onChange={(event) => { setValue(event.target.value); if (error) setError(null); }}
            />
          </div>
          <motion.div whileTap={reduced ? undefined : { scale: 0.97 }}>
            <Button type="submit">Open record</Button>
          </motion.div>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {error
            ? <motion.p
                className="pv-lookup-error" id="pv-lookup-error" role="alert" key="error"
                initial={reduced ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
              >{error}</motion.p>
            : <motion.p
                className="pv-lookup-hint" id="pv-lookup-hint" key="hint"
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduced ? undefined : { opacity: 0 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
              >Find this on your order page, or on the parcel's shipping label. A full record link works too.</motion.p>}
        </AnimatePresence>
      </motion.form>

      <motion.section className="pv-card pv-claim" {...rise(0.16)}>
        <ShieldIcon aria-hidden />
        <div>
          <strong>Read from the chain, not from our database</strong>
          <p>
            A record here is reconstructed from transactions on the network. We cannot edit it,
            back-date it, or quietly remove a hop — and neither can the merchant or the courier.
          </p>
        </div>
      </motion.section>

      <motion.p className="pv-lookup-privacy" {...rise(0.2)}>
        This page cannot list parcels. You need the address, the same as a tracking number.
      </motion.p>
    </main>
  </div>;
}
