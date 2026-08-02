import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';

import { setDemoRole, type DemoRole } from './infrastructure/demo-role.js';
import { CourierApp } from './presentation/courier/courier.js';
import { DemoRoleSwitcher } from './presentation/demo-role-switcher.js';
import { Marketplace } from './presentation/marketplace/marketplace.js';
import { MyOrderPage } from './presentation/shop/my-order-page.js';
import { MyOrdersPage } from './presentation/shop/my-orders-page.js';
import { MerchantOrdersPage } from './presentation/shop/merchant-orders-page.js';
import { OrderPage } from './presentation/shop/order-page.js';
import { PublicParcelPage } from './presentation/public/public-parcel-page.js';
import { PublicLookup } from './presentation/public/public-lookup.js';

type Route =
  | { kind: 'shop'; category: string | null }
  | { kind: 'product'; productId: string }
  | { kind: 'order'; orderId: string }
  | { kind: 'my-order'; orderId: string; token: string | null }
  | { kind: 'my-orders' }
  | { kind: 'merchant-orders' }
  | { kind: 'courier' }
  | { kind: 'public'; parcelId: string }
  | { kind: 'public-lookup' };

function routeFromHash(hash: string): Route | null {
  const [path, search = ''] = hash.replace(/^#/, '').split('?');
  let parts: string[];
  try {
    parts = path.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
  } catch {
    return null;
  }

  if (parts.length === 1 && parts[0] === 'shop') return { kind: 'shop', category: new URLSearchParams(search).get('category') };
  if (parts.length === 3 && parts[0] === 'shop' && parts[1] === 'product') return { kind: 'product', productId: parts[2]! };
  if (parts.length === 3 && parts[0] === 'shop' && parts[1] === 'order') return { kind: 'order', orderId: parts[2]! };
  if (parts.length === 3 && parts[0] === 'shop' && parts[1] === 'my-order') {
    return { kind: 'my-order', orderId: parts[2]!, token: new URLSearchParams(search).get('t') };
  }
  if (parts.length === 2 && parts[0] === 'shop' && parts[1] === 'orders') return { kind: 'my-orders' };
  if (parts.length === 2 && parts[0] === 'merchant' && parts[1] === 'orders') return { kind: 'merchant-orders' };
  if (parts.length === 1 && parts[0] === 'courier') return { kind: 'courier' };
  if (parts.length === 2 && parts[0] === 'p') return { kind: 'public', parcelId: parts[1]! };
  if (parts.length === 1 && parts[0] === 'p') return { kind: 'public-lookup' };
  return null;
}

function navigate(path: string): void {
  window.location.hash = path;
}

export function Router() {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash) ?? { kind: 'shop', category: null });
  const [role, setRole] = useState<DemoRole>(() => roleForRoute(routeFromHash(window.location.hash) ?? { kind: 'shop', category: null }));

  useEffect(() => {
    const updateRoute = () => {
      const next = routeFromHash(window.location.hash);
      if (next) {
        setRoute(next);
        setRole(roleForRoute(next));
        return;
      }
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/shop`);
      setRoute({ kind: 'shop', category: null });
      setRole('buyer');
    };

    updateRoute();
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  useEffect(() => { setDemoRole(role); }, [role]);

  const chooseRole = (nextRole: DemoRole) => {
    setDemoRole(nextRole);
    setRole(nextRole);
    navigate(nextRole === 'buyer' ? '/shop' : nextRole === 'merchant' ? '/merchant/orders' : '/courier');
  };

  // The public record is nobody's surface — it renders bare, with no role chrome, because that
  // is exactly what an outsider holding the link sees.
  if (route.kind === 'public-lookup') return <PublicLookup onOpen={(parcelId) => navigate(`/p/${encodeURIComponent(parcelId)}`)} />;
  if (route.kind === 'public') return <PublicParcelPage parcelId={route.parcelId} />;

  const surface = (() => {
    switch (route.kind) {
      case 'shop': return <Marketplace
        category={route.category}
        onOpenProduct={(productId) => navigate(`/shop/product/${encodeURIComponent(productId)}`)}
        onBrowseCategory={(category) => navigate(`/shop?category=${encodeURIComponent(category)}`)}
      />;
      case 'product': return <Marketplace
        productId={route.productId}
        onOpenProduct={(productId) => navigate(`/shop/product/${encodeURIComponent(productId)}`)}
        onCloseProduct={() => navigate('/shop')}
        onBrowseCategory={(category) => navigate(`/shop?category=${encodeURIComponent(category)}`)}
        onCheckout={(orderId) => navigate(`/shop/order/${encodeURIComponent(orderId)}`)}
      />;
      case 'order': return <OrderPage orderId={route.orderId} onTrackOrder={() => navigate(`/shop/my-order/${encodeURIComponent(route.orderId)}`)} />;
      case 'my-order': return <MyOrderPage orderId={route.orderId} urlToken={route.token} />;
      case 'my-orders': return <MyOrdersPage onOpenOrder={(orderId) => navigate(`/shop/my-order/${encodeURIComponent(orderId)}`)} />;
      case 'merchant-orders': return <MerchantOrdersPage />;
      case 'courier': return <CourierApp />;
    }
  })();

  return <RoleSurface role={role} onChooseRole={chooseRole}>{surface}</RoleSurface>;
}

function roleForRoute(route: Route): DemoRole {
  if (route.kind === 'merchant-orders') return 'merchant';
  if (route.kind === 'courier') return 'courier';
  return 'buyer';
}

/**
 * The role strip is persistent chrome and never animates — only the surface under it does.
 * Keyed by role, not by route: moving between a role's own pages is ordinary navigation, but
 * changing who you are is the biggest context switch in the app and earns a handoff.
 */
function RoleSurface({ role, onChooseRole, children }: { role: DemoRole; onChooseRole: (role: DemoRole) => void; children: ReactNode }) {
  const reduced = useReducedMotion();

  return <>
    <DemoRoleSwitcher role={role} onChange={onChooseRole} />
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={role}
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduced ? undefined : { opacity: 0, y: -8 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >{children}</motion.div>
    </AnimatePresence>
  </>;
}

function Placeholder({ label }: { label: string }) {
  return <main className="shop-placeholder"><p>{label}</p></main>;
}
