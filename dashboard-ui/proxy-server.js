/**
 * Local proxy server that adds Google Cloud identity tokens to requests
 * This allows local development against Cloud Run services that require IAM auth
 *
 * Usage: node proxy-server.js
 * Then set VITE_API_BASE_URL=http://localhost:3000 in your .env.local
 */

import http from 'http';
import https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const PROXY_PORT = 3000;
const BACKEND_URL = 'https://thesis-validator-792842314050.us-central1.run.app';

let cachedToken = null;
let tokenExpiry = 0;

async function getIdentityToken() {
  const now = Date.now();
  // Refresh token if expired or within 5 minutes of expiry
  if (cachedToken && tokenExpiry > now + 5 * 60 * 1000) {
    return cachedToken;
  }

  try {
    const { stdout } = await execAsync('gcloud auth print-identity-token');
    cachedToken = stdout.trim();
    // Tokens are valid for 1 hour, cache for 55 minutes
    tokenExpiry = now + 55 * 60 * 1000;
    console.log('[Proxy] Refreshed identity token');
    return cachedToken;
  } catch (error) {
    console.error('[Proxy] Failed to get identity token:', error.message);
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const token = await getIdentityToken();
    const url = new URL(req.url, BACKEND_URL);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: req.method,
      headers: {
        ...req.headers,
        'host': url.hostname,
        'authorization': `Bearer ${token}`,
      },
    };

    // Remove headers that shouldn't be forwarded
    delete options.headers['connection'];
    delete options.headers['upgrade'];

    console.log(`[Proxy] ${req.method} ${req.url} -> ${BACKEND_URL}${req.url}`);

    const proxyReq = https.request(options, (proxyRes) => {
      // Merge CORS headers with proxy response headers
      const responseHeaders = {
        ...proxyRes.headers,
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'access-control-allow-headers': 'Content-Type, Authorization',
      };

      res.writeHead(proxyRes.statusCode, responseHeaders);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (error) => {
      console.error('[Proxy] Request error:', error.message);
      res.writeHead(502);
      res.end(JSON.stringify({ error: 'Bad Gateway', message: error.message }));
    });

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.writeHead(204);
      res.end();
      return;
    }

    req.pipe(proxyReq);
  } catch (error) {
    console.error('[Proxy] Error:', error.message);
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Internal Server Error', message: error.message }));
  }
});

server.listen(PROXY_PORT, () => {
  console.log(`[Proxy] Local authentication proxy running on http://localhost:${PROXY_PORT}`);
  console.log(`[Proxy] Forwarding requests to ${BACKEND_URL}`);
  console.log('[Proxy] Make sure you are logged in with: gcloud auth login');
});
