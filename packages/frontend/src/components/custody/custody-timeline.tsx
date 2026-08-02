import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import type { ParcelView } from '../../domain/parcel.js';
import { parcelStateLabel } from '../../domain/parcel.js';
import { HashValue } from './hash-value.js';
import { StateBadge } from './state-badge.js';
import { TxLink } from './tx-link.js';

export type CustodyTimelineState = 'loading' | 'not-found' | 'ready';

export function CustodyTimeline({ state, parcel }: { state: CustodyTimelineState; parcel?: ParcelView }) {
  const reduced = useReducedMotion();

  if (state === 'loading') return <div className="custody-timeline custody-timeline-skeleton" aria-label="Loading custody history"><span /><span /><span /></div>;
  if (state === 'not-found' || !parcel) return <div className="custody-timeline custody-timeline-empty">This parcel record could not be found.</div>;
  if (parcel.parcelId === null) return <div className="custody-timeline custody-timeline-pending">Custody attaching…</div>;

  const currentHop = parcel.hops.at(-1);
  const deliveredHop = currentHop?.state === 0x04 ? currentHop : null;

  return <section className="custody-timeline" aria-label="Custody history">
    {!parcel.custodyAvailable && <p className="custody-unavailable">The chain could not be read right now. Your order is still safe.</p>}
    {/* Keyed by state: when the chain moves, the badge visibly re-lands rather than mutating. */}
    {currentHop && <div className="custody-current-state"><span>Current custody state</span>
      <motion.span
        key={`${currentHop.txid}-${currentHop.state}`} style={{ display: 'inline-flex' }}
        initial={reduced ? false : { opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      ><StateBadge state={currentHop.state} /></motion.span>
    </div>}
    {parcel.hops.length === 0 && parcel.custodyAvailable && <p className="custody-timeline-empty">Custody history will appear here when it is recorded.</p>}
    <ol className="custody-hop-list">
      {/* New hops arrive at the top while the page polls — a courier's action lands as movement
          on the buyer's screen, not a silent row swap. */}
      <AnimatePresence initial={false}>
        {[...parcel.hops].reverse().map((hop) => (
          <motion.li
            className="custody-hop" key={`${hop.txid}-${hop.state}`}
            layout={!reduced}
            initial={reduced ? false : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
          >
            <StateBadge state={hop.state} />
            <div className="custody-hop-detail">
              <strong>{hop.actorLabel ?? <HashValue value={hop.custodian} label="Custodian" />}</strong>
              {hop.timestamp !== undefined && <time dateTime={new Date(hop.timestamp).toISOString()}>{formatTime(hop.timestamp)}</time>}
            </div>
            <TxLink txid={hop.txid} />
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
    {deliveredHop && <motion.section
      className="custody-delivery-receipt"
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: 'easeOut' }}
    >
      <h3>Delivery receipt</h3>
      <dl>
        <div><dt>Delivered by</dt><dd>{deliveredHop.actorLabel ?? <HashValue value={deliveredHop.custodian} label="Recipient" />}</dd></div>
        {deliveredHop.timestamp !== undefined && <div><dt>When</dt><dd>{formatTime(deliveredHop.timestamp)}</dd></div>}
        {deliveredHop.blockHeight !== undefined && <div><dt>Block height</dt><dd>{deliveredHop.blockHeight}</dd></div>}
        <div><dt>Transaction</dt><dd><TxLink txid={deliveredHop.txid} /></dd></div>
      </dl>
    </motion.section>}
  </section>;
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

export function currentParcelState(parcel: ParcelView): string | null {
  const hop = parcel.hops.at(-1);
  return hop ? parcelStateLabel(hop.state) : null;
}
