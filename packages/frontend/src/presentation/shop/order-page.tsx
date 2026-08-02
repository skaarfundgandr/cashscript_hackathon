import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { HashValue } from '../../components/custody/hash-value.js';
import { QrCode } from '../../components/custody/qr-code.js';
import { useToast } from '../../components/ui/toast.js';
import { accessTokenForOrder } from '../../infrastructure/order-storage.js';
import { ShopApiError } from '../../infrastructure/api-client.js';
import { PublicRecordLink } from './public-record-link.js';
import { useOrder } from './use-order.js';

/** One stage of the order's progress replacing another. */
const stage = (reduced: boolean | null) => ({
  initial: reduced ? false as const : { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: reduced ? undefined : { opacity: 0 },
  transition: { duration: 0.22, ease: 'easeOut' as const },
});

/** Panels within a stage, staged so the finished order assembles rather than appears at once. */
const rise = (reduced: boolean | null, delay: number) => reduced ? {} : {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.26, ease: 'easeOut' as const, delay },
};

export function OrderPage({ orderId, onTrackOrder }: { orderId: string; onTrackOrder: () => void }) {
  const accessToken = accessTokenForOrder(orderId, null);
  const { order, error, isLoading, timedOut, retrying, retryCustody } = useOrder(orderId, accessToken);
  const toast = useToast();
  const reduced = useReducedMotion();

  const retry = async () => {
    const result = await retryCustody();
    if (result.ok) toast.success('Custody attachment restarted', 'We are preparing the parcel record again.');
    else toast.error('Could not retry custody', result.message);
  };

  if (isLoading && !order) return <OrderLoading />;
  if (error && !order) return error instanceof ShopApiError && error.status === 404 ? <OrderNotFound /> : <OrderProblem message={error.message} />;
  if (!order) return <OrderProblem message="The order could not be loaded." />;

  return <main className="shop-page">
    <header className="shop-page-header"><p>Order received</p><h1>Order #{order.orderId}</h1><span>{order.product.name} for {order.buyer.name}</span></header>

    {/* The order walks pending → processing → attaching → attached while this page polls. Each
        stage cross-fades so progress is felt, and the finished state stages its panels in. */}
    <AnimatePresence mode="wait" initial={false}>
    {order.status === 'pending' ? <motion.section className="shop-custody-panel shop-custody-attaching" key="pending" {...stage(reduced)}>
      <p className="shop-eyebrow">Order status</p>
      <h2>Awaiting merchant approval</h2>
      <p>Your order is saved. The merchant will approve it before preparing the custody record.</p>
    </motion.section> : order.status === 'processing' ? <motion.section className="shop-custody-panel shop-custody-attaching" key="processing" {...stage(reduced)}>
      <p className="shop-eyebrow">Order status</p>
      <h2>Merchant is processing your order</h2>
      <p>Custody tracking will be attached once processing is complete.</p>
    </motion.section> : order.parcelId === null ? <motion.section className="shop-custody-panel shop-custody-attaching" key="attaching" {...stage(reduced)}>
      <p className="shop-eyebrow">Custody</p>
      <h2>{timedOut ? "Custody didn't attach" : 'Custody attaching…'}</h2>
      <p>{timedOut ? 'Your order is saved. You can ask us to attach custody again.' : 'Preparing the parcel’s custody record.'}</p>
      {timedOut && <button type="button" className="shop-button" onClick={() => void retry()} disabled={retrying}>{retrying ? 'Retrying…' : 'Retry'}</button>}
    </motion.section> : <motion.div key="attached" {...stage(reduced)}>
      <motion.section className="shop-custody-panel shop-custody-attached" {...rise(reduced, 0)}>
        <p className="shop-eyebrow">Custody</p>
        <h2>Custody tracking enabled</h2>
        <dl className="shop-hash-list">
          {order.contractAddress && <div><dt>Contract address</dt><dd><HashValue value={order.contractAddress} label="Contract address" /></dd></div>}
          {order.mintTxid && <div><dt>Mint transaction</dt><dd><HashValue value={order.mintTxid} label="Mint transaction" /></dd></div>}
        </dl>
      </motion.section>
      <motion.section className="shop-shipping-label" {...rise(reduced, 0.06)}>
        <QrCode value={{ t: 'parcel', id: order.parcelId }} label="Shipping label QR code" />
        <div><p className="shop-eyebrow">Shipping label</p><h2>{order.product.name}</h2><p>Order #{order.orderId}</p><p className="shop-label-note">Scan this label to record each custody handover.</p></div>
      </motion.section>
      <motion.div {...rise(reduced, 0.12)}>
        <PublicRecordLink parcelId={order.parcelId} />
        <button type="button" className="shop-button" onClick={onTrackOrder}>Track my order</button>
      </motion.div>
    </motion.div>}
    </AnimatePresence>
  </main>;
}

export function OrderLoading() {
  return <main className="shop-page" aria-busy="true">
    <div className="shop-skeleton" role="status" aria-label="Loading order">
      <span className="shop-skel shop-skel-eyebrow" />
      <span className="shop-skel shop-skel-title" />
      <span className="shop-skel shop-skel-sub" />
      <span className="shop-skel shop-skel-panel" />
      <span className="shop-skel shop-skel-panel shop-skel-panel-tall" />
    </div>
  </main>;
}

export function OrderNotFound() {
  return <main className="shop-page"><div className="shop-empty"><h1>Order not found</h1><p>Check the order number and try again.</p></div></main>;
}

export function OrderProblem({ message }: { message: string }) {
  return <main className="shop-page"><div className="shop-empty"><h1>We couldn’t load this order</h1><p>{message}</p></div></main>;
}
