// The public parcel record: `#/p/:parcelId`. Read-only, no auth, no login — anyone holding the
// parcel address may open it, the same way a courier tracking number works.
//
// Record-first layout. The chain is the point of the page, so it starts immediately under a
// one-line header strip; the claim band, receipt and record facts sit BELOW it, where someone
// who wants to verify goes looking. Proof leads, explanation follows.
//
// No top search bar and no left rail: a top search on a record page reads as "look up another
// parcel", which is the one thing this page cannot do. Row search lives inside the ledger card's
// own toolbar, and the state filters are pills that double as a summary of the chain.

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';

import { Button } from '../../components/ui/button.js';
import { parcelStateLabel } from '../../domain/parcel.js';
import { ShopApiError, type PublicParcel, type ShopCustodyHop } from '../../infrastructure/api-client.js';
import {
  actorOf, clockOf, commitmentOf, explorerAddress, explorerTx, logoOf, STATE_PROOF, truncate,
} from './format.js';
import { ChevronIcon, ExternalIcon, SearchIcon, ShieldIcon } from './icons.js';
import { usePublicParcel } from './use-public-parcel.js';

const NETWORK = 'chipnet';
const STATES = [0x00, 0x01, 0x02, 0x04];
type Sort = 'oldest' | 'newest';

/** Index is the hop's position in the *chain*, so it stays stable under filtering and sorting. */
interface NumberedHop { hop: ShopCustodyHop; index: number }

const hex2 = (state: number) => state.toString(16).padStart(2, '0');

export function PublicParcelPage({ parcelId }: { parcelId: string }) {
  const { parcel, error, isLoading, isStale, checkedAt } = usePublicParcel(parcelId);

  if (isLoading) return <PublicParcelSkeleton />;
  if (!parcel || error) {
    return <PublicParcelStatus>
      {error instanceof ShopApiError && error.status === 404
        ? 'No record exists for this parcel address.'
        : 'The chain could not be read right now. Try again in a moment.'}
    </PublicParcelStatus>;
  }

  return <PublicParcelLedger parcel={parcel} isStale={isStale} checkedAt={checkedAt ?? Date.now()} />;
}

/** The record page in outline: head, pills, ledger rows. Pulsing blocks, never the word "Loading". */
function PublicParcelSkeleton() {
  return <div className="pv">
    <header className="pv-topbar">
      <div className="pv-brand">Hermes</div>
      <span className="pv-brand-sub">Public custody record</span>
    </header>
    <main className="pv-record" role="status" aria-label="Loading parcel record" aria-busy="true">
      <div aria-hidden="true">
        <span className="pv-skel pv-skel-eyebrow" />
        <span className="pv-skel pv-skel-title" />
        <div className="pv-skel-pills">
          {[0, 1, 2, 3].map((index) => <span className="pv-skel pv-skel-pill" key={index} />)}
        </div>
        <div className="pv-card pv-skel-ledger">
          {[0, 1, 2, 3, 4].map((index) => <span className="pv-skel pv-skel-row" key={index} />)}
        </div>
      </div>
    </main>
  </div>;
}

function PublicParcelStatus({ children }: { children: ReactNode }) {
  return <div className="pv">
    <header className="pv-topbar">
      <div className="pv-brand">Hermes</div>
      <span className="pv-brand-sub">Public custody record</span>
    </header>
    <main className="pv-record">
      <p className="pv-empty">{children}</p>
    </main>
  </div>;
}

