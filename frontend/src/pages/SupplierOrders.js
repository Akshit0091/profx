import React, { useState, useRef, useCallback } from 'react';
import api from '../utils/api';

const PLATFORM_LABEL = { meesho: 'Meesho', flipkart: 'Flipkart' };

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

function PlatformSection({ platform, orders, checkedIds, onToggle, onToggleAll }) {
  if (!orders.length) return null;
  const allChecked = orders.every((o) => checkedIds.has(o.rowId));
  const checkedCount = orders.filter((o) => checkedIds.has(o.rowId)).length;
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: platform === 'meesho' ? '#fdf2f8' : '#eff6ff', borderBottom: '1px solid #e2e8f0' }}>
        <strong style={{ color: platform === 'meesho' ? '#be185d' : '#1d4ed8' }}>{PLATFORM_LABEL[platform]}</strong>
        <span style={{ fontSize: 13, color: '#64748b' }}>{checkedCount}/{orders.length} selected</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => onToggleAll(platform, !allChecked)} style={btnGhostSm}>{allChecked ? 'Uncheck all' : 'Check all'}</button>
      </div>
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
        onChange={(e) => { const v = e.target.value; onChange({ ...book, publisher: v }); if (book.title) search(book.title, v, book.className); }}
        style={inp} />
      <div style={{ position: 'relative' }}>
        <input placeholder="Title" value={book.title}
          onChange={(e) => { onChange({ ...book, title: e.target.value, supplierProductId: null }); search(e.target.value, book.publisher, book.className); }}
          onFocus={() => book.title && search(book.title, book.publisher, book.className)}
          onBlur={() => setTimeout(() => setShowSug(false), 180)} style={inp} />
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
  const [meeshoFile, setMeeshoFile] = useState(null);
  const [flipkartFile, setFlipkartFile] = useState(null);
  const [orders, setOrders] = useState([]);       // individual orders (checklist)
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [lines, setLines] = useState([]);          // resolved SKU lines (mapping stage)
  const [stage, setStage] = useState('upload');    // upload | checklist | map
  const [loading, setLoading] = useState(false);
  const [supplierName, setSupplierName] = useState('CHIRAG BOOK CENTER');
  const [error, setError] = useState('');

  const parse = async () => {
    if (!meeshoFile && !flipkartFile) { setError('Upload at least one file'); return; }
    setError(''); setLoading(true);
    try {
      const fd = new FormData();
      if (meeshoFile) fd.append('meesho', meeshoFile);
      if (flipkartFile) fd.append('flipkart', flipkartFile);
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
          <input type="file" accept=".csv,.xlsx" onChange={(e) => setMeeshoFile(e.target.files[0])} />
          {meeshoFile && <span style={{ fontSize: 12, color: '#16a34a' }}>{meeshoFile.name}</span>}
        </label>
        <label style={fileLbl}>
          <span style={{ fontWeight: 600 }}>Flipkart orders CSV</span>
          <input type="file" accept=".csv,.xlsx" onChange={(e) => setFlipkartFile(e.target.files[0])} />
          {flipkartFile && <span style={{ fontSize: 12, color: '#16a34a' }}>{flipkartFile.name}</span>}
        </label>
        <button onClick={parse} disabled={loading} style={{ ...btnPrimary, alignSelf: 'center' }}>
          {loading && stage === 'upload' ? 'Parsing…' : 'Load Pending Orders'}
        </button>
      </div>

      {error && <div style={{ color: '#e11', margin: '10px 0' }}>{error}</div>}

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
          <PlatformSection platform="meesho" orders={meeshoOrders} checkedIds={checkedIds} onToggle={toggle} onToggleAll={toggleAll} />
          <PlatformSection platform="flipkart" orders={flipkartOrders} checkedIds={checkedIds} onToggle={toggle} onToggleAll={toggleAll} />
        </>
      )}

      {/* Stage: map */}
      {stage === 'map' && (
        <>
          <div style={{ ...card, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => setStage('checklist')} style={btnGhost}>← Back to selection</button>
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
