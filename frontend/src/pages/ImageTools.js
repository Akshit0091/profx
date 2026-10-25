import React, { useState } from 'react';
import api from '../utils/api';
import { useAuth } from '../utils/AuthContext';
import { ownsAllPlatforms } from '../utils/platforms';

const MAX_FILES = 30;

function stamp() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}-${d.toLocaleString('en-US', { month: 'short' })}`;
}

// Shared batch handling: both sections post a multipart batch and get a ZIP.
function useBatch() {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const pick = (e) => {
    const chosen = Array.from(e.target.files || []);
    setError(''); setDone('');
    if (chosen.length > MAX_FILES) {
      setError(`Please select at most ${MAX_FILES} images at a time.`);
      setFiles(chosen.slice(0, MAX_FILES));
      return;
    }
    setFiles(chosen);
  };

  const removeAt = (i) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const send = async (endpoint, fields, zipName, verb) => {
    if (!files.length) { setError('Choose at least one image'); return; }
    setError(''); setDone(''); setBusy(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('images', f));
      Object.entries(fields).forEach(([k, v]) => fd.append(k, v));

      const res = await api.post(endpoint, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${zipName}-${stamp()}.zip`;
      a.click();
      window.URL.revokeObjectURL(url);

      const ok = Number(res.headers['x-processed-count'] || files.length);
      const bad = Number(res.headers['x-failed-count'] || 0);
      const badNames = decodeURIComponent(res.headers['x-failed-files'] || '')
        .split('|').filter(Boolean);
      let msg = `${ok} image${ok === 1 ? '' : 's'} ${verb} and downloaded.`;
      if (bad) msg += ` ${bad} failed: ${badNames.join(', ')}`;
      setDone(msg);
    } catch (e) {
      setError('That batch failed. Try fewer images at once, or check the file formats.');
    } finally {
      setBusy(false);
    }
  };

  return { files, busy, error, done, pick, removeAt, send };
}

