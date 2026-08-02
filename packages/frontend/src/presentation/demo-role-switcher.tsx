import type { DemoRole } from '../infrastructure/demo-role.js';

const ROLE_LABELS: Record<DemoRole, string> = {
  buyer: 'Buyer',
  merchant: 'Merchant',
  courier: 'Courier',
};

export function DemoRoleSwitcher({ role, onChange }: { role: DemoRole; onChange: (role: DemoRole) => void }) {
  return <aside className="demo-role-switcher" aria-label="Demo role switcher">
    <span>Demo mode</span>
    <label>
      <span className="custody-sr-only">Current role</span>
      <select value={role} onChange={(event) => onChange(event.target.value as DemoRole)}>
        {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <small>No authentication</small>
  </aside>;
}
