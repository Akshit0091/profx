import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../utils/api';
import { buildPrompt } from './productPrompts';
import './ProductImages.css';

const MAX_REFS = 14;

// Rough per-image cost, straight from Google's pricing page. Shown so the cost
// of a click is never a surprise — every generation is billed.
const COST_USD = {
  standard: { '1K': 0.0336, '2K': 0.0504, '4K': 0.113 },
  premium: { '1K': 0.134, '2K': 0.134, '4K': 0.24 },
};
const USD_TO_INR = 89;

export default function ProductImages() {
  const [refs, setRefs] = useState([]);
  const [cleanBranding, setCleanBranding] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('standard');
  const [imageSize, setImageSize] = useState('2K');
  const [aspectRatio, setAspectRatio] = useState('1:1');

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [config, setConfig] = useState(null);

  const previewsRef = useRef([]);

  useEffect(() => {
    let cancelled = false;
    api.get('/image-gen/config')
      .then(({ data }) => { if (!cancelled) setConfig(data); })
      .catch(() => { if (!cancelled) setConfig({ configured: false }); });
    return () => { cancelled = true; };
  }, []);

  // object URLs for the thumbnails have to be released by hand
  useEffect(() => () => previewsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const addImages = useCallback((incoming) => {
    const chosen = incoming.filter((f) => f && /^image\//.test(f.type));
    if (!chosen.length) return;
    setError(''); setResult(null);

    setRefs((prev) => {
      const room = MAX_REFS - prev.length;
      if (room <= 0) { setError(`You can use at most ${MAX_REFS} reference images.`); return prev; }
      const next = chosen.slice(0, room).map((file) => {
        const url = URL.createObjectURL(file);
        previewsRef.current.push(url);
        return { file, url };
      });
      if (chosen.length > room) setError(`Only the first ${room} images were added — the limit is ${MAX_REFS}.`);
      return [...prev, ...next];
    });
  }, []);

  const addFiles = (e) => {
    const chosen = Array.from(e.target.files || []);
    e.target.value = '';
    addImages(chosen);
  };

  // Paste a screenshot or a copied image straight onto the page. Pasting text
  // into the prompt box is untouched — only image data is intercepted.
  useEffect(() => {
    const onPaste = (event) => {
      const items = Array.from(event.clipboardData?.items || []);
      const images = items
        .filter((i) => i.kind === 'file' && /^image\//.test(i.type))
        .map((i) => i.getAsFile())
        .filter(Boolean);
      if (!images.length) return;
      event.preventDefault();
      addImages(images);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addImages]);

  const removeRef = (i) => {
    setRefs((prev) => {
      const gone = prev[i];
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const loadTemplate = (kind) => {
    setPrompt(buildPrompt(kind, { cleanBranding, count: Math.max(2, refs.length) }));
    setError('');
  };

  const generate = async () => {
    if (!prompt.trim()) { setError('Paste or load the prompt first.'); return; }
    setBusy(true); setError(''); setResult(null);
    try {
      const fd = new FormData();
      refs.forEach((r) => fd.append('images', r.file));
      fd.append('prompt', prompt);
      fd.append('model', model);
      fd.append('imageSize', imageSize);
      fd.append('aspectRatio', aspectRatio);

      const { data } = await api.post('/image-gen/generate', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 200000,
      });
      setResult(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Generation failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!result) return;
    const ext = (result.mimeType || 'image/png').split('/')[1] || 'png';
    const a = document.createElement('a');
    a.href = `data:${result.mimeType};base64,${result.image}`;
    a.download = `product-${Date.now()}.${ext}`;
    a.click();
  };

  const usd = (COST_USD[model] && COST_USD[model][imageSize]) || 0;
  const notConfigured = config && config.configured === false;

  return (
    <div className="pi-page">
      <h1>Product Images</h1>
      <p className="pi-sub">
        Turn a supplier's cover photo into a clean studio product shot. Upload the reference
        images, paste the prompt you wrote for that brand, and generate.
      </p>

      {notConfigured && (
        <div className="pi-alert pi-alert-warn">
          The server has no Gemini API key yet, so generation is switched off. Add
          <code> GEMINI_API_KEY</code> to the backend environment and restart it.
        </div>
      )}

      <div className="pi-grid">
        <div className="pi-controls">
          <section className="card pi-card">
            <div className="pi-head"><span className="pi-step">1</span> Reference images</div>
            <input type="file" accept="image/*" multiple onChange={addFiles} />
            <div className="pi-hint">
              One image for a single book, one per book for a set. Up to {MAX_REFS}.
              You can also paste a copied image anywhere on this page.
            </div>
            {refs.length > 0 && (
              <div className="pi-thumbs">
                {refs.map((r, i) => (
                  <div className="pi-thumb" key={r.url}>
                    <img src={r.url} alt={`Reference ${i + 1}`} />
                    <button type="button" onClick={() => removeRef(i)} aria-label="Remove">✕</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card pi-card">
            <div className="pi-head"><span className="pi-step">2</span> Prompt</div>

            <label className="pi-check">
              <input
                type="checkbox" checked={cleanBranding}
                onChange={(e) => setCleanBranding(e.target.checked)}
              />
              <span>Clear the publisher mark off the cover</span>
            </label>

            <div className="pi-hint">
              {cleanBranding
                ? 'Adds a section to the prompt below — edit it there to say where the mark sits for this brand. It asks for plain cover background in that area, wording Gemini accepts, where "remove the X logo" gets blocked on safety grounds.'
                : 'Leave this off to keep the cover exactly as supplied and just turn it into a studio product shot.'}
            </div>

            <div className="pi-template-row">
              <button type="button" className="btn btn-secondary" onClick={() => loadTemplate('single')}>
                Load single-book prompt
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => loadTemplate('set')}>
                Load set prompt ({Math.max(2, refs.length)} books)
              </button>
            </div>

            <textarea
              className="pi-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Paste the full prompt here — the one you generated for this brand."
              rows={14}
            />
            <div className="pi-hint">{prompt.trim().length} characters</div>
          </section>

          <section className="card pi-card">
            <div className="pi-head"><span className="pi-step">3</span> Output</div>
            <div className="pi-row">
              <label className="pi-field">
                <span>Model</span>
                <select value={model} onChange={(e) => setModel(e.target.value)}>
                  <option value="standard">Nano Banana 2.1 — best value</option>
                  <option value="premium">Nano Banana Pro — sharpest text</option>
                </select>
              </label>
              <label className="pi-field">
                <span>Size</span>
                <select value={imageSize} onChange={(e) => setImageSize(e.target.value)}>
                  <option value="1K">1K</option>
                  <option value="2K">2K</option>
                  <option value="4K">4K</option>
                </select>
              </label>
              <label className="pi-field">
                <span>Shape</span>
                <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
                  <option value="1:1">Square 1:1</option>
                  <option value="4:5">Portrait 4:5</option>
                  <option value="3:4">Portrait 3:4</option>
                  <option value="16:9">Wide 16:9</option>
                </select>
              </label>
            </div>
            <div className="pi-hint">
              About ${usd.toFixed(3)} (~₹{(usd * USD_TO_INR).toFixed(1)}) per image, billed to
              your Google account on every generation — including retries.
            </div>
          </section>

          <div className="pi-actions">
            <button className="btn" onClick={generate} disabled={busy || notConfigured}>
              {busy ? 'Generating…' : 'Generate image'}
            </button>
            {busy && <span className="pi-hint">This usually takes 15–60 seconds.</span>}
          </div>

          {error && <div className="pi-alert pi-alert-error">{error}</div>}
        </div>

        <div className="pi-result card">
          <div className="pi-result-head">
            <span>Result</span>
            {result && (
              <button className="btn btn-secondary pi-dl" onClick={download}>Download</button>
            )}
          </div>
          {result ? (
            <>
              <img
                className="pi-out"
                src={`data:${result.mimeType};base64,${result.image}`}
                alt="Generated product"
              />
              <div className="pi-hint pi-meta">
                {result.imageSize} · {result.aspectRatio} · {result.refs} reference
                {result.refs === 1 ? '' : 's'} · {(result.ms / 1000).toFixed(1)}s
              </div>
            </>
          ) : (
            <div className="pi-empty">
              <div className="pi-empty-ico">🖼️</div>
              {busy ? 'Working on it…' : 'Your generated image will appear here.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
