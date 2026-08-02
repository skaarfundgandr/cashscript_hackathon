import type { ParcelChainEntry } from '../../infrastructure/api-client.js';

import { courierByPkh, labelForPkh, type CourierIdentity } from './couriers.js';

/**
 * The four states in scope. Anything else renders neutral rather than breaking — an unknown
 * commitment byte is a thing the chain can legitimately contain, not a crash.
 */
export const IN_CUSTODY = 0x00;
export const AWAITING_ACCEPTANCE = 0x01;
export const OUT_FOR_DELIVERY = 0x02;
export const DELIVERED = 0x04;

export interface StateMeta {
  label: string;
  /** CSS custom-property name holding this state's locked colour. */
  tone: string;
}

const STATES: Record<number, StateMeta> = {
  [IN_CUSTODY]: { label: 'In custody', tone: 's0' },
  [AWAITING_ACCEPTANCE]: { label: 'Awaiting acceptance', tone: 's1' },
  [OUT_FOR_DELIVERY]: { label: 'Out for delivery', tone: 's2' },
  [DELIVERED]: { label: 'Delivered', tone: 's4' },
};

export function stateMeta(state: number): StateMeta {
  return STATES[state] ?? { label: `State 0x${state.toString(16).padStart(2, '0')}`, tone: 'unknown' };
}

/**
 * `decline` is the odd one out and deliberately so: it signs nothing.
 *
 * The contract has no transition out of `HandoffPending` except `acceptHandoff` — a courier who
 * does not want a parcel simply never accepts it, and it sits at `0x01` with the releasing courier
 * still liable. (`reject` in the v2 spec is the *recipient* refusing a delivery at `0x02`, a
 * different transition with a different signer, and it is not in the shipped contract either.)
 * So declining is a work-list action, not a custody action, and the UI must not imply otherwise.
 */
export type CourierAction = 'handoff' | 'request-delivery' | 'accept' | 'decline' | 'scan-delivery';

/**
 * How this parcel relates to the signed-in courier. Drives which section of the work list it sits
 * in, and it is a field rather than something the list re-derives, because `watching` is a real
 * product state — a parcel you released and are still liable for — not a leftover of `yours`.
 */
export type Involvement = 'yours' | 'watching' | 'closed' | 'other';

export interface ParcelStanding {
  state: number;
  meta: StateMeta;
  /** The headline the courier reads first — always about them, never about the parcel abstractly. */
  headline: string;
  /** One sentence of context. Carries the liability wording where a liability window is open. */
  detail: string;
  /**
   * What this courier can do right now. Never a disabled button: an action the courier cannot take
   * is simply absent, and `detail` says what is happening instead.
   */
  actions: CourierAction[];
  /** Whoever the commitment names. For 0x01 that is the *next* custodian, not the holder. */
  custodian: string;
  isMine: boolean;
  involvement: Involvement;
}

/**
 * Reads the tip of the chain from the signed-in courier's point of view.
 *
 * The commitment's `custodian` field means different things per state — at 0x01 it names the
 * courier who must *accept*, not the one still liable. That asymmetry is the whole point of the
 * handoff window, so it is read explicitly here rather than smoothed over.
 */
