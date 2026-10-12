import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { buildSheet, inspectPage, TEMPLATE_DEFAULTS } from './labelTemplate';
import './LabelEditor.css';

const MAX_FILES = 20;
const DEFAULT_LOGO_SRC = '/shoppix-logo.svg';
const PREVIEW_PAGE_LIMIT = 3;
const RASTER_WIDTH = 1600; // wide enough for the logo to stay crisp at 300 dpi

/* ------------------------------ helpers ------------------------------ */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that logo image.'));
    img.src = src;
  });
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function svgIntrinsicSize(svgText) {
  const vb = /viewBox\s*=\s*["']([-\d.\s,]+)["']/i.exec(svgText);
  if (vb) {
    const p = vb[1].trim().split(/[\s,]+/).map(Number);
    if (p.length === 4 && p[2] > 0 && p[3] > 0) return { w: p[2], h: p[3] };
  }
  return { w: 1000, h: 1000 };
}

// Greyscale is done on the pixels rather than with a PDF blend mode: it is
// predictable in every viewer and survives flattening at the printer.
function toGreyscale(ctx, canvas) {
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    px[i] = px[i + 1] = px[i + 2] = lum;
  }
  ctx.putImageData(data, 0, 0);
}

// Logo files carry uneven blank margins inside their own canvas — the Shoppix
// SVG, for one, ends well short of the right edge of its viewBox. Centring the
// file would therefore put the artwork off-centre, so the blank is cut away
// first and only the ink is handed to the PDF.
function trimBlankEdges(canvas, ctx) {
  const w = canvas.width;
  const h = canvas.height;
  const { data } = ctx.getImageData(0, 0, w, h);

  let transparent = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) { transparent = true; break; }
  }
  // Images with an alpha channel are trimmed on it; flat ones lose their white.
  const inked = (i) => (
    transparent
      ? data[i + 3] > 8
      : !(data[i] > 247 && data[i + 1] > 247 && data[i + 2] > 247)
  );

  let minX = w; let minY = h; let maxX = -1; let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (inked((y * w + x) * 4)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return canvas;        // nothing visible
  const tw = maxX - minX + 1;
  const th = maxY - minY + 1;
  if (tw === w && th === h) return canvas;              // already tight

  const trimmed = document.createElement('canvas');
  trimmed.width = tw;
  trimmed.height = th;
  trimmed.getContext('2d').drawImage(canvas, minX, minY, tw, th, 0, 0, tw, th);
  return trimmed;
}

