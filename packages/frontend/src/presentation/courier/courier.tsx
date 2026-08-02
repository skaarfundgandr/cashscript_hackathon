import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { apiClient, type ParcelChainEntry } from '../../infrastructure/api-client.js';

import { ActionOverlay, type PendingAction } from './action-overlay.js';
import { CourierButton, Field, HashValue } from './bits.js';
import {
  courierByPkh,
  labelForPkh,
  resolveCourier,
  shortHash,
  shortParcelId,
  type CourierIdentity,
} from './couriers.js';
import { DELIVERED, standingFor, type CourierAction } from './custody.js';
import { AlertIcon, BadgeIcon, BoxIcon, RefreshIcon, ScanIcon } from './icons.js';
import { Deliveries } from './deliveries.js';
import { ParcelPanel } from './parcel-panel.js';
import { QrCode } from './qr-code.js';
import { encodePayload, parseQrPayload, type QrPayloadType } from './qr-payloads.js';
import { ScanPanel } from './scan-panel.js';
import { SignIn } from './sign-in.js';

const SESSION_KEY = 'courier.session';
const DECLINED_KEY = (courierId: string) => `courier.declined.${courierId}`;

function readDeclined(courierId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(DECLINED_KEY(courierId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    // A corrupt entry must not cost the courier their whole screen.
    return new Set();
  }
}

/** How long "Signing" holds before the display advances to "Broadcasting". */
const SIGNING_HOLD_MS = 650;
const NOTICE_MS = 4200;

type Mode = 'work' | 'badge';
/**
 * What the scanner has been armed to expect. The camera is never open speculatively — it opens
 * because an action needs one specific code, and it closes when that code arrives or is cancelled.
 */
type Arm = Extract<QrPayloadType, 'parcel' | 'courier' | 'delivery'>;

interface Notice {
  tone: 'error' | 'ok';
  text: string;
}

export function CourierApp() {
  const [courier, setCourier] = useState<CourierIdentity | null>(() => {
    const stored = window.localStorage.getItem(SESSION_KEY);
    return stored ? resolveCourier(stored) : null;
  });

  const signIn = (next: CourierIdentity) => {
    window.localStorage.setItem(SESSION_KEY, next.id);
    setCourier(next);
  };

  const signOut = () => {
    window.localStorage.removeItem(SESSION_KEY);
    setCourier(null);
  };

  return (
    <div className="courier">
      {courier
        ? <Terminal courier={courier} onSignOut={signOut} key={courier.id} />
        : <SignIn onSignIn={signIn} />}
    </div>
  );
}

function Terminal({ courier, onSignOut }: { courier: CourierIdentity; onSignOut: () => void }) {
  const [mode, setMode] = useState<Mode>('work');
  const [parcelId, setParcelId] = useState<string | null>(null);
  /** Bumped after every broadcast so the work list re-reads instead of showing a chain it outran. */
  const [manifestKey, setManifestKey] = useState(0);
  const [chain, setChain] = useState<ParcelChainEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const [arm, setArm] = useState<Arm | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  /**
   * A delivery this device broadcast. Kept because `GET /parcel/:id` cannot read a parcel once the
   * NFT has left the covenant — the courier still deserves their receipt.
   */
  const [closed, setClosed] = useState<{ txid: string } | null>(null);
  /**
   * Handoffs this courier declined. Local by necessity — declining signs nothing, so there is no
   * chain fact to read it back from and no other device that could learn about it.
   */
  const [declined, setDeclined] = useState<Set<string>>(() => readDeclined(courier.id));

  const reduced = useReducedMotion();

  const noticeTimer = useRef(0);
  const notify = useCallback((tone: Notice['tone'], text: string) => {
    window.clearTimeout(noticeTimer.current);
    setNotice({ tone, text });
    noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const standing = useMemo(
    () => (chain.length > 0 ? standingFor(chain, courier) : null),
    [chain, courier],
  );

  /**
   * A chain that still reads `0x02` after this device closed the parcel is a stale read, not the
   * truth — the last read failed and the previous hops were kept on screen. The local receipt wins.
   */
  const showReceipt = closed !== null && standing?.state !== DELIVERED;

  /** Keeps the last good chain when a read fails: a stale record beats a blank screen mid-handover. */
  const readChain = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const next = await apiClient.getParcel(id);
      setChain(next);
      setChainError(null);
    } catch (err) {
      setChainError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const openParcel = useCallback((id: string) => {
    setArm(null);
    setMode('work');
    setParcelId(id);
    setChain([]);
    setChainError(null);
    setClosed(null);
    void readChain(id);
  }, [readChain]);

  const backToList = () => {
    setParcelId(null);
    setChain([]);
    setChainError(null);
    setClosed(null);
    setArm(null);
    setManifestKey((key) => key + 1);
  };

  const undecline = (id: string) => {
    setDeclined((current) => {
      const next = new Set(current);
      next.delete(id);
      window.localStorage.setItem(DECLINED_KEY(courier.id), JSON.stringify([...next]));
      return next;
    });
  };

  const handleScan = useCallback((text: string) => {
    const payload = parseQrPayload(text, arm ?? undefined);
    if (!payload) {
      notify('error', 'That code is not one this app recognises.');
      return;
    }

    if (payload.t === 'parcel') {
      notify('ok', `Label scanned · ${shortParcelId(payload.id)}`);
      openParcel(payload.id);
      return;
    }

    // Both remaining payloads act on the parcel already on screen; `arm` is only ever set from it.
    if (arm === null || parcelId === null) {
      notify('error', payload.t === 'courier'
        ? 'That is a courier badge. Open a parcel and tap Hand off first.'
        : 'That is a delivery code. Open the parcel and tap Scan delivery code first.');
      return;
    }

    if (payload.t === 'courier') {
      if (arm !== 'courier') {
        notify('error', 'That is a courier badge. Tap Hand off on the parcel first.');
        return;
      }
      const badgePkh = payload.pkh.toLowerCase();
      if (badgePkh === courier.pkh) {
        notify('error', 'That badge is yours. Scan the courier receiving the parcel.');
        return;
      }
      const next = courierByPkh(badgePkh) ?? resolveCourier(payload.id);
      const nextKey = next?.custodyKey ?? payload.id;
      const nextName = next?.name ?? payload.name ?? `Courier ${shortHash(badgePkh, 6, 4)}`;
      notify('ok', `Badge scanned · ${nextName}`);
      setArm(null);
      setPending({
        stage: 'confirm',
        action: 'handoff',
        subject: nextName,
        details: (
          <>
            <div className="c-sheet-row"><span>Receiving</span><strong>{nextName}</strong></div>
            <div className="c-sheet-row"><span>Key hash</span><HashValue value={badgePkh} /></div>
          </>
        ),
        run: () => apiClient.handoff(parcelId, courier.custodyKey, nextKey),
      });
      return;
    }

    if (arm !== 'delivery') {
      notify('error', 'That is a delivery code. Tap Scan delivery code on the parcel first.');
      return;
    }
    if (payload.id && payload.id !== parcelId) {
      notify('error', 'That code belongs to a different parcel.');
      return;
    }
    notify('ok', 'Delivery code scanned · confirm to close the parcel');
    setArm(null);
    setPending({
      stage: 'confirm',
      action: 'scan-delivery',
      details: (
        <>
          <div className="c-sheet-row"><span>Parcel</span><strong>{shortParcelId(parcelId)}</strong></div>
          <div className="c-sheet-row"><span>Code</span><HashValue value={payload.secret} /></div>
        </>
      ),
      run: () => apiClient.confirmDelivery(parcelId, courier.custodyKey, payload.secret),
    });
  }, [arm, courier, notify, openParcel, parcelId]);

  const startAction = (action: CourierAction) => {
    if (!parcelId) return;
    // The camera opens because an action needs one specific code — never speculatively.
    if (action === 'handoff') return setArm('courier');
    if (action === 'scan-delivery') return setArm('delivery');

    if (action === 'decline') {
      // The releasing courier is the hop before the tip; the commitment names the incoming one.
      const releasedBy = chain[chain.length - 2]?.custodian.toLowerCase();
      return setPending({
        stage: 'confirm',
        action,
        subject: releasedBy ? labelForPkh(releasedBy) : undefined,
        apply: () => {
          setDeclined((current) => {
            const next = new Set(current).add(parcelId);
            window.localStorage.setItem(DECLINED_KEY(courier.id), JSON.stringify([...next]));
            return next;
          });
          setParcelId(null);
          setManifestKey((key) => key + 1);
          notify('ok', 'Cleared from your list. Custody did not move.');
        },
      });
    }

    setPending({
      stage: 'confirm',
      action,
      run: action === 'accept'
        ? () => apiClient.acceptHandoff(parcelId, courier.custodyKey)
        : () => apiClient.requestDelivery(parcelId, courier.custodyKey),
    });
  };

  const runPending = async () => {
    if (!pending || pending.stage !== 'confirm' || !parcelId) return;
    const { action, run, apply } = pending;

    // Declining broadcasts nothing, so it skips the signing theatre entirely.
    if (apply) {
      apply();
      setPending(null);
      return;
    }
    if (!run) return;

    setPending({ stage: 'signing', action });
    const advance = window.setTimeout(
      () => setPending((current) => (current?.stage === 'signing' ? { stage: 'broadcasting', action } : current)),
      SIGNING_HOLD_MS,
    );

    try {
      const { txid } = await run();
      window.clearTimeout(advance);
      setPending({ stage: 'done', action, txid });
      if (action === 'scan-delivery') setClosed({ txid });
      await readChain(parcelId);
    } catch (err) {
      window.clearTimeout(advance);
      setPending({ stage: 'failed', action, message: err instanceof Error ? err.message : String(err) });
    }
  };

  const scanCopy = arm === 'courier'
    ? {
        kicker: 'Handing off',
        title: 'Scan their badge',
        hint: 'Ask the receiving courier to open My badge. Custody does not move until you confirm.',
        pasteHint: 'Paste their badge payload.',
      }
    : arm === 'delivery'
      ? {
          kicker: 'Delivering',
          title: 'Scan the recipient\'s code',
          hint: 'The buyer reveals this on their order page. It is a bearer secret — it closes the parcel.',
          pasteHint: 'Paste the delivery payload, or the raw code.',
        }
      : {
          kicker: 'Opening a parcel',
          title: 'Scan a box label',
          hint: 'Point the camera at the label on the parcel.',
          pasteHint: 'Paste a label payload, or the contract address.',
        };

  return (
    <>
      <header className="c-top">
        <div className="c-brand">
          <span className="c-brand-name">Hermes</span>
          <span className="c-brand-tag">Courier</span>
        </div>
        <div className="c-modes" role="tablist" aria-label="Terminal mode">
          <button type="button" role="tab" aria-selected={mode === 'work'} className="c-mode" onClick={() => { setMode('work'); setArm(null); }}>
            <BoxIcon className="c-icon" />Deliveries
          </button>
          <button type="button" role="tab" aria-selected={mode === 'badge'} className="c-mode" onClick={() => setMode('badge')}>
            <BadgeIcon className="c-icon" />My badge
          </button>
        </div>
        <div className="c-who">
          <span className="c-who-initials" aria-hidden="true">
            {courier.name.split(' ').map((part) => part[0]).join('')}
          </span>
          <span className="c-who-body">
            <span className="c-who-name">{courier.name}</span>
            <span className="c-who-meta">{courier.company} · {courier.id}</span>
          </span>
          <CourierButton variant="quiet" onClick={onSignOut}>End shift</CourierButton>
        </div>
      </header>

      <main className="c-body">
        <AnimatePresence mode="wait" initial={false}>
          {mode === 'badge' ? (
            <BadgePanel key="badge" courier={courier} />
          ) : arm ? (
            <ScanPanel
              key={`arm-${arm}`}
              armed={arm !== 'parcel'}
              {...scanCopy}
              onDecode={handleScan}
              onCancel={() => setArm(null)}
            />
          ) : !parcelId ? (
            <Deliveries
              key="deliveries"
              courier={courier}
              refreshKey={manifestKey}
              declined={declined}
              onOpen={openParcel}
              onScanLabel={() => setArm('parcel')}
              onUndecline={undecline}
            />
          ) : showReceipt ? (
            <ClosedReceipt key="closed" parcelId={parcelId} txid={closed!.txid} onBack={backToList} />
          ) : standing ? (
            <ParcelPanel
              key="parcel"
              parcelId={parcelId}
              chain={chain}
              courier={courier}
              standing={standing}
              refreshing={loading}
              onAction={startAction}
              onRefresh={() => void readChain(parcelId)}
              onBack={backToList}
            />
          ) : loading ? (
            <Loading key="loading" />
          ) : (
            <ChainError key="chain-error" message={chainError} onRetry={() => void readChain(parcelId)} onBack={backToList} />
          )}
        </AnimatePresence>

        {/* The receipt already explains why the last read failed; repeating it in red just alarms. */}
        {chainError && chain.length > 0 && !showReceipt && (
          <p className="c-stale" role="status">Last read failed — showing the previous chain. {chainError}</p>
        )}
      </main>

      {/* Keyed by text so a second scan re-plays the entrance instead of silently swapping the
          words — every scan is its own acknowledgement. Same motion as the app's toast. */}
      <AnimatePresence mode="wait">
        {notice && (
          <motion.p
            className={`c-notice c-notice-${notice.tone}`}
            key={notice.text}
            role="status"
            initial={reduced ? false : { opacity: 0, x: 40, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, y: 10 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {notice.text}
          </motion.p>
        )}
      </AnimatePresence>

      <ActionOverlay
        pending={pending}
        onCancel={() => setPending(null)}
        onConfirm={() => void runPending()}
        onDismiss={() => setPending(null)}
      />
    </>
  );
}

function BadgePanel({ courier }: { courier: CourierIdentity }) {
  const payload = encodePayload({
    t: 'courier',
    id: courier.id,
    pkh: courier.pkh,
    name: courier.name,
    company: courier.company,
  });

  return (
    <motion.section
      className="c-badge"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <p className="c-kicker">Your badge</p>
      <h2 className="c-scan-title">Show this to release</h2>
      <p className="c-scan-hint">
        The courier handing you a parcel scans this.
      </p>

      <div className="c-badge-plate">
        <QrCode value={payload} label={`Courier badge for ${courier.name}`} />
        <p className="c-badge-safe">Safe to show anyone</p>
      </div>

      <div className="c-facts">
        <Field label="Courier"><span>{courier.name} · {courier.company}</span></Field>
        <Field label="ID"><span className="c-mono">{courier.id}</span></Field>
        <Field label="Key hash"><HashValue value={courier.pkh} lead={12} tail={8} /></Field>
      </div>
    </motion.section>
  );
}

function ClosedReceipt({ parcelId, txid, onBack }: { parcelId: string; txid: string; onBack: () => void }) {
  return (
    <motion.section
      className="c-receipt"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <div className="c-receipt-perf" aria-hidden="true" />
      <p className="c-kicker">Delivered</p>
      <h2 className="c-receipt-title">You closed this parcel</h2>
      <p className="c-receipt-body">
        Delivered is terminal — the parcel left the covenant and there is no state after it.
      </p>
      <div className="c-facts">
        <Field label="Parcel"><HashValue value={parcelId} lead={14} tail={8} /></Field>
        <Field label="Transaction"><HashValue value={txid} lead={14} tail={8} /></Field>
      </div>
      <p className="c-receipt-note">
        The custody API cannot re-read a parcel once the token has left the contract address, so this
        receipt is the transaction this device broadcast rather than a fresh read.
      </p>
      <CourierButton variant="ghost" block icon={<BoxIcon className="c-icon" />} onClick={onBack}>
        Back to deliveries
      </CourierButton>
    </motion.section>
  );
}

function Loading() {
  return (
    <motion.div className="c-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status">
      <RefreshIcon className="c-icon c-icon-spin" />
      <span>Reading the chain…</span>
    </motion.div>
  );
}

function ChainError({ message, onRetry, onBack }: { message: string | null; onRetry: () => void; onBack: () => void }) {
  return (
    <motion.section
      className="c-fault"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      role="alert"
    >
      <AlertIcon className="c-fault-icon" />
      <h2 className="c-fault-title">Could not read this parcel</h2>
      <p className="c-fault-body">{message ?? 'The custody API returned nothing for that label.'}</p>
      <div className="c-actions">
        <CourierButton variant="primary" block onClick={onRetry} icon={<RefreshIcon className="c-icon" />}>Try again</CourierButton>
        <CourierButton variant="ghost" block onClick={onBack} icon={<BoxIcon className="c-icon" />}>Back to deliveries</CourierButton>
      </div>
    </motion.section>
  );
}
