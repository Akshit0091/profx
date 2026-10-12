import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { buildSheet, inspectPage, TEMPLATE_DEFAULTS, TEMPLATE_URL } from './labelTemplate';
import './LabelEditor.css';

const MAX_FILES = 20;
const PREVIEW_PAGE_LIMIT = 3;

function friendlyError(e) {
  const msg = String((e && e.message) || e || '');
  if (/encrypt|password/i.test(msg)) return 'That PDF is password protected — remove the password and try again.';
  if (/clear space/i.test(msg)) return msg;
  if (/template/i.test(msg)) return msg;
  if (/No pages/i.test(msg)) return msg;
  return 'Could not process that PDF. Make sure it is a label sheet downloaded from the seller panel.';
}

function fileStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export default function LabelEditor() {
  const [files, setFiles] = useState([]);
  const [templateFile, setTemplateFile] = useState(null);
  const [settings, setSettings] = useState(TEMPLATE_DEFAULTS);
  const [sheetInfo, setSheetInfo] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [rendering, setRendering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const previewRef = useRef('');
  const templateCache = useRef({ key: null, bytes: null });

  const set = (patch) => { setDone(''); setSettings((prev) => ({ ...prev, ...patch })); };

  const getTemplate = useCallback(async () => {
    const key = templateFile
      ? `${templateFile.name}:${templateFile.size}:${templateFile.lastModified}`
      : 'default';
    if (templateCache.current.key === key) return templateCache.current.bytes;

    let bytes;
    if (templateFile) {
      bytes = new Uint8Array(await templateFile.arrayBuffer());
    } else {
      const res = await fetch(TEMPLATE_URL);
      if (!res.ok) throw new Error('The branding template is missing from the site.');
      bytes = new Uint8Array(await res.arrayBuffer());
    }
    templateCache.current = { key, bytes };
    return bytes;
  }, [templateFile]);

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

  const pickTemplate = (e) => {
    const f = (e.target.files || [])[0];
    setError(''); setDone('');
    if (f) setTemplateFile(f);
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
        const template = await getTemplate();
        const { bytes } = await buildSheet({
          files: [files[0]], template, settings, pageLimit: PREVIEW_PAGE_LIMIT,
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
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [files, settings, getTemplate]);

  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  const render = async () => {
    const template = await getTemplate();
    const res = await buildSheet({ files, template, settings });
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
        Upload the label sheet you downloaded from the seller panel. Every page comes back on
        your branded design, with the tax invoice cut away. Nothing is uploaded anywhere — it
        all runs in your browser.
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
            <div className="le-card-head"><span className="le-step">2</span> Branding</div>
            <p className="le-note">
              The logo, feature strip, website bar and thank-you come from your design file as
              artwork, so they print exactly as drawn. The label is placed in the blank space
              in the middle of it.
            </p>

            <label className="le-check">
              <input
                type="checkbox" checked={settings.logoGreyscale}
                onChange={(e) => set({ logoGreyscale: e.target.checked })}
              />
              <span>Print the logo in black and white</span>
            </label>

            <div className="le-template-row">
              <div className="le-template-name">
                {templateFile ? templateFile.name : 'Shoppix design (built in)'}
              </div>
              <div className="le-logo-pick">
                <label className="le-link">
                  <input type="file" hidden accept="application/pdf,.pdf" onChange={pickTemplate} />
                  Use a different design
                </label>
                {templateFile && (
                  <button type="button" className="le-link le-link-plain" onClick={() => setTemplateFile(null)}>
                    Back to the Shoppix design
                  </button>
                )}
                <div className="le-hint">
                  A one-page PDF with your artwork at the top and bottom and the middle left
                  empty — that empty band is where each label lands.
                </div>
              </div>
            </div>
          </section>

          <div className="le-actions">
            <button className="btn" onClick={download} disabled={busy || !files.length}>
              {busy ? 'Working…' : 'Download branded sheet'}
            </button>
            <button className="btn btn-secondary" onClick={openForPrint} disabled={busy || !files.length}>
              Open to print
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
