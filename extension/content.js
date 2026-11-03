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
  // The same pattern, for counting every one on the page rather than
  // pulling one out of a row.
  const SUB_ORDER_ALL = /\b\d{15,20}_\d+\b/g;
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
  // Shown in the panel. Without it there is no way to tell, from a screenshot
  // of a run, whether the extension was reloaded after a change.
  const VERSION = '2026-11-03c';
  const STEP = 0.5;           // of a screen per scroll step, so every row is on screen a while
  const PASSES = 3;           // trips down the list; a later one picks up what an earlier missed
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

  /**
   * The orders table, remembered between calls. The page re-renders constantly
   * and this is looked up on every change, so searching every table each time
   * would be wasteful.
   */
  let tableCache = null;
  function currentTable() {
    if (tableCache && tableCache.isConnected) return tableCache;
    tableCache = findTable();
    return tableCache;
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
      const src = fromSet || img.currentSrc || img.src ||
        img.getAttribute('data-src') || img.getAttribute('data-original');
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

    // A row whose photo has not arrived yet is still worth keeping. Dropping it
    // loses the row for good, because the list will have moved on by the time
    // the photo appears; held instead, the next sighting fills it in.
    const imageUrl = rowImage(row);

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

  /**
   * Folds a row into what has been collected so far.
   *
   * The same row goes past several times, and an early sighting can be missing
   * the photo, so a later one fills the gaps instead of being thrown away.
   */
  function merge(into, item) {
    const prev = into.get(item.subOrderId);
    if (!prev) { into.set(item.subOrderId, item); return 1; }
    if (!prev.imageUrl && item.imageUrl) prev.imageUrl = item.imageUrl;
    if (!prev.sku && item.sku) prev.sku = item.sku;
    if (!prev.title && item.title) prev.title = item.title;
    return 0;
  }

  /**
   * Rows that went past and could not be read. A row with no sub-order ID in
   * it is skipped, and silently: this is the count that separates "the row
   * was never on the page" from "the row was there and we turned it away",
   * which look identical in the total at the end.
   */
  const turnedAway = new Set();

  function harvest(table, into) {
    if (!table) return 0;
    const idx = headerIndex(table);
    const body = table.querySelector('tbody') || table;
    let added = 0;
    for (const row of body.querySelectorAll('tr')) {
      const item = readRow(row, idx);
      if (item) { added += merge(into, item); continue; }
      // Keyed by its text so the same unreadable row is not counted on every
      // pass; a header row has no cells of its own, so it does not count.
      const text = norm(row.textContent);
      if (text && row.querySelector('td')) turnedAway.add(text.slice(0, 120));
    }
    return added;
  }

  /**
   * Reads every row the moment it appears, for as long as the walk lasts.
   *
   * Scroll-then-look is a race. The list keeps only the rows near the scroll
   * position, so one that is rendered and removed again between two looks is
   * never seen at all — which is how a list that was being scrolled through
   * perfectly well still came back three rows in four. Reading on change
   * instead means the timing of the scroll no longer has to be right.
   */
  function watch(found) {
    if (typeof MutationObserver !== 'function') return () => {};
    let queued = false;
    const read = () => { queued = false; harvest(currentTable(), found); };
    const observer = new MutationObserver(() => {
      if (queued) return;        // one read per tick, however many changes land
      queued = true;
      setTimeout(read, 0);
    });
    const root = document.body || document.documentElement;
    if (root) observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
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

  /**
   * What the page holds right now, as opposed to what was read from it.
   *
   * Two things a total alone cannot tell apart: a grid split across several
   * tables, of which only the first is ever read, and a grid whose rows
   * simply never render. Counting both settles it.
   */
  function census() {
    const tables = [...document.querySelectorAll('table')]
      .filter((t) => /sub[-\s]?order/i.test(t.textContent || ''));
    const rows = tables.reduce(
      (n, t) => n + (t.querySelector('tbody') || t).querySelectorAll('tr').length, 0);
    return { tables: tables.length, rows };
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
    const stopWatching = watch(found);

    /** How many rows are in the page at this moment. */
    const rowCount = () => {
      const t = currentTable();
      const body = t && (t.querySelector('tbody') || t);
      return body ? body.querySelectorAll('tr').length : 0;
    };

    /**
     * How tall the rows currently in the page are, or 0 where that cannot be
     * measured.
     */
    const renderedHeight = () => {
      const t = currentTable();
      const body = t && (t.querySelector('tbody') || t);
      const list = body ? body.querySelectorAll('tr') : [];
      if (!list.length || typeof list[0].getBoundingClientRect !== 'function') return 0;
      const first = list[0].getBoundingClientRect();
      const last = list[list.length - 1].getBoundingClientRect();
      return Math.max(0, last.bottom - first.top);
    };

    /**
     * Advances the innermost box that still has somewhere to go, falling
     * through to the page once the grid is at its end. Returns false only when
     * nothing on the page can scroll any further.
     *
     * The step is measured against the rows that are in the page rather than
     * against the box, because the box can be a good deal taller than the band
     * of rows rendered inside it — it scrolls the filters and tabs too. A step
     * measured against the box then clears a stretch that no row was ever
     * rendered into, and watching for changes cannot recover a row that was
     * never there. That is what left three rows in four.
     */
    // What the walk did, reported when it comes up short. A shortfall has
    // several possible causes that look identical from the outside, and these
    // are the numbers that tell them apart.
    const seen = { steps: 0, boxH: 0, bandH: 0, mostRows: 0, passes: 0 };
    // Every sub-order ID that has appeared in the table, read straight out of
    // its text. A row that rendered is in here whether or not it could be
    // parsed, so comparing this with what was collected says which half of
    // the job is failing.
    const idsOnPage = new Set();

    const stepScroll = () => {
      const rendered = renderedHeight();
      if (rendered > seen.bandH) seen.bandH = Math.round(rendered);
      for (const b of boxes) {
        const before = b.scrollTop;
        const byBox = Math.floor((b.clientHeight || 600) * STEP);
        const step = Math.max(
          100,
          rendered > 0 ? Math.min(byBox, Math.floor(rendered * STEP)) : byBox
        );
        if (!seen.boxH) seen.boxH = Math.round(b.clientHeight || 0);
        b.scrollTop = Math.min(b.scrollTop + step, b.scrollHeight);
        if (b.scrollTop > before + 2) { seen.steps += 1; return true; }
      }
      return false;
    };

    /**
     * Back to the top before each walk. The seller may well have scrolled the
     * list themselves before pressing the button, and the walk only ever goes
     * downwards, so everything above where they left it would be missed.
     */
    const toTop = async () => {
      for (const b of boxes) b.scrollTop = 0;
      await sleep(SETTLE_MS);
    };

    /**
     * Every sub-order ID visible in a cell, read cell by cell.
     *
     * Not from the whole table at once: textContent runs adjacent cells
     * together, so the order number in the product cell ends up glued to the
     * sub-order beside it and the pattern can find no boundary between them.
     */
    const noteIds = () => {
      const t = currentTable();
      if (!t) return;
      const body = t.querySelector('tbody') || t;
      for (const row of body.querySelectorAll('tr')) {
        for (const cell of row.children) {
          const hits = norm(cell.textContent).match(SUB_ORDER_ALL);
          if (hits) for (const id of hits) idsOnPage.add(id);
        }
      }
    };

    const progress = () =>
      report(`Reading the list… ${found.size}${target ? ` of ${target}` : ''} orders`);

    // Without a ceiling the scroll and page limits multiply out to hours. A
    // run over a few thousand orders finishes in minutes, so anything past
    // this is a loop that is not making progress.
    const deadline = Date.now() + BUDGET_MS;
    let ranOut = false;

    try {
      for (let page = 0; page < MAX_PAGES; page += 1) {
        // Walk the whole list more than once. A row missed on the way down is
        // only going to be seen on another trip past it, and a second walk of
        // a list that is already loaded costs seconds.
        for (let pass = 0; pass < PASSES; pass += 1) {
          seen.passes = pass + 1;
          const atStart = found.size;
          await toTop();
          let stable = 0;

          for (let i = 0; i < MAX_SCROLLS; i += 1) {
            if (Date.now() > deadline) { ranOut = true; break; }

            const added = harvest(currentTable() || table, found);
            const onScreen = rowCount();
            if (onScreen > seen.mostRows) seen.mostRows = onScreen;
            noteIds();
            progress();

            // Everything the tab promised is in hand, so there is nothing to be
            // gained by scrolling on and waiting out the quiet rounds.
            if (target && found.size >= target) break;

            // Step well under a screen at a time rather than jumping to the
            // bottom. The list only keeps the rows near the scroll position in
            // the page, so a jump skips everything in between.
            const moved = stepScroll();

            // Nothing left to scroll usually means more is being fetched, so
            // wait longer there than between ordinary steps.
            await sleep(moved ? SETTLE_MS : BOTTOM_WAIT_MS);

            if (added === 0 && !moved) stable += 1;
            else stable = 0;

            // While the tab says there are more than we have, give the page far
            // longer to produce them before concluding the list has ended.
            const shortOfTarget = target && found.size < target;
            if (stable >= (shortOfTarget ? STABLE_ROUNDS_PATIENT : STABLE_ROUNDS)) break;
          }

          harvest(currentTable() || table, found);
          progress();

          // Another trip down would only repeat this one: either the list is
          // complete, or a whole walk turned up nothing new.
          if (ranOut || found.size === atStart || (target && found.size >= target)) break;
        }
        if (ranOut) break;

        const before = found.size;
        if (!(await nextPage(table, box))) break;
        box.scrollTop = 0;
        harvest(currentTable() || table, found);

        // The control we clicked was not pagination after all, or the list has
        // genuinely ended. Either way, going round again would just repeat.
        if (found.size === before) break;
      }
    } finally {
      stopWatching();
    }

    harvest(currentTable() || table, found);
    const items = [...found.values()];
    noteIds();
    const now = census();
    const diag =
      `v${VERSION} · ${seen.passes} pass(es), ${seen.steps} steps, ` +
      `box ${seen.boxH}px, rows band ${seen.bandH}px, most rows at once ${seen.mostRows}, ` +
      `ids seen ${idsOnPage.size}, unreadable rows ${turnedAway.size}, ` +
      `now ${now.tables} table(s)/${now.rows} rows`;

    return {
      items,
      photoless: items.filter((i) => !i.imageUrl).length,
      ranOut,
      target,
      diag,
    };
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
    const { items, photoless, ranOut, target, diag } = await collectAll(report);
    if (!items.length) {
      throw new Error(`Found no orders with a product photo. (What is here — ${describePage()})`);
    }
    const withSku = items.filter((i) => i.sku).length;
    const sample = items[0];
    console.log('[ProfX] preview — all rows read from this page:', items);
    return {
      scanned: items.length,
      photoless,
      diag,
      withSku,
      ranOut,
      target,
      sample: `${sample.subOrderId} · ${sample.sku || 'no SKU'} · ${(sample.title || '').slice(0, 40)}`,
    };
  }

  async function run(report) {
    const status = await send('status');
    if (!status.signedIn) throw new Error('Sign in from the ProfX extension popup first.');

    const { items, photoless, ranOut, target, diag } = await collectAll(report);
    if (!items.length) {
      throw new Error(`Found no orders with a product photo. (What is here — ${describePage()})`);
    }

    // Only a row whose photo was on the page can be sent. Any that were read
    // before their photo arrived are counted and reported, not quietly dropped.
    const sendable = items.filter((i) => i.imageUrl);
    const totals = { rows: 0, imagesSaved: 0, imagesSkipped: 0, unresolved: 0, target };
    for (let i = 0; i < sendable.length; i += CHUNK) {
      const batch = sendable.slice(i, i + CHUNK);
      report(`Saving ${Math.min(i + batch.length, sendable.length)} of ${sendable.length}…`);
      const res = await send('ingest', { items: batch });
      totals.rows += res.rows || 0;
      totals.imagesSaved += res.imagesSaved || 0;
      totals.imagesSkipped += res.imagesSkipped || 0;
      totals.unresolved += res.unresolved || 0;
    }
    return { ...totals, scanned: items.length, photoless, ranOut, diag };
  }

  // ---------- the on-page panel ----------

  const POS_KEY = 'profx.panel.pos';
  const FOLD_KEY = 'profx.panel.folded';

  const panel = document.createElement('div');
  panel.className = 'profx-panel';
  panel.innerHTML = `
    <div class="profx-bar">
      <div class="profx-title">ProfX <span class="profx-ver"></span></div>
      <button class="profx-fold" type="button" title="Collapse" aria-label="Collapse">–</button>
    </div>
    <div class="profx-body">
      <div class="profx-status">Ready</div>
      <button class="profx-check" type="button">Preview — read, send nothing</button>
      <button class="profx-go" type="button">Save product images</button>
    </div>
  `;
  panel.querySelector('.profx-ver').textContent = VERSION;
  // Also in the status line, which is the part that ends up in a screenshot.
  panel.querySelector('.profx-status').textContent = `Ready · v${VERSION}`;
  const statusEl = panel.querySelector('.profx-status');
  const bar = panel.querySelector('.profx-bar');
  const foldBtn = panel.querySelector('.profx-fold');

  // ---------- where the panel sits ----------

  /**
   * Meesho puts its own controls along the bottom of the orders page, and a
   * panel parked on top of them is worse than no panel. There is no corner
   * that is reliably free, though, so rather than guessing at one this can be
   * dragged anywhere and folded away, and it remembers both.
   */
  const remembered = (key) => {
    try { return localStorage.getItem(key); } catch { return null; }
  };
  const remember = (key, value) => {
    try { localStorage.setItem(key, value); } catch { /* private windows refuse */ }
  };

  /** Puts the panel at x,y, kept wholly on screen whatever the window did. */
  function place(x, y) {
    const w = panel.offsetWidth || 260;
    const h = panel.offsetHeight || 140;
    const left = Math.max(8, Math.min(x, window.innerWidth - w - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - h - 8));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    return { x: left, y: top };
  }

  let drag = null;

  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.profx-fold')) return;   // that button is not a handle
    const r = panel.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    panel.classList.add('is-dragging');
    try { bar.setPointerCapture(e.pointerId); } catch { /* older engines */ }
    e.preventDefault();
  });

  bar.addEventListener('pointermove', (e) => {
    if (drag) place(e.clientX - drag.dx, e.clientY - drag.dy);
  });

  const endDrag = () => {
    if (!drag) return;
    drag = null;
    panel.classList.remove('is-dragging');
    const r = panel.getBoundingClientRect();
    remember(POS_KEY, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) }));
  };
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);

  foldBtn.addEventListener('click', () => {
    const folded = panel.classList.toggle('is-folded');
    foldBtn.textContent = folded ? '+' : '–';
    foldBtn.title = folded ? 'Expand' : 'Collapse';
    foldBtn.setAttribute('aria-label', foldBtn.title);
    remember(FOLD_KEY, folded ? '1' : '0');
    // Folding changes the height, which can leave it hanging off the bottom.
    const r = panel.getBoundingClientRect();
    if (panel.style.left) place(r.left, r.top);
  });

  // A window that shrinks must not take the panel off screen with it.
  window.addEventListener('resize', () => {
    if (!panel.style.left) return;
    const r = panel.getBoundingClientRect();
    place(r.left, r.top);
  });
  const button = panel.querySelector('.profx-go');
  const checkButton = panel.querySelector('.profx-check');
  const report = (text) => { statusEl.textContent = text; };

  const tooSlow = (r) => (r.ranOut ? ' Stopped at the 10 minute limit — run it again to carry on.' : '');

  // The tab says how many there should be, so say plainly when fewer were read
  // rather than leaving a quiet shortfall to be noticed later.
  const shortfall = (r) =>
    (r.target && r.scanned < r.target
      ? ` ${r.target - r.scanned} of the ${r.target} on this tab are not in the list.` +
        ' Check the filters above the list: with one set, the tab still counts every order' +
        ' while the list shows only some.' +
        (r.diag ? ` [${r.diag}]` : '')
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
    (r.photoless ? `, ${r.photoless} whose photo had not loaded` : '') + '.' +
    shortfall(r) + tooSlow(r));

  const mount = () => {
    if (!document.body) return;
    document.body.appendChild(panel);

    if (remembered(FOLD_KEY) === '1') {
      panel.classList.add('is-folded');
      foldBtn.textContent = '+';
      foldBtn.title = 'Expand';
      foldBtn.setAttribute('aria-label', foldBtn.title);
    }

    let saved = null;
    try { saved = JSON.parse(remembered(POS_KEY) || 'null'); } catch { saved = null; }
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) place(saved.x, saved.y);
  };
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
})();
