'use strict';

/**
 * Keeps the instance from being spun down for inactivity.
 *
 * Render stops a free service after fifteen idle minutes, and starting it again
 * takes the better part of a minute. A packer who scans a parcel and waits that
 * long does not experience a cold start; they experience the app being broken.
 * A request every thirteen minutes from the instance to its own public URL is
 * traffic like any other, and the idle clock never runs out.
 *
 * What this cannot do is wake a service that is already asleep — nothing
 * running inside it can. It does not need to: the service is awake when it
 * boots, and from then on it is never idle long enough to be stopped. The gap
 * is a crash or a long outage, and an external pinger is the answer to that;
 * see SETUP_GUIDE.md.
 */

const MINUTES = Number(process.env.KEEP_AWAKE_MINUTES) || 13;
const TIMEOUT_MS = 20000;
const TZ = process.env.KEEP_AWAKE_TZ || 'Asia/Kolkata';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Render sets RENDER_EXTERNAL_URL itself, so this usually needs no config. */
function targetUrl() {
  const base = process.env.KEEP_AWAKE_URL || process.env.RENDER_EXTERNAL_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/api/health`;
}

/** The hour of the day, 0–23, where the seller actually is. */
function hourIn(tz) {
  try {
    const text = new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric', hour12: false, timeZone: tz,
    }).format(new Date());
    const h = parseInt(text, 10);
    return Number.isFinite(h) ? h % 24 : new Date().getHours();
  } catch {
    return new Date().getHours();   // an unknown timezone should not stop the ping
  }
}

/**
 * Whether now falls inside the waking hours.
 *
 * Unset means always, which is the simple thing to want. The option exists
 * because a free Render plan allows 750 instance-hours a month and staying up
 * around the clock spends about 730 of them, leaving nothing for anything else
 * on the account.
 */
function withinWindow() {
  const { KEEP_AWAKE_FROM: from, KEEP_AWAKE_TO: to } = process.env;
  if (from == null || to == null) return true;

  const f = Number(from);
  const t = Number(to);
  if (!Number.isFinite(f) || !Number.isFinite(t) || f === t) return true;

  const h = hourIn(TZ);
  // A window is allowed to run past midnight, e.g. 06 to 01.
  return f < t ? (h >= f && h < t) : (h >= f || h < t);
}

function disabled() {
  return /^(0|off|false|no)$/i.test(process.env.KEEP_AWAKE || '');
}

/**
 * Starts the ping loop. Returns the timer, or null when there is nothing to
 * ping — a local checkout, or a host that does not say what its URL is.
 */
function startKeepAwake() {
  if (disabled()) {
    console.log('[keep-awake] off (KEEP_AWAKE)');
    return null;
  }

  const url = targetUrl();
  if (!url) return null;

  let failures = 0;
  let lastReport = Date.now();

  const ping = async () => {
    if (!withinWindow()) return;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'user-agent': 'profx-keep-awake' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      failures = 0;

      // One line a day, not a hundred: enough to show it is still running,
      // little enough to leave the logs worth reading.
      if (Date.now() - lastReport >= DAY_MS) {
        lastReport = Date.now();
        console.log(`[keep-awake] still up, pinging every ${MINUTES} min`);
      }
    } catch (err) {
      failures += 1;
      // Worth saying every time: while this is failing, the service will sleep.
      console.warn(`[keep-awake] ping failed (${failures} in a row): ${err.message}`);
    }
  };

  const period = MINUTES * 60 * 1000;
  // A little scatter so the ping does not land on the same second as
  // everything else that runs on a schedule — but never a large share of the
  // period itself, or the gap between two pings stops being predictable.
  const spread = Math.min(30000, Math.floor(period * 0.1));

  const timer = setInterval(() => {
    const jitter = setTimeout(ping, Math.floor(Math.random() * spread));
    if (jitter.unref) jitter.unref();
  }, period);

  // Never hold the process open on shutdown.
  if (timer.unref) timer.unref();

  console.log(`[keep-awake] ${url} every ${MINUTES} min`);
  // The first ping is a whole period away on purpose: booting is itself the
  // traffic that just reset the idle clock.
  return timer;
}

module.exports = { startKeepAwake, withinWindow, hourIn, targetUrl };
