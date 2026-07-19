import React, { useState, useRef, useCallback } from 'react';
import api from '../utils/api';

const PLATFORM_LABEL = { meesho: 'Meesho', flipkart: 'Flipkart' };

// ── Title normalization (mirrors backend utils/titleNormalizer.js) ──
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text, phrase) =>
  new RegExp('\\b' + escapeRe(phrase) + '\\b', 'i').test(text);

// ── Shared subject vocabulary ────────────────────────────────────────
const SUBJECT_ALIASES = {
  'social-studies': 'Social Science',
  'social studies': 'Social Science',
  'social science': 'Social Science',
  'general knowledge': 'GK',
  'computer science': 'Computer',
  'political science': 'Political Science',
  'home science': 'Home Science',
  'mathematics': 'Mathematics',
  'mathamtics': 'Mathematics',
  'mathmatics': 'Mathematics',
  'maths': 'Mathematics',
  'math': 'Mathematics',
  'ganit': 'Mathematics',
  'science': 'Science',
  'english': 'English',
  'hindi': 'Hindi',
  'sanskrit': 'Sanskrit',
  'reasoning': 'Reasoning',
  'biology': 'Biology',
  'physics': 'Physics',
  'chemistry': 'Chemistry',
  'sociology': 'Sociology',
  'history': 'History',
  'geography': 'Geography',
  'gk': 'GK',
  'computer': 'Computer',
  'cyber': 'Computer',
  'evs': 'EVS',
};

// Qualifiers that distinguish different books of the same subject.
// Order matters: longest / most specific first.
const QUALIFIERS = [
  { match: 'basic', out: 'Basic' },
  { match: 'standard', out: 'Standard' },
  { match: 'std', out: 'Standard' },
  { match: 'core', out: 'Core' },
  { match: 'literature', out: 'Literature' },
  { match: 'lit', out: 'Literature' },
  { match: 'communicative', out: 'Communicative' },
  { match: 'curiosity', out: 'Curiosity' },
  { match: 'aadhar', out: 'Aadhar' },
  { match: 'part-1', out: 'Part-1' },
  { match: 'part 1', out: 'Part-1' },
  { match: 'part-2', out: 'Part-2' },
  { match: 'part 2', out: 'Part-2' },
];

// "Hindi A" / "Hindi B" style single-letter course codes.
function courseLetter(text) {
  const m = text.match(/\b(?:hindi|english)\s+([ab])\b/i);
  return m ? m[1].toUpperCase() : '';
}

function findSubject(text) {
  const keys = Object.keys(SUBJECT_ALIASES).sort((a, b) => b.length - a.length);
  for (const k of keys) if (hasWord(text, k)) return SUBJECT_ALIASES[k];
  return '';
}

function findQualifier(text, allowed) {
  for (const q of QUALIFIERS) {
    if (allowed && !allowed.includes(q.out)) continue;
    if (hasWord(text, q.match)) return q.out;
  }
  return '';
}

// ── Publisher rule sets ──────────────────────────────────────────────
// prefixes: publisher-name prefixes this rule set applies to
// series:   canonical series name + the variants that map to it
const PUBLISHER_RULES = [
  {
    name: 'MTG',
    prefixes: ['mtg', 'mth'],
    olympiad: true, // prepend "Olympiad", treat any series as an Olympiad book
    keepCbse: false,
    keepQualifier: false,
    series: [
      { canonical: 'PrepGuide', variants: ['prep-guide', 'prep guide', 'prepguide', 'preparation guide'] },
      { canonical: 'Workbook',  variants: ['work book', 'work-book', 'workbook'] },
      { canonical: 'PYQs',      variants: ['pyqs', 'pyq', 'previous year', 'previou year', 'prev year'] },
    ],
  },
  {
    name: 'Educart',
    prefixes: ['educart'],
    olympiad: false,
    keepCbse: true,
    keepQualifier: true,
    series: [
      { canonical: 'Question Bank', variants: ['question bank', 'questionbank', 'qb'] },
      { canonical: 'One Shot',      variants: ['one-shot', 'one shot', 'oneshot'] },
    ],
  },
  {
    name: 'Golden',
    prefixes: ['golden', 'goldeb'],
    olympiad: false,
    keepCbse: false,
    keepQualifier: true,
    series: [
      // Guides are Textbooks for Golden — both map to "Textbook".
      { canonical: 'Textbook', variants: ['textbook', 'text book', 'guide'] },
      { canonical: 'Workbook', variants: ['workbook', 'work book', 'work-book'] },
    ],
  },
  {
    name: 'Arihant',
    prefixes: ['arihant', 'arhant'],
    olympiad: false,
    keepCbse: false,
    keepQualifier: true,
    keepLeftover: true, // preserve descriptors like "Sharda", "Lit and Lang"
    // Only these count as qualifiers for Arihant; other words stay as leftover
    // text so titles like "English Lit and Lang" aren't rewritten.
    qualifiers: ['Core', 'Communicative'],
    series: [
      // Longest variants first so "ncert solutions" beats "ncert solution".
      { canonical: 'NCERT Solutions', variants: ['ncert solutions', 'ncert solution', 'ncert sol'] },
      { canonical: 'NCERT Exemplar', variants: ['ncert exemplar'] },
      { canonical: 'Lab Manual',     variants: ['lab manual'] },
      { canonical: 'All in One',     variants: ['all in one', 'all-in-one', 'allinone'] },
    ],
  },
];

