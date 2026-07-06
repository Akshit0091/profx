import { useEffect, useRef, useState } from 'react';
import './Onboarding.css';

const SEEN_KEY = 'profx_onboarded';

const SLIDES = [
  {
    title: 'Welcome to ProfX',
    body: 'Know exactly how much you earned today — not just what you sold.',
    icon: 'mark',
  },
  {
    title: 'Every marketplace, one view',
    body: 'Flipkart, Meesho and Amazon profit together in a single dashboard.',
    icon: 'stack',
  },
  {
    title: 'Upload. See true profit.',
    body: 'Drop your settlement files and get net profit per SKU — returns and fees included.',
    icon: 'chart',
  },
];

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true
  );
}

function isMobile() {
  return window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 820;
}

function Glyph({ type }) {
  if (type === 'mark') {
    return (
      <svg viewBox="380 370 340 300" width="72" height="64" aria-hidden="true">
        <g fill="#fff">
          <path d="M715.28,537.19c-15.8,0-30.02,0.42-44.18-0.33c-3.15-0.17-7.1-3.85-8.94-6.95c-16.31-27.46-32.35-55.08-48.13-82.85c-2.93-5.16-6.21-7.13-12.2-7.08c-31.39,0.29-62.79-0.04-94.18,0.28c-6.95,0.07-11.4-1.8-14.72-8.17c-5.95-11.41-12.68-22.42-19.59-34.47c2.86-0.41,4.91-0.97,6.96-0.97c48.55-0.05,97.1-0.2,145.64,0.24c4.3,0.04,10.52,2.76,12.54,6.18c25.14,42.48,49.67,85.31,74.32,128.07C713.57,532.45,713.98,533.96,715.28,537.19z" />
          <path d="M545.6,550.21c55.91,0.06,111.82,0.1,167.74,0.2c3.53,0.01,7.06,0.39,10.59,0.59c-0.66,1.81-1.33,3.63-1.99,5.44c-3.93,6.91-7.85,13.81-11.78,20.72c-2.11,3.43-4.22,6.86-6.33,10.29c-1.91,2.48-3.82,4.95-5.73,7.43c-4.26,0.16-8.53,0.31-12.79,0.47c-8.42-0.02-16.85-0.03-25.27-0.05c-2.66-0.02-5.32-0.05-7.97-0.07c-38.95-0.11-77.9-0.17-116.85-0.39c-4.44-0.03-8.88-0.96-13.31-1.47C529.81,578.99,537.7,564.6,545.6,550.21z" />
          <path d="M545.6,550.21c-7.9,14.39-15.79,28.77-23.69,43.16c-4.86-7.45-10.04-14.72-14.52-22.39c-23.9-40.93-47.52-82.03-71.55-122.88c-3.55-6.03-3.96-10.7-0.09-16.74c7.08-11.05,13.34-22.63,21.07-35.95C487.07,448.15,516.34,499.18,545.6,550.21z" />
          <path d="M487.27,649.79c-7.85-12.89-15.92-25.65-23.51-38.7c-20.43-35.09-40.5-70.38-61.08-105.38c-3.57-6.08-3.88-10.8-0.07-16.78c6.89-10.82,13.07-22.09,20.72-35.17c30.27,52.59,59.7,103.73,89.13,154.86C504.05,622.34,495.66,636.07,487.27,649.79z" />
          <path d="M487.27,649.79c8.39-13.72,16.78-27.45,25.17-41.17c45.23-0.17,90.46-0.34,135.69-0.51c2.69,0.01,5.38,0.02,8.07,0.03c10.98,0,21.96,0,34.5,0c-5.98,11.29-10.75,20.27-15.51,29.26c-1.89,3.35-3.78,6.69-5.67,10.04c-3.32,1.33-6.6,3.66-9.97,3.8c-12.8,0.55-25.62,0.38-38.44,0.49c-4.55,0.02-9.1,0.04-13.65,0.05c-36.72-0.12-73.44-0.2-110.15-0.43C493.97,651.33,490.62,650.33,487.27,650.33z" />
        </g>
      </svg>
    );
  }
  if (type === 'stack') {
    return (
      <svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M32 8 56 20 32 32 8 20 32 8Z" />
        <path d="M8 32 32 44 56 32" />
        <path d="M8 44 32 56 56 44" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 56V8" />
      <path d="M8 56h48" />
      <rect x="18" y="34" width="8" height="14" rx="1.5" fill="#fff" stroke="none" />
      <rect x="32" y="24" width="8" height="24" rx="1.5" fill="#fff" stroke="none" />
      <rect x="46" y="16" width="8" height="32" rx="1.5" fill="#fff" stroke="none" />
    </svg>
  );
}

export default function Onboarding() {
  const [show, setShow] = useState(false);
  const [i, setI] = useState(0);
  const [closing, setClosing] = useState(false);
  const startX = useRef(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
    } catch {
      return;
    }
    // Onboarding is a mobile/app experience — skip it on desktop web.
    if (isStandalone() || isMobile()) setShow(true);
  }, []);

  function finish() {
    setClosing(true);
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {}
    setTimeout(() => setShow(false), 260);
  }

  function next() {
    if (i < SLIDES.length - 1) setI(i + 1);
    else finish();
  }

  function onTouchStart(e) {
    startX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e) {
    if (startX.current == null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    if (dx < -40 && i < SLIDES.length - 1) setI(i + 1);
    if (dx > 40 && i > 0) setI(i - 1);
    startX.current = null;
  }

  if (!show) return null;
  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;

  return (
    <div className={`pwa-ob ${closing ? 'pwa-ob--closing' : ''}`} role="dialog" aria-label="Welcome to ProfX">
      <button className="pwa-ob__skip" onClick={finish}>Skip</button>

      <div className="pwa-ob__stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="pwa-ob__art" key={i}>
          <div className="pwa-ob__ring">
            <Glyph type={slide.icon} />
          </div>
        </div>
        <div className="pwa-ob__copy" key={`c${i}`}>
          <h2>{slide.title}</h2>
          <p>{slide.body}</p>
        </div>
      </div>

      <div className="pwa-ob__foot">
        <div className="pwa-ob__dots">
          {SLIDES.map((_, d) => (
            <span key={d} className={`pwa-ob__dot ${d === i ? 'is-on' : ''}`} />
          ))}
        </div>
        <button className="pwa-ob__cta" onClick={next}>
          {last ? 'Get started' : 'Next'}
        </button>
      </div>
    </div>
  );
}
