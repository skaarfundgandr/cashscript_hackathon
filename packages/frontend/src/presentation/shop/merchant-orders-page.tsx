import { useCallback, useEffect, useMemo, useState } from 'react';

import jtExpressLogo from '../../assets/couriers/jt-express-demo.png';
import ninjaVanLogo from '../../assets/couriers/ninja-van-demo.png';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { useToast } from '../../components/ui/toast.js';
import { shopApi, type ShopCourier, type ShopOrder } from '../../infrastructure/api-client.js';
import { BadgeScanDialog } from './badge-scan-dialog.js';

type OrderSort = 'newest' | 'oldest' | 'customer';

export function MerchantOrdersPage() {
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [couriers, setCouriers] = useState<ShopCourier[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingOrderId, setApprovingOrderId] = useState<string | null>(null);
  /** Which order the badge scanner is open for. One dialog at a time — the camera is exclusive. */
  const [scanningOrderId, setScanningOrderId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<OrderSort>('newest');
  const toast = useToast();

  /** Background refreshes stay silent: no skeleton flash, and a failed tick just waits for the next. */
  const loadOrders = useCallback((background = false) => {
    if (!background) {
      setIsLoading(true);
      setError(null);
    }
    void Promise.all([shopApi.getPendingOrders(), shopApi.getCouriers()])
      .then(([pendingOrders, availableCouriers]) => {
        setOrders(pendingOrders);
        setCouriers(availableCouriers);
        setError(null);
      })
      .catch((cause: unknown) => { if (!background) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (!background) setIsLoading(false); });
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // The queue watches for new orders on its own. Paused while an approval is in flight (a stale
  // read could briefly resurrect the order it just removed) and while the badge scanner is open —
  // every tick re-rendered the dialog over a live camera, replaying its entrance like a newly
  // spawned modal.
  useEffect(() => {
    if (approvingOrderId !== null || scanningOrderId !== null) return;
    const timer = window.setInterval(() => loadOrders(true), 5_000);
    return () => window.clearInterval(timer);
  }, [approvingOrderId, scanningOrderId, loadOrders]);

  const approve = async (orderId: string) => {
    const courierId = assignments[orderId];
    if (!courierId) return;
    setApprovingOrderId(orderId);
    try {
      await shopApi.approveOrder(orderId, courierId);
      setOrders((current) => current.filter((order) => order.orderId !== orderId));
      toast.success(`Order #${orderId} approved`, 'Custody is attaching and the parcel label is ready for packing.');
    } catch (cause) {
      toast.error('Could not approve order', cause instanceof Error ? cause.message : String(cause));
    } finally {
      setApprovingOrderId(null);
    }
  };

  const visibleOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery === '' ? orders : orders.filter((order) =>
      [order.orderId, order.product.name, order.buyer.name, order.buyer.address]
        .some((value) => value.toLowerCase().includes(normalizedQuery)),
    );

    return [...filtered].sort((left, right) => {
      if (sort === 'oldest') return left.createdAt - right.createdAt;
      if (sort === 'customer') return left.buyer.name.localeCompare(right.buyer.name);
      return right.createdAt - left.createdAt;
    });
  }, [orders, query, sort]);

  return <main className="shop-page merchant-orders-page">
    <header className="merchant-page-header">
      <div><p className="shop-eyebrow">Northbay Supply · Fulfilment</p><h1>Orders needing action</h1><span>Assign the initial courier, then approve the order to create its custody record.</span></div>
    </header>
    {/* Controls only exist once there is something to search or sort — dead controls on an
        empty queue read as noise, not stability. */}
    {orders.length > 0 && <section className="merchant-filter-bar" aria-label="Filter pending orders">
      <label className="merchant-search-field"><span className="custody-sr-only">Search pending orders</span><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, customer, or address…" /></label>
      <label className="merchant-sort-field">Sort <select value={sort} onChange={(event) => setSort(event.target.value as OrderSort)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="customer">Customer name</option></select></label>
      <span className="merchant-order-count">{visibleOrders.length} {visibleOrders.length === 1 ? 'order' : 'orders'} awaiting approval</span>
    </section>}
    {error && <p className="shop-error" role="alert">{error}</p>}
    {isLoading ? <ol className="merchant-order-list" role="status" aria-label="Loading pending orders" aria-busy="true">
        {[0, 1].map((index) => (
          <li className="merchant-order-card" key={index} aria-hidden="true">
            <div className="merchant-order-product">
              <span className="shop-skel shop-skel-art-lg" />
              <div className="shop-skeleton">
                <span className="shop-skel shop-skel-line-narrow" />
                <span className="shop-skel shop-skel-line-wide" />
                <span className="shop-skel shop-skel-line" />
              </div>
            </div>
            <span className="shop-skel shop-skel-fill" />
            <span className="shop-skel shop-skel-fill" />
          </li>
        ))}
      </ol>
      : orders.length === 0 ? <section className="merchant-empty">
          <InboxIcon />
          <h2>No orders</h2>
          <p>New orders appear here on their own.</p>
        </section>
      : visibleOrders.length === 0 ? <div className="shop-empty"><h2>No orders found</h2><p>Try a different order number, customer, or address.</p></div>
      : <ol className="merchant-order-list">{visibleOrders.map((order) => {
        const assignedCourier = couriers.find((courier) => courier.id === assignments[order.orderId]) ?? null;
        return <li key={order.orderId} className="merchant-order-card">
          <div className="merchant-order-product"><img src={order.product.imageUrl} alt="" /><div><span className="merchant-status">New order · needs approval</span><h2>{order.product.name}</h2><p>Order #{order.orderId} · placed {formatDate(order.createdAt)}</p></div></div>
          <dl className="merchant-order-details"><div><dt>Customer</dt><dd>{order.buyer.name}</dd></div><div><dt>Delivery</dt><dd>{order.buyer.address}</dd></div></dl>
          <section className="merchant-dispatch-panel" aria-label={`Dispatch order #${order.orderId}`}>
            <p className="shop-eyebrow">Dispatch parcel</p>
            {assignedCourier
              ? <div className="merchant-assigned-row">
                  <CourierBrand courier={assignedCourier} />
                  <Button type="button" variant="ghost" size="sm" onClick={() => setScanningOrderId(order.orderId)}>Rescan</Button>
                </div>
              : <Button type="button" variant="outline" className="merchant-scan-badge-button" onClick={() => setScanningOrderId(order.orderId)}>Scan courier badge</Button>}
            <Button type="button" className="merchant-approve-button" onClick={() => void approve(order.orderId)} disabled={!assignedCourier || approvingOrderId !== null}>{approvingOrderId === order.orderId ? 'Creating parcel…' : 'Approve & create parcel'}</Button>
            <p className="merchant-dispatch-note">{assignedCourier
              ? 'Approval creates the custody record and prepares the parcel label for packing.'
              : 'The courier taking this parcel shows their badge — they open “My badge” in the courier terminal.'}</p>
          </section>
        </li>;
      })}</ol>}
    {scanningOrderId && <BadgeScanDialog
      couriers={couriers}
      onCancel={() => setScanningOrderId(null)}
      onAssign={(courier) => {
        setAssignments((current) => ({ ...current, [scanningOrderId]: courier.id }));
        setScanningOrderId(null);
        toast.success('Courier assigned', `${courier.name} · ${courier.company} will take this parcel.`);
      }}
    />}
  </main>;
}

function InboxIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 5h16v14H4z" />
    <path d="M4 13h5l1.5 2.5h3L15 13h5" />
  </svg>;
}

function CourierBrand({ courier }: { courier: ShopCourier }) {
  const logo = courier.company === 'J&T Express' ? jtExpressLogo : courier.company === 'Ninja Van' ? ninjaVanLogo : null;
  return <div className="merchant-courier-brand">{logo && <img src={logo} alt="" />}<span><strong>{courier.name}</strong><small>{courier.company}</small></span></div>;
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
}