// Words removed when collecting leftover descriptors — filler that adds nothing.
const LEFTOVER_STOPWORDS = [
  'the', 'of', 'for', 'with', 'in', 'ncert', 'cbse', 'class',
  'book', 'books', 'edition', 'medium',
];

// Competitive-exam markers — never rewrite these (e.g. "NEET PYQ 39 years biology").
const NON_OLYMPIAD_EXAMS = ['neet', 'jee', 'aiims', 'ntse', 'kvpy', 'cuet', 'net', 'gate'];

// Olympiad exam codes -> subject (MTG only).
const EXAM_CODES = {
  imo: 'Mathematics', ieo: 'English', iso: 'Science', nso: 'Science',
  igko: 'GK', icso: 'Computer', isso: 'Social Science', nco: 'Computer',
};

// Collect descriptor words left over after stripping series / subject / qualifier.
// e.g. "All in One Sanskrit (Sharda)" -> "Sharda"
function leftoverWords(cleaned, matchedVariant, subject, qualifier, courseLtr) {
  // Preserve part ranges like "Part 1 & 2" / "(Part 1 and 2)" as a single token.
  let partRange = '';
  const pr = cleaned.match(/part\s*\d+\s*(?:&|and|-|to)\s*\d+/i);
  if (pr) partRange = pr[0].replace(/\s+/g, ' ').replace(/\band\b/i, '&').trim();

  let rest = cleaned;
  if (partRange) rest = rest.replace(new RegExp(escapeRe(pr[0]), 'i'), ' ');
  const strip = (text, phrase) => {
    if (!phrase) return text;
    return text.replace(new RegExp(escapeRe(phrase), 'ig'), ' ');
  };
  rest = strip(rest, matchedVariant);
  if (subject) {
    // Strip every alias that maps to this subject (e.g. "maths" for Mathematics).
    for (const [alias, canon] of Object.entries(SUBJECT_ALIASES)) {
      if (canon === subject) rest = strip(rest, alias);
    }
    rest = strip(rest, subject);
  }
  if (qualifier) {
    for (const q of QUALIFIERS) if (q.out === qualifier) rest = strip(rest, q.match);
    rest = strip(rest, qualifier);
  }
  // Remove bracket punctuation and stray symbols, keep words.
  rest = rest.replace(/[()\[\]{}|,&:;.\-–—?]/g, ' ');
  const words = rest.split(/\s+/).filter(Boolean).filter((w) => {
    const lw = w.toLowerCase();
    if (LEFTOVER_STOPWORDS.includes(lw)) return false;
    if (courseLtr && lw === courseLtr.toLowerCase()) return false;
    if (/^\d+$/.test(lw)) return false;           // bare numbers
    if (/^\d+(st|nd|rd|th)$/.test(lw)) return false; // 1st, 2nd...
    return true;
  });
  // De-duplicate while preserving order.
  const seen = new Set();
  const kept = words.filter((w) => {
    const lw = w.toLowerCase();
    if (seen.has(lw)) return false;
    seen.add(lw);
    return true;
  });
  if (partRange) kept.push('(' + partRange + ')');
  return kept.join(' ');
}

