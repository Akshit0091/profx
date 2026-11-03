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

// Scanning continuously, a label left sitting in frame would be read again and
// again, beeping each time. This is how long the same code is ignored for —
// long enough not to nag, short enough to rescan a parcel on purpose.
const REPEAT_MS = 4000;

/**
 * The confirmation beep.
 *
 * It has to be heard across a packing table with tape guns and boxes going,
 * through a phone speaker, so it is a square wave rather than a sine: the
 * harmonics carry where a pure tone just disappears. The short ramps top and
 * tail are there to stop it clicking, which at this volume it otherwise would.
 */
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === 'suspended') ctx.resume();   // iOS parks it between taps
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1050;

    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.012);
    gain.gain.setValueAtTime(0.3, t + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);

    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.16);
    setTimeout(() => ctx.close(), 400);
  } catch {
    /* a silent scan is still a working scan */
  }
}

// Which camera to open. Remembered because a packer scanning a stack of
// labels should not have to correct it on every parcel.
const FACING_KEY = 'profx.scan.facing';

// Whether a hit stops the scan. Both ways of working are reasonable —
// checking each parcel against its photo, or running a whole stack through
// and watching the screen — so it is the packer's choice, and it is kept.
const HOLD_KEY = 'profx.scan.hold';
function rememberedFacing() {
  try { return localStorage.getItem(FACING_KEY) === 'user' ? 'user' : 'environment'; }
  catch { return 'environment'; }   // private windows can refuse outright
}

function rememberedHold() {
  try { return localStorage.getItem(HOLD_KEY) !== 'continuous'; }
  catch { return true; }
}

