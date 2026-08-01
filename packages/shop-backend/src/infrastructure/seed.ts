import { Buyer, Courier, Product } from '../domain/index.js';

/** Products are seeded catalogue data; there is no admin surface in this demo. */
export const MERCHANT_NAME = 'Northbay Supply';

const svg = (body: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" fill="none" stroke="#737373" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`,
)}`;

const art = {
  notebook: svg(`<path d="M52 26h94a8 8 0 018 8v140a8 8 0 01-8 8H52z"/><path d="M52 26c-7 0-12 5-12 12v124c0 7 5 12 12 12"/><path d="M64 56h70M64 74h70M64 92h70M64 110h46" stroke-width="1.2" opacity=".5"/><path d="M126 26v50l10-8 10 8V26"/>`),
  tote: svg(`<path d="M40 66h120l-11 116H51z"/><path d="M74 66V48a26 26 0 0152 0v18"/><path d="M40 66h120"/><path d="M66 100h68" stroke-width="1.2" opacity=".45"/>`),
  rule: svg(`<rect x="70" y="20" width="60" height="160" rx="3"/><g stroke-width="1.2" opacity=".55"><path d="M70 44h18M70 60h10M70 76h10M70 92h18M70 108h10M70 124h10M70 140h18M70 156h10"/></g><path d="M130 20v160" stroke-width="1.2" opacity=".35"/>`),
  mug: svg(`<path d="M54 70h84v96a20 20 0 01-20 20H74a20 20 0 01-20-20z"/><path d="M138 92h16a18 18 0 010 36h-16"/><ellipse cx="96" cy="70" rx="42" ry="11"/><ellipse cx="96" cy="70" rx="30" ry="6" stroke-width="1.2" opacity=".4"/>`),
  cap: svg(`<path d="M44 132c0-40 24-66 56-66s56 26 56 66z"/><path d="M44 132h126a17 17 0 01-17 17H44z"/><path d="M100 66v66" stroke-width="1.2" opacity=".45"/><path d="M72 84c13 9 43 9 56 0" stroke-width="1.2" opacity=".45"/>`),
  cord: svg(`<ellipse cx="96" cy="100" rx="54" ry="54"/><ellipse cx="96" cy="100" rx="24" ry="24"/><g stroke-width="1.2" opacity=".5"><ellipse cx="96" cy="100" rx="43" ry="43"/><ellipse cx="96" cy="100" rx="33" ry="33"/></g><path d="M150 100c13-6 21-2 25 8"/>`),
  apron: svg(`<path d="M68 40h64l6 26c14 6 22 18 22 34v66a14 14 0 01-14 14H54a14 14 0 01-14-14v-66c0-16 8-28 22-34z"/><path d="M84 40a16 16 0 0032 0"/><path d="M62 122h76" stroke-width="1.2" opacity=".45"/>`),
  pencil: svg(`<path d="M42 158l12-36 88-88 24 24-88 88z"/><path d="M130 46l24 24"/><path d="M54 122l24 24"/><path d="M42 158l20-8-12-12z"/>`),
  tape: svg(`<circle cx="100" cy="100" r="62"/><circle cx="100" cy="100" r="24"/><path d="M148 138l26 26" stroke-width="3"/><path d="M100 38v14M162 100h-14M100 162v-14M38 100h14" stroke-width="1.4" opacity=".5"/>`),
  flask: svg(`<path d="M76 34h48v20l10 16v112a12 12 0 01-12 12H78a12 12 0 01-12-12V70l10-16z"/><path d="M76 34a10 10 0 0148 0"/><path d="M66 96h68" stroke-width="1.2" opacity=".45"/>`),
  cardholder: svg(`<rect x="38" y="62" width="124" height="80" rx="8"/><path d="M38 90h124" stroke-width="1.2" opacity=".5"/><rect x="56" y="106" width="34" height="20" rx="3" stroke-width="1.4"/>`),
  shirt: svg(`<path d="M76 34l24 16 24-16 34 18-12 30-12-6v88a8 8 0 01-8 8H74a8 8 0 01-8-8V76l-12 6-12-30z"/><path d="M76 34a24 24 0 0048 0"/>`),
};

export const PRODUCTS: Product[] = [
  { id: 'field-notebook-a5', name: 'Field notebook, A5', description: 'Stitch-bound A5, 160 pages of 100gsm dot-grid, water-resistant cover.', priceCents: 48000, currency: 'PHP', imageUrl: art.notebook, category: 'Stationery', rating: 4.8, sold: 1240 },
  { id: 'canvas-tote-16', name: 'Canvas tote, 16L', description: '18oz cotton canvas, riveted at every stress point, flat-bottomed.', priceCents: 125000, currency: 'PHP', imageUrl: art.tote, category: 'Bags', rating: 4.9, sold: 860 },
  { id: 'brass-rule-300', name: 'Brass rule, 300mm', description: 'Solid brass, etched and blackfilled in millimetres and inches.', priceCents: 32000, currency: 'PHP', imageUrl: art.rule, category: 'Tools', rating: 4.6, sold: 3410 },
  { id: 'enamel-mug-350', name: 'Enamel mug, 350ml', description: 'Steel core, double-dipped enamel, rolled rim. Chips honestly.', priceCents: 41500, currency: 'PHP', imageUrl: art.mug, category: 'Kitchen', rating: 4.7, sold: 2180 },
  { id: 'twill-cap', name: 'Cotton twill cap', description: 'Unstructured six-panel in washed twill, brass slide closure.', priceCents: 68000, currency: 'PHP', imageUrl: art.cap, category: 'Apparel', rating: 4.4, sold: 540 },
  { id: 'waxed-cord-20', name: 'Waxed cord, 20m', description: 'Braided polyester under a hard wax finish. Holds a knot under load.', priceCents: 19000, currency: 'PHP', imageUrl: art.cord, category: 'Tools', rating: 4.5, sold: 4720 },
  { id: 'canvas-apron', name: 'Canvas work apron', description: 'Cross-back straps, three pockets, 12oz duck canvas that breaks in.', priceCents: 95000, currency: 'PHP', imageUrl: art.apron, category: 'Apparel', rating: 4.8, sold: 310 },
  { id: 'pencil-hb-12', name: 'Pencil, HB — dozen', description: 'Cedar-cased graphite, unlacquered. Sharpens without splintering.', priceCents: 24000, currency: 'PHP', imageUrl: art.pencil, category: 'Stationery', rating: 4.3, sold: 5960 },
  { id: 'tape-measure-5m', name: 'Steel tape measure, 5m', description: 'Nylon-coated blade, magnetic hook, true-zero end. Locks positively.', priceCents: 54000, currency: 'PHP', imageUrl: art.tape, category: 'Tools', rating: 4.6, sold: 1780 },
  { id: 'flask-750', name: 'Insulated flask, 750ml', description: 'Double-walled 18/8 steel, holds temperature through a full shift.', priceCents: 148000, currency: 'PHP', imageUrl: art.flask, category: 'Kitchen', rating: 4.9, sold: 990 },
  { id: 'card-holder', name: 'Leather card holder', description: 'Full-grain vegetable-tanned leather, four slots, no lining to fail.', priceCents: 89000, currency: 'PHP', imageUrl: art.cardholder, category: 'Bags', rating: 4.7, sold: 1120 },
  { id: 'work-shirt', name: 'Cotton work shirt', description: 'Heavy chambray, felled seams, corozo buttons. Softens rather than wears.', priceCents: 175000, currency: 'PHP', imageUrl: art.shirt, category: 'Apparel', rating: 4.5, sold: 420 },
];

export const COURIERS: Courier[] = [
  { id: 'jnt-mgl', name: 'Miguel Santos', company: 'J&T Express', pkh: '06afd46bcdfd22ef94ac122aa11f241244a37ecc' },
  { id: 'ninjavan-rey', name: 'Rey Delgado', company: 'Ninja Van', pkh: '7dd65592d0ab2fe0d0257d571abf032cd9db93dc' },
];

export const BUYER: Buyer = { id: 'buyer-ana', name: 'Ana Reyes', address: '14 Mabini Street, Barangay Poblacion, Makati City 1210' };

export function getProduct(id: string): Product | undefined { return PRODUCTS.find((product) => product.id === id); }
export function getCourier(id: string): Courier | undefined { return COURIERS.find((courier) => courier.id === id); }
export function getBuyer(id: string): Buyer | undefined { return BUYER.id === id ? BUYER : undefined; }
