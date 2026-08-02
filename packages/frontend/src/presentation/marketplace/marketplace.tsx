import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '../../components/ui/button.js';
import { useToast } from '../../components/ui/toast.js';
import { storeOrder } from '../../infrastructure/order-storage.js';

import {
  apply,
  categoriesOf,
  price,
  sold,
  type MarketplaceProduct,
  type MarketplaceState,
  type SortKey,
} from './data.js';
import { CheckIcon, FilterIcon, HeartIcon, SearchIcon, ShieldIcon, StarIcon } from './skin-a-icons.js';
import { shopApi } from '../../infrastructure/api-client.js';

const MERCHANT = 'Northbay Supply';

const SORTS: Array<[SortKey, string]> = [
  ['relevance', 'Relevance'],
  ['latest', 'Latest'],
  ['sales', 'Top sales'],
  ['priceAsc', 'Price ↑'],
  ['priceDesc', 'Price ↓'],
];

const RATING_OPTIONS = [
  [0, 'Any rating'],
  [4, '4★ & up'],
  [4.5, '4.5★ & up'],
] as const;

const emptyState = (): MarketplaceState => ({
  q: '',
  categories: new Set(),
  min: null,
  max: null,
  minRating: 0,
  sort: 'relevance',
});

type Chip = { key: string; label: string };

function getChips(state: MarketplaceState): Chip[] {
  const chips = [...state.categories].map((category) => ({ key: `category:${category}`, label: category }));
  if (state.min !== null || state.max !== null) chips.push({ key: 'price', label: `₱${state.min ?? 0} – ₱${state.max ?? '∞'}` });
  if (state.minRating) chips.push({ key: 'rating', label: `${state.minRating}★ & up` });
  if (state.q.trim()) chips.push({ key: 'query', label: `“${state.q.trim()}”` });
  return chips;
}

function ProductCard({ product, onOpen }: { product: MarketplaceProduct; onOpen: (productId: string) => void }) {
  return (
    <motion.article
      className="marketplace-card"
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      whileHover={{ y: -2 }}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(product.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(product.id);
        }
      }}
    >
      <div className="marketplace-art"><img src={product.imageUrl} alt="" /></div>
      <div className="marketplace-product-body">
        <h2 className="marketplace-product-name">{product.name}</h2>
        <div className="marketplace-price">{price(product)}</div>
        <div className="marketplace-product-meta">
          <span className="marketplace-stars" aria-label={`${product.rating} out of 5 stars`}>
            {[1, 2, 3, 4, 5].map((star) => <StarIcon key={star} filled={star <= Math.round(product.rating)} />)}
          </span>
          <span>{product.rating}</span><span>·</span><span>{sold(product.sold)} sold</span>
        </div>
      </div>
    </motion.article>
  );
}