export default function ScanLabel() {
  // off → the camera is released. live → decoding. held → a parcel is on
  // screen and the stream is still open, so Scan next resumes instantly
  // instead of paying to reopen the camera every parcel.
  const [camera, setCamera] = useState('off');
  const [result, setResult] = useState(null);
  const [miss, setMiss] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [stats, setStats] = useState(null);
  const [manual, setManual] = useState('');
  const [uploading, setUploading] = useState(false);
  const [facing, setFacing] = useState(rememberedFacing);
  const [holdOnHit, setHoldOnHit] = useState(rememberedHold);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const loopRef = useRef(null);
  const zxingRef = useRef(null);
  const detectorRef = useRef(null);
  const lastRef = useRef({ code: '', at: 0 });
  const liveRef = useRef(false);
  // Mirrors the facing state so that starting the camera does not have to
  // wait for a render to know which one was asked for.
  const facingRef = useRef(facing);
  // Same again: the decode callback is created once and would otherwise
  // close over whatever the setting was when the camera started.
  const holdRef = useRef(holdOnHit);

  const loadStats = useCallback(() => {
    api.get('/scan/stats').then(({ data }) => setStats(data)).catch(() => {});
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  // ---------- decoding ----------

  /** Stops decoding but leaves the camera open. */
  const halt = useCallback(() => {
    liveRef.current = false;
    if (loopRef.current) { cancelAnimationFrame(loopRef.current); loopRef.current = null; }
    if (zxingRef.current) {
      zxingRef.current.stop?.();
      zxingRef.current.reset?.();
      zxingRef.current = null;
    }
  }, []);

  /** Starts the decode loop against the stream already playing. */
  const decode = useCallback(async (onCode) => {
    const video = videoRef.current;
    if (!video) return;
    liveRef.current = true;

    if (HAS_NATIVE) {
      if (!detectorRef.current) {
        try {
          const supported = await window.BarcodeDetector.getSupportedFormats();
          detectorRef.current = new window.BarcodeDetector({
            formats: FORMATS.filter((f) => supported.includes(f)),
          });
        } catch {
          detectorRef.current = new window.BarcodeDetector();
        }
      }
      const tick = async () => {
        if (!liveRef.current) return;
        try {
          const hits = await detectorRef.current.detect(video);
          if (hits.length && hits[0].rawValue) onCode(hits[0].rawValue);
        } catch {
          /* a frame that arrives mid-resize just fails; the next one won't */
        }
        if (liveRef.current) loopRef.current = requestAnimationFrame(tick);
      };
      loopRef.current = requestAnimationFrame(tick);
      return;
    }

    // Safari and older Android: decode in JavaScript instead.
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      zxingRef.current = await reader.decodeFromVideoElement(video, (res) => {
        if (res && liveRef.current) onCode(res.getText());
      });
    } catch (err) {
      setError('Could not start the barcode decoder: ' + err.message);
    }
  }, []);

  // ---------- lookup ----------

  const lookup = useCallback(async (code, { fromCamera } = {}) => {
    const now = Date.now();
    if (fromCamera && code === lastRef.current.code && now - lastRef.current.at < REPEAT_MS) return;
    lastRef.current = { code, at: now };

    beep();
    if (navigator.vibrate) navigator.vibrate(60);

    try {
      const { data } = await api.get('/scan/lookup', { params: { code } });
      if (holdRef.current) {
        // The camera comes off the boil and the product fills the screen.
        // Nothing else is worth looking at until the packer says they are
        // ready for the next one.
        halt();
        if (videoRef.current) videoRef.current.pause();
        setCamera((c) => (c === 'live' ? 'held' : c));
      }
      setMiss(null);
      setResult(data);
      setError('');
    } catch (err) {
      const data = err.response?.data;
      if (data?.found === false) {
        setError('');
        if (fromCamera) {
          // Not stopping here is deliberate: an unknown code off the camera is
          // usually a half-read barcode, and halting on every one of those would
          // make the scanner feel broken. Keep looking; say so over the
          // viewfinder without getting in the way.
          setMiss({ code: data.code, message: data.message });
        } else {
          // A code someone typed out deliberately is a question that deserves
          // an answer on the page, not a note over a camera that is not running.
          setMiss(null);
          setResult({ found: false, code: data.code, message: data.message });
        }
      } else {
        setError(data?.error || 'Lookup failed');
      }
    }
  }, [halt]);

  // ---------- camera ----------

  const stop = useCallback(() => {
    halt();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    detectorRef.current = null;
    setCamera('off');
  }, [halt]);

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
    setMiss(null);
    setResult(null);

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
    setCamera('live');

    const video = videoRef.current;
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true'); // iOS otherwise opens it fullscreen
    try { await video.play(); } catch { /* autoplay policies vary; the loop copes */ }

    decode((code) => lookup(code, { fromCamera: true }));
  }, [decode, lookup]);

  /** Back to scanning, on the stream that was left running. */
  const scanNext = useCallback(async () => {
    setResult(null);
    setMiss(null);
    setError('');
    lastRef.current = { code: '', at: 0 };  // the same parcel twice is fine

    if (!streamRef.current) { start(); return; }   // the camera was released
    setCamera('live');
    try { await videoRef.current.play(); } catch { /* the loop copes */ }
    decode((code) => lookup(code, { fromCamera: true }));
  }, [decode, lookup, start]);

  /**
   * Changes what happens after a hit. Turning continuous scanning on while a
   * parcel is being held means the packer has just said "keep going", so it
   * goes, rather than making them press Scan next as well.
   */
  const setHold = useCallback((hold) => {
    holdRef.current = hold;
    setHoldOnHit(hold);
    try { localStorage.setItem(HOLD_KEY, hold ? 'hold' : 'continuous'); }
    catch { /* not worth failing over */ }
  }, []);

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

  const parcel = result && result.found ? result : null;
  // Only a held parcel takes over the frame. Scanning continuously, the
  // camera stays where it is and the parcel appears underneath it, so one
  // label can follow another without a tap in between.
  const showingParcel = !!parcel && camera === 'held';

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

      {/* One frame throughout: the camera, then the product that was scanned.
          Swapping the contents rather than the box keeps the page from jumping
          under the packer's thumb between parcels. */}
      <div className={`scan-stage ${showingParcel ? 'has-parcel' : ''}`}>
        {/* Kept mounted: attaching a stream to a video that does not exist yet
            is the usual cause of a black preview on iOS. */}
        {/* The front camera is shown mirrored, as every other selfie view is;
            it is only the display, so the decoder still sees the real frame. */}
        <video
          ref={videoRef}
          className={
            `scan-video${camera !== 'off' && !showingParcel ? '' : ' hidden'}` +
            `${facing === 'user' ? ' mirrored' : ''}`
          }
          muted
          playsInline
        />

        {camera === 'live' && !showingParcel && (
          <>
            <div className="scan-frame" aria-hidden="true">
              <i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" />
              <div className="scan-sweep" />
            </div>
            <div className="scan-hint">Hold the barcode inside the frame</div>
            <button
              type="button"
              className="scan-flip"
              onClick={flip}
              aria-label={facing === 'environment' ? 'Use the front camera' : 'Use the back camera'}
              title={facing === 'environment' ? 'Use the front camera' : 'Use the back camera'}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
                   strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h2L9 4h6l1.5 2h2A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
                <path d="M9.5 12.5a2.5 2.5 0 0 0 4.3 1.7M14.5 12a2.5 2.5 0 0 0-4.3-1.7" />
                <path d="M9.5 9.8v2.7h2.7M14.5 14.6v-2.7h-2.7" />
              </svg>
            </button>
          </>
        )}

        {showingParcel && (
          parcel.image
            ? <img className="scan-shot" src={result.image} alt={result.title || result.sku} />
            : <div className="scan-noshot">
                <span className="scan-noshot-mark">?</span>
                <p>No photo saved for this product yet.</p>
                <p className="small">Run the extension on the Meesho orders page.</p>
              </div>
        )}

        {camera === 'off' && !showingParcel && (
          <div className="scan-idle">
            <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor"
                 strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
              <path d="M7.5 12h9" />
            </svg>
            <p>Point the camera at the barcode on a shipping label.</p>
          </div>
        )}

        {/* An unknown code does not stop the scan, so it is said over the
            viewfinder rather than below the fold. */}
        {miss && camera === 'live' && (
          <div className="scan-miss">
            <strong>Not in the list</strong>
            <span className="mono">{miss.code}</span>
          </div>
        )}
      </div>

      <div className="scan-actions">
        {showingParcel ? (
          <button type="button" className="btn btn-next" onClick={scanNext} autoFocus>
            Scan next parcel
          </button>
        ) : camera !== 'off' ? (
          <button type="button" className="btn btn-stop" onClick={stop}>Stop camera</button>
        ) : (
          <button type="button" className="btn btn-go" onClick={start}>Start camera</button>
        )}
      </div>

      <div className="scan-mode" role="group" aria-label="After each scan">
        <button
          type="button"
          className={holdOnHit ? 'is-on' : ''}
          aria-pressed={holdOnHit}
          onClick={() => setHold(true)}
        >
          Stop on each parcel
        </button>
        <button
          type="button"
          className={!holdOnHit ? 'is-on' : ''}
          aria-pressed={!holdOnHit}
          onClick={() => { setHold(false); if (showingParcel) scanNext(); }}
        >
          Keep scanning
        </button>
      </div>

      {error && <p className="scan-msg error">{error}</p>}
      {notice && <p className="scan-msg notice">{notice}</p>}

      {parcel && (
        <section className={`scan-result ${!showingParcel && parcel.image ? 'with-photo' : ''}`}>
          {/* Scanning continuously the frame stays on the camera, so this is
              the only place the product can be seen — and it is what the packer
              is checking the parcel against, so it gets the full width here too
              rather than being shrunk to a corner. */}
          {!showingParcel && parcel.image && (
            <img className="scan-photo" src={parcel.image} alt={parcel.title || parcel.sku} />
          )}
          <div className="scan-result-body">
          <h2 className="scan-title">{parcel.title || parcel.sku}</h2>
          <dl className="scan-facts">
            <div><dt>SKU</dt><dd>{parcel.sku}</dd></div>
            <div><dt>Qty</dt><dd className={parcel.qty > 1 ? 'big' : ''}>{parcel.qty}</dd></div>
            {parcel.size && <div><dt>Size</dt><dd>{parcel.size}</dd></div>}
            {parcel.courier && <div><dt>Courier</dt><dd>{parcel.courier}</dd></div>}
            <div className="wide"><dt>Sub-order</dt><dd className="mono">{parcel.subOrderId}</dd></div>
            {parcel.awb && <div className="wide"><dt>AWB</dt><dd className="mono">{parcel.awb}</dd></div>}
          </dl>
          </div>
        </section>
      )}

      {result && !result.found && (
        <section className="scan-result miss">
          <h2 className="scan-title">Not found</h2>
          <p>{result.message}</p>
          <p className="mono small">Scanned: {result.code}</p>
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
