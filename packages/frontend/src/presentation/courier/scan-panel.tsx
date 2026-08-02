import { motion } from 'motion/react';
import { useState } from 'react';

import { CourierButton } from './bits.js';
import { AlertIcon, CloseIcon, RefreshIcon } from './icons.js';
import { useQrScanner } from './use-qr-scanner.js';

export interface ScanPanelProps {
  kicker: string;
  title: string;
  hint: string;
  pasteHint: string;
  onDecode: (text: string) => void;
  onCancel?: () => void;
  /** Armed scans wear the hi-vis rail: the app is waiting for one specific thing, not browsing. */
  armed?: boolean;
}

export function ScanPanel({ kicker, title, hint, pasteHint, onDecode, onCancel, armed }: ScanPanelProps) {
  const { videoRef, status, error, retry } = useQrScanner(true, onDecode);
  const [pasted, setPasted] = useState('');

  const readPasted = () => {
    const text = pasted.trim();
    if (!text) return;
    setPasted('');
    onDecode(text);
  };

  return (
    <motion.section
      className={`c-scan${armed ? ' c-scan-armed' : ''}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <header className="c-scan-head">
        <p className="c-kicker">{kicker}</p>
        <h2 className="c-scan-title">{title}</h2>
        <p className="c-scan-hint">{hint}</p>
        {onCancel && (
          <CourierButton className="c-scan-cancel" variant="quiet" onClick={onCancel} aria-label="Cancel">
            <CloseIcon className="c-icon" />
          </CourierButton>
        )}
      </header>

      <div className="c-viewport" data-status={status}>
        <video ref={videoRef} className="c-viewport-video" playsInline muted autoPlay />
        <div className="c-viewport-frame" aria-hidden="true">
          <i /><i /><i /><i />
        </div>
        {status === 'running' && <div className="c-viewport-laser" aria-hidden="true" />}
        {status === 'starting' && <p className="c-viewport-note">Opening camera…</p>}
        {status === 'error' && (
          <div className="c-viewport-note c-viewport-note-error" role="alert">
            <AlertIcon className="c-icon" />
            <span>{error}</span>
            <CourierButton variant="quiet" onClick={retry} icon={<RefreshIcon className="c-icon" />}>Try again</CourierButton>
          </div>
        )}
      </div>

      <div className="c-paste">
        <label className="c-label" htmlFor="paste-code">Or paste it</label>
        <p className="c-paste-hint">{pasteHint}</p>
        <textarea
          id="paste-code"
          className="c-input c-input-mono c-textarea"
          rows={2}
          spellCheck={false}
          autoCapitalize="off"
          value={pasted}
          placeholder='{"t":"parcel","id":"bchtest:p…"}'
          onChange={(event) => setPasted(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              readPasted();
            }
          }}
        />
        <CourierButton variant="ghost" block onClick={readPasted} disabled={!pasted.trim()}>Read code</CourierButton>
      </div>
    </motion.section>
  );
}