function FileList({ files, onRemove }) {
  if (!files.length) return null;
  const mb = (files.reduce((s, f) => s + f.size, 0) / (1024 * 1024)).toFixed(1);
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13, color: '#475569', marginBottom: 6 }}>
        {files.length} selected · {mb} MB
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
        {files.map((f, i) => (
          <div key={f.name + i} style={fileRow}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
            <span style={{ color: '#94a3b8', fontSize: 12 }}>{Math.round(f.size / 1024)} KB</span>
            <button onClick={() => onRemove(i)} style={{ ...btnGhost, color: '#e11', padding: '2px 8px' }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ImageTools() {
  const { user } = useAuth();
  const hasAllPlan = ownsAllPlatforms(user);

  // ── Meesho: the shipping-size normalizer, exactly as before ──
  const meesho = useBatch();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [canvas, setCanvas] = useState(2000);
  const [targetAreaPct, setTargetAreaPct] = useState(67);
  const [kbMin, setKbMin] = useState(150);
  const [kbMax, setKbMax] = useState(300);
  const [qualityFloor, setQualityFloor] = useState(78);

  // ── Amazon: watermark only, image otherwise untouched ──
  const amazon = useBatch();
  const [wmText, setWmText] = useState('SHOPPIX_INDIA');
  const [wmOpacity, setWmOpacity] = useState(3);
  const [wmScale, setWmScale] = useState(100);
  const [wmMode, setWmMode] = useState('tile');

  // Server enforces this too — this screen is just a friendlier message than a 403.
  if (!hasAllPlan) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '8px 4px' }}>
        <h1 style={{ marginBottom: 4 }}>Image Tools</h1>
        <div style={{ ...card, textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 42, lineHeight: 1, marginBottom: 12 }}>🔒</div>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
            Available on the all-platform plan
          </div>
          <p style={{ color: '#64748b', margin: '0 0 18px', lineHeight: 1.6 }}>
            Image Tools is included with the ₹999/mo plan that covers Flipkart,
            Meesho and Amazon together. Upgrade to unlock it.
          </p>
          <a href="/payment" style={{ ...btnPrimary, display: 'inline-block', textDecoration: 'none' }}>
            View plans →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '8px 4px' }}>
      <h1 style={{ marginBottom: 4 }}>Image Tools</h1>
      <p style={{ color: '#64748b', marginTop: 0 }}>
        Two separate jobs: resize product images down for cheaper shipping, or stamp a
        faint ownership mark on them without touching anything else.
      </p>

      {/* ── 1. Meesho ─────────────────────────────────────────── */}
      <div style={card}>
        <div style={sectionHead}>
          <span style={badgeMeesho}>1 · Meesho</span>
          <span style={{ fontWeight: 600 }}>Shrink for cheaper shipping</span>
        </div>
        <p style={note}>
          Squares the image on a white canvas, centres the product and compresses it into
          your KB window. The magical shipping hack — works on any platform.
        </p>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Product images (up to {MAX_FILES})</span>
          <input type="file" accept="image/*" multiple onChange={meesho.pick} />
        </label>
        <FileList files={meesho.files} onRemove={meesho.removeAt} />

        <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            style={btnPrimary}
            disabled={meesho.busy || !meesho.files.length}
            onClick={() => meesho.send(
              '/image-tools/process',
              { canvas, targetAreaPct, kbMin, kbMax, qualityFloor },
              'processed-images', 'processed'
            )}
          >
            {meesho.busy ? 'Processing…' : 'Process & Download ZIP'}
          </button>
          <button onClick={() => setShowAdvanced((v) => !v)} style={btnGhost}>
            {showAdvanced ? 'Hide settings' : 'Settings'}
          </button>
          {meesho.busy && <span style={{ fontSize: 13, color: '#64748b' }}>Large batches can take a minute…</span>}
        </div>

        {showAdvanced && (
          <div style={grid}>
            <Field label="Canvas (px)" value={canvas} onChange={setCanvas} />
            <Field label="Product area %" value={targetAreaPct} onChange={setTargetAreaPct} />
            <Field label="Min KB" value={kbMin} onChange={setKbMin} />
            <Field label="Max KB" value={kbMax} onChange={setKbMax} />
            <Field label="Quality floor" value={qualityFloor} onChange={setQualityFloor} />
          </div>
        )}

        {meesho.error && <div style={errText}>{meesho.error}</div>}
        {meesho.done && <div style={okText}>{meesho.done}</div>}
      </div>

      {/* ── 2. Amazon ─────────────────────────────────────────── */}
      <div style={card}>
        <div style={sectionHead}>
          <span style={badgeAmazon}>2 · Amazon</span>
          <span style={{ fontWeight: 600 }}>Watermark only</span>
        </div>
        <p style={note}>
          Adds the faint lettering and nothing else. Same pixels, same dimensions, same
          format — no resizing, no white canvas, no compression.
        </p>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Images to watermark (up to {MAX_FILES})</span>
          <input type="file" accept="image/*" multiple onChange={amazon.pick} />
        </label>
        <FileList files={amazon.files} onRemove={amazon.removeAt} />

        <div style={grid}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>Text</span>
            <input value={wmText} onChange={(e) => setWmText(e.target.value)} style={inp} />
          </label>
          <Field label="Opacity %" value={wmOpacity} onChange={setWmOpacity} />
          <Field label="Size %" value={wmScale} onChange={setWmScale} />
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>Placement</span>
            <select value={wmMode} onChange={(e) => setWmMode(e.target.value)} style={inp}>
              <option value="tile">Repeated across the image</option>
              <option value="center">One line across the middle</option>
            </select>
          </label>
          <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
            3% is just perceptible on a white background. Raise it if you want it easier
            to spot in a stolen copy.
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            style={btnPrimary}
            disabled={amazon.busy || !amazon.files.length}
            onClick={() => amazon.send(
              '/image-tools/watermark',
              { text: wmText, opacity: wmOpacity, scale: wmScale, mode: wmMode },
              'watermarked-images', 'watermarked'
            )}
          >
            {amazon.busy ? 'Watermarking…' : 'Watermark & Download ZIP'}
          </button>
          {amazon.busy && <span style={{ fontSize: 13, color: '#64748b' }}>Large batches can take a minute…</span>}
        </div>

        {amazon.error && <div style={errText}>{amazon.error}</div>}
        {amazon.done && <div style={okText}>{amazon.done}</div>}
      </div>
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, color: '#64748b' }}>{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)} style={inp} />
    </label>
  );
}

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 14 };
const sectionHead = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' };
const note = { color: '#64748b', fontSize: 13, lineHeight: 1.6, margin: '0 0 14px' };
const grid = { marginTop: 14, paddingTop: 14, borderTop: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 };
const inp = { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, width: '100%', boxSizing: 'border-box' };
const btnPrimary = { padding: '9px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' };
const btnGhost = { padding: '8px 12px', background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: 8, cursor: 'pointer' };
const fileRow = { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderBottom: '1px solid #f1f5f9', fontSize: 13 };
const badgeMeesho = { fontSize: 12, fontWeight: 700, color: '#9d174d', background: '#fce7f3', padding: '3px 10px', borderRadius: 999 };
const badgeAmazon = { fontSize: 12, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '3px 10px', borderRadius: 999 };
const errText = { color: '#e11', marginTop: 10, fontSize: 13 };
const okText = { color: '#16a34a', marginTop: 10, fontSize: 13 };
