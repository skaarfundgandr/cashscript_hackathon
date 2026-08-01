export interface MarketplaceProduct {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  imageUrl: string;
  category: string;
  rating: number;
  sold: number;
}

export type SortKey = 'relevance' | 'latest' | 'sales' | 'priceAsc' | 'priceDesc';

export type MarketplaceState = {
  q: string;
  categories: Set<string>;
  min: number | null;
  max: number | null;
  minRating: number;
  sort: SortKey;
};

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 });

export const price = (product: MarketplaceProduct) => peso.format(product.priceCents / 100);
export const sold = (amount: number) => (amount >= 1000 ? `${(amount / 1000).toFixed(1)}k` : String(amount));
export const categoriesOf = (products: MarketplaceProduct[]) => [...new Set(products.map((product) => product.category))].sort();

export function apply(products: MarketplaceProduct[], state: MarketplaceState): MarketplaceProduct[] {
  const query = state.q.trim().toLowerCase();
  const filtered = products.filter((product) => {
    if (query && !(product.name + product.description).toLowerCase().includes(query)) return false;
    if (state.categories.size && !state.categories.has(product.category)) return false;
    if (state.min !== null && product.priceCents / 100 < state.min) return false;
    if (state.max !== null && product.priceCents / 100 > state.max) return false;
    return !state.minRating || product.rating >= state.minRating;
  });

  const comparisons: Record<SortKey, (a: MarketplaceProduct, b: MarketplaceProduct) => number> = {
    relevance: () => 0,
    latest: (a, b) => products.indexOf(b) - products.indexOf(a),
    sales: (a, b) => b.sold - a.sold,
    priceAsc: (a, b) => a.priceCents - b.priceCents,
    priceDesc: (a, b) => b.priceCents - a.priceCents,
  };

  return [...filtered].sort(comparisons[state.sort]);
}
