import { useToast } from '../../components/ui/toast.js';

/**
 * The buyer's doorway to the public surface — and the demo's step 22: Copy link is what makes
 * "opens cold in a fresh window, no session" demonstrable on camera, which a same-browser click
 * cannot show. The URL carries only the parcel id; no order id, no token.
 */
export function PublicRecordLink({ parcelId }: { parcelId: string }) {
  const toast = useToast();
  const href = `#/p/${encodeURIComponent(parcelId)}`;

  const copy = async () => {
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}${href}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied', 'Anyone with this link can verify the custody record — no account needed.');
    } catch {
      toast.error('Could not copy', url);
    }
  };

  return <section className="shop-custody-panel">
    <p className="shop-eyebrow">Public record</p>
    <h2>Anyone can verify this parcel</h2>
    <p>The custody record is public — no account, no login. Share the link and the chain speaks for itself.</p>
    <div className="shop-public-record-actions">
      <a className="shop-button" href={href} target="_blank" rel="noreferrer">Open public record</a>
      <button type="button" className="shop-button shop-button-secondary" onClick={() => void copy()}>Copy link</button>
    </div>
  </section>;
}
