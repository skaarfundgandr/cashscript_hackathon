import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Children, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { shortHash } from './couriers.js';
import { CheckIcon, CopyIcon, OutboundIcon } from './icons.js';

/** A chipnet explorer that renders CashTokens. Every txid on this surface is clickable. */
const EXPLORER = 'https://chipnet.imaginary.cash/tx/';

type Variant = 'primary' | 'ghost' | 'quiet';

export interface CourierButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
  icon?: ReactNode;
}

export function CourierButton({ variant = 'ghost', block, icon, children, className, ...props }: CourierButtonProps) {
  // A button with no words is square. CSS cannot answer this on its own — `svg:only-child` counts
  // elements and ignores text nodes, so it calls an icon sitting next to a label "only".
  const labelled = Children.toArray(children).some((child) => typeof child === 'string' || typeof child === 'number');

  return (
    <button
      type="button"
      className={['c-btn', `c-btn-${variant}`, block ? 'c-btn-block' : '', labelled ? '' : 'c-btn-icon', className ?? ''].filter(Boolean).join(' ')}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

/** Copy confirmation, animated: the tick replaces the clipboard rather than blinking into it. */
function CopyFeedback({ copied }: { copied: boolean }) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={copied ? 'copied' : 'idle'}
        style={{ display: 'inline-flex' }}
        initial={reduced ? false : { opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={reduced ? undefined : { opacity: 0, scale: 0.6 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
      >
        {copied ? <CheckIcon className="c-hash-icon" /> : <CopyIcon className="c-hash-icon" />}
      </motion.span>
    </AnimatePresence>
  );
}

/**
 * Mono, middle-truncated, click-to-copy. Hashes are the only thing on this surface a courier might
 * need to read out loud, so the full value is always one tap away and never silently shortened
 * without the affordance to recover it.
 */
export function HashValue({ value, lead = 8, tail = 6, full }: { value: string; lead?: number; tail?: number; full?: boolean }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    void navigator.clipboard?.writeText(value).then(() => setCopied(true)).catch(() => setCopied(false));
  };

  return (
    <button type="button" className="c-hash" onClick={copy} title={value} aria-label={`Copy ${value}`}>
      <span>{full ? value : shortHash(value, lead, tail)}</span>
      <CopyFeedback copied={copied} />
    </button>
  );
}

export function TxLink({ txid }: { txid: string }) {
  return (
    <a className="c-txlink" href={`${EXPLORER}${txid}`} target="_blank" rel="noreferrer">
      <span>{shortHash(txid, 10, 8)}</span>
      <OutboundIcon className="c-txlink-icon" />
    </a>
  );
}

/** One dot per state, in that state's locked colour. The colour is never used for anything else. */
export function StateDot({ tone }: { tone: string }) {
  return <span className="c-dot" style={{ background: `var(--c-${tone})` }} aria-hidden="true" />;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="c-field">
      <span className="c-field-label">{label}</span>
      <div className="c-field-value">{children}</div>
    </div>
  );
}
