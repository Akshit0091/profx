import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../utils/api';
import './ScanLabel.css';

// Shipping labels use Code 128 almost everywhere; the rest are here because
// couriers do occasionally switch, and listing them costs nothing.
const FORMATS = ['code_128', 'code_39', 'codabar', 'itf', 'ean_13', 'qr_code', 'data_matrix'];

/**
 * Whether this browser can decode barcodes itself, and which kinds.
 *
 * Chrome on Android can, which is faster and keeps the bundle small. Nothing
 * on a desktop can — Chrome on Windows has no BarcodeDetector at all — and
 * neither does Safari, so ZXing carries every PC and every iPhone.
 *
 * Being present is not the same as working: on some builds the constructor
 * exists and the engine behind it reports no formats whatsoever, and a
 * detector made from it throws on every single frame. Asking what it can read
 * is the only honest test. Asked once, because the answer cannot change.
 */
let nativeFormats = null;
async function nativeSupport() {
  if (nativeFormats !== null) return nativeFormats;
  nativeFormats = [];
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      nativeFormats = FORMATS.filter((f) => supported.includes(f));
    } catch {
      nativeFormats = [];
    }
  }
  return nativeFormats;
}

/**
 * Resolves once the video actually has a picture, which is not the same as the
 * stream being live: a camera reports a width and height of zero until its
 * first frame has decoded, and on a PC webcam that warm-up runs to a second or
 * two. Anything that measures the picture before then measures nothing.
 */
function framesFlowing(video, timeoutMs = 8000) {
  if (video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (ok) => { clearInterval(poll); clearTimeout(bail); resolve(ok); };
    const poll = setInterval(() => {
      if (video.videoWidth > 0 && video.videoHeight > 0) finish(true);
    }, 50);
    const bail = setTimeout(() => finish(false), timeoutMs);
  });
}

// How many times a decode loop that has died is put back on its feet before
// the packer is told to stop waiting and type the code instead.
const MAX_RESTARTS = 5;

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
  // How many times this scanning session has had to restart a decode loop that
  // died. Counted so that a camera failing for some reason nobody foresaw ends
  // in an explanation rather than in restarting for ever.
  const restartsRef = useRef(0);
  // The typed-code box, so a scanner gun can send one parcel after another
  // without the focus having to be put back by hand.
  const manualRef = useRef(null);
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

  /**
   * Decoding in JavaScript, which is every PC and every iPhone.
   *
   * ZXing's scan loop retries after "no barcode in this frame" and gives up for
   * good on anything else — silently, with no way to ask it afterwards. So it
   * is started through scan() rather than decodeFromVideoElement(), because
   * that is the form that reports a loop that has died, and a dead loop is put
   * back rather than left behind a preview that will never read again.
   */
  const startZxing = useCallback(async (onCode) => {
    const video = videoRef.current;
    if (!video) return;
    try {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] =
        await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
      if (!liveRef.current) return;

      // Told what to look for, it stops spending frames on formats no courier
      // prints; TRY_HARDER buys the extra passes a webcam's softer, flatter
      // picture needs to find the bars at all.
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF,
        BarcodeFormat.CODABAR, BarcodeFormat.EAN_13,
        BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      // Twice a second is the library's own default, and it feels broken to
      // someone holding a parcel up to a camera waiting for a beep.
      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 100,
        delayBetweenScanSuccess: 300,
      });

      const run = () => {
        zxingRef.current = reader.scan(
          video,
          (res) => { if (res && liveRef.current) onCode(res.getText()); },
          (err) => {
            // Finishing with no error means stop() was called, and that was us.
            if (!err || !liveRef.current) return;
            if (restartsRef.current >= MAX_RESTARTS) {
              setError('The barcode reader keeps failing on this camera. '
                + 'Type the code below, or scan into that box with a scanner gun.');
              return;
            }
            restartsRef.current += 1;
            // A fresh scan() measures the picture again, which is the fix for
            // the commonest cause of the loop dying in the first place.
            setTimeout(() => { if (liveRef.current) run(); }, 300);
          },
        );
      };
      run();
    } catch (err) {
      setError('Could not start the barcode decoder: '
        + ((err && err.message) || 'the camera sent no picture.'));
    }
  }, []);

  /**
   * Starts the decode loop against the stream already playing.
   *
   * The wait at the top is not politeness. ZXing sizes its capture canvas once,
   * from the video's own width and height, and a camera that has not delivered
   * its first frame reports zero. A canvas of no size draws nothing and then
   * throws IndexSizeError the moment its pixels are read — which is not the
   * "no barcode in this frame" error the loop retries after, so the loop gives
   * up for good, without a word, behind a preview that looks perfectly alive.
   * That is the camera that works on a phone and does nothing on a PC.
   */
  const decode = useCallback(async (onCode) => {
    const video = videoRef.current;
    if (!video) return;
    liveRef.current = true;
    restartsRef.current = 0;

    if (!(await framesFlowing(video))) {
      if (!liveRef.current) return;
      setError('The camera opened but sent no picture. '
        + 'Close anything else that might be using it, then start it again.');
      return;
    }
    if (!liveRef.current) return;   // stopped while the camera was warming up

    const formats = await nativeSupport();
    if (!liveRef.current) return;

    if (formats.length) {
      if (!detectorRef.current) {
        try { detectorRef.current = new window.BarcodeDetector({ formats }); }
        catch { detectorRef.current = null; }
      }
    }

    if (formats.length && detectorRef.current) {
      let misfires = 0;
      const tick = async () => {
        if (!liveRef.current) return;
        try {
          const hits = await detectorRef.current.detect(video);
          misfires = 0;
          if (hits.length && hits[0].rawValue) onCode(hits[0].rawValue);
        } catch {
          // One frame failing is nothing; a frame caught mid-resize does it.
          // Every frame failing means this engine cannot read this stream at
          // all, so hand the job over rather than spin on a camera that is
          // never going to decode anything.
          misfires += 1;
          if (misfires > 15) {
            nativeFormats = [];
            detectorRef.current = null;
            startZxing(onCode);
            return;
          }
        }
        if (liveRef.current) loopRef.current = requestAnimationFrame(tick);
      };
      loopRef.current = requestAnimationFrame(tick);
      return;
    }

    startZxing(onCode);
  }, [startZxing]);

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

    // A camera can be taken away mid-scan: another app claims the webcam, a
    // laptop sleeps, a USB lead is nudged. The preview freezes on its last
    // frame and decoding goes on reading that same frame for ever, so this
    // says what happened instead of leaving a picture that never beeps.
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        if (streamRef.current !== stream) return;   // already replaced
        stop();
        setError('The camera stopped sending pictures — another app may have '
          + 'taken it. Start it again.');
      });
    });

    const video = videoRef.current;
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true'); // iOS otherwise opens it fullscreen
    try { await video.play(); } catch { /* autoplay policies vary; the loop copes */ }

    decode((code) => lookup(code, { fromCamera: true }));
  }, [decode, lookup, stop]);

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
    // A scanner gun types the code and presses Enter for you. Emptying the box
    // is what stops the next parcel being added onto the end of the last one
    // and looked up as one long code belonging to nothing; keeping the focus is
    // what lets a whole stack go through without touching the mouse.
    setManual('');
    if (manualRef.current) manualRef.current.focus();
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
              ref={manualRef}
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
