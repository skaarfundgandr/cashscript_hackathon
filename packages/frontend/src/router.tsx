import { useEffect, useState, type ReactNode } from 'react';

import { setDemoRole, type DemoRole } from './infrastructure/demo-role.js';
import { DemoRoleSwitcher } from './presentation/demo-role-switcher.js';
import { Marketplace } from './presentation/marketplace/marketplace.js';
import { MyOrderPage } from './presentation/shop/my-order-page.js';
import { MerchantOrdersPage } from './presentation/shop/merchant-orders-page.js';
import { OrderPage } from './presentation/shop/order-page.js';

type Route =
  | { kind: 'shop'; category: string | null }
  | { kind: 'product'; productId: string }
  | { kind: 'order'; orderId: string }
  | { kind: 'my-order'; orderId: string; token: string | null }
  | { kind: 'merchant-orders' }
  | { kind: 'courier' }
  | { kind: 'public'; parcelId: string };

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
  if (parts.length === 2 && parts[0] === 'merchant' && parts[1] === 'orders') return { kind: 'merchant-orders' };
  if (parts.length === 1 && parts[0] === 'courier') return { kind: 'courier' };
  if (parts.length === 2 && parts[0] === 'p') return { kind: 'public', parcelId: parts[1]! };
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
    navigate(nextRole === 'buyer' ? '/shop' : '/merchant/orders');
  };

  if (route.kind === 'shop') return <RoleSurface role={role} onChooseRole={chooseRole}><Marketplace
    category={route.category}
    onOpenProduct={(productId) => navigate(`/shop/product/${encodeURIComponent(productId)}`)}
    onBrowseCategory={(category) => navigate(`/shop?category=${encodeURIComponent(category)}`)}
  /></RoleSurface>;
  if (route.kind === 'product') {
    return <RoleSurface role={role} onChooseRole={chooseRole}><Marketplace
      productId={route.productId}
      onOpenProduct={(productId) => navigate(`/shop/product/${encodeURIComponent(productId)}`)}
      onCloseProduct={() => navigate('/shop')}
      onBrowseCategory={(category) => navigate(`/shop?category=${encodeURIComponent(category)}`)}
      onCheckout={(orderId) => navigate(`/shop/order/${encodeURIComponent(orderId)}`)}
    /></RoleSurface>;
  }
  if (route.kind === 'order') return <RoleSurface role={role} onChooseRole={chooseRole}><OrderPage orderId={route.orderId} onTrackOrder={() => navigate(`/shop/my-order/${encodeURIComponent(route.orderId)}`)} /></RoleSurface>;
  if (route.kind === 'my-order') return <RoleSurface role={role} onChooseRole={chooseRole}><MyOrderPage orderId={route.orderId} urlToken={route.token} /></RoleSurface>;
  if (route.kind === 'merchant-orders') return <RoleSurface role={role} onChooseRole={chooseRole}><MerchantOrdersPage /></RoleSurface>;
  if (route.kind === 'courier') return <Placeholder label="Courier scanner · P4" />;
  return <Placeholder label={`Public parcel record · ${route.parcelId}`} />;
}

function roleForRoute(route: Route): DemoRole {
  if (route.kind === 'merchant-orders') return 'merchant';
  return 'buyer';
}

function RoleSurface({ role, onChooseRole, children }: { role: DemoRole; onChooseRole: (role: DemoRole) => void; children: ReactNode }) {
  return <><DemoRoleSwitcher role={role} onChange={onChooseRole} />{children}</>;
}

function Placeholder({ label }: { label: string }) {
  return <main className="shop-placeholder"><p>{label}</p></main>;
}