function PublicParcelLedger({ parcel, isStale, checkedAt }: { parcel: PublicParcel; isStale: boolean; checkedAt: number }) {
  const [selectedStates, setSelectedStates] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('oldest');
  const [showRaw, setShowRaw] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const reduced = useReducedMotion();

  /** Same vocabulary as the lookup page: short, easeOut, small offsets, gone entirely under
   *  prefers-reduced-motion. This is what makes the page feel like it materializes on open. */
  const rise = (delay: number) => reduced
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.26, ease: 'easeOut' as const, delay },
      };

  const numbered = useMemo<NumberedHop[]>(
    () => parcel.chain.map((hop, index) => ({ hop, index: index + 1 })),
    [parcel.chain],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = numbered.filter(({ hop }) => {
      if (selectedStates.size > 0 && !selectedStates.has(hop.state)) return false;
      if (!needle) return true;
      return `${actorOf(hop)} ${hop.custodian} ${hop.txid} ${parcelStateLabel(hop.state)}`.toLowerCase().includes(needle);
    });
    return sort === 'oldest' ? matched : [...matched].reverse();
  }, [numbered, selectedStates, query, sort]);

  const countOf = (state: number) => parcel.chain.filter((hop) => hop.state === state).length;
  const isFiltered = selectedStates.size > 0 || query.trim() !== '';

  const toggleState = (state: number) => {
    setSelectedStates((current) => {
      const next = new Set(current);
      if (next.has(state)) next.delete(state); else next.add(state);
      return next;
    });
  };

  const clearAll = () => { setSelectedStates(new Set()); setQuery(''); };

  const current = parcel.chain.at(-1);
  const delivered = current?.state === 0x04 ? current : null;

  return <div className="pv">
    <header className="pv-topbar">
      <div className="pv-brand">Hermes</div>
      <span className="pv-brand-sub">Public custody record</span>
      <nav className="pv-topnav" aria-label="Public record">
        <a href={explorerAddress(parcel.contractAddress)} target="_blank" rel="noreferrer">Open on {NETWORK}</a>
      </nav>
    </header>

    <main className="pv-record">
      <motion.header className="pv-head" {...rise(0)}>
        <p className="pv-eyebrow">Parcel record</p>
        <div className="pv-head-row">
          <h1>{current ? <><i className={`pv-dot pv-dot-${hex2(current.state)}`} />{parcelStateLabel(current.state)}</> : 'No record'}</h1>
          <a className="pv-head-id" href={explorerAddress(parcel.contractAddress)} target="_blank" rel="noreferrer">
            {parcel.parcelId}<ExternalIcon />
          </a>
        </div>
      </motion.header>

      <motion.div className="pv-pills" role="group" aria-label="Filter by custody state" {...rise(0.05)}>
        {STATES.map((state) => (
          <button
            type="button" key={state}
            className="pv-pill"
            aria-pressed={selectedStates.has(state)}
            onClick={() => toggleState(state)}
          >
            <i className={`pv-dot pv-dot-${hex2(state)}`} />
            {parcelStateLabel(state)}
            <span className="pv-pill-count">{countOf(state)}</span>
          </button>
        ))}
      </motion.div>

      {isStale && <p className="pv-stale" role="status">
        The chain could not be read just now. Showing the last successful read, {clockOf(checkedAt)} — retrying.
      </p>}

      <motion.section className="pv-card pv-ledger" {...rise(0.1)}>
        <div className="pv-toolbar">
          <div className="pv-search-field pv-search-compact">
            <SearchIcon aria-hidden />
            <input
              className="pv-input"
              type="text"
              aria-label="Filter custody rows"
              placeholder="Filter rows by courier, key hash or transaction"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="pv-toolbar-controls">
            <Button type="button" variant="ghost" size="sm" aria-pressed={sort === 'oldest'} onClick={() => setSort('oldest')}>Oldest</Button>
            <Button type="button" variant="ghost" size="sm" aria-pressed={sort === 'newest'} onClick={() => setSort('newest')}>Newest</Button>
            <span className="pv-toolbar-divider" />
            <Button type="button" variant="ghost" size="sm" aria-pressed={showRaw} onClick={() => setShowRaw((raw) => !raw)}>Bytes</Button>
            {isFiltered && <Button type="button" variant="ghost" size="sm" onClick={clearAll}>Clear</Button>}
            <span className="pv-toolbar-count">{rows.length} of {parcel.chain.length} hops</span>
          </div>
        </div>

        {rows.length === 0 ? <div className="pv-empty">No custody rows match those filters.</div> : <>
          <div className="pv-row pv-row-head">
            <span>#</span><span>State</span><span>Custody</span><span>Transaction</span>
          </div>
          {/* layout + popLayout: filtering/sorting reflows rather than snaps, matching how
              marketplace.tsx animates its product grid. Entrance stagger is capped at 8 rows
              worth of delay so a long chain doesn't leave the last row waiting a full second. */}
          <motion.div layout={!reduced}>
            <AnimatePresence initial={false} mode="popLayout">
              {rows.map(({ hop, index }, position) => {
                const logo = logoOf(hop);
                const isOpen = expanded === hop.txid;
                return <motion.div
                  className="pv-row-group" key={hop.txid} layout={!reduced}
                  initial={reduced ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? undefined : { opacity: 0 }}
                  transition={{ duration: 0.22, ease: 'easeOut', delay: Math.min(position, 7) * 0.03 }}
                >
                  <div className="pv-row">
                    <span className="pv-index">{String(index).padStart(2, '0')}</span>
                    <span className="pv-state">
                      <span className={`pv-badge pv-badge-${hex2(hop.state)}`}>{parcelStateLabel(hop.state)}</span>
                      <small>0x{hex2(hop.state)}</small>
                    </span>
                    <span className="pv-actor">
                      {logo ? <img className="pv-logo" src={logo} alt="" /> : <span className="pv-logo pv-logo-empty" aria-hidden>—</span>}
                      <span className="pv-actor-text">
                        <strong>{actorOf(hop)}</strong>
                        <em>{STATE_PROOF[hop.state] ?? 'Signed on chain'}</em>
                        <code>{truncate(hop.custodian)}</code>
                      </span>
                    </span>
                    <span className="pv-tx">
                      <a href={explorerTx(hop.txid)} target="_blank" rel="noreferrer">{truncate(hop.txid)}<ExternalIcon /></a>
                      <button type="button" className="pv-expand" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : hop.txid)}>
                        <ChevronIcon open={isOpen} />bytes
                      </button>
                    </span>
                  </div>
                  <AnimatePresence initial={false}>
                    {(isOpen || showRaw) && <motion.div
                      className="pv-raw"
                      initial={reduced ? false : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={reduced ? undefined : { opacity: 0, height: 0 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      <dl>
                        <div><dt>Commitment</dt><dd>{commitmentOf(hop)}</dd></div>
                        <div><dt>State byte</dt><dd>0x{hex2(hop.state)} · {parcelStateLabel(hop.state)}</dd></div>
                        <div><dt>Custodian</dt><dd>{hop.custodian}</dd></div>
                        <div><dt>Reason byte</dt><dd>0x00</dd></div>
                        <div><dt>Transaction</dt><dd>{hop.txid}</dd></div>
                      </dl>
                      <p>Reconstructed from the state and custodian this row reports. The chain response does not return the commitment itself.</p>
                    </motion.div>}
                  </AnimatePresence>
                </motion.div>;
              })}
            </AnimatePresence>
          </motion.div>
        </>}
      </motion.section>

      {delivered && <motion.section className="pv-card pv-receipt" {...rise(0.14)}>
        <h2>Delivery receipt</h2>
        <dl>
          {/* "by", not "to": the covenant keeps the delivering courier's pkh in the 0x04
              commitment (`confirmDelivery` requires `0x04 + tail`), so this hop names the
              deliverer. The recipient signed, but their key hash is not what the chain records. */}
          <div><dt>Delivered by</dt><dd>{actorOf(delivered)} · <code>{truncate(delivered.custodian)}</code></dd></div>
          <div><dt>Transaction</dt><dd><a className="pv-mono-link" href={explorerTx(delivered.txid)} target="_blank" rel="noreferrer">{truncate(delivered.txid)}<ExternalIcon /></a></dd></div>
          <div><dt>Terminal</dt><dd>The parcel NFT left the covenant on this transaction. There is no state to re-enter, so this record is final by construction rather than by policy.</dd></div>
        </dl>
      </motion.section>}

      <motion.section className="pv-card pv-claim" {...rise(delivered ? 0.18 : 0.14)}>
        <ShieldIcon aria-hidden />
        <div>
          <strong>Read from the chain, not from our database</strong>
          <p>Every row above is a signed transaction on {NETWORK}. You do not have to trust this page — open any transaction and check it yourself.</p>
          <p className="pv-claim-muted">The chain records the order of custody, not wall-clock time. Each row links to its transaction, where the network's own timestamp lives.</p>
        </div>
      </motion.section>

      <motion.section className="pv-card pv-facts" {...rise(delivered ? 0.22 : 0.18)}>
        <h2>Record facts</h2>
        <dl>
          <div><dt>Network</dt><dd>{NETWORK}</dd></div>
          <div><dt>Contract</dt><dd><a className="pv-mono-link" href={explorerAddress(parcel.contractAddress)} target="_blank" rel="noreferrer">{truncate(parcel.contractAddress)}<ExternalIcon /></a></dd></div>
          {parcel.mintTxid && <div><dt>Mint transaction</dt><dd><a className="pv-mono-link" href={explorerTx(parcel.mintTxid)} target="_blank" rel="noreferrer">{truncate(parcel.mintTxid)}<ExternalIcon /></a></dd></div>}
          <div><dt>Custody hops</dt><dd>{parcel.chain.length}</dd></div>
          <div><dt>Status</dt><dd>{delivered ? 'Terminal — the NFT left the covenant' : 'In flight — the record is still being written'}</dd></div>
        </dl>
      </motion.section>

      <motion.footer className="pv-foot" {...rise(delivered ? 0.26 : 0.22)}>
        <span>{NETWORK} · Hermes</span>
        <span>Last checked {clockOf(checkedAt)}</span>
      </motion.footer>
    </main>
  </div>;
}