function rulesFor(publisher) {
  const pub = String(publisher || '').trim().toLowerCase();
  if (!pub) return null;
  return PUBLISHER_RULES.find((r) => r.prefixes.some((p) => pub.startsWith(p))) || null;
}

// Returns { normalized, seriesType }.
// normalized === original when nothing matched.
function normalizeTitle(rawTitle, publisher) {
  const original = String(rawTitle || '').trim();
  if (!original) return { normalized: '', seriesType: '' };

  const rules = rulesFor(publisher);
  if (!rules) return { normalized: original, seriesType: '' };

  const cleaned = original.replace(/^[|\s-]+/, '').trim();
  const lower = cleaned.toLowerCase();

  // Competitive-exam book -> never rewrite.
  if (NON_OLYMPIAD_EXAMS.some((e) => hasWord(cleaned, e))) {
    return { normalized: original, seriesType: '' };
  }

  // 1. Series type (longest matching variant wins).
  let seriesType = '';
  let matchedVariant = '';
  for (const st of rules.series) {
    for (const v of st.variants) {
      if (lower.includes(v) && v.length > matchedVariant.length) {
        seriesType = st.canonical;
        matchedVariant = v;
      }
    }
  }
  if (!seriesType) return { normalized: original, seriesType: '' };

  // 2. Subject — for MTG, fall back to the Olympiad exam code.
  let subject = findSubject(cleaned);
  if (!subject && rules.olympiad) {
    for (const [code, subj] of Object.entries(EXAM_CODES)) {
      if (hasWord(cleaned, code)) { subject = subj; break; }
    }
  }

  // 3. Build canonical title.
  const parts = [];
  if (rules.keepCbse && hasWord(cleaned, 'cbse')) parts.push('CBSE');
  if (rules.olympiad) parts.push('Olympiad');
  parts.push(seriesType);
  if (subject) parts.push(subject);

  let letter = '';
  let qual = '';
  if (rules.keepQualifier) {
    letter = courseLetter(cleaned);
    if (letter) parts.push(letter);
    qual = findQualifier(cleaned, rules.qualifiers);
    if (qual) parts.push(qual);
  }

  if (rules.keepLeftover) {
    const extra = leftoverWords(cleaned, matchedVariant, subject, qual, letter);
    if (extra) parts.push(extra);
  }

  return { normalized: parts.join(' ').replace(/\s+/g, ' ').trim(), seriesType };
}

