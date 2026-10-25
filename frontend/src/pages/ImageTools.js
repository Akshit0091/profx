import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { useAuth } from '../utils/AuthContext';
import { ownsAllPlatforms, useActivePlatform } from '../utils/platforms';

const MAX_FILES = 30;

export default function ImageTools() {
  const { user } = useAuth();
  const hasAllPlan = ownsAllPlatforms(user);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Defaults mirror backend utils/imageProcessor.js
  const [canvas, setCanvas] = useState(2000);
  const [targetAreaPct, setTargetAreaPct] = useState(67);
  const [kbMin, setKbMin] = useState(150);
  const [kbMax, setKbMax] = useState(300);
  const [qualityFloor, setQualityFloor] = useState(78);

  // Faint ownership mark. Used on the Amazon catalogue, so it switches itself
  // on when Amazon is the active marketplace — overridable either way.
  const { platform } = useActivePlatform(user);
  const [watermark, setWatermark] = useState(false);
  const [wmText, setWmText] = useState('SHOPPIX_INDIA');
  const [wmOpacity, setWmOpacity] = useState(3);
  const [wmScale, setWmScale] = useState(100);
  const [wmMode, setWmMode] = useState('tile');
  const [wmTouched, setWmTouched] = useState(false);

  useEffect(() => {
    if (!wmTouched) setWatermark(platform === 'amazon');
  }, [platform, wmTouched]);

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

  const process = async () => {
    if (!files.length) { setError('Choose at least one image'); return; }
    setError(''); setDone(''); setBusy(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('images', f));
      fd.append('canvas', canvas);
      fd.append('targetAreaPct', targetAreaPct);
      fd.append('kbMin', kbMin);
      fd.append('kbMax', kbMax);
      fd.append('qualityFloor', qualityFloor);
      fd.append('watermark', String(watermark));
      if (watermark) {
        fd.append('watermarkText', wmText);
        fd.append('watermarkOpacity', wmOpacity);
        fd.append('watermarkScale', wmScale);
        fd.append('watermarkMode', wmMode);
      }

      const res = await api.post('/image-tools/process', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      const d = new Date();
      const stamp = `${String(d.getDate()).padStart(2, '0')}-${d.toLocaleString('en-US', { month: 'short' })}`;
      a.href = url;
      a.download = `processed-images-${stamp}.zip`;
      a.click();
      window.URL.revokeObjectURL(url);
      const okCount = Number(res.headers['x-processed-count'] || files.length);
      const failCount = Number(res.headers['x-failed-count'] || 0);
      const failNames = decodeURIComponent(res.headers['x-failed-files'] || '')
        .split('|').filter(Boolean);
      let msg = `${okCount} image${okCount === 1 ? '' : 's'} processed and downloaded.`;
      if (failCount) {
        msg += ` ${failCount} could not be processed: ${failNames.join(', ')}`;
      }
      setDone(msg);
    } catch (e) {
      setError('Processing failed. Try fewer images at once, or check the file formats.');
    } finally {
      setBusy(false);
    }
  };

  const totalMb = (files.reduce((s, f) => s + f.size, 0) / (1024 * 1024)).toFixed(1);

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
        A magical hack to reduce the shipping price of your products on any platform.
        Upload your product images, download them ready to list.
      </p>

      <div style={card}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontWeight: 600 }}>Product images (up to {MAX_FILES})</span>
          <input type="file" accept="image/*" multiple onChange={pick} />
        </label>

        {files.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: '#475569', marginBottom: 6 }}>
              {files.length} selected · {totalMb} MB
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              {files.map((f, i) => (
                <div key={f.name + i} style={fileRow}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span style={{ color: '#94a3b8', fontSize: 12 }}>{Math.round(f.size / 1024)} KB</span>
                  <button onClick={() => removeAt(i)} style={{ ...btnGhost, color: '#e11', padding: '2px 8px' }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={watermark}
              onChange={(e) => { setWmTouched(true); setWatermark(e.target.checked); }}
            />
            <span>Add a faint watermark</span>
            {platform === 'amazon' && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#c2410c', background: '#ffedd5', padding: '2px 8px', borderRadius: 999 }}>
                on by default for Amazon
              </span>
            )}
          </label>

          {watermark && (
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
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
                3% is just perceptible on a white background. Raise it if you want it
                easier to spot in a stolen copy.
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={process} disabled={busy || !files.length} style={btnPrimary}>
            {busy ? 'Processing…' : 'Process & Download ZIP'}
          </button>
          <button onClick={() => setShowAdvanced((v) => !v)} style={btnGhost}>
            {showAdvanced ? 'Hide settings' : 'Settings'}
          </button>
          {busy && <span style={{ fontSize: 13, color: '#64748b' }}>Large batches can take a minute…</span>}
        </div>

        {showAdvanced && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
            <Field label="Canvas (px)" value={canvas} onChange={setCanvas} />
            <Field label="Product area %" value={targetAreaPct} onChange={setTargetAreaPct} />
            <Field label="Min KB" value={kbMin} onChange={setKbMin} />
            <Field label="Max KB" value={kbMax} onChange={setKbMax} />
            <Field label="Quality floor" value={qualityFloor} onChange={setQualityFloor} />
          </div>
        )}
      </div>

      {error && <div style={{ color: '#e11', margin: '10px 0' }}>{error}</div>}
      {done && <div style={{ color: '#16a34a', margin: '10px 0' }}>{done}</div>}

      <div style={{ ...card, background: '#f8fafc' }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>✨ Magical shipping hack</div>
        <p style={{ margin: 0, color: '#475569', fontSize: 14, lineHeight: 1.7 }}>
          Upload your product images here and download the processed versions. Use these
          on your listings to bring down the shipping price of your products — works on
          any platform.
        </p>
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

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 12 };
const inp = { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, width: '100%', boxSizing: 'border-box' };
const btnPrimary = { padding: '9px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' };
const btnGhost = { padding: '8px 12px', background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: 8, cursor: 'pointer' };
const fileRow = { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderBottom: '1px solid #f1f5f9', fontSize: 13 };
