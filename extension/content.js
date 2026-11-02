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
  // Small batches: the server fetches a photo per new SKU, so one huge request
  // would sit there for minutes with nothing to show for it. 40 keeps the
  // progress line moving and keeps any single request well short of a proxy
  // timeout.
  const CHUNK = 40;
  const SETTLE_MS = 400;      // between scroll steps, where rows are already rendered
  const BOTTOM_WAIT_MS = 2000; // at the bottom, where more may still be loading
  const STABLE_ROUNDS = 3;          // quiet rounds before the list is called finished
  const STABLE_ROUNDS_PATIENT = 10; // ...but far more while the tab says there are more to come
  const MAX_SCROLLS = 800;    // smaller steps means more of them
  const MAX_PAGES = 60;
  const BUDGET_MS = 10 * 60 * 1000;  // overall ceiling on one run

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
  /**
   * Every box that might need scrolling, innermost first.
   *
   * The orders page has two: the grid scrolls inside its own box, and the page
   * scrolls behind it. Driving only the inner one reaches the end of the rows
   * currently loaded and stops, because it is the page scroll that makes Meesho
   * fetch the next lot — which is how a 352-order list stopped at 263.
   */
  function scrollers(table) {
    const boxes = [];
    let el = table.parentElement;
    while (el && el !== document.body) {
      const style = getComputedStyle(el);
      if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 40) boxes.push(el);
      el = el.parentElement;
    }
    const page = document.scrollingElement || document.documentElement;
    if (page && !boxes.includes(page)) boxes.push(page);
    return boxes;
  }

  /**
   * How many orders the tab says there are, e.g. "Ready to Ship (352)". Knowing
   * the target is what tells the difference between a list that has ended and
   * one that is still loading, so it is worth reading even though it is only a
   * label on the page.
   */
  function expectedCount() {
    const text = document.body ? (document.body.innerText || document.body.textContent || '') : '';
    const m = text.match(/(?:Ready to Ship|Pending|On Hold|Shipped|Cancelled)\s*\((\d[\d,]*)\)/i);
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
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
  /**
   * Clicks through to the next page of the list, if it is paginated.
   *
   * The search is deliberately confined to the table's own surroundings. The
   * orders page also carries a promotions carousel, and a carousel's "next"
   * arrow looks exactly like a pagination arrow — clicking that would advance a
   * banner, reset the list to the top and start the whole scroll again.
   */
  async function nextPage(table, box) {
    const isNext = (el) => {
      const label = `${el.getAttribute('aria-label') || ''} ${norm(el.textContent)}`.trim().toLowerCase();
      if (!/^(next|next page|›|→|>)$/.test(label) && !/next\s*page/.test(label)) return false;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
      return !table.contains(el); // not a per-row action button
    };

    // Widen out from the table a level at a time and take the first match.
    let scope = (box && box.parentElement) || table.parentElement;
    for (let depth = 0; depth < 4 && scope; depth += 1, scope = scope.parentElement) {
      const next = [...scope.querySelectorAll('button, a, [role="button"]')].find(isNext);
      if (next) {
        next.click();
        await sleep(SETTLE_MS * 2);
        return true;
      }
    }
    return false;
  }

  /**
   * Describes what is actually on the page when no orders table is found, so a
   * Meesho redesign can be diagnosed from the seller's screenshot rather than
   * guessed at.
   */
  function describePage() {
    const tables = document.querySelectorAll('table').length;
    const photos = [...document.querySelectorAll('img')]
      .filter((i) => /^https?:/i.test(i.currentSrc || i.src || '')).length;
    const pageText = document.body ? (document.body.innerText || document.body.textContent || '') : '';
    const subOrders = (pageText.match(/\b\d{15,20}_\d+\b/g) || []).length;
    const grids = document.querySelectorAll('[role="table"], [role="grid"], [role="rowgroup"]').length;
    return `tables: ${tables}, aria grids: ${grids}, http images: ${photos}, sub-order IDs in text: ${subOrders}`;
  }

  async function collectAll(report) {
    const table = findTable();
    if (!table) {
      throw new Error(
        'No orders table on this page. Open Orders → Ready to Ship and try again. ' +
        `(What is here — ${describePage()})`
      );
    }

    const found = new Map();
    const boxes = scrollers(table);
    const box = boxes[0];
    const target = expectedCount();

    /**
     * Advances the innermost box that still has somewhere to go, falling
     * through to the page once the grid is at its end. Returns false only when
     * nothing on the page can scroll any further.
     */
    const stepScroll = () => {
      for (const b of boxes) {
        const before = b.scrollTop;
        const step = Math.max(200, Math.floor((b.clientHeight || 600) * 0.8));
        b.scrollTop = Math.min(b.scrollTop + step, b.scrollHeight);
        if (b.scrollTop > before + 2) return true;
      }
      return false;
    };

    // Without a ceiling the scroll and page limits multiply out to hours. A
    // run over a few thousand orders finishes in minutes, so anything past
    // this is a loop that is not making progress.
    const deadline = Date.now() + BUDGET_MS;
    let ranOut = false;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      let stable = 0;
      for (let i = 0; i < MAX_SCROLLS; i += 1) {
        if (Date.now() > deadline) { ranOut = true; break; }

        const added = harvest(findTable() || table, found);
        report(`Reading the list… ${found.size}${target ? ` of ${target}` : ''} orders`);

        // Everything the tab promised is in hand, so there is nothing to be
        // gained by scrolling on and waiting out the quiet rounds.
        if (target && found.size >= target) break;

        // Step down roughly one screen at a time rather than jumping to the
        // bottom. The list only keeps the visible rows in the page, so a jump
        // skips everything in between.
        const moved = stepScroll();

        // Nothing left to scroll usually means more is being fetched, so wait
        // longer there than between ordinary steps.
        await sleep(moved ? SETTLE_MS : BOTTOM_WAIT_MS);

        if (added === 0 && !moved) stable += 1;
        else stable = 0;

        // While the tab says there are more than we have, give the page far
        // longer to produce them before concluding the list has ended.
        const shortOfTarget = target && found.size < target;
        if (stable >= (shortOfTarget ? STABLE_ROUNDS_PATIENT : STABLE_ROUNDS)) break;
      }
      harvest(findTable() || table, found);
      report(`Reading the list… ${found.size}${target ? ` of ${target}` : ''} orders`);
      if (ranOut) break;

      const before = found.size;
      if (!(await nextPage(table, box))) break;
      box.scrollTop = 0;
      harvest(findTable() || table, found);

      // The control we clicked was not pagination after all, or the list has
      // genuinely ended. Either way, going round again would just repeat.
      if (found.size === before) break;
    }

    return { items: [...found.values()], ranOut, target };
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

  /**
   * Reads the list and reports what it found without sending anything. This is
   * the safe way to find out whether the scraper understands the page, since
   * nothing reaches the server and nothing is stored.
   */
  async function preview(report) {
    const { items, ranOut, target } = await collectAll(report);
    if (!items.length) {
      throw new Error(`Found no orders with a product photo. (What is here — ${describePage()})`);
    }
    const withSku = items.filter((i) => i.sku).length;
    const sample = items[0];
    console.log('[ProfX] preview — all rows read from this page:', items);
    return {
      scanned: items.length,
      withSku,
      ranOut,
      target,
      sample: `${sample.subOrderId} · ${sample.sku || 'no SKU'} · ${(sample.title || '').slice(0, 40)}`,
    };
  }

  async function run(report) {
    const status = await send('status');
    if (!status.signedIn) throw new Error('Sign in from the ProfX extension popup first.');

    const { items, ranOut, target } = await collectAll(report);
    if (!items.length) {
      throw new Error(`Found no orders with a product photo. (What is here — ${describePage()})`);
    }

    const totals = { rows: 0, imagesSaved: 0, imagesSkipped: 0, unresolved: 0, target };
    for (let i = 0; i < items.length; i += CHUNK) {
      const batch = items.slice(i, i + CHUNK);
      report(`Saving ${Math.min(i + batch.length, items.length)} of ${items.length}…`);
      const res = await send('ingest', { items: batch });
      totals.rows += res.rows || 0;
      totals.imagesSaved += res.imagesSaved || 0;
      totals.imagesSkipped += res.imagesSkipped || 0;
      totals.unresolved += res.unresolved || 0;
    }
    return { ...totals, scanned: items.length, ranOut };
  }

  // ---------- the on-page panel ----------

  const panel = document.createElement('div');
  panel.className = 'profx-panel';
  panel.innerHTML = `
    <div class="profx-title">ProfX</div>
    <div class="profx-status">Ready</div>
    <button class="profx-check" type="button">Preview — read, send nothing</button>
    <button class="profx-go" type="button">Save product images</button>
  `;
  const statusEl = panel.querySelector('.profx-status');
  const button = panel.querySelector('.profx-go');
  const checkButton = panel.querySelector('.profx-check');
  const report = (text) => { statusEl.textContent = text; };

  const tooSlow = (r) => (r.ranOut ? ' Stopped at the 10 minute limit — run it again to carry on.' : '');

  // The tab says how many there should be, so say plainly when fewer were read
  // rather than leaving a quiet shortfall to be noticed later.
  const shortfall = (r) =>
    (r.target && r.scanned < r.target
      ? ` ${r.target - r.scanned} of the ${r.target} on this tab were not reached — scroll to the bottom yourself and run it again.`
      : '');

  /** Both buttons behave the same way; only the work in between differs. */
  function wire(el, work, describe) {
    el.addEventListener('click', async () => {
      button.disabled = true;
      checkButton.disabled = true;
      panel.classList.remove('profx-error', 'profx-done');
      try {
        const r = await work(report);
        panel.classList.add('profx-done');
        statusEl.textContent = describe(r);
      } catch (err) {
        panel.classList.add('profx-error');
        statusEl.textContent = err.message;
      } finally {
        button.disabled = false;
        checkButton.disabled = false;
      }
    });
  }

  wire(checkButton, preview, (r) =>
    `Read ${r.scanned}${r.target ? ` of ${r.target}` : ''} orders, ${r.withSku} with a SKU. ` +
    `Nothing sent. First: ${r.sample}. Full list in the browser console.` +
    shortfall(r) + tooSlow(r));

  wire(button, run, (r) =>
    `Done — ${r.scanned}${r.target ? ` of ${r.target}` : ''} orders, ${r.imagesSaved} new photos` +
    (r.imagesSkipped ? `, ${r.imagesSkipped} already saved` : '') +
    (r.unresolved ? `, ${r.unresolved} with no SKU` : '') +
    shortfall(r) + tooSlow(r));

  const mount = () => document.body && document.body.appendChild(panel);
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
})();
