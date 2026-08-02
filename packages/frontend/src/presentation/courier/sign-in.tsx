import { motion } from 'motion/react';
import { useState, type FormEvent } from 'react';

import { CourierButton } from './bits.js';
import { COURIER_ROSTER, resolveCourier, shortHash, type CourierIdentity } from './couriers.js';
import { ArrowRightIcon } from './icons.js';

export function SignIn({ onSignIn }: { onSignIn: (courier: CourierIdentity) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const courier = resolveCourier(value);
    if (!courier) {
      // Deliberately specific. The custody backend holds two private keys and rejects every other
      // id, so a vague "invalid" here would send a courier hunting for a password that never existed.
      setError('No courier with that ID. This demo knows two: jnt-mgl and ninjavan-rey.');
      return;
    }
    onSignIn(courier);
  };

  return (
    <motion.div
      className="c-signin"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
    >
      <div className="c-signin-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <p className="c-kicker">Parcel custody</p>
      <h1 className="c-signin-title">Courier<br />terminal</h1>
      <p className="c-signin-lede">
        Scan a box, sign a handover. Every action you take here is a signature recorded on chain
        under your key.
      </p>

      <form className="c-signin-form" onSubmit={submit}>
        <label className="c-label" htmlFor="courier-id">Courier ID</label>
        <div className="c-signin-row">
          <input
            id="courier-id"
            className="c-input c-input-mono"
            value={value}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="jnt-mgl"
            onChange={(event) => { setValue(event.target.value); setError(null); }}
          />
          <CourierButton type="submit" variant="primary" icon={<ArrowRightIcon className="c-icon" />} aria-label="Start shift" />
        </div>
        {error && <p className="c-signin-error" role="alert">{error}</p>}
        <p className="c-signin-note">Demo build</p>
      </form>

      <div className="c-roster">
        <p className="c-kicker">On shift today</p>
        {COURIER_ROSTER.map((courier) => (
          <button type="button" className="c-roster-row" key={courier.id} onClick={() => onSignIn(courier)}>
            <span className="c-roster-initials" aria-hidden="true">
              {courier.name.split(' ').map((part) => part[0]).join('')}
            </span>
            <span className="c-roster-body">
              <span className="c-roster-name">{courier.name}</span>
              <span className="c-roster-meta">{courier.company} · {courier.id}</span>
            </span>
            <span className="c-roster-pkh">{shortHash(courier.pkh, 6, 4)}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