async function rasterize(source, { grey, width = RASTER_WIDTH }) {
  let img;
  let ratio;
  let blobUrl = '';
  try {
    if (typeof source === 'string') {
      const { w, h } = svgIntrinsicSize(source);
      let markup = source;
      if (!/<svg[^>]*\swidth\s*=/i.test(markup)) {
        markup = markup.replace(/<svg/i, `<svg width="${w}" height="${h}"`);
      }
      blobUrl = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
      img = await loadImage(blobUrl);
      ratio = h / w;
    } else {
      blobUrl = URL.createObjectURL(source);
      img = await loadImage(blobUrl);
      ratio = img.naturalHeight / img.naturalWidth;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width);
    canvas.height = Math.max(1, Math.round(width * ratio));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (grey) toGreyscale(ctx, canvas);
    const tight = trimBlankEdges(canvas, ctx);
    return { kind: 'png', bytes: dataUrlToBytes(tight.toDataURL('image/png')) };
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
}

async function readLogo(logoFile, grey) {
  if (!logoFile) {
    const res = await fetch(DEFAULT_LOGO_SRC);
    if (!res.ok) throw new Error('The Shoppix logo file is missing from the site.');
    return rasterize(await res.text(), { grey });
  }
  const type = (logoFile.type || '').toLowerCase();
  const name = (logoFile.name || '').toLowerCase();
  if (type.includes('svg') || name.endsWith('.svg')) {
    return rasterize(await logoFile.text(), { grey });
  }
  const isPng = type.includes('png') || name.endsWith('.png');
  const isJpg = type.includes('jpeg') || type.includes('jpg') || /\.jpe?g$/.test(name);
  if (!isPng && !isJpg) throw new Error('Logo must be an SVG, PNG or JPG file.');
  // Uploads go through the canvas too, so they get the same edge trim.
  return rasterize(logoFile, { grey });
}

function friendlyError(e) {
  const msg = String((e && e.message) || e || '');
  if (/encrypt|password/i.test(msg)) return 'That PDF is password protected — remove the password and try again.';
  if (/logo/i.test(msg)) return msg;
  if (/No pages/i.test(msg)) return msg;
  return 'Could not process that PDF. Make sure it is a label sheet downloaded from the seller panel.';
}

function fileStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/* ------------------------------- page -------------------------------- */

export default function LabelEditor() {
  const [files, setFiles] = useState([]);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(DEFAULT_LOGO_SRC);
  const [settings, setSettings] = useState(TEMPLATE_DEFAULTS);
  const [sheetInfo, setSheetInfo] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [rendering, setRendering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const previewRef = useRef('');
  const logoCache = useRef({ key: null, data: null });

  const set = (patch) => { setDone(''); setSettings((prev) => ({ ...prev, ...patch })); };

  const getLogo = useCallback(async () => {
    const key = `${logoFile ? `${logoFile.name}:${logoFile.size}:${logoFile.lastModified}` : 'default'}:${settings.logoGreyscale ? 'grey' : 'colour'}`;
    if (logoCache.current.key === key) return logoCache.current.data;
    const data = await readLogo(logoFile, settings.logoGreyscale);
    logoCache.current = { key, data };
    return data;
  }, [logoFile, settings.logoGreyscale]);

  const pickPdfs = (e) => {
    const chosen = Array.from(e.target.files || []).filter(
      (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
    );
    setError(''); setDone('');
    if (!chosen.length) { setError('Please choose label sheets in PDF format.'); return; }
    if (chosen.length > MAX_FILES) {
      setError(`Please select at most ${MAX_FILES} PDFs at a time.`);
      setFiles(chosen.slice(0, MAX_FILES));
      return;
    }
    setFiles(chosen);
  };

  const pickLogo = (e) => {
    const f = (e.target.files || [])[0];
    setError(''); setDone('');
    if (!f) return;
    setLogoFile(f);
    setLogoPreview((prev) => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    set({ logoOn: true });
  };

  const resetLogo = () => {
    setLogoFile(null);
    setLogoPreview((prev) => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return DEFAULT_LOGO_SRC;
    });
  };

  // Read every page up front so the seller is told, before printing, if any
  // page is in a layout the invoice-cut doesn't recognise.
  useEffect(() => {
    if (!files.length) { setSheetInfo(null); return undefined; }
    let cancelled = false;
    (async () => {
      try {
        let pages = 0;
        let unknown = 0;
        for (const file of files) {
          const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
          for (const page of doc.getPages()) {
            pages++;
            if (!inspectPage(page).hasInvoice) unknown++;
          }
        }
        if (!cancelled) setSheetInfo({ pages, unknown });
      } catch (e) {
        if (!cancelled) { setSheetInfo(null); setError(friendlyError(e)); }
      }
    })();
    return () => { cancelled = true; };
  }, [files]);

  // Live preview of the first few pages, redrawn once the controls settle.
  useEffect(() => {
    if (!files.length) {
      if (previewRef.current) { URL.revokeObjectURL(previewRef.current); previewRef.current = ''; }
      setPreviewUrl('');
      return undefined;
    }
    let cancelled = false;
    setRendering(true);
    const timer = setTimeout(async () => {
      try {
        const logo = settings.logoOn ? await getLogo() : null;
        const { bytes } = await buildSheet({
          files: [files[0]], settings, logo, pageLimit: PREVIEW_PAGE_LIMIT,
        });
        if (cancelled) return;
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        if (previewRef.current) URL.revokeObjectURL(previewRef.current);
        previewRef.current = url;
        setPreviewUrl(`${url}#toolbar=0&navpanes=0&view=Fit`);
        setError('');
      } catch (e) {
        if (!cancelled) setError(friendlyError(e));
      } finally {
        if (!cancelled) setRendering(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [files, settings, getLogo]);

  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  const render = async () => {
    const logo = settings.logoOn ? await getLogo() : null;
    const res = await buildSheet({ files, settings, logo });
    return { blob: new Blob([res.bytes], { type: 'application/pdf' }), res };
  };

  const download = async () => {
    if (!files.length) { setError('Choose at least one label sheet.'); return; }
    setBusy(true); setError(''); setDone('');
    try {
      const { blob, res } = await render();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shoppix-labels-${fileStamp()}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      let msg = `${res.pages} label${res.pages === 1 ? '' : 's'} ready.`;
      if (res.scaled) msg += ` ${res.scaled} had a long product list and printed slightly smaller.`;
      setDone(msg);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const openForPrint = async () => {
    if (!files.length) { setError('Choose at least one label sheet.'); return; }
    setBusy(true); setError(''); setDone('');
    try {
      const { blob } = await render();
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (!win) setError('Your browser blocked the new tab — allow pop-ups, or use Download instead.');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const totalMb = (files.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024)).toFixed(1);

  return (
    <div className="label-editor">
      <h1>Label Editor</h1>
      <p className="le-sub">
        Upload the label sheet you downloaded from the seller panel. Every page comes back
        branded: logo on top, the tax invoice cut away, and your coupon, website bar and
        thank-you underneath. Nothing is uploaded anywhere — it all runs in your browser.
      </p>

      <div className="le-grid">
        <div className="le-controls">
          <section className="card le-card">
            <div className="le-card-head"><span className="le-step">1</span> Label sheets</div>
            <input type="file" accept="application/pdf" multiple onChange={pickPdfs} />
            {files.length > 0 && (
              <>
                <div className="le-meta">
                  {files.length} PDF{files.length === 1 ? '' : 's'} · {totalMb} MB
                  {sheetInfo && <> · {sheetInfo.pages} label{sheetInfo.pages === 1 ? '' : 's'}</>}
                </div>
                {sheetInfo && sheetInfo.unknown > 0 && (
                  <div className="le-alert le-alert-warn">
                    {sheetInfo.unknown} page{sheetInfo.unknown === 1 ? '' : 's'} in an unfamiliar
                    layout — no invoice heading found, so the cut there is a guess. Check those
                    pages in the preview before printing.
                  </div>
                )}
                <div className="le-filelist">
                  {files.map((f, i) => (
                    <div className="le-filerow" key={f.name + i}>
                      <span className="le-filename">{f.name}</span>
                      <button
                        type="button" className="le-remove"
                        onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        aria-label={`Remove ${f.name}`}
                      >✕</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="card le-card">
            <div className="le-card-head">
              <span className="le-step">2</span> Logo
              <Toggle checked={settings.logoOn} onChange={(v) => set({ logoOn: v })} />
            </div>

            <label className="le-check">
              <input
                type="checkbox" checked={settings.logoGreyscale} disabled={!settings.logoOn}
                onChange={(e) => set({ logoGreyscale: e.target.checked })}
              />
              <span>Print it black and white</span>
            </label>

            <Slider
              label="Logo height" value={settings.logoHeight} min={40} max={130}
              disabled={!settings.logoOn} onChange={(v) => set({ logoHeight: v })}
            />

            <div className="le-logo-row">
              <div className={`le-logo-preview ${settings.logoGreyscale ? 'is-grey' : ''}`}>
                <img src={logoPreview} alt="Logo preview" />
              </div>
              <div className="le-logo-pick">
                <label className="le-link">
                  <input
                    type="file" hidden accept=".svg,image/svg+xml,image/png,image/jpeg"
                    onChange={pickLogo}
                  />
                  Use a different logo
                </label>
                {logoFile && (
                  <button type="button" className="le-link le-link-plain" onClick={resetLogo}>
                    Back to Shoppix logo
                  </button>
                )}
                <div className="le-hint">SVG, PNG (transparent works best) or JPG</div>
              </div>
            </div>
          </section>

          <section className="card le-card">
            <div className="le-card-head">
              <span className="le-step">3</span> Coupon
              <Toggle checked={settings.couponOn} onChange={(v) => set({ couponOn: v })} />
            </div>
            <div className="le-fields">
              <Field label="Side tab" value={settings.stubText} disabled={!settings.couponOn}
                onChange={(v) => set({ stubText: v })} hint="One word per line" />
              <Field label="Headline" value={settings.flatText} disabled={!settings.couponOn}
                onChange={(v) => set({ flatText: v })} />
              <Field label="Amount" value={settings.percentText} disabled={!settings.couponOn}
                onChange={(v) => set({ percentText: v })} />
              <Field label="Word under it" value={settings.offText} disabled={!settings.couponOn}
                onChange={(v) => set({ offText: v })} />
              <Field label="Code label" value={settings.codeLabel} disabled={!settings.couponOn}
                onChange={(v) => set({ codeLabel: v })} />
              <Field label="Code" value={settings.codeText} disabled={!settings.couponOn}
                onChange={(v) => set({ codeText: v })} />
            </div>
          </section>

          <section className="card le-card">
            <div className="le-card-head">
              <span className="le-step">4</span> Website bar
              <Toggle checked={settings.barOn} onChange={(v) => set({ barOn: v })} />
            </div>
            <Field label="Text" value={settings.barText} disabled={!settings.barOn}
              onChange={(v) => set({ barText: v })} wide />
          </section>

          <section className="card le-card">
            <div className="le-card-head">
              <span className="le-step">5</span> Thank you
              <Toggle checked={settings.thanksOn} onChange={(v) => set({ thanksOn: v })} />
            </div>
            <Field label="Headline" value={settings.thanksText} disabled={!settings.thanksOn}
              onChange={(v) => set({ thanksText: v })} wide />
            <Field label="Line under it" value={settings.subText} disabled={!settings.thanksOn}
              onChange={(v) => set({ subText: v })} wide />
          </section>

          <div className="le-actions">
            <button className="btn" onClick={download} disabled={busy || !files.length}>
              {busy ? 'Working…' : 'Download branded sheet'}
            </button>
            <button className="btn btn-secondary" onClick={openForPrint} disabled={busy || !files.length}>
              Open to print
            </button>
            <button
              className="btn btn-secondary" type="button"
              onClick={() => { setSettings({ ...TEMPLATE_DEFAULTS }); setDone(''); }}
            >
              Reset
            </button>
          </div>

          {error && <div className="le-alert le-alert-error">{error}</div>}
          {done && <div className="le-alert le-alert-ok">{done}</div>}
        </div>

        <div className="le-preview card">
          <div className="le-preview-head">
            <span>Preview</span>
            {rendering && <span className="le-meta">updating…</span>}
            {!rendering && sheetInfo && sheetInfo.pages > PREVIEW_PAGE_LIMIT && (
              <span className="le-meta">
                first {PREVIEW_PAGE_LIMIT} of {sheetInfo.pages} · all are in the download
              </span>
            )}
          </div>
          {previewUrl ? (
            <iframe title="Label preview" src={previewUrl} className="le-frame" />
          ) : (
            <div className="le-empty">
              <div className="le-empty-ico">🏷️</div>
              Pick a label sheet to see it here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- small inputs ---------------------------- */

function Toggle({ checked, onChange }) {
  return (
    <label className="le-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>On</span>
    </label>
  );
}

function Field({ label, value, onChange, disabled, hint, wide }) {
  return (
    <label className={`le-field ${wide ? 'is-wide' : ''}`}>
      <span>{label}</span>
      <input type="text" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      {hint && <div className="le-hint">{hint}</div>}
    </label>
  );
}

function Slider({ label, hint, value, min, max, step = 1, onChange, disabled }) {
  return (
    <div className={`le-slider ${disabled ? 'is-disabled' : ''}`}>
      <div className="le-slider-top">
        <span>{label}</span>
        <input
          type="number" className="le-num" value={value} min={min} max={max} step={step}
          disabled={disabled}
          onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))}
        />
      </div>
      <input
        type="range" value={value} min={min} max={max} step={step} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <div className="le-hint">{hint}</div>}
    </div>
  );
}
