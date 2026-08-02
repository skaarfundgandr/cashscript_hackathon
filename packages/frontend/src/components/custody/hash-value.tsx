import { useState } from 'react';

export function truncateHash(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 9)}…${value.slice(-7)}`;
}

export function HashValue({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

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
    <span>{copied ? 'Copied' : truncateHash(value)}</span>
    {label && <span className="custody-sr-only">{label}</span>}
  </button>;
}
