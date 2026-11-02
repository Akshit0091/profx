import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../utils/api';
import './ScanLabel.css';

// Chrome on Android decodes barcodes natively, which is faster and keeps the
// bundle small. Safari has no such engine, so ZXing is pulled in only on the
// phones that actually need it.
const HAS_NATIVE = typeof window !== 'undefined' && 'BarcodeDetector' in window;

// Shipping labels use Code 128 almost everywhere; the rest are here because
// couriers do occasionally switch, and listing them costs nothing.
const FORMATS = ['code_128', 'code_39', 'codabar', 'itf', 'ean_13', 'qr_code', 'data_matrix'];

// Re-reading the same label for as long as it sits in frame would hammer the
// API, so a code is only looked up again after this long.
const REPEAT_MS = 2500;

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.06;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
    setTimeout(() => ctx.close(), 300);
  } catch {
    /* a silent scan is still a working scan */
  }
}

// Which camera to open. Remembered because a packer scanning a stack of
// labels should not have to correct it on every parcel.
const FACING_KEY = 'profx.scan.facing';
function rememberedFacing() {
  try { return localStorage.getItem(FACING_KEY) === 'user' ? 'user' : 'environment'; }
  catch { return 'environment'; }   // private windows can refuse outright
}

export default function ScanLabel() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [stats, setStats] = useState(null);
  const [manual, setManual] = useState('');
  const [uploading, setUploading] = useState(false);
  const [facing, setFacing] = useState(rememberedFacing);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const loopRef = useRef(null);
  const zxingRef = useRef(null);
  const lastRef = useRef({ code: '', at: 0 });
  const liveRef = useRef(false);
  // Mirrors the facing state so that starting the camera does not have to
  // wait for a render to know which one was asked for.
  const facingRef = useRef(facing);

  const loadStats = useCallback(() => {
    api.get('/scan/stats').then(({ data }) => setStats(data)).catch(() => {});
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  // ---------- lookup ----------

  const lookup = useCallback(async (code) => {
    const now = Date.now();
    if (code === lastRef.current.code && now - lastRef.current.at < REPEAT_MS) return;
    lastRef.current = { code, at: now };

    beep();
    if (navigator.vibrate) navigator.vibrate(60);

    try {
      const { data } = await api.get('/scan/lookup', { params: { code } });
      setResult(data);
      setError('');
    } catch (err) {
      const data = err.response?.data;
      if (data?.found === false) {
        setResult({ found: false, code: data.code, message: data.message });
        setError('');
      } else {
        setError(data?.error || 'Lookup failed');
      }
    }
  }, []);

  // ---------- camera ----------

  const stop = useCallback(() => {
    liveRef.current = false;
    if (loopRef.current) { cancelAnimationFrame(loopRef.current); loopRef.current = null; }
    if (zxingRef.current) { zxingRef.current.reset?.(); zxingRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }, []);

  // Releasing the camera when the page goes away matters more on a phone than
  // on a desktop: a live track keeps the lamp on and drains the battery.
  useEffect(() => stop, [stop]);

  // `which` is omitted when this is a button handler, which passes an event.
  const start = useCallback(async (which) => {
    const want = which === 'user' || which === 'environment' ? which : facingRef.current;
    facingRef.current = want;
    setFacing(want);
    try { localStorage.setItem(FACING_KEY, want); } catch { /* not worth failing over */ }

    setError('');
    setNotice('');

    if (!window.isSecureContext) {
      setError('The camera only works over HTTPS. Open the app at its https address.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser will not give a web page camera access.');
      return;
    }

    const wanted = (mode) => ({
      video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });

    let stream;
    try {
      // Ask for that camera by name. Some phones label their cameras in a way
      // that makes a merely "ideal" request hand back the selfie one, which is
      // no use pointed at a parcel.
      stream = await navigator.mediaDevices.getUserMedia(wanted({ exact: want }));
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Camera permission was refused. Allow it for this site and try again.');
        return;
      }
      try {
        // No camera answers to that name — a tablet with one lens, say. Take
        // whatever there is rather than refusing to scan at all.
        stream = await navigator.mediaDevices.getUserMedia(wanted({ ideal: want }));
      } catch (err2) {
        setError('Could not open the camera: ' + err2.message);
        return;
      }
    }

    streamRef.current = stream;
    setScanning(true);
    liveRef.current = true;

    const video = videoRef.current;
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true'); // iOS otherwise opens it fullscreen
    try { await video.play(); } catch { /* autoplay policies vary; the loop copes */ }

    if (HAS_NATIVE) {
      let detector;
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        detector = new window.BarcodeDetector({
          formats: FORMATS.filter((f) => supported.includes(f)),
        });
      } catch {
        detector = new window.BarcodeDetector();
      }

      const tick = async () => {
        if (!liveRef.current) return;
        try {
          const hits = await detector.detect(video);
          if (hits.length && hits[0].rawValue) lookup(hits[0].rawValue);
        } catch {
          /* a frame that arrives mid-resize just fails; the next one won't */
        }
        loopRef.current = requestAnimationFrame(tick);
      };
      loopRef.current = requestAnimationFrame(tick);
      return;
    }

    // Safari and older Android: decode in JavaScript instead.
    setNotice('Using the built-in decoder — hold the label steady for a moment.');
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      zxingRef.current = await reader.decodeFromVideoElement(video, (res) => {
        if (res && liveRef.current) lookup(res.getText());
      });
    } catch (err) {
      setError('Could not start the barcode decoder: ' + err.message);
      stop();
    }
  }, [lookup, stop]);

  /** Swaps to the other camera, reopening the stream on the new one. */
  const flip = useCallback(() => {
    const next = facingRef.current === 'environment' ? 'user' : 'environment';
    stop();
    start(next);
  }, [start, stop]);

  // ---------- label sheet upload ----------

  const uploadSheet = async (event) => {
    const files = [...event.target.files];
    event.target.value = '';
    if (!files.length) return;

    setUploading(true);
    setError('');
    setNotice('');
    try {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      const { data } = await api.post('/scan/labels', form);

      // Sheets overlap, so "how many were actually new" is the number the
      // seller wants — re-uploading yesterday's labels should visibly do nothing.
      const parts = [`${data.added} new`];
      if (data.duplicates) parts.push(`${data.duplicates} already stored`);
      if (data.updated) parts.push(`${data.updated} corrected`);
      if (data.purged) parts.push(`${data.purged} expired and removed`);

      const what = (data.sources || []).includes('manifest')
        ? ((data.sources || []).length > 1 ? 'sheet and manifest' : 'manifest')
        : 'label sheet';

      setNotice(
        `${parts.join(', ')}. ${data.scannable} parcels from this ${what} are scannable, ` +
        `across ${data.distinctSkus} products` +
        (data.skusMissingImage
          ? ` — ${data.skusMissingImage} still have no photo, so run the extension on the Meesho orders page.`
          : ' — every one of them has a photo.')
      );
      loadStats();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not read that PDF.');
    } finally {
      setUploading(false);
    }
  };

  const submitManual = (e) => {
    e.preventDefault();
    const code = manual.trim();
    if (!code) return;
    lastRef.current = { code: '', at: 0 }; // a deliberate retype should always run
    lookup(code);
  };

  return (
    <div className="scan">
      <header className="scan-head">
        <h1>Scan a label</h1>
        {stats && (
          <p className="scan-stats">
            {stats.labels} labels indexed · {stats.images} products pictured
            {stats.skusMissingImage > 0 && ` · ${stats.skusMissingImage} without a photo`}
            {stats.retentionDays && ` · kept for ${stats.retentionDays} days`}
          </p>
        )}
      </header>

      <div className="scan-stage">
        {/* Kept mounted: attaching a stream to a video that does not exist yet
            is the usual cause of a black preview on iOS. */}
        {/* The front camera is shown mirrored, as every other selfie view is;
            it is only the display, so the decoder still sees the real frame. */}
        <video
          ref={videoRef}
          className={`scan-video${scanning ? '' : ' hidden'}${facing === 'user' ? ' mirrored' : ''}`}
          muted
          playsInline
        />
        {scanning && <div className="scan-reticle" aria-hidden="true" />}
        {!scanning && (
          <div className="scan-idle">
            <p>Point the camera at the barcode on a shipping label.</p>
          </div>
        )}
      </div>

      <div className="scan-actions">
        {scanning ? (
          <>
            <button type="button" className="btn btn-stop" onClick={stop}>Stop camera</button>
            <button type="button" className="btn btn-flip" onClick={flip}>
              {facing === 'environment' ? 'Front camera' : 'Back camera'}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-go" onClick={start}>Start camera</button>
        )}
      </div>

      {error && <p className="scan-msg error">{error}</p>}
      {notice && <p className="scan-msg notice">{notice}</p>}

      {result && (
        <section className={`scan-result ${result.found ? '' : 'miss'}`}>
          {result.found ? (
            <>
              {result.image
                ? <img className="scan-photo" src={result.image} alt={result.title || result.sku} />
                : <div className="scan-photo placeholder">
                    No photo saved for this product yet — run the extension on the Meesho orders page.
                  </div>}
              <div className="scan-info">
                <h2>{result.title || result.sku}</h2>
                <dl>
                  <div><dt>SKU</dt><dd>{result.sku}</dd></div>
                  <div><dt>Qty</dt><dd>{result.qty}</dd></div>
                  {result.size && <div><dt>Size</dt><dd>{result.size}</dd></div>}
                  {result.courier && <div><dt>Courier</dt><dd>{result.courier}</dd></div>}
                  <div><dt>Sub-order</dt><dd className="mono">{result.subOrderId}</dd></div>
                  {result.awb && <div><dt>AWB</dt><dd className="mono">{result.awb}</dd></div>}
                </dl>
              </div>
            </>
          ) : (
            <div className="scan-info">
              <h2>Not found</h2>
              <p>{result.message}</p>
              <p className="mono small">Scanned: {result.code}</p>
            </div>
          )}
        </section>
      )}

      <section className="scan-tools">
        <form className="scan-manual" onSubmit={submitManual}>
          <label htmlFor="manual-code">Type a code instead</label>
          <div className="scan-manual-row">
            <input
              id="manual-code"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="VL0085981395206"
              autoComplete="off"
              autoCapitalize="characters"
            />
            <button type="submit" className="btn btn-secondary">Look up</button>
          </div>
        </form>

        <div className="scan-upload">
          <label htmlFor="sheet">Label sheet or manifest</label>
          <p className="hint">
            Upload either the <b>Sub Order Labels</b> PDF or the <b>Supplier Manifest</b> for
            a batch — whichever you have. Both carry the same orders, and ProfX works out
            which is which. Every parcel in it stays scannable for {stats?.retentionDays || 90} days,
            and re-uploading an overlapping batch leaves what's already stored alone rather
            than duplicating it.
          </p>
          <input id="sheet" type="file" accept="application/pdf" multiple onChange={uploadSheet} disabled={uploading} />
          {uploading && <p className="hint">Reading the sheet…</p>}
        </div>
      </section>
    </div>
  );
}
