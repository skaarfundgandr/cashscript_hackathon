
import { PRODUCTS, MERCHANT, price } from './products.js';

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const head = () => `
  <header class="shop-head">
    <div class="mark">${MERCHANT}</div>
    <nav><a href="#">Orders</a><a href="#">Help</a></nav>
  </header>`;

/* ══ A · Broadsheet catalogue ══════════════════════════════════════════════
   Uniform grid. Editorial type scale, display headline set as misregistered
   text plates. No masthead rules, no plate numerals on prices. */
const VariantA = {
  name: 'Broadsheet catalogue',
  render: () => {
  // The plate spans must sit on each .line individually — the construction is
  // per-line, and a single wrapper would misregister the whole block.
  const line = (t) => `<span class="line cmyk-head" style="display:block;position:relative">
      <span class="paper">${esc(t)}</span>
      <span class="plate plate-c" aria-hidden="true">${esc(t)}</span>
      <span class="plate plate-m" aria-hidden="true">${esc(t)}</span>
      <span class="plate plate-y" aria-hidden="true">${esc(t)}</span>
    </span>`;
  return `<div class="wrap">
    ${head()}
    <section class="a-hero">
      <div class="label" style="margin-bottom:30px">Edition one</div>
      <h1 style="margin:0;font-size:76px">${line('Made to be')}${line('carried.')}</h1>
    </section>
    <p class="a-sub">Everyday supply, shipped with a custody record anyone can
      read. <span class="aside">The parcel signs for itself.</span></p>

    <section class="a-grid">
      ${PRODUCTS.map((p) => `
        <article>
          <div class="art halftone">${p.art}</div>
          <h2 class="a-name">${esc(p.name)}</h2>
          <p class="a-desc">${esc(p.description)}</p>
          <div class="a-foot">
            <span class="a-price">${price(p)}</span>
            <button class="buy">Buy now</button>
          </div>
        </article>`).join('')}
    </section>
  </div>`;
  },
};

/* ══ B · Index list ════════════════════════════════════════════════════════
   Not a grid at all — a price list. Text-led rows, thumbnail at 72px, price
   right-aligned. The storefront gets out of the way entirely. */
const VariantB = {
  name: 'Index list — host, not brand',
  render: () => `<div class="wrap">
    ${head()}
    <section class="b-head">
      <div class="label">Catalogue</div>
    </section>
    <section>
      ${PRODUCTS.map((p) => `
        <div class="b-row">
          <div class="art">${p.art}</div>
          <div>
            <h2 class="b-name">${esc(p.name)}</h2>
            <p class="b-desc">${esc(p.description)}</p>
          </div>
          <div class="b-right">
            <span class="b-price">${price(p)}</span>
            <button class="buy">Buy now</button>
          </div>
        </div>`).join('')}
    </section>
  </div>`,
};

/* ══ C · Front page ════════════════════════════════════════════════════════
   Asymmetric editorial layout — a lead product at half the page with the rest
   as a stacked column beside it. Masthead rules, plate numerals as product
   index numbers, and the true #sep-all compound filter on the lead image only
   (the defs are document-global, so exactly one .print figure per page). */
const VariantC = {
  name: 'Front page — full press',
  render: () => {
    const [lead, ...rest] = PRODUCTS;
    const num = (n, cls) => `<span class="cmyk-num ${cls || ''}">
        <span class="paper">${n}</span>
        <span class="plate plate-c" aria-hidden="true">${n}</span>
        <span class="plate plate-m" aria-hidden="true">${n}</span>
        <span class="plate plate-y" aria-hidden="true">${n}</span>
      </span>`;
    return `<div class="wrap">
      <header class="c-masthead">
        <div class="c-rule"></div>
        <div class="c-rule thin"></div>
        <div class="c-mark">${MERCHANT}</div>
        <div class="c-rule thin"></div>
        <div class="c-rule"></div>
        <div class="c-dateline">
          <span>No. 1</span><span>Everyday supply</span><span>Orders · Help</span>
        </div>
      </header>

      <div class="c-body">
        <article class="c-lead">
          <figure class="cmyk" style="margin:0">
            <div class="print"><div class="art">${lead.art}</div></div>
          </figure>
          <div class="c-num">
            ${num('01')}
            <div>
              <h1 class="c-lead-title">${esc(lead.name)}</h1>
              <p class="c-lead-desc">${esc(lead.description)}</p>
              <div class="c-lead-foot">
                <span class="c-lead-price">${price(lead)}</span>
                <button class="buy-solid">Buy now</button>
              </div>
            </div>
          </div>
        </article>

        <div class="c-side">
          ${rest.map((p, i) => `
            <article class="c-item">
              <div class="art">${p.art}</div>
              <div>
                ${num(String(i + 2).padStart(2, '0'))}
                <h2 class="c-item-name">${esc(p.name)}</h2>
                <div class="c-item-price">${price(p)}</div>
                <button class="buy c-item-buy">Buy now</button>
              </div>
            </article>`).join('')}
        </div>
      </div>
    </div>`;
  },
};

/* ── switcher ───────────────────────────────────────────────────────────── */
const VARIANTS = { A: VariantA, B: VariantB, C: VariantC };
const KEYS = Object.keys(VARIANTS);

function current() {
  const k = (new URLSearchParams(location.search).get('variant') || 'A').toUpperCase();
  return KEYS.includes(k) ? k : 'A';
}

function paint() {
  const k = current();
  document.getElementById('stage').innerHTML = VARIANTS[k].render();
  document.getElementById('vkey').textContent = k;
  document.getElementById('vname').textContent = VARIANTS[k].name;
}

function go(step) {
  const i = (KEYS.indexOf(current()) + step + KEYS.length) % KEYS.length;
  const u = new URL(location.href);
  u.searchParams.set('variant', KEYS[i]);
  history.replaceState(null, '', u);
  paint();
}

document.getElementById('prev').onclick = () => go(-1);
document.getElementById('next').onclick = () => go(1);
addEventListener('keydown', (e) => {
  if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  if (e.key === 'ArrowLeft') go(-1);
  if (e.key === 'ArrowRight') go(1);
});

paint();