function ProductDetail({
  product,
  onBack,
  onCategory,
  onBuy,
  isCheckoutLoading,
  placed,
}: {
  product: MarketplaceProduct;
  onBack: () => void;
  onCategory: (category: string) => void;
  onBuy: () => void;
  isCheckoutLoading: boolean;
  /** The order landed; hold the confirmation until the page hands off. */
  placed: boolean;
}) {
  const [selectedThumbnail, setSelectedThumbnail] = useState(0);

  return (
    <motion.div
      className="marketplace-detail-page"
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -18 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <header className="marketplace-topbar">
        <div className="marketplace-brand">{MERCHANT}</div>
        <nav className="marketplace-topnav" aria-label="Marketplace">
          <a href="#/shop/orders">Orders</a>
          <a href="#help">Help</a>
        </nav>
      </header>

      <div className="marketplace-detail">
        <nav className="marketplace-crumbs" aria-label="Breadcrumb">
          <a href="#/shop" onClick={(event) => { event.preventDefault(); onBack(); }}>Catalogue</a>
          <span>/</span>
          <a href="#/shop" onClick={(event) => { event.preventDefault(); onCategory(product.category); }}>{product.category}</a>
          <span>/</span>
          <span className="marketplace-crumb-current">{product.name}</span>
        </nav>

        <div className="marketplace-detail-grid">
          <div className="marketplace-gallery">
            <AnimatePresence mode="wait">
              <motion.div
                className="marketplace-hero-art"
                key={selectedThumbnail}
                initial={{ opacity: 0.6, scale: 0.985 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0.6, scale: 1.015 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
              ><img src={product.imageUrl} alt={product.name} /></motion.div>
            </AnimatePresence>
            <div className="marketplace-thumbnails" aria-label="Product images">
              {[0, 1, 2, 3].map((thumbnail) => (
                <motion.button
                  type="button"
                  className="marketplace-thumbnail"
                  key={thumbnail}
                  aria-label={`Product image ${thumbnail + 1}`}
                  aria-current={selectedThumbnail === thumbnail}
                  onClick={() => setSelectedThumbnail(thumbnail)}
                  whileTap={{ scale: 0.96 }}
                ><img src={product.imageUrl} alt="" /></motion.button>
              ))}
            </div>
          </div>

          <div className="marketplace-buybox">
            <span className="marketplace-badge">{product.category}</span>
            <h1>{product.name}</h1>
            <div className="marketplace-detail-rating">
              <span className="marketplace-stars" aria-label={`${product.rating} out of 5 stars`}>
                {[1, 2, 3, 4, 5].map((star) => <StarIcon key={star} filled={star <= Math.round(product.rating)} />)}
              </span>
              <strong>{product.rating}</strong><span>·</span><span>{sold(product.sold)} sold</span>
            </div>
            <div className="marketplace-detail-price">{price(product)}</div>
            <p className="marketplace-detail-lede">{product.description}</p>
            <dl className="marketplace-specs">
              <dt>Item ID</dt><dd>{product.id}</dd>
              <dt>Category</dt><dd>{product.category}</dd>
              <dt>Ships from</dt><dd>Makati City</dd>
              <dt>Courier</dt><dd>Assigned by the merchant after checkout</dd>
            </dl>
            <div className="marketplace-detail-actions">
              {/* Buying is the demo's opening move and the one call that mints a parcel, so the
                  button carries the wait itself: a spinner and a label that swap in place. */}
              <motion.div
                className={`marketplace-buy-wrap${placed ? ' is-placed' : ''}`}
                whileTap={isCheckoutLoading ? undefined : { scale: 0.98 }}
                animate={placed ? { scale: [1, 1.03, 1] } : { scale: 1 }}
                transition={{ duration: 0.34, ease: 'easeOut' }}
              >
                <Button type="button" className="marketplace-buy-button" onClick={onBuy} disabled={isCheckoutLoading}>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      className="marketplace-buy-label"
                      key={placed ? 'placed' : isCheckoutLoading ? 'placing' : 'idle'}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                    >
                      {placed
                        ? <><CheckIcon />Order placed</>
                        : <>{isCheckoutLoading && <span className="marketplace-spinner" aria-hidden="true" />}{isCheckoutLoading ? 'Placing order…' : 'Buy now'}</>}
                    </motion.span>
                  </AnimatePresence>
                </Button>
              </motion.div>
              <Button type="button" variant="outline" size="icon" aria-label="Save"><HeartIcon /></Button>
            </div>
            <div className="marketplace-custody-note">
              <ShieldIcon aria-hidden="true" />
              <div>
                <strong>Ships with custody tracking</strong>
                <p>Every handover is signed by the courier holding it, and the record is public. You get a delivery code only you can release.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="marketplace-detail-sections">
          <section>
            <h2>Description</h2>
            <p>{product.description}</p>
            <p>Packed flat and dispatched the same working day. Custody passes to the first courier at the depot, and every handover after that is a separate signature — nobody can move this parcel alone.</p>
          </section>
          <section>
            <h2>Delivery</h2>
            <p>Metro Manila, 1–2 working days. Provincial, 3–5.</p>
            <p>At the door the courier needs a delivery code that only you can reveal. Until you release it, the parcel cannot be closed.</p>
          </section>
        </div>
      </div>
    </motion.div>
  );
}

/** How long the "Order placed" confirmation holds before the order page takes over. */
const CONFIRM_MS = 900;

export function Marketplace({
  productId = null,
  category = null,
  onOpenProduct,
  onCloseProduct = () => undefined,
  onBrowseCategory = () => undefined,
  onCheckout = () => undefined,
}: {
  productId?: string | null;
  category?: string | null;
  onOpenProduct: (productId: string) => void;
  onCloseProduct?: () => void;
  onBrowseCategory?: (category: string) => void;
  onCheckout?: (orderId: string) => void;
}) {
  const [state, setState] = useState<MarketplaceState>(() => category ? { ...emptyState(), categories: new Set([category]) } : emptyState());
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  /** Held between a successful checkout and the navigation, so the confirmation is seen. */
  const [placed, setPlaced] = useState(false);
  const toast = useToast();
  const results = useMemo(() => apply(products, state), [products, state]);
  const categories = useMemo(() => categoriesOf(products), [products]);
  const chips = useMemo(() => getChips(state), [state]);
  const selectedProduct = useMemo(() => products.find((product) => product.id === productId) ?? null, [products, productId]);

  const loadProducts = () => {
    setIsLoadingProducts(true);
    setProductsError(null);
    void shopApi.getProducts()
      .then(setProducts)
      .catch((error: unknown) => setProductsError(error instanceof Error ? error.message : String(error)))
      .finally(() => setIsLoadingProducts(false));
  };

  useEffect(() => { loadProducts(); }, []);
  useEffect(() => {
    setState((current) => ({ ...current, categories: category ? new Set([category]) : new Set() }));
  }, [category]);

  const update = (changes: Partial<MarketplaceState>) => setState((current) => ({ ...current, ...changes }));

  const toggleCategory = (category: string, checked: boolean) => {
    setState((current) => {
      const categories = new Set(current.categories);
      checked ? categories.add(category) : categories.delete(category);
      return { ...current, categories };
    });
  };

  const removeChip = (key: string) => {
    if (key.startsWith('category:')) return toggleCategory(key.slice('category:'.length), false);
    if (key === 'price') return update({ min: null, max: null });
    if (key === 'rating') return update({ minRating: 0 });
    update({ q: '' });
  };

  const openProduct = (nextProductId: string) => {
    onOpenProduct(nextProductId);
    window.scrollTo(0, 0);
  };

  const closeProduct = () => {
    onCloseProduct();
  };

  const browseCategory = (category: string) => {
    onBrowseCategory(category);
  };

  const buyProduct = () => {
    if (!selectedProduct || isCheckoutLoading) return;
    setIsCheckoutLoading(true);
    void shopApi.checkout(selectedProduct.id)
      .then(({ orderId, accessToken }) => {
        storeOrder(orderId, accessToken);
        toast.success(`Order #${orderId} placed`, 'The merchant will approve it before dispatch.');
        // `placed` plays the confirmation over the detail page; navigation waits for it, so the
        // order page is not already on screen while the tick is still animating.
        setPlaced(true);
        window.setTimeout(() => onCheckout(orderId), CONFIRM_MS);
      })
      .catch((error: unknown) => {
        toast.error('Could not place order', error instanceof Error ? error.message : String(error));
        setIsCheckoutLoading(false);
      });
  };

  return (
    <div className="marketplace">
      <AnimatePresence mode="wait" initial={false}>
        {selectedProduct ? (
          <ProductDetail key={selectedProduct.id} product={selectedProduct} onBack={closeProduct} onCategory={browseCategory} onBuy={buyProduct} isCheckoutLoading={isCheckoutLoading} placed={placed} />
        ) : <motion.div key="catalogue" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
      <header className="marketplace-topbar">
        <div className="marketplace-brand">{MERCHANT}</div>
        <nav className="marketplace-topnav" aria-label="Marketplace">
          <a href="#/shop/orders">Orders</a>
          <a href="#help">Help</a>
        </nav>
      </header>

      <div className="marketplace-search-row">
        <div className="marketplace-search-field">
          <SearchIcon aria-hidden="true" />
          <input
            className="marketplace-input"
            aria-label="Search products"
            placeholder="Search products"
            value={state.q}
            onChange={(event) => update({ q: event.target.value })}
          />
        </div>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="marketplace-filter-button"
          aria-label="Filters"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((isOpen) => !isOpen)}
        >
          <FilterIcon />
          {chips.length > 0 && <span className="marketplace-filter-count">{chips.length}</span>}
        </Button>
      </div>

      <div className={`marketplace-shell${filtersOpen ? '' : ' marketplace-shell-no-filters'}`}>
        <AnimatePresence initial={false}>
          {filtersOpen && (
            <motion.aside
              className="marketplace-filters"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              <section>
                <h2>Category</h2>
                {categories.map((category) => {
                  const id = `category-${category.toLowerCase()}`;
                  return (
                    <label className="marketplace-option" htmlFor={id} key={category}>
                      <input className="marketplace-control marketplace-checkbox" id={id} type="checkbox" checked={state.categories.has(category)} onChange={(event) => toggleCategory(category, event.target.checked)} />
                      <span>{category}</span>
                      <span className="marketplace-option-count">{products.filter((product) => product.category === category).length}</span>
                    </label>
                  );
                })}
              </section>

              <section>
                <h2>Price range</h2>
                <div className="marketplace-range">
                  <input className="marketplace-input" aria-label="Minimum price" type="number" placeholder="₱ Min" value={state.min ?? ''} onChange={(event) => update({ min: event.target.value === '' ? null : Number(event.target.value) })} />
                  <span>–</span>
                  <input className="marketplace-input" aria-label="Maximum price" type="number" placeholder="₱ Max" value={state.max ?? ''} onChange={(event) => update({ max: event.target.value === '' ? null : Number(event.target.value) })} />
                </div>
              </section>

              <section>
                <h2>Rating</h2>
                {RATING_OPTIONS.map(([rating, label]) => (
                  <label className="marketplace-option" htmlFor={`rating-${rating}`} key={rating}>
                    <input className="marketplace-control marketplace-radio" type="radio" name="rating" value={rating} id={`rating-${rating}`} checked={state.minRating === rating} onChange={() => update({ minRating: rating })} />
                    <span>{label}</span>
                  </label>
                ))}
              </section>

              <section className="marketplace-clear-section">
                <Button type="button" variant="outline" size="sm" onClick={() => setState(emptyState())}>Clear all</Button>
              </section>
            </motion.aside>
          )}
        </AnimatePresence>

        <main className="marketplace-main">
          <div className="marketplace-sortbar">
            <span className="marketplace-sort-label">Sort by</span>
            {SORTS.map(([key, label]) => (
              <Button key={key} type="button" variant="ghost" size="sm" aria-pressed={state.sort === key} onClick={() => update({ sort: key })}>{label}</Button>
            ))}
            <span className="marketplace-sort-spacer" />
            <span className="marketplace-results-count">{results.length} of {products.length}</span>
          </div>

          <AnimatePresence initial={false}>
            {chips.length > 0 && (
              <motion.div className="marketplace-chips" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {chips.map((chip) => (
                  <span className="marketplace-chip" key={chip.key}>
                    {chip.label}
                    <button type="button" aria-label={`Remove ${chip.label} filter`} onClick={() => removeChip(chip.key)}>×</button>
                  </span>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {isLoadingProducts ? <div className="marketplace-loading" role="status">Loading products…</div>
            : productsError ? <div className="marketplace-load-error" role="alert"><p>{productsError}</p><Button type="button" variant="outline" size="sm" onClick={loadProducts}>Try again</Button></div>
            : results.length > 0 ? (
            <motion.div layout className="marketplace-grid">
              <AnimatePresence mode="popLayout">{results.map((product) => <ProductCard product={product} key={product.id} onOpen={openProduct} />)}</AnimatePresence>
            </motion.div>
          ) : <div className="marketplace-empty">No products match those filters.</div>}
        </main>
      </div>
        </motion.div>}
      </AnimatePresence>
    </div>
  );
}
