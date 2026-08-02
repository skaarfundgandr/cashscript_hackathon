import type { ParcelView } from '../../domain/parcel.js';
import { parcelStateLabel } from '../../domain/parcel.js';
import { HashValue } from './hash-value.js';
import { StateBadge } from './state-badge.js';
import { TxLink } from './tx-link.js';

export type CustodyTimelineState = 'loading' | 'not-found' | 'ready';

export function CustodyTimeline({ state, parcel }: { state: CustodyTimelineState; parcel?: ParcelView }) {
  if (state === 'loading') return <div className="custody-timeline custody-timeline-skeleton" aria-label="Loading custody history"><span /><span /><span /></div>;
  if (state === 'not-found' || !parcel) return <div className="custody-timeline custody-timeline-empty">This parcel record could not be found.</div>;
  if (parcel.parcelId === null) return <div className="custody-timeline custody-timeline-pending">Custody attaching…</div>;

  const currentHop = parcel.hops.at(-1);
  const deliveredHop = currentHop?.state === 0x04 ? currentHop : null;

  return <section className="custody-timeline" aria-label="Custody history">
    {!parcel.custodyAvailable && <p className="custody-unavailable">The chain could not be read right now. Your order is still safe.</p>}
    {currentHop && <div className="custody-current-state"><span>Current custody state</span><StateBadge state={currentHop.state} /></div>}
    {parcel.hops.length === 0 && parcel.custodyAvailable && <p className="custody-timeline-empty">Custody history will appear here when it is recorded.</p>}
    <ol className="custody-hop-list">
      {[...parcel.hops].reverse().map((hop) => (
        <li className="custody-hop" key={`${hop.txid}-${hop.state}`}>
          <StateBadge state={hop.state} />
          <div className="custody-hop-detail">
            <strong>{hop.actorLabel ?? <HashValue value={hop.custodian} label="Custodian" />}</strong>
            {hop.timestamp !== undefined && <time dateTime={new Date(hop.timestamp).toISOString()}>{formatTime(hop.timestamp)}</time>}
          </div>
          <TxLink txid={hop.txid} />
        </li>
      ))}
    </ol>
    {deliveredHop && <section className="custody-delivery-receipt">
      <h3>Delivery receipt</h3>
      <dl>
        <div><dt>Delivered by</dt><dd>{deliveredHop.actorLabel ?? <HashValue value={deliveredHop.custodian} label="Recipient" />}</dd></div>
        {deliveredHop.timestamp !== undefined && <div><dt>When</dt><dd>{formatTime(deliveredHop.timestamp)}</dd></div>}
        {deliveredHop.blockHeight !== undefined && <div><dt>Block height</dt><dd>{deliveredHop.blockHeight}</dd></div>}
        <div><dt>Transaction</dt><dd><TxLink txid={deliveredHop.txid} /></dd></div>
      </dl>
    </section>}
  </section>;
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

export function currentParcelState(parcel: ParcelView): string | null {
  const hop = parcel.hops.at(-1);
  return hop ? parcelStateLabel(hop.state) : null;
}
