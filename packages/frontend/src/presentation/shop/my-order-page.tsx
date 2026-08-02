import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';

import { CustodyTimeline, currentParcelState } from '../../components/custody/custody-timeline.js';
import { QrCode } from '../../components/custody/qr-code.js';
import { useToast } from '../../components/ui/toast.js';
import { parcelViewFromOrder } from '../../domain/parcel.js';
import { ShopApiError, shopApi } from '../../infrastructure/api-client.js';
import { accessTokenForOrder } from '../../infrastructure/order-storage.js';
import { OrderLoading, OrderNotFound, OrderProblem } from './order-page.js';
import { PublicRecordLink } from './public-record-link.js';
import { useOrder } from './use-order.js';

export function MyOrderPage({ orderId, urlToken }: { orderId: string; urlToken: string | null }) {
  const accessToken = accessTokenForOrder(orderId, urlToken);
  const { order, error, isLoading } = useOrder(orderId, accessToken);
  const [revealed, setRevealed] = useState<{ secret: string; revealedAt: number } | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const toast = useToast();
  const reduced = useReducedMotion();

  /** Same step vocabulary as the badge dialog: short, easeOut, off under reduced motion. */
  const step = {
    initial: reduced ? false as const : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: reduced ? undefined : { opacity: 0 },
    transition: { duration: 0.18, ease: 'easeOut' as const },
  };

  if (isLoading && !order) return <OrderLoading />;
  if (error && !order) return error instanceof ShopApiError && error.status === 404 ? <OrderNotFound /> : <OrderProblem message={error.message} />;
  if (!order) return <OrderProblem message="The order could not be loaded." />;

  const parcel = parcelViewFromOrder(order);
  const terminalState = parcel.hops.at(-1)?.state;
  const canReveal = terminalState === 0x02 || terminalState === 0x04;

  const reveal = async () => {
    if (!accessToken) {
      toast.error('Could not reveal delivery code', 'Open this on the device you ordered from to reveal the delivery code.');
      return;
    }
    setIsRevealing(true);
    try {
      const code = await shopApi.revealCode(order.orderId, accessToken);
      setRevealed(code);
      toast.success('Delivery code revealed', `Revealed at ${formatTime(code.revealedAt)}. Show it only to the courier at your door.`);
    } catch (cause) {
      toast.error('Could not reveal delivery code', cause instanceof ShopApiError && cause.status === 403
        ? 'Open this on the device you ordered from to reveal the delivery code.'
        : cause instanceof Error ? cause.message : String(cause));
    } finally {
      setIsRevealing(false);
    }
  };

  return <main className="shop-page">
    <header className="shop-page-header"><p>My order</p><h1>Order #{order.orderId}</h1><span>{order.product.name}{currentParcelState(parcel) ? ` · ${currentParcelState(parcel)}` : ''}</span></header>
    <CustodyTimeline state="ready" parcel={parcel} />
    {/* Always present once a parcel exists, so the buyer knows the code is coming. It unlocks
        at 0x02 on its own — useOrder keeps polling the chain until the record is terminal. */}
    {order.parcelId && <section className="shop-delivery-code">
      <p className="shop-eyebrow">Delivery code</p>
      {/* Locked → unlocked → revealed each cross-fade: the section's state changes are moments
          the buyer notices, not silent swaps. The QR itself lands with a small pop. */}
      <AnimatePresence initial={false} mode="wait">
      {!canReveal
        ? <motion.p key="locked" {...step}>Your delivery code unlocks when the courier marks this parcel out for delivery. Keep this page open — it updates on its own.</motion.p>
        : revealed ? <motion.div key="revealed" {...step}>
            <div className="shop-delivery-code-content">
              <motion.div
                initial={reduced ? false : { opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.24, ease: 'easeOut', delay: reduced ? 0 : 0.08 }}
              ><QrCode value={{ t: 'delivery', id: order.parcelId, secret: revealed.secret }} label="Delivery code QR" /></motion.div>
              <p>Revealed {formatTime(revealed.revealedAt)}</p>
            </div>
            <p className="shop-secret-warning">Anyone holding this code can confirm delivery. Show it only to the courier at your door.</p>
          </motion.div>
        : <motion.div key="unlocked" {...step}>
            {order.revealedAt !== null && <p>Revealed {formatTime(order.revealedAt)}. The code is not shown after a refresh.</p>}
            {accessToken ? <button type="button" className="shop-button" onClick={() => void reveal()} disabled={isRevealing}>{isRevealing ? 'Revealing…' : order.revealedAt === null ? 'Reveal code' : 'Reveal code again'}</button>
              : <p>Open this on the device you ordered from to reveal the delivery code.</p>}
            <p className="shop-secret-warning">Anyone holding this code can confirm delivery. Show it only to the courier at your door.</p>
          </motion.div>}
      </AnimatePresence>
    </section>}
    {order.parcelId && <PublicRecordLink parcelId={order.parcelId} />}
    {!accessToken && <p className="shop-recovery-note">Open this on the device you ordered from to manage your delivery code.</p>}
  </main>;
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}