export function standingFor(chain: ParcelChainEntry[], courier: CourierIdentity): ParcelStanding {
  const tip = chain[chain.length - 1];
  if (!tip) {
    return {
      state: -1,
      meta: { label: 'No custody record', tone: 'unknown' },
      headline: 'No custody record',
      detail: 'The chain came back empty. This parcel has no hops to act on.',
      actions: [],
      custodian: '',
      isMine: false,
      involvement: 'other',
    };
  }

  const custodian = tip.custodian.toLowerCase();
  const isMine = custodian === courier.pkh;
  const meta = stateMeta(tip.state);
  const touchedByMe = chain.some((hop) => hop.custodian.toLowerCase() === courier.pkh);
  const base = { state: tip.state, meta, custodian, isMine };

  switch (tip.state) {
    case IN_CUSTODY:
      return isMine
        ? {
            ...base,
            involvement: 'yours',
            headline: 'You are holding this',
            detail: 'Custody is yours until another courier accepts it, or the buyer confirms delivery.',
            actions: ['handoff', 'request-delivery'],
          }
        : {
            ...base,
            involvement: 'other',
            headline: 'Held by another courier',
            detail: `${labelForPkh(custodian)} is liable for this parcel. Nothing for you to sign.`,
            actions: [],
          };

    case AWAITING_ACCEPTANCE: {
      // The releasing courier is not in the commitment — it is the hop before this one.
      const releasedByMe = chain[chain.length - 2]?.custodian.toLowerCase() === courier.pkh;
      if (isMine) {
        return {
          ...base,
          involvement: 'yours',
          headline: 'Awaiting your acceptance',
          detail: 'Released to you. You are not liable until you accept.',
          actions: ['accept', 'decline'],
        };
      }
      return releasedByMe
        ? {
            ...base,
            involvement: 'watching',
            headline: 'Released — awaiting acceptance',
            detail: `You remain liable until ${labelForPkh(custodian)} accepts. No action available.`,
            actions: [],
          }
        : {
            ...base,
            involvement: 'other',
            headline: 'Awaiting another courier',
            detail: `${labelForPkh(custodian)} has been offered this parcel and has not accepted yet.`,
            actions: [],
          };
    }

    case OUT_FOR_DELIVERY:
      return isMine
        ? {
            ...base,
            involvement: 'yours',
            headline: 'Out for delivery',
            detail: 'Ask the buyer to reveal their delivery code, then scan it to close the parcel.',
            actions: ['scan-delivery'],
          }
        : {
            ...base,
            involvement: 'other',
            headline: 'Out for delivery',
            detail: `${labelForPkh(custodian)} is delivering this parcel. Nothing for you to sign.`,
            actions: [],
          };

    case DELIVERED:
      return {
        ...base,
        involvement: touchedByMe ? 'closed' : 'other',
        headline: 'Delivered',
        detail: 'Terminal. The parcel left the covenant and the record is closed.',
        actions: [],
      };

    default:
      return {
        ...base,
        involvement: touchedByMe ? 'watching' : 'other',
        headline: meta.label,
        detail: 'This state is outside the delivery flow. No action available.',
        actions: [],
      };
  }
}

export interface ActionCopy {
  label: string;
  /** Sheet title. A question, because the sheet is a decision. */
  question: string;
  /** The consequence of confirming, in the courier's own terms. */
  consequence: string;
  confirm: string;
  /** Whether the confirm sheet wears the hazard band — a liability window opens or closes. */
  liability: boolean;
  /** True when confirming broadcasts nothing. The sheet drops the signing steps and says so. */
  local?: boolean;
}

export function actionCopy(action: CourierAction, subject?: string): ActionCopy {
  switch (action) {
    case 'handoff':
      return {
        label: 'Hand off',
        question: `Release custody to ${subject ?? 'this courier'}?`,
        consequence: 'You remain liable until they accept. Until then the parcel is in neither of your hands.',
        confirm: 'Release',
        liability: true,
      };
    case 'accept':
      return {
        label: 'Accept custody',
        question: 'Accept custody of this parcel?',
        consequence: 'You become liable from this moment, and stay liable until you hand it off or deliver it.',
        confirm: 'Accept',
        liability: true,
      };
    case 'decline':
      return {
        label: 'Decline',
        question: 'Decline this handoff?',
        consequence: `Nothing is signed and custody does not move. The parcel stays with ${subject ?? 'the releasing courier'}, who remains liable for it. This only clears it from your list.`,
        confirm: 'Decline',
        liability: false,
        local: true,
      };
    case 'request-delivery':
      return {
        label: 'Request delivery',
        question: 'Mark this parcel out for delivery?',
        consequence: 'Custody stays with you. The buyer is told the parcel is arriving and can reveal their code.',
        confirm: 'Mark out for delivery',
        liability: false,
      };
    case 'scan-delivery':
      return {
        label: 'Scan delivery code',
        question: 'Confirm delivery with this code?',
        consequence: 'This closes the parcel permanently. Delivered is terminal — there is no state after it.',
        confirm: 'Confirm delivery',
        liability: true,
      };
  }
}
