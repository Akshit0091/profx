// popup.js — signing in and seeing how much of the catalogue is covered.

const $ = (id) => document.getElementById(id);

function say(text, kind = '') {
  const el = $('msg');
  el.textContent = text;
  el.className = `msg ${kind}`;
}

function send(type, payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!res?.ok) return reject(new Error(res?.error || 'Something went wrong'));
      resolve(res.data);
    });
  });
}

/**
 * The API can live anywhere, so its host is not in the manifest. Chrome grants
 * it at runtime instead, which keeps the install prompt down to Meesho alone.
 */
async function grantHost(apiUrl) {
  let origin;
  try {
    origin = `${new URL(apiUrl).origin}/*`;
  } catch {
    throw new Error('That does not look like a web address.');
  }
  if (await chrome.permissions.contains({ origins: [origin] })) return;
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) throw new Error('ProfX needs permission to reach that address.');
}

function renderStats(s) {
  const missing = s.skusMissingImage || 0;
  $('stats').innerHTML = `
    <div><span>Labels indexed</span><b>${s.labels ?? 0}</b></div>
    <div><span>Products pictured</span><b>${s.images ?? 0}</b></div>
    <div><span>Products still missing a photo</span><b>${missing}</b></div>
  `;
}

async function showSignedIn(email) {
  $('signed-out').classList.add('hidden');
  $('signed-in').classList.remove('hidden');
  $('who').textContent = email || '';
  try {
    renderStats(await send('stats'));
  } catch (err) {
    say(err.message, 'error');
  }
}

function showSignedOut(apiUrl, email) {
  $('signed-in').classList.add('hidden');
  $('signed-out').classList.remove('hidden');
  $('apiUrl').value = apiUrl || '';
  $('email').value = email || '';
}

$('login').addEventListener('click', async () => {
  const apiUrl = $('apiUrl').value.trim();
  const email = $('email').value.trim();
  const password = $('password').value;

  if (!apiUrl || !email || !password) return say('Fill in all three fields.', 'error');

  $('login').disabled = true;
  say('Signing in…');
  try {
    await grantHost(apiUrl);
    await chrome.storage.local.set({ apiUrl });
    await send('login', { email, password });
    $('password').value = '';
    say('');
    await showSignedIn(email);
  } catch (err) {
    say(err.message, 'error');
  } finally {
    $('login').disabled = false;
  }
});

$('logout').addEventListener('click', async () => {
  await send('logout');
  const { apiUrl } = await chrome.storage.local.get('apiUrl');
  showSignedOut(apiUrl, '');
  say('');
});

$('refresh').addEventListener('click', async () => {
  say('Refreshing…');
  try {
    renderStats(await send('stats'));
    say('');
  } catch (err) {
    say(err.message, 'error');
  }
});

(async () => {
  const status = await send('status');
  if (status.signedIn) await showSignedIn(status.email);
  else showSignedOut(status.apiUrl, status.email);
})();
