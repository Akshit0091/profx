const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_OAUTH_CLIENT_SECRET;
const SITE_URL = process.env.SITE_URL || 'https://profx.website';

// Step 1: Redirect the user to GitHub for authorization
router.get('/auth', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `https://${req.get('host')}/oauth/callback`,
    scope: 'repo,user',
    state,
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// Step 2: GitHub redirects here with a code; exchange it for a token
router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');

  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
      }),
    });
    const data = await response.json();

    if (data.error) {
      return res.status(401).send(`GitHub error: ${data.error_description || data.error}`);
    }

    // Decap expects the token posted back to the opener window via postMessage
    const script = `
      <script>
        (function() {
          function recieveMessage(e) {
            console.log("recieveMessage %o", e);
            window.opener.postMessage(
              'authorization:github:success:${JSON.stringify({ token: data.access_token, provider: 'github' })}',
              e.origin
            );
          }
          window.addEventListener("message", recieveMessage, false);
          window.opener.postMessage("authorizing:github", "*");
        })();
      </script>
    `;
    res.send(script);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('OAuth exchange failed');
  }
});

module.exports = router;