// ── Order checklist row ──
function OrderRow({ order, checked, onToggle }) {
  return (
    <div style={{ ...orderRow, opacity: checked ? 1 : 0.5 }}>
      <input type="checkbox" checked={checked} onChange={() => onToggle(order.rowId)} style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} />
      <span style={{ width: 92, fontSize: 12, color: '#64748b', flexShrink: 0 }}>{order.date || '—'}</span>
      <code style={{ width: 150, fontSize: 11, color: '#334155', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.orderId || '—'}</code>
      <code style={{ width: 110, fontSize: 11, background: '#f1f5f9', padding: '1px 6px', borderRadius: 4, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.sku}</code>
      <span style={{ flex: 1, fontSize: 12.5, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={order.rawTitle}>{order.rawTitle}</span>
      <span style={{ width: 40, textAlign: 'right', fontWeight: 600, flexShrink: 0 }}>{order.qty}</span>
    </div>
  );
}

function PlatformSection({ platform, orders, checkedIds, onToggle, onToggleAll, onToggleDate }) {
  if (!orders.length) return null;
  const allChecked = orders.every((o) => checkedIds.has(o.rowId));
  const checkedCount = orders.filter((o) => checkedIds.has(o.rowId)).length;

  // Distinct dates (in first-seen order) with per-date selection state.
  const dateMap = new Map();
  for (const o of orders) {
    const d = o.date || '(no date)';
    if (!dateMap.has(d)) dateMap.set(d, []);
    dateMap.get(d).push(o);
  }
  const dates = Array.from(dateMap.entries()).map(([date, list]) => {
    const checked = list.filter((o) => checkedIds.has(o.rowId)).length;
    return { date, total: list.length, checked, all: checked === list.length, some: checked > 0 && checked < list.length };
  });

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: platform === 'meesho' ? '#fdf2f8' : '#eff6ff', borderBottom: '1px solid #e2e8f0' }}>
        <strong style={{ color: platform === 'meesho' ? '#be185d' : '#1d4ed8' }}>{PLATFORM_LABEL[platform]}</strong>
        <span style={{ fontSize: 13, color: '#64748b' }}>{checkedCount}/{orders.length} selected</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => onToggleAll(platform, !allChecked)} style={btnGhostSm}>{allChecked ? 'Uncheck all' : 'Check all'}</button>
      </div>

      {/* Horizontal date chips — tick a date to select all its orders */}
      {dates.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 16px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
          <span style={{ fontSize: 12, color: '#94a3b8', alignSelf: 'center', marginRight: 2 }}>Dates:</span>
          {dates.map((d) => (
            <button
              key={d.date}
              onClick={() => onToggleDate(platform, d.date, !d.all)}
              title={`${d.checked}/${d.total} selected`}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20, fontSize: 12.5, cursor: 'pointer',
                border: `1px solid ${d.all ? '#16a34a' : d.some ? '#f59e0b' : '#cbd5e1'}`,
                background: d.all ? '#dcfce7' : d.some ? '#fef9c3' : '#fff',
                color: d.all ? '#15803d' : d.some ? '#b45309' : '#475569', fontWeight: 600,
              }}
            >
              <span style={{ fontSize: 13 }}>{d.all ? '☑' : d.some ? '◪' : '☐'}</span>
              {d.date} <span style={{ opacity: 0.7 }}>({d.total})</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ maxHeight: 340, overflowY: 'auto' }}>
        {orders.map((o) => (
          <OrderRow key={o.rowId} order={o} checked={checkedIds.has(o.rowId)} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}

// ── SKU mapping card ──
function BookRow({ book, onChange, onRemove, canRemove }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const debRef = useRef(null);

  const search = useCallback((q, publisher, className) => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      try {
        const res = await api.get('/supplier-orders/products/search', {
          params: { q, publisher: publisher || '', className: className || '' },
        });
        setSuggestions(res.data.products || []);
        setShowSug(true);
      } catch { /* ignore */ }
    }, 250);
  }, []);

  return (
    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 2fr 0.8fr 0.6fr auto', gap: 8, marginBottom: 6 }}>
      <input placeholder="Publisher" value={book.publisher}
        onChange={(e) => { const v = e.target.value; onChange({ ...book, publisher: v }); search(book.title, v, book.className); }}
        style={inp} />
      <div style={{ position: 'relative' }}>
        <input placeholder="Title" value={book.title}
          onChange={(e) => { onChange({ ...book, title: e.target.value, supplierProductId: null }); search(e.target.value, book.publisher, book.className); }}
          onFocus={() => search(book.title, book.publisher, book.className)}
          onBlur={() => {
            setTimeout(() => setShowSug(false), 180);
            const n = normalizeTitle(book.title, book.publisher);
            if (n.seriesType && n.normalized && n.normalized !== book.title.trim()) {
              onChange({ ...book, title: n.normalized, supplierProductId: null });
            }
          }} style={inp} />
        {(() => {
          const n = normalizeTitle(book.title, book.publisher);
          if (!n.seriesType || n.normalized === book.title.trim()) return null;
          return (
            <div style={{ fontSize: 11.5, marginTop: 3, color: '#0369a1', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Will save as: <strong>{n.normalized}</strong></span>
              <button type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange({ ...book, title: n.normalized, supplierProductId: null }); }}
                style={{ padding: '1px 7px', fontSize: 11, border: '1px solid #7dd3fc', background: '#f0f9ff', color: '#0369a1', borderRadius: 5, cursor: 'pointer' }}>
                use
              </button>
            </div>
          );
        })()}
        {showSug && suggestions.length > 0 && (
          <div style={sugBox}>
            {suggestions.map((s) => (
              <div key={s.id} style={sugItem} onMouseDown={() => {
                onChange({ ...book, supplierProductId: s.id, publisher: s.publisher || '', title: s.title, className: s.className || '' });
                setShowSug(false);
              }}>
                <strong>{s.title}</strong>
                <span style={{ color: '#888', marginLeft: 6, fontSize: 12 }}>{s.publisher}{s.className ? ` · ${s.className}` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <input placeholder="Class" value={book.className}
        onChange={(e) => { const v = e.target.value; onChange({ ...book, className: v }); if (book.title) search(book.title, book.publisher, v); }}
        style={inp} />
      <input type="number" min="1" title="Copies of THIS book per 1 order of the SKU (combo multiplier)"
        value={book.qtyPerUnit} onChange={(e) => onChange({ ...book, qtyPerUnit: e.target.value })} style={inp} />
      {canRemove ? <button onClick={onRemove} style={{ ...btnGhost, color: '#e11' }}>✕</button> : <span style={{ width: 28 }} />}
    </div>
  );
}

function SkuCard({ line, onSaved }) {
  const emptyBook = () => ({ supplierProductId: null, publisher: '', title: '', className: '', qtyPerUnit: 1 });
  const [books, setBooks] = useState(
    line.mapped && line.products.length
      ? line.products.map((p) => ({ supplierProductId: p.supplierProductId, publisher: p.publisher, title: p.title, className: p.className, qtyPerUnit: p.qtyPerUnit }))
      : [{ ...emptyBook(), title: line.refs.meesho?.rawTitle || line.refs.flipkart?.rawTitle || '' }]
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(line.mapped);
  const [err, setErr] = useState('');

  const setBook = (i, b) => setBooks((prev) => prev.map((x, idx) => (idx === i ? b : x)));
  const addBook = () => setBooks((prev) => [...prev, emptyBook()]);
  const removeBook = (i) => setBooks((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    setErr('');
    const clean = books.filter((b) => b.title.trim());
    if (!clean.length) { setErr('Add at least one title'); return; }
    setSaving(true);
    try {
      const res = await api.post('/supplier-orders/map', {
        sku: line.sku,
        books: clean.map((b) => ({ supplierProductId: b.supplierProductId || undefined, publisher: b.publisher, title: b.title, className: b.className, qtyPerUnit: b.qtyPerUnit })),
      });
      setSaved(true);
      onSaved(line.sku, res.data.products);
    } catch (e) {
      setErr(e.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ ...card, borderLeft: `4px solid ${saved ? '#16a34a' : '#f59e0b'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <code style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>{line.sku}</code>
          <span style={{ marginLeft: 10, color: '#555' }}>Order qty: <strong>{line.totalQty}</strong></span>
          {saved && <span style={{ marginLeft: 10, color: '#16a34a', fontSize: 13 }}>✓ mapped</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
        {['meesho', 'flipkart'].map((p) => line.refs[p] && (
          <div key={p} style={refBox}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{PLATFORM_LABEL[p]}</div>
            <div style={{ fontSize: 12, color: '#334155' }}>Order: <code>{line.refs[p].sampleOrderId || '—'}</code></div>
            <div style={{ fontSize: 12, color: '#475569', maxWidth: 340 }}>{line.refs[p].rawTitle}</div>
          </div>
        ))}
      </div>
      {books.map((b, i) => (
        <BookRow key={i} book={b} onChange={(nb) => setBook(i, nb)} onRemove={() => removeBook(i)} canRemove={books.length > 1} />
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <button onClick={addBook} style={btnGhost}>+ Add book (combo)</button>
        <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : saved ? 'Update mapping' : 'Save mapping'}</button>
        {err && <span style={{ color: '#e11', fontSize: 13 }}>{err}</span>}
      </div>
    </div>
  );
}

// ── Filename helper: "Seller Name - DD Month" ──
function datedFilename(supplierName) {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-US', { month: 'long' });
  const name = (supplierName || 'Supplier').trim();
  return `${name} - ${day} ${month}.xlsx`;
}

export default function SupplierOrders() {
  const [meeshoFiles, setMeeshoFiles] = useState([]);
  const [flipkartFiles, setFlipkartFiles] = useState([]);
  const [orders, setOrders] = useState([]);       // individual orders (checklist)
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [lines, setLines] = useState([]);          // resolved SKU lines (mapping stage)
  const [stage, setStage] = useState('upload');    // upload | checklist | map
  const [loading, setLoading] = useState(false);
  const [supplierName, setSupplierName] = useState('CHIRAG BOOK CENTER');
  const [error, setError] = useState('');
  const [normMsg, setNormMsg] = useState('');

  const normalizeExisting = async () => {
    setNormMsg(''); setError('');
    try {
      const prev = await api.get('/supplier-orders/normalize-titles');
      if (!prev.data.changed) { setNormMsg('All saved titles are already normalized.'); return; }
      const sample = prev.data.changes.slice(0, 5).map((c) => `• ${c.from}  →  ${c.to}`).join('\n');
      const ok = window.confirm(
        `${prev.data.changed} of ${prev.data.total} saved titles will be renamed.\n\n${sample}` +
        (prev.data.changed > 5 ? `\n…and ${prev.data.changed - 5} more` : '') +
        '\n\nApply these changes?'
      );
      if (!ok) return;
      const res = await api.post('/supplier-orders/normalize-titles');
      setNormMsg(`Renamed ${res.data.changed} titles. Re-run "Continue" to see updated names.`);
    } catch (e) {
      setError(e.response?.data?.error || 'Normalize failed');
    }
  };

  const parse = async () => {
    if (!meeshoFiles.length && !flipkartFiles.length) { setError('Upload at least one file'); return; }
    setError(''); setLoading(true);
    try {
      const fd = new FormData();
      meeshoFiles.forEach((f) => fd.append('meesho', f));
      flipkartFiles.forEach((f) => fd.append('flipkart', f));
      const res = await api.post('/supplier-orders/parse', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setOrders(res.data.orders);
      setCheckedIds(new Set(res.data.orders.map((o) => o.rowId))); // all checked by default
      setStage('checklist');
    } catch (e) {
      setError(e.response?.data?.error || 'Parse failed');
    } finally { setLoading(false); }
  };

  const toggle = (rowId) => setCheckedIds((prev) => {
    const next = new Set(prev);
    if (next.has(rowId)) next.delete(rowId); else next.add(rowId);
    return next;
  });

  const toggleAll = (platform, check) => setCheckedIds((prev) => {
    const next = new Set(prev);
    orders.filter((o) => o.platform === platform).forEach((o) => (check ? next.add(o.rowId) : next.delete(o.rowId)));
    return next;
  });

  const toggleDate = (platform, date, check) => setCheckedIds((prev) => {
    const next = new Set(prev);
    orders
      .filter((o) => o.platform === platform && (o.date || '(no date)') === date)
      .forEach((o) => (check ? next.add(o.rowId) : next.delete(o.rowId)));
    return next;
  });

  const proceedToMap = async () => {
    const selected = orders.filter((o) => checkedIds.has(o.rowId));
    if (!selected.length) { setError('Select at least one order'); return; }
    setError(''); setLoading(true);
    try {
      const res = await api.post('/supplier-orders/resolve', { orders: selected });
      const sorted = [...res.data.lines].sort((a, b) => (a.mapped === b.mapped ? 0 : a.mapped ? 1 : -1));
      setLines(sorted);
      setStage('map');
    } catch (e) {
      setError(e.response?.data?.error || 'Resolve failed');
    } finally { setLoading(false); }
  };

  const onSaved = (sku, products) => setLines((prev) => prev.map((l) => (l.sku === sku ? { ...l, mapped: true, products } : l)));

  const buildExport = () => {
    const acc = new Map();
    for (const l of lines) {
      if (!l.mapped || !l.products?.length) continue;
      for (const p of l.products) {
        const qty = l.totalQty * (p.qtyPerUnit || 1);
        const key = `${(p.publisher || '').toLowerCase()}|${p.title.toLowerCase()}|${(p.className || '').toLowerCase()}`;
        if (!acc.has(key)) acc.set(key, { publisher: p.publisher, title: p.title, className: p.className, qty: 0 });
        acc.get(key).qty += qty;
      }
    }
    return Array.from(acc.values());
  };

  const exportSheet = async () => {
    const out = buildExport();
    if (!out.length) { setError('No mapped orders to export yet'); return; }
    try {
      const res = await api.post('/supplier-orders/export', { supplierName, lines: out }, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = datedFilename(supplierName);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError('Export failed');
    }
  };

  const meeshoOrders = orders.filter((o) => o.platform === 'meesho');
  const flipkartOrders = orders.filter((o) => o.platform === 'flipkart');
  const totalChecked = checkedIds.size;
  const totalExcluded = orders.length - totalChecked;
  const unmappedCount = lines.filter((l) => !l.mapped).length;
  const mappedCount = lines.length - unmappedCount;

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '8px 4px' }}>
      <h1 style={{ marginBottom: 4 }}>Supplier Orders</h1>
      <p style={{ color: '#64748b', marginTop: 0 }}>
        Upload Meesho (PENDING) and Flipkart (Approved) order CSVs. Select which orders to include, map each SKU to its supplier book(s) once — it's remembered forever.
      </p>

      {/* Upload */}
      <div style={{ ...card, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <label style={fileLbl}>
          <span style={{ fontWeight: 600 }}>Meesho orders CSV</span>
          <input type="file" accept=".csv,.xlsx" multiple onChange={(e) => setMeeshoFiles(Array.from(e.target.files))} />
          {meeshoFiles.map((f) => (<span key={f.name} style={{ fontSize: 12, color: '#16a34a' }}>{f.name}</span>))}
        </label>
        <label style={fileLbl}>
          <span style={{ fontWeight: 600 }}>Flipkart orders CSV</span>
          <input type="file" accept=".csv,.xlsx" multiple onChange={(e) => setFlipkartFiles(Array.from(e.target.files))} />
          {flipkartFiles.map((f) => (<span key={f.name} style={{ fontSize: 12, color: '#16a34a' }}>{f.name}</span>))}
        </label>
        <button onClick={parse} disabled={loading} style={{ ...btnPrimary, alignSelf: 'center' }}>
          {loading && stage === 'upload' ? 'Parsing…' : 'Load Pending Orders'}
        </button>
      </div>

      {error && <div style={{ color: '#e11', margin: '10px 0' }}>{error}</div>}
      {normMsg && <div style={{ color: '#0369a1', margin: '10px 0', fontSize: 14 }}>{normMsg}</div>}

      {/* Stage: checklist */}
      {stage === 'checklist' && (
        <>
          <div style={{ ...card, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>Total orders: <strong>{orders.length}</strong></span>
            <span style={{ color: '#16a34a' }}>Selected: <strong>{totalChecked}</strong></span>
            <span style={{ color: '#ef4444' }}>Excluded: <strong>{totalExcluded}</strong></span>
            <div style={{ flex: 1 }} />
            <button onClick={proceedToMap} disabled={loading} style={btnPrimary}>
              {loading ? 'Loading…' : `Continue with ${totalChecked} orders →`}
            </button>
          </div>
          <PlatformSection platform="meesho" orders={meeshoOrders} checkedIds={checkedIds} onToggle={toggle} onToggleAll={toggleAll} onToggleDate={toggleDate} />
          <PlatformSection platform="flipkart" orders={flipkartOrders} checkedIds={checkedIds} onToggle={toggle} onToggleAll={toggleAll} onToggleDate={toggleDate} />
        </>
      )}

      {/* Stage: map */}
      {stage === 'map' && (
        <>
          <div style={{ ...card, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => setStage('checklist')} style={btnGhost}>← Back to selection</button>
            <button onClick={normalizeExisting} style={btnGhost} title="Rewrite saved Olympiad titles (MTG etc.) into canonical form">Normalize saved titles</button>
            <span>SKUs: <strong>{lines.length}</strong></span>
            <span style={{ color: '#f59e0b' }}>Unmapped: <strong>{unmappedCount}</strong></span>
            <span style={{ color: '#16a34a' }}>Mapped: <strong>{mappedCount}</strong></span>
            <div style={{ flex: 1 }} />
            <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} style={{ ...inp, width: 220 }} />
            <button onClick={exportSheet} style={btnPrimary}>Generate Sheet ↓</button>
          </div>
          {lines.map((l) => (<SkuCard key={l.sku} line={l} onSaved={onSaved} />))}
        </>
      )}
    </div>
  );
}

// ── styles ──
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 12 };
const inp = { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, width: '100%', boxSizing: 'border-box' };
const btnPrimary = { padding: '9px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' };
const btnGhost = { padding: '8px 12px', background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: 8, cursor: 'pointer' };
const btnGhostSm = { padding: '5px 10px', background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 12.5 };
const fileLbl = { display: 'flex', flexDirection: 'column', gap: 6 };
const refBox = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px' };
const sugBox = { position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.1)', zIndex: 20, maxHeight: 240, overflowY: 'auto' };
const sugItem = { padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 14 };
const orderRow = { display: 'flex', alignItems: 'center', gap: 12, padding: '7px 16px', borderBottom: '1px solid #f1f5f9' };
