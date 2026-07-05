import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './InstallPrompt.css';

const DISMISS_KEY = 'profx_pwa_dismissed_at';
const VISITS_KEY = 'profx_pwa_visits';
const SESSION_KEY = 'profx_pwa_session_counted';
const DISMISS_DAYS = 14;
const SHOW_DELAY_MS = 8000;
const MIN_VISITS = 2;

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true
  );
}

function detectPlatform() {
  const ua = window.navigator.userAgent || '';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as Mac; disambiguate by touch support.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  // iOS can only "Add to Home Screen" from Safari — not Chrome/Firefox/in-app.
  const isIOSSafari =
    isIOS && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line/.test(ua);
  return { isIOS, isAndroid, isIOSSafari };
}

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (!at) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function countVisit() {
  try {
    if (!sessionStorage.getItem(SESSION_KEY)) {
      sessionStorage.setItem(SESSION_KEY, '1');
      const n = Number(localStorage.getItem(VISITS_KEY) || 0) + 1;
      localStorage.setItem(VISITS_KEY, String(n));
      return n;
    }
    return Number(localStorage.getItem(VISITS_KEY) || 0);
  } catch {
    return MIN_VISITS; // storage blocked — don't hard-block the prompt
  }
}

export default function InstallPrompt() {
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [platform, setPlatform] = useState({ isIOS: false, isAndroid: false, isIOSSafari: false });

  const deferredRef = useRef(null); // beforeinstallprompt event (Android/desktop)
  const timerDoneRef = useRef(false);
  const navigatedRef = useRef(false);
  const visitsRef = useRef(0);
  const shownRef = useRef(false);
  const firstLocRef = useRef(true);

  // One-time setup.
  useEffect(() => {
    if (isStandalone()) return; // already installed
    setPlatform(detectPlatform());
    visitsRef.current = countVisit();

    const onBIP = (e) => {
      e.preventDefault();
      deferredRef.current = e;
      maybeShow();
    };
    const onInstalled = () => {
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      } catch {}
      setVisible(false);
    };

    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('appinstalled', onInstalled);

    const t = setTimeout(() => {
      timerDoneRef.current = true;
      maybeShow();
    }, SHOW_DELAY_MS);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track route changes (ignore the initial mount location).
  useEffect(() => {
    if (firstLocRef.current) {
      firstLocRef.current = false;
      return;
    }
    navigatedRef.current = true;
    maybeShow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  function eligible() {
    if (shownRef.current) return false;
    if (isStandalone()) return false;
    if (dismissedRecently()) return false;
    if (visitsRef.current < MIN_VISITS) return false;
    const p = detectPlatform();
    // Android/desktop: need a captured install event. iOS: need Safari.
    if (deferredRef.current) return true;
    if (p.isIOSSafari) return true;
    return false;
  }

  function maybeShow() {
    // Show only once both the delay elapsed AND the user has navigated once.
    if (!(timerDoneRef.current && navigatedRef.current)) return;
    if (!eligible()) return;
    shownRef.current = true;
    setVisible(true);
  }

  function close() {
    setClosing(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setTimeout(() => {
      setVisible(false);
      setClosing(false);
    }, 240);
  }

  async function install() {
    const evt = deferredRef.current;
    if (!evt) return;
    evt.prompt();
    try {
      await evt.userChoice;
    } catch {}
    deferredRef.current = null;
    close();
  }

  if (!visible) return null;

  const showIOS = platform.isIOSSafari && !deferredRef.current;

  return (
    <div className={`pwa-ip ${closing ? 'pwa-ip--closing' : ''}`} role="dialog" aria-label="Install ProfX">
      <button className="pwa-ip__scrim" aria-label="Dismiss" onClick={close} />
      <div className="pwa-ip__sheet">
        <span className="pwa-ip__grip" />
        <button className="pwa-ip__x" aria-label="Close" onClick={close}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div className="pwa-ip__head">
          <div className="pwa-ip__icon">
            <img src="/icons/icon-192.png" alt="ProfX" width="56" height="56" />
          </div>
          <div className="pwa-ip__title">
            <h3>Install ProfX</h3>
            <p>Your profit dashboard, one tap away — fullscreen, faster, works offline.</p>
          </div>
        </div>

        {showIOS ? (
          <div className="pwa-ip__ios">
            <ol className="pwa-ip__steps">
              <li>
                <span className="pwa-ip__num">1</span>
                <span>
                  Tap the <strong>Share</strong> button
                  <span className="pwa-ip__glyph" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 16V4" />
                      <path d="M8 8l4-4 4 4" />
                      <path d="M6 12v6a2 2 0 002 2h8a2 2 0 002-2v-6" />
                    </svg>
                  </span>
                  in the toolbar
                </span>
              </li>
              <li>
                <span className="pwa-ip__num">2</span>
                <span>Choose <strong>Add to Home Screen</strong></span>
              </li>
              <li>
                <span className="pwa-ip__num">3</span>
                <span>Tap <strong>Add</strong> — done.</span>
              </li>
            </ol>
            <button className="pwa-ip__ghost" onClick={close}>Got it</button>
          </div>
        ) : (
          <div className="pwa-ip__actions">
            <button className="pwa-ip__cta" onClick={install}>
              Install app
            </button>
            <button className="pwa-ip__later" onClick={close}>Maybe later</button>
          </div>
        )}
      </div>
    </div>
  );
}
