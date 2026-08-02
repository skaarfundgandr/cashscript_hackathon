import { motion } from 'motion/react';
import type { CSSProperties } from 'react';

import type { ParcelChainEntry } from '../../infrastructure/api-client.js';

import { CourierButton, Field, HashValue, StateDot, TxLink } from './bits.js';
import { courierByPkh, labelForPkh, shortParcelId, type CourierIdentity } from './couriers.js';
import { actionCopy, stateMeta, type CourierAction, type ParcelStanding } from './custody.js';
import { ArrowLeftIcon, BoxIcon, RefreshIcon } from './icons.js';

export interface ParcelPanelProps {
  parcelId: string;
  chain: ParcelChainEntry[];
  courier: CourierIdentity;
  standing: ParcelStanding;
  refreshing: boolean;
  onAction: (action: CourierAction) => void;
  onRefresh: () => void;
  onBack: () => void;
}

export function ParcelPanel({ parcelId, chain, courier, standing, refreshing, onAction, onRefresh, onBack }: ParcelPanelProps) {
  return (
    <motion.section
      className="c-parcel"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <header className="c-parcel-head">
        <CourierButton variant="quiet" onClick={onBack} aria-label="Back to deliveries">
          <ArrowLeftIcon className="c-icon" />
        </CourierButton>
        <div className="c-parcel-head-body">
          <p className="c-kicker">Parcel</p>
          <p className="c-parcel-id">{shortParcelId(parcelId)}</p>
        </div>
        <CourierButton variant="quiet" onClick={onRefresh} disabled={refreshing} aria-label="Re-read the chain">
          <RefreshIcon className={`c-icon${refreshing ? ' c-icon-spin' : ''}`} />
        </CourierButton>
      </header>

      <motion.div
        className="c-standing"
        style={{ '--c-state': `var(--c-${standing.meta.tone})` } as CSSProperties}
        key={`${standing.state}-${standing.custodian}`}
        initial={{ opacity: 0.4 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.22 }}
      >
        <p className="c-standing-state"><StateDot tone={standing.meta.tone} />{standing.meta.label}</p>
        <h2 className="c-standing-headline">{standing.headline}</h2>
        <p className="c-standing-detail">{standing.detail}</p>
      </motion.div>

      {standing.actions.length > 0 && (
        <div className="c-actions">
          {standing.actions.map((action, index) => (
            <CourierButton
              key={action}
              variant={index === 0 ? 'primary' : 'ghost'}
              block
              onClick={() => onAction(action)}
            >
              {actionCopy(action).label}
            </CourierButton>
          ))}
        </div>
      )}

      <div className="c-facts">
        <Field label="Contract">
          <HashValue value={parcelId} lead={14} tail={8} />
        </Field>
        <Field label={standing.state === 0x01 ? 'Next custodian' : 'Custodian'}>
          {standing.isMine
            ? <span className="c-you">You · {courier.name}</span>
            : <span>{labelForPkh(standing.custodian)}</span>}
        </Field>
      </div>

      <ChainList chain={chain} courier={courier} />

      <CourierButton variant="ghost" block icon={<BoxIcon className="c-icon" />} onClick={onBack}>
        Back to deliveries
      </CourierButton>
    </motion.section>
  );
}

function ChainList({ chain, courier }: { chain: ParcelChainEntry[]; courier: CourierIdentity }) {
  if (chain.length === 0) return null;

  return (
    <div className="c-chain">
      <p className="c-kicker">Custody chain · {chain.length} {chain.length === 1 ? 'hop' : 'hops'}</p>
      <ol className="c-chain-list">
        {chain.map((hop, index) => {
          const meta = stateMeta(hop.state);
          const custodian = hop.custodian.toLowerCase();
          const known = courierByPkh(custodian);
          const mine = custodian === courier.pkh;
          return (
            <li className="c-chain-row" key={`${hop.txid}-${index}`} style={{ '--c-state': `var(--c-${meta.tone})` } as CSSProperties}>
              <span className="c-chain-rail" aria-hidden="true" />
              <div className="c-chain-body">
                <p className="c-chain-state"><StateDot tone={meta.tone} />{meta.label}</p>
                <p className="c-chain-actor">{mine ? 'You' : known?.name ?? labelForPkh(custodian)}</p>
              </div>
              <TxLink txid={hop.txid} />
            </li>
          );
        })}
      </ol>
      <p className="c-chain-note">Read from chipnet. No timestamps — the custody record does not carry one.</p>
    </div>
  );
}
