import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';

export function truncateHash(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 9)}…${value.slice(-7)}`;
}

export function HashValue({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const reduced = useReducedMotion();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return <button type="button" className="custody-hash-value" onClick={() => void copy()} title="Copy full value">
    {/* The hash and its confirmation cross-fade in place, so a copy reads as an event. */}
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={copied ? 'copied' : 'value'}
        style={{ display: 'inline-block' }}
        initial={reduced ? false : { opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduced ? undefined : { opacity: 0, y: -3 }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
      >{copied ? 'Copied' : truncateHash(value)}</motion.span>
    </AnimatePresence>
    {label && <span className="custody-sr-only">{label}</span>}
  </button>;
}
