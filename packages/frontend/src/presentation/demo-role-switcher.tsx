import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import type { DemoRole } from '../infrastructure/demo-role.js';

const ROLE_LABELS: Record<DemoRole, string> = {
  buyer: 'Buyer',
  merchant: 'Merchant',
  courier: 'Courier',
};

export function DemoRoleSwitcher({ role, onChange }: { role: DemoRole; onChange: (role: DemoRole) => void }) {
  const reduced = useReducedMotion();

  return <aside className="demo-role-switcher" aria-label="Demo role switcher">
    <span>Demo mode</span>
    <label>
      <span className="custody-sr-only">Current role</span>
      <select value={role} onChange={(event) => onChange(event.target.value as DemoRole)}>
        {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    {/* Names who you have become. The strip stays put through the switch, so this is the one
        piece of chrome that has to announce the change itself. */}
    <AnimatePresence mode="wait" initial={false}>
      <motion.small
        key={role}
        className="demo-role-now"
        initial={reduced ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduced ? undefined : { opacity: 0, y: -4 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
      >Viewing as {ROLE_LABELS[role]}</motion.small>
    </AnimatePresence>
  </aside>;
}
