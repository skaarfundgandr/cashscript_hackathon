import { useEffect, useMemo, useState } from 'react';

import jtExpressLogo from '../../assets/couriers/jt-express-demo.png';
import ninjaVanLogo from '../../assets/couriers/ninja-van-demo.png';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { useToast } from '../../components/ui/toast.js';
import { shopApi, type ShopCourier, type ShopOrder } from '../../infrastructure/api-client.js';

type OrderSort = 'newest' | 'oldest' | 'customer';

export function MerchantOrdersPage() {
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [couriers, setCouriers] = useState<ShopCourier[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingOrderId, setApprovingOrderId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<OrderSort>('newest');
  const toast = useToast();

  const loadOrders = () => {
    setIsLoading(true);
    setError(null);
    void Promise.all([shopApi.getPendingOrders(), shopApi.getCouriers()])
      .then(([pendingOrders, availableCouriers]) => {
        setOrders(pendingOrders);
        setCouriers(availableCouriers);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { loadOrders(); }, []);

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
    <section className="merchant-filter-bar" aria-label="Filter pending orders">
      <label className="merchant-search-field"><span className="custody-sr-only">Search pending orders</span><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, customer, or address…" /></label>
      <label className="merchant-sort-field">Sort <select value={sort} onChange={(event) => setSort(event.target.value as OrderSort)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="customer">Customer name</option></select></label>
      <span className="merchant-order-count">{visibleOrders.length} {visibleOrders.length === 1 ? 'order' : 'orders'} awaiting approval</span>
    </section>
    {error && <p className="shop-error" role="alert">{error}</p>}
    {isLoading ? <div className="shop-loading" role="status">Loading pending orders…</div>
      : orders.length === 0 ? <div className="shop-empty"><h2>No pending orders</h2><p>New customer orders will appear here.</p></div>
      : visibleOrders.length === 0 ? <div className="shop-empty"><h2>No orders found</h2><p>Try a different order number, customer, or address.</p></div>
      : <ol className="merchant-order-list">{visibleOrders.map((order) => {
        const assignedCourier = couriers.find((courier) => courier.id === assignments[order.orderId]) ?? null;
        return <li key={order.orderId} className="merchant-order-card">
          <div className="merchant-order-product"><img src={order.product.imageUrl} alt="" /><div><span className="merchant-status">New order · needs approval</span><h2>{order.product.name}</h2><p>Order #{order.orderId} · placed {formatDate(order.createdAt)}</p></div></div>
          <dl className="merchant-order-details"><div><dt>Customer</dt><dd>{order.buyer.name}</dd></div><div><dt>Delivery</dt><dd>{order.buyer.address}</dd></div></dl>
          <section className="merchant-dispatch-panel" aria-label={`Dispatch order #${order.orderId}`}>
            <p className="shop-eyebrow">Dispatch parcel</p>
            <label><span className="custody-sr-only">Assign courier for order #{order.orderId}</span><select value={assignments[order.orderId] ?? ''} onChange={(event) => setAssignments((current) => ({ ...current, [order.orderId]: event.target.value }))}><option value="">Assign courier…</option>{couriers.map((courier) => <option value={courier.id} key={courier.id}>{courier.name} · {courier.company}</option>)}</select></label>
            {assignedCourier && <CourierBrand courier={assignedCourier} />}
            <Button type="button" className="merchant-approve-button" onClick={() => void approve(order.orderId)} disabled={!assignedCourier || approvingOrderId !== null}>{approvingOrderId === order.orderId ? 'Creating parcel…' : 'Approve & create parcel'}</Button>
            <p className="merchant-dispatch-note">Approval creates the custody record and prepares the parcel label for packing.</p>
          </section>
        </li>;
      })}</ol>}
  </main>;
}

function CourierBrand({ courier }: { courier: ShopCourier }) {
  const logo = courier.company === 'J&T Express' ? jtExpressLogo : courier.company === 'Ninja Van' ? ninjaVanLogo : null;
  return <div className="merchant-courier-brand">{logo && <img src={logo} alt="" />}<span><strong>{courier.name}</strong><small>{courier.company}</small></span></div>;
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
}
