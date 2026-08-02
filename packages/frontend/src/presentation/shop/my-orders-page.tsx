// The buyer's order list: `#/shop/orders`, linked from the marketplace topbar.
//
// Orders live in this device's localStorage — the shop has no buyer accounts, so the access
// token written at checkout is the only proof of ownership. This page lists ids and fetches
// each order fresh; it can only ever show what this browser bought.

import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

import { parcelStateLabel } from '../../domain/parcel.js';
import { shopApi, type ShopOrder } from '../../infrastructure/api-client.js';
import { storedOrderIds } from '../../infrastructure/order-storage.js';

interface OrderRow {
  orderId: string;
  order: ShopOrder | null;
}

type OrderStatusTone = 'approval' | 'processing' | 'in-custody' | 'awaiting-acceptance' | 'out-for-delivery' | 'delivered' | 'neutral' | 'error';

interface OrderStatus {
  label: string;
  tone: OrderStatusTone;
}

export function MyOrdersPage({ onOpenOrder }: { onOpenOrder: (orderId: string) => void }) {
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    // Each order is fetched independently: one failed read costs that row, not the page.
    void Promise.all(storedOrderIds().map(async ({ orderId }): Promise<OrderRow> => {
      try {
        return { orderId, order: await shopApi.getOrder(orderId) };
      } catch {
        return { orderId, order: null };
      }
    })).then((next) => { if (!cancelled) setRows(next); });
    return () => { cancelled = true; };
  }, []);

  return <main className="shop-page">
    <header className="shop-page-header"><p>Your orders</p><h1>Orders</h1><span>Everything ordered from this device.</span></header>

    {rows === null ? <div className="shop-orders-list" role="status" aria-label="Loading orders" aria-busy="true">
        {[0, 1, 2].map((index) => (
          <div className="shop-order-card shop-order-card-skeleton" key={index} aria-hidden="true">
            <span className="shop-skel shop-skel-art" />
            <span className="shop-order-body">
              <span className="shop-skel shop-skel-line-wide" />
              <span className="shop-skel shop-skel-line-narrow" />
            </span>
            <span className="shop-skel shop-skel-chip" />
          </div>
        ))}
      </div>
      : rows.length === 0 ? <div className="shop-empty">
          <h1>No orders yet</h1>
          <p>Orders appear here on the device that placed them. Browse the shop and buy something to start one.</p>
        </div>
      : <div className="shop-orders-list">
          {rows.map(({ orderId, order }, position) => {
            const status = order ? statusOf(order) : { label: 'Could not load', tone: 'error' };
            {/* Stagger capped at 8 rows so a long history never leaves the last card waiting. */}
            return <motion.button
              type="button" className="shop-order-card" key={orderId} onClick={() => onOpenOrder(orderId)}
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut', delay: Math.min(position, 7) * 0.04 }}
              whileTap={reduced ? undefined : { scale: 0.98 }}
            >
              {order && <img className="shop-order-art" src={order.product.imageUrl} alt="" />}
              <span className="shop-order-body">
                <strong>{order ? order.product.name : `Order #${orderId}`}</strong>
                <span>#{orderId}{order ? ` · ${formatDate(order.createdAt)}` : ''}</span>
              </span>
              <span className="shop-order-state" data-tone={status.tone}>{status.label}</span>
            </motion.button>
          })}
        </div>}
  </main>;
}

function statusOf(order: ShopOrder): OrderStatus {
  if (order.status === 'pending') return { label: 'Awaiting approval', tone: 'approval' };
  if (order.status === 'processing') return { label: 'Processing', tone: 'processing' };
  if (order.parcelId === null) return { label: 'Custody attaching…', tone: 'processing' };
  const tip = order.chain.at(-1);
  if (!tip) return { label: 'Custody attached', tone: 'neutral' };

  const toneByState: Record<number, OrderStatusTone> = {
    0x00: 'in-custody',
    0x01: 'awaiting-acceptance',
    0x02: 'out-for-delivery',
    0x04: 'delivered',
  };
  return { label: parcelStateLabel(tip.state), tone: toneByState[tip.state] ?? 'neutral' };
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(timestamp);
}
