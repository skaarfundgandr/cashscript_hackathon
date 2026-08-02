import { motion } from 'motion/react';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';

import { apiClient, shopApi, type ManifestEntry, type ParcelChainEntry } from '../../infrastructure/api-client.js';

import { CourierButton, StateDot } from './bits.js';
import { shortParcelId, type CourierIdentity } from './couriers.js';
import { AWAITING_ACCEPTANCE, standingFor, type Involvement, type ParcelStanding } from './custody.js';
import { AlertIcon, ArrowRightIcon, RefreshIcon, ScanIcon } from './icons.js';

interface DeliveryRow {
  entry: ManifestEntry;
  standing: ParcelStanding | null;
  /** Set when this parcel's chain would not read. Delivered parcels do this on the real backend. */
  error: string | null;
}

/** `declined` is not an Involvement — it is a local overlay, so it gets its own bucket key. */
type Bucket = Involvement | 'declined';

const SECTIONS: Array<{ key: Bucket; title: string; note?: string }> = [
  { key: 'yours', title: 'Assigned to you' },
  { key: 'watching', title: 'Released — still your liability', note: 'You signed these away. Until the other courier accepts, they are still on you.' },
  { key: 'declined', title: 'Declined', note: 'Nothing was signed, so these are still awaiting your acceptance on chain. Declining only hid them here.' },
  { key: 'closed', title: 'Delivered by you' },
  { key: 'other', title: 'Other couriers' },
];

