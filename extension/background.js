// background.js — the extension's only route to the ProfX API.
//
// The content script runs on supplier.meesho.com, so anything it fetches from
// another origin is a cross-origin request subject to CORS. The service worker
// is not, and it is also the only place the login token is held: keeping it out
// of the page means Meesho's own scripts can never read it.

const DEFAULTS = {
  apiUrl: 'http://localhost:5000/api',
  token: '',
  email: '',
};

async function settings() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
}

function apiBase(url) {
  return String(url || '').replace(/\/+$/, '');
}

async function call(path, { method = 'GET', body, auth = true } = {}) {
  const { apiUrl, token } = await settings();
  if (!apiUrl) throw new Error('Set your ProfX address in the extension popup first.');
  if (auth && !token) throw new Error('Sign in from the extension popup first.');

  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${apiBase(apiUrl)}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error(`Could not reach ProfX at ${apiBase(apiUrl)} — is the address right and the server up?`);
  }

  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* non-JSON error page */ }

  if (res.status === 401) {
    await chrome.storage.local.set({ token: '' });
    throw new Error('Your ProfX session expired. Sign in again from the popup.');
  }
  if (!res.ok) throw new Error(data.error || `ProfX returned ${res.status}`);
  return data;
}

const handlers = {
  async login({ email, password }) {
    const data = await call('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });
    if (!data.token) throw new Error('ProfX did not return a token.');
    await chrome.storage.local.set({ token: data.token, email });
    return { email };
  },

  async logout() {
    await chrome.storage.local.set({ token: '', email: '' });
    return {};
  },

  async stats() {
    return call('/scan/stats');
  },

  async ingest({ items }) {
    return call('/scan/ingest', { method: 'POST', body: { items } });
  },

  async status() {
    const { apiUrl, email, token } = await settings();
    return { apiUrl, email, signedIn: Boolean(token) };
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler) {
    sendResponse({ ok: false, error: `Unknown request: ${msg?.type}` });
    return false;
  }
  handler(msg.payload || {})
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));
  return true; // keeps the message channel open for the async reply
});
