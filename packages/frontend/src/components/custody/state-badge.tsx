import { parcelStateLabel } from '../../domain/parcel.js';

export function StateBadge({ state }: { state: number }) {
  const known = [0x00, 0x01, 0x02, 0x04].includes(state);
  return <span className={`custody-state-badge${known ? ` custody-state-${state.toString(16).padStart(2, '0')}` : ''}`}>{parcelStateLabel(state)}</span>;
}
