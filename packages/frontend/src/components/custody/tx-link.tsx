import { truncateHash } from './hash-value.js';

const EXPLORER_BASE_URL = 'https://chipnet.imaginary.cash/tx/';

export function TxLink({ txid }: { txid: string }) {
  return <a className="custody-tx-link" href={`${EXPLORER_BASE_URL}${encodeURIComponent(txid)}`} target="_blank" rel="noreferrer" title="Open transaction in block explorer">
    {truncateHash(txid)}
  </a>;
}
