import { Buyer, Courier, Product } from '../domain/index.js';

/**
 * Products, couriers and the buyer are seeded constants, not tables. They never change at runtime
 * and there is no admin surface — a table for four constant rows is ceremony.
 */
export const MERCHANT_NAME = 'Northbay Supply';

export const PRODUCTS: Array<Product> = [
  {
    id: 'field-notebook-a5',
    name: 'Field notebook, A5',
    description:
      'Stitch-bound A5 notebook, 160 pages of 100gsm dot-grid paper, water-resistant cover. Made for site notes that have to survive the trip back.',
    priceCents: 48000,
    currency: 'PHP',
    imageUrl: '/products/field-notebook-a5.jpg',
  },
];

/**
 * Courier ids are arbitrary and seeded — a courier is a person at a company, not a letter.
 * The pkhs are `packages/backend`'s fixture keys (COURIER_A, COURIER_B), verified against
 * `packages/backend/src/infrastructure/fixtures.ts`. The A/B translation the real custody backend
 * needs lives in `http-custody-gateway.ts` and nowhere else.
 */
export const COURIERS: Array<Courier> = [
  {
    id: 'jnt-mgl',
    name: 'Miguel Santos',
    company: 'J&T Express',
    pkh: '06afd46bcdfd22ef94ac122aa11f241244a37ecc',
  },
  {
    id: 'ninjavan-rey',
    name: 'Rey Delgado',
    company: 'Ninja Van',
    pkh: '7dd65592d0ab2fe0d0257d571abf032cd9db93dc',
  },
];

export const BUYER: Buyer = {
  id: 'buyer-ana',
  name: 'Ana Reyes',
  address: '14 Mabini Street, Barangay Poblacion, Makati City 1210',
};

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((product) => product.id === id);
}

export function getCourier(id: string): Courier | undefined {
  return COURIERS.find((courier) => courier.id === id);
}

export function getBuyer(id: string): Buyer | undefined {
  return BUYER.id === id ? BUYER : undefined;
}
