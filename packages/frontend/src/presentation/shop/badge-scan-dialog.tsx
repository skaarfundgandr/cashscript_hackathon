// The merchant assigns a courier by scanning the badge the courier terminal shows under
// "My badge" — the same handshake couriers use between themselves at a handoff, so the roster
// is attested by presence, not picked from a list.
//
// The scan surface IS the courier terminal's ScanPanel — same viewport, frame, laser, armed
// rail, and paste fallback — so scanning feels identical on both sides of the handover.
// Matching is by pkh: the badge's `id` is the terminal's roster id, not the shop's courier id,
// but the key hash is the same fact in both systems.
//
// Rendered through a portal so the dialog lives outside the order list's subtree — nothing the
// polling list does can remount it, which matters with a live camera inside.

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import jtExpressLogo from '../../assets/couriers/jt-express-demo.png';
import ninjaVanLogo from '../../assets/couriers/ninja-van-demo.png';
import { HashValue } from '../../components/custody/hash-value.js';
import { Button } from '../../components/ui/button.js';
import type { ShopCourier } from '../../infrastructure/api-client.js';
import { parseQrPayload } from '../courier/qr-payloads.js';
import { ScanPanel } from '../courier/scan-panel.js';

export function BadgeScanDialog({ couriers, onAssign, onCancel }: {
  couriers: ShopCourier[];
  onAssign: (courier: ShopCourier) => void;
  onCancel: () => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  /** A successful scan lands here first — assignment happens only on the explicit confirm. */
  const [candidate, setCandidate] = useState<ShopCourier | null>(null);
  const reduced = useReducedMotion();

  const read = (text: string) => {
    const payload = parseQrPayload(text, 'courier');
    if (!payload || payload.t !== 'courier') {
      setProblem('That is not a courier badge. Ask the courier to open “My badge” in their terminal.');
      return;
    }
    const pkh = payload.pkh.toLowerCase();
    const courier = couriers.find((entry) => entry.pkh.toLowerCase() === pkh);
    if (!courier) {
      setProblem('That badge does not belong to a registered courier.');
      return;
    }
    setProblem(null);
    setCandidate(courier);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  /** Same vocabulary as the rest of the app: short, easeOut, small offsets, off under reduced motion. */
  const step = {
    initial: reduced ? false as const : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: reduced ? undefined : { opacity: 0 },
    transition: { duration: 0.16, ease: 'easeOut' as const },
  };

  return createPortal(
    <motion.div
      className="merchant-scan-overlay" role="presentation" onClick={onCancel}
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <motion.div
        className="merchant-scan-dialog" role="dialog" aria-modal="true" aria-label="Scan courier badge"
        onClick={(event) => event.stopPropagation()}
        initial={reduced ? false : { opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {candidate
            ? <motion.div key="preview" {...step}>
                <BadgePreview courier={candidate} onConfirm={() => onAssign(candidate)} onRescan={() => setCandidate(null)} onCancel={onCancel} />
              </motion.div>
            : <motion.div key="scan" {...step}>
                <ScanPanel
                  kicker="Assign courier"
                  title="Scan their badge"
                  hint="Ask the courier taking this parcel to open My badge in their terminal. Nothing is final until you approve the order."
                  pasteHint="Paste the badge payload."
                  armed
                  onDecode={read}
                  onCancel={onCancel}
                />
                {problem && <p className="shop-error" role="alert">{problem}</p>}
              </motion.div>}
        </AnimatePresence>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

/** The confirm step: who the badge belongs to, verbatim, before anything is assigned. */
function BadgePreview({ courier, onConfirm, onRescan, onCancel }: {
  courier: ShopCourier;
  onConfirm: () => void;
  onRescan: () => void;
  onCancel: () => void;
}) {
  const logo = courier.company === 'J&T Express' ? jtExpressLogo : courier.company === 'Ninja Van' ? ninjaVanLogo : null;

  return <div className="merchant-scan-confirm">
    <p className="shop-eyebrow">Badge recognised</p>
    <h2>Assign this courier?</h2>

    <div className="merchant-scan-confirm-card">
      {logo && <img src={logo} alt="" />}
      <div>
        <strong>{courier.name}</strong>
        <span>{courier.company}</span>
      </div>
    </div>

    <dl className="merchant-scan-confirm-facts">
      <div><dt>Key hash</dt><dd><HashValue value={courier.pkh} label="Courier key hash" /></dd></div>
    </dl>
    <p className="merchant-scan-confirm-note">
      This courier takes first custody when the parcel is minted. Nothing is final until you approve the order.
    </p>

    <div className="merchant-scan-confirm-actions">
      <Button type="button" onClick={onConfirm}>Assign courier</Button>
      <Button type="button" variant="outline" onClick={onRescan}>Scan again</Button>
      <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
    </div>
  </div>;
}
