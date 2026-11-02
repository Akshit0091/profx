// content.js — reads the Meesho orders table and sends each row's product photo
// to ProfX.
//
// Meesho ships class names like "sc-fXSgeo", which change on every deploy, so
// nothing here depends on them. Rows are found by what they contain: a
// sub-order ID always looks like 347365437691724416_1, and the product photo is
// always the one image in the row. Columns are located by reading the table's
// own header text, so a reordered or renamed column is handled too.

(() => {
  if (window.__profxScanLoaded) return;
  window.__profxScanLoaded = true;

  const SUB_ORDER_RE = /\b(\d{15,20}_\d+)\b/;
  const CHUNK = 150;          // rows per request to ProfX
  const SETTLE_MS = 900;      // how long to let the table render after a scroll
  const STABLE_ROUNDS = 3;    // scrolls with no new rows before we call it done
  const MAX_SCROLLS = 400;
  const MAX_PAGES = 60;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

  // ---------- finding the table ----------

  /** The orders grid is whichever table has a "Sub-order ID" column. */
  function findTable() {
    for (const table of document.querySelectorAll('table')) {
      if (/sub[-\s]?order/i.test(table.textContent || '')) return table;
    }
    return null;
  }

  /** Maps column meaning to index, read from the table's own header row. */
  function headerIndex(table) {
    const head = table.querySelector('thead tr') || table.querySelector('tr');
    if (!head) return {};
    const cells = [...head.children].map((c) => norm(c.textContent).toLowerCase());
    const find = (re) => cells.findIndex((t) => re.test(t));
    return {
      product: find(/product/),
      subOrder: find(/sub[-\s]?order/),
      sku: find(/^sku/),
      qty: find(/quantity|^qty/),
    };
  }

  // ---------- reading one row ----------

  /**
   * Picks the product photo out of a row. Meesho serves it from its own image
   * CDN; status icons and the courier logo are inline SVG or data URIs, so
   * requiring a real http(s) URL is enough to tell them apart.
   */
  function rowImage(row) {
    for (const img of row.querySelectorAll('img')) {
      // A srcset gives the sharpest variant the page knows about.
      const fromSet = (img.getAttribute('srcset') || '')
        .split(',')
        .map((s) => norm(s).split(' ')[0])
        .filter((u) => /^https?:/i.test(u))
        .pop();
      const src = fromSet || img.currentSrc || img.src;
      if (!src || !/^https?:/i.test(src)) continue;
      if (/\.svg(\?|$)/i.test(src)) continue;
      return src;
    }
    return null;
  }

  function readRow(row, idx) {
    const cells = row.children ? [...row.children] : [];
    const cellText = (i) => (i >= 0 && cells[i] ? norm(cells[i].textContent) : '');
    const rowText = norm(row.textContent);

    const subOrderId = (cellText(idx.subOrder).match(SUB_ORDER_RE) ||
                        rowText.match(SUB_ORDER_RE) || [])[1];
    if (!subOrderId) return null;

    const imageUrl = rowImage(row);
    if (!imageUrl) return null;

    // The product cell holds the title plus an "Order ID: ..." line underneath;
    // only the title is wanted.
    const title = cellText(idx.product)
      .replace(/Order ID:\s*\S+/i, '')
      .trim() || null;

    const sku = cellText(idx.sku) || null;
    const qty = parseInt(cellText(idx.qty), 10);

    return { subOrderId, sku, title, imageUrl, qty: qty > 0 ? qty : 1 };
  }

  // ---------- walking the whole list ----------

  /** The grid usually scrolls inside its own box rather than with the page. */
  function scroller(table) {
    let el = table.parentElement;
    while (el && el !== document.body) {
      const style = getComputedStyle(el);
      if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 40) return el;
      el = el.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function harvest(table, into) {
    const idx = headerIndex(table);
    const body = table.querySelector('tbody') || table;
    let added = 0;
    for (const row of body.querySelectorAll('tr')) {
      const item = readRow(row, idx);
      if (item && !into.has(item.subOrderId)) {
        into.set(item.subOrderId, item);
        added += 1;
      }
    }
    return added;
  }

  /** Clicks through to the next page, if the list is paginated. Returns success. */
  async function nextPage() {
    const controls = [...document.querySelectorAll('button, a, [role="button"]')];
    const next = controls.find((el) => {
      const label = `${el.getAttribute('aria-label') || ''} ${norm(el.textContent)}`.toLowerCase();
      if (!/^(next|next page|›|→|>)$/.test(label.trim()) && !/next\s*page/.test(label)) return false;
      return !el.disabled && el.getAttribute('aria-disabled') !== 'true';
    });
    if (!next) return false;
    next.click();
    await sleep(SETTLE_MS * 2);
    return true;
  }

  async function collectAll(report) {
    const table = findTable();
    if (!table) throw new Error('No orders table on this page. Open Orders → Ready to Ship and try again.');

    const found = new Map();
    const box = scroller(table);

    for (let page = 0; page < MAX_PAGES; page += 1) {
      let stable = 0;
      for (let i = 0; i < MAX_SCROLLS && stable < STABLE_ROUNDS; i += 1) {
        const added = harvest(findTable() || table, found);
        report(`Reading the list… ${found.size} orders`);

        const before = box.scrollTop;
        box.scrollTop = box.scrollHeight;
        await sleep(SETTLE_MS);

        // Nothing new and nowhere further to scroll means this page is done.
        if (added === 0 && box.scrollTop <= before + 2) stable += 1;
        else stable = 0;
      }
      harvest(findTable() || table, found);

      report(`Reading the list… ${found.size} orders`);
      if (!(await nextPage())) break;
      box.scrollTop = 0;
    }

    return [...found.values()];
  }

  // ---------- sending ----------

  function send(type, payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!res?.ok) return reject(new Error(res?.error || 'Something went wrong'));
        resolve(res.data);
      });
    });
  }

  async function run(report) {
    const status = await send('status');
    if (!status.signedIn) throw new Error('Sign in from the ProfX extension popup first.');

    const items = await collectAll(report);
    if (!items.length) throw new Error('Found no orders with a product photo on this page.');

    const totals = { rows: 0, imagesSaved: 0, imagesSkipped: 0, unresolved: 0 };
    for (let i = 0; i < items.length; i += CHUNK) {
      const batch = items.slice(i, i + CHUNK);
      report(`Saving ${Math.min(i + batch.length, items.length)} of ${items.length}…`);
      const res = await send('ingest', { items: batch });
      totals.rows += res.rows || 0;
      totals.imagesSaved += res.imagesSaved || 0;
      totals.imagesSkipped += res.imagesSkipped || 0;
      totals.unresolved += res.unresolved || 0;
    }
    return { ...totals, scanned: items.length };
  }

  // ---------- the on-page panel ----------

  const panel = document.createElement('div');
  panel.className = 'profx-panel';
  panel.innerHTML = `
    <div class="profx-title">ProfX</div>
    <div class="profx-status">Ready</div>
    <button class="profx-go" type="button">Save product images</button>
  `;
  const statusEl = panel.querySelector('.profx-status');
  const button = panel.querySelector('.profx-go');
  const report = (text) => { statusEl.textContent = text; };

  button.addEventListener('click', async () => {
    button.disabled = true;
    panel.classList.remove('profx-error', 'profx-done');
    try {
      const r = await run(report);
      panel.classList.add('profx-done');
      statusEl.textContent =
        `Done — ${r.scanned} orders, ${r.imagesSaved} new photos` +
        (r.imagesSkipped ? `, ${r.imagesSkipped} already saved` : '') +
        (r.unresolved ? `, ${r.unresolved} with no SKU` : '');
    } catch (err) {
      panel.classList.add('profx-error');
      statusEl.textContent = err.message;
    } finally {
      button.disabled = false;
    }
  });

  const mount = () => document.body && document.body.appendChild(panel);
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
})();