export function Deliveries({
  courier,
  refreshKey,
  declined,
  onOpen,
  onScanLabel,
  onUndecline,
}: {
  courier: CourierIdentity;
  /** Bumped after every broadcast so the list re-reads rather than showing a chain it has outrun. */
  refreshKey: number;
  declined: Set<string>;
  onOpen: (parcelId: string) => void;
  onScanLabel: () => void;
  onUndecline: (parcelId: string) => void;
}) {
  const [rows, setRows] = useState<DeliveryRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const manifest = await shopApi.getManifest();
      // Each chain is read independently: one unreadable parcel must cost that row and no more.
      const next = await Promise.all(manifest.map(async (entry): Promise<DeliveryRow> => {
        try {
          const chain: ParcelChainEntry[] = await apiClient.getParcel(entry.parcelId);
          return { entry, standing: chain.length > 0 ? standingFor(chain, courier) : null, error: null };
        } catch (err) {
          return { entry, standing: null, error: err instanceof Error ? err.message : String(err) };
        }
      }));
      setRows(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [courier]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  return (
    <motion.section
      className="c-work"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <header className="c-work-head">
        <div>
          <p className="c-kicker">Your round</p>
          <h2 className="c-scan-title">Assigned deliveries</h2>
        </div>
        <CourierButton variant="quiet" onClick={() => void load()} disabled={loading} aria-label="Refresh">
          <RefreshIcon className={`c-icon${loading ? ' c-icon-spin' : ''}`} />
        </CourierButton>
      </header>

      {rows && <Summary rows={rows} declined={declined} />}

      {error && (
        <div className="c-work-fault" role="alert">
          <AlertIcon className="c-icon" />
          <span>{error}</span>
        </div>
      )}

      {loading && rows === null ? (
        <div className="c-loading" role="status"><RefreshIcon className="c-icon c-icon-spin" /><span>Reading the chain…</span></div>
      ) : rows && rows.length > 0 ? (
        SECTIONS.map((section) => {
          const inSection = rows.filter((row) => bucketOf(row, declined) === section.key);
          if (inSection.length === 0) return null;
          return (
            <div className="c-work-section" key={section.key} data-tone={section.key}>
              <p className="c-kicker">{section.title} · {inSection.length}</p>
              {section.note && <p className="c-work-note">{section.note}</p>}
              {inSection.map((row) => (
                <DeliveryCard
                  row={row}
                  key={row.entry.parcelId}
                  onOpen={onOpen}
                  onUndecline={section.key === 'declined' ? onUndecline : undefined}
                />
              ))}
            </div>
          );
        })
      ) : !error && (
        <div className="c-work-empty">
          <p>No parcels have been minted yet.</p>
          <p>Place an order in the shop, or scan a label you were handed.</p>
        </div>
      )}

      <CourierButton variant="ghost" block icon={<ScanIcon className="c-icon" />} onClick={onScanLabel}>
        Scan a box label
      </CourierButton>
    </motion.section>
  );
}

/**
 * Three headline numbers, so a KPI row of stat tiles rather than a chart — there is no series and
 * no time axis here, and a three-bar chart of three integers would be strictly worse than the
 * integers.
 *
 * The middle tile is the one that belongs to *this* product. "On you" counts what the courier is
 * liable for, which is not the same as what they are holding: a parcel released and not yet
 * accepted is out of their hands and still their responsibility. That gap is the thing a custody
 * system exists to make visible, so it gets a number rather than a paragraph.
 */
function Summary({ rows, declined }: { rows: DeliveryRow[]; declined: Set<string> }) {
  const buckets = rows.map((row) => bucketOf(row, declined));
  const needsYou = rows.filter((row, index) => buckets[index] === 'yours' && (row.standing?.actions.length ?? 0) > 0).length;
  const onYou = rows.filter((row, index) => {
    if (buckets[index] === 'watching') return true;
    return buckets[index] === 'yours' && row.standing?.isMine === true;
  }).length;
  const delivered = buckets.filter((bucket) => bucket === 'closed').length;

  return (
    <div className="c-kpis">
      <Stat label="Needs you" value={needsYou} lead />
      <Stat label="On you" value={onYou} hint="incl. released" />
      <Stat label="Delivered" value={delivered} />
    </div>
  );
}

function Stat({ label, value, hint, lead }: { label: string; value: number; hint?: string; lead?: boolean }) {
  return (
    <div className={`c-kpi${lead && value > 0 ? ' c-kpi-lead' : ''}`}>
      <p className="c-kpi-value">{value}</p>
      <p className="c-kpi-label">{label}</p>
      {hint && <p className="c-kpi-hint">{hint}</p>}
    </div>
  );
}

/**
 * A declined handoff still reads `0x01 · awaiting you` on chain, because declining signed nothing.
 * The local overlay only wins while that is still the state — once it moves, the chain is the truth
 * again and the row returns to wherever it now belongs.
 */
function bucketOf(row: DeliveryRow, declined: Set<string>): Bucket {
  const involvement = row.standing?.involvement ?? 'other';
  if (involvement === 'yours' && declined.has(row.entry.parcelId) && row.standing?.state === AWAITING_ACCEPTANCE) {
    return 'declined';
  }
  return involvement;
}

function DeliveryCard({
  row,
  onOpen,
  onUndecline,
}: {
  row: DeliveryRow;
  onOpen: (parcelId: string) => void;
  onUndecline?: (parcelId: string) => void;
}) {
  const { entry, standing, error } = row;
  const tone = standing?.meta.tone ?? 'unknown';

  return (
    <div className="c-work-item" style={{ '--c-state': `var(--c-${tone})` } as CSSProperties}>
      <button type="button" className="c-work-card" onClick={() => onOpen(entry.parcelId)}>
        <span className="c-work-rail" aria-hidden="true" />
        <span className="c-work-art"><img src={entry.product.imageUrl} alt="" /></span>
        <span className="c-work-body">
          <span className="c-work-state">
            <StateDot tone={tone} />
            {error ? 'Chain unreadable' : standing?.meta.label ?? 'No custody record'}
          </span>
          <span className="c-work-product">{entry.product.name}</span>
          <span className="c-work-meta">#{entry.orderId} · {entry.buyer.name}</span>
          <span className="c-work-headline">{error ? 'The custody API would not return this parcel.' : standing?.headline ?? '—'}</span>
        </span>
        <span className="c-work-tail">
          <span className="c-work-id">{shortParcelId(entry.parcelId)}</span>
          <ArrowRightIcon className="c-icon" />
        </span>
      </button>
      {onUndecline && (
        <CourierButton variant="quiet" className="c-work-undo" onClick={() => onUndecline(entry.parcelId)}>
          Put it back
        </CourierButton>
      )}
    </div>
  );
}
