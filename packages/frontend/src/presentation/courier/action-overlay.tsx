import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';

import { CourierButton, TxLink } from './bits.js';
import { actionCopy, type CourierAction } from './custody.js';
import { AlertIcon, CheckIcon } from './icons.js';

export type PendingAction =
  /** `run` broadcasts; `apply` is the local-only path (decline), and exactly one is ever set. */
  | { stage: 'confirm'; action: CourierAction; subject?: string; details?: ReactNode; run?: () => Promise<{ txid: string }>; apply?: () => void }
  | { stage: 'signing'; action: CourierAction }
  | { stage: 'broadcasting'; action: CourierAction }
  | { stage: 'done'; action: CourierAction; txid: string }
  | { stage: 'failed'; action: CourierAction; message: string };

const DONE_HEADLINE: Record<CourierAction, string> = {
  handoff: 'Custody released',
  accept: 'Custody accepted',
  decline: 'Cleared from your list',
  'request-delivery': 'Out for delivery',
  'scan-delivery': 'Delivered',
};

export function ActionOverlay({
  pending,
  onCancel,
  onConfirm,
  onDismiss,
}: {
  pending: PendingAction | null;
  onCancel: () => void;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          className="c-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <motion.div
            className="c-sheet"
            role="dialog"
            aria-modal="true"
            initial={{ y: 32, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <SheetBody pending={pending} onCancel={onCancel} onConfirm={onConfirm} onDismiss={onDismiss} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SheetBody({
  pending,
  onCancel,
  onConfirm,
  onDismiss,
}: {
  pending: PendingAction;
  onCancel: () => void;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const copy = actionCopy(pending.action, 'subject' in pending ? pending.subject : undefined);

  if (pending.stage === 'confirm') {
    return (
      <>
        {copy.liability && <div className="c-hazard" aria-hidden="true" />}
        <h2 className="c-sheet-title">{copy.question}</h2>
        <p className="c-sheet-consequence">{copy.consequence}</p>
        {/* Said plainly rather than left to be inferred from the absence of a txid afterwards. */}
        {copy.local && <p className="c-sheet-local">Nothing is broadcast. This device only.</p>}
        {pending.details && <div className="c-sheet-details">{pending.details}</div>}
        <div className="c-sheet-actions">
          <CourierButton variant="ghost" block onClick={onCancel}>Cancel</CourierButton>
          {/* Hi-vis, not red: the action is consequential, not a mistake. The hazard band above is
              what marks a liability window — red here would read as "something went wrong". */}
          <CourierButton variant="primary" block onClick={onConfirm}>{copy.confirm}</CourierButton>
        </div>
      </>
    );
  }

  if (pending.stage === 'signing' || pending.stage === 'broadcasting') {
    return (
      <>
        <p className="c-kicker">{copy.label}</p>
        {/*
          The custody backend signs and broadcasts inside one request, so the boundary between the
          two is not observable from here. The steps are shown in order and advanced on a timer —
          an indicator of what the backend is doing, not a claim to have watched it happen.
        */}
        <ol className="c-steps">
          <Step label="Signing" state={pending.stage === 'signing' ? 'active' : 'done'} />
          <Step label="Broadcasting" state={pending.stage === 'broadcasting' ? 'active' : 'waiting'} />
        </ol>
      </>
    );
  }

  if (pending.stage === 'done') {
    return (
      <>
        <div className="c-sheet-seal"><CheckIcon className="c-icon" /></div>
        <h2 className="c-sheet-title">{DONE_HEADLINE[pending.action]}</h2>
        <p className="c-sheet-consequence">Signed under your key and broadcast to chipnet.</p>
        <div className="c-sheet-details">
          <div className="c-sheet-row"><span>Transaction</span><TxLink txid={pending.txid} /></div>
        </div>
        <CourierButton variant="primary" block onClick={onDismiss}>Done</CourierButton>
      </>
    );
  }

  return (
    <>
      <div className="c-sheet-seal c-sheet-seal-bad"><AlertIcon className="c-icon" /></div>
      <h2 className="c-sheet-title">{copy.label} failed</h2>
      <p className="c-sheet-error">{pending.message}</p>
      <p className="c-sheet-consequence">Nothing moved. The parcel is exactly where it was.</p>
      <CourierButton variant="ghost" block onClick={onDismiss}>Close</CourierButton>
    </>
  );
}

function Step({ label, state }: { label: string; state: 'waiting' | 'active' | 'done' }) {
  return (
    <li className="c-step" data-state={state}>
      <span className="c-step-mark" aria-hidden="true">{state === 'done' ? <CheckIcon className="c-icon" /> : null}</span>
      <span className="c-step-label">{label}{state === 'active' ? '…' : ''}</span>
    </li>
  );
}
