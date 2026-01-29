/**
 * API Key Proxy Server
 *
 * Routes API calls through GCE and injects API keys.
 * Claude CLI/Gemini in Modal Sandbox connect here instead of directly to APIs.
 *
 * Security:
 * - URL path secret validation (/a/{secret}/ and /g/{secret}/)
 * - Modal Proxy static IP restriction (via Nginx)
 * - Rate limiting (per-IP, global limits)
 * - TLS encryption (via Nginx + Let's Encrypt)
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PROXY_SECRET = process.env.PROXY_INTERNAL_SECRET;

if (!PROXY_SECRET) {
  console.error('FATAL: PROXY_INTERNAL_SECRET not configured');
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('FATAL: ANTHROPIC_API_KEY not configured');
  process.exit(1);
}

if (!process.env.GEMINI_API_KEY) {
  console.error('FATAL: GEMINI_API_KEY not configured');
  process.exit(1);
}

// Rate limiting
// NOTE: Modal Proxy uses static IP, so all users share same IP
// Set generous limits; per-user limiting should be done at app level
const anthropicLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // 300 requests/min (all users combined)
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

const geminiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600, // 600 requests/min (all users combined)
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Request logging (mask secrets in path)
app.use((req, res, next) => {
  const maskedPath = req.path.replace(/^\/(a|g)\/[^/]+/, '/$1/****');
  console.log(`[${new Date().toISOString()}] ${req.method} ${maskedPath} from ${req.ip}`);
  next();
});

// Health check (no auth required - for monitoring)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// URL path secret validation middleware
const validatePathSecret = (req, res, next) => {
  const pathSecret = req.params.secret;
  if (pathSecret !== PROXY_SECRET) {
    console.log(`[AUTH FAIL] Invalid secret from ${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Anthropic API Proxy
// URL: /a/{secret}/v1/messages
app.use('/a/:secret', validatePathSecret, anthropicLimiter, createProxyMiddleware({
  target: 'https://api.anthropic.com',
  changeOrigin: true,
  pathRewrite: (path) => path.replace(/^\/a\/[^/]+/, ''),
  on: {
    proxyReq: (proxyReq, req) => {
      // Inject API key
      proxyReq.setHeader('x-api-key', process.env.ANTHROPIC_API_KEY);
      // Ensure anthropic-version header is set
      if (!proxyReq.getHeader('anthropic-version')) {
        proxyReq.setHeader('anthropic-version', '2023-06-01');
      }
      const maskedPath = req.path.replace(/^\/a\/[^/]+/, '/a/****');
      console.log(`[ANTHROPIC] ${req.method} ${maskedPath}`);
    },
    error: (err, req, res) => {
      console.error(`[ANTHROPIC ERROR] ${err.message}`);
      if (res.writeHead) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Proxy error' }));
      }
    },
  },
}));

// Gemini API Proxy
// URL: /g/{secret}/v1beta/models/...
app.use('/g/:secret', validatePathSecret, geminiLimiter, createProxyMiddleware({
  target: 'https://generativelanguage.googleapis.com',
  changeOrigin: true,
  pathRewrite: (path) => path.replace(/^\/g\/[^/]+/, ''),
  on: {
    proxyReq: (proxyReq, req) => {
      // Append API key to query string
      const url = new URL(proxyReq.path, 'https://generativelanguage.googleapis.com');
      url.searchParams.set('key', process.env.GEMINI_API_KEY);
      proxyReq.path = url.pathname + url.search;
      const maskedPath = req.path.replace(/^\/g\/[^/]+/, '/g/****');
      console.log(`[GEMINI] ${req.method} ${maskedPath}`);
    },
    error: (err, req, res) => {
      console.error(`[GEMINI ERROR] ${err.message}`);
      if (res.writeHead) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Proxy error' }));
      }
    },
  },
}));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Listen only on localhost (Nginx handles external traffic)
const PORT = process.env.PORT || 3100;
const HOST = process.env.HOST || '127.0.0.1';

app.listen(PORT, HOST, () => {
  console.log(`API Proxy listening on ${HOST}:${PORT}`);
  console.log('Endpoints:');
  console.log('  /a/{secret}/* -> api.anthropic.com');
  console.log('  /g/{secret}/* -> generativelanguage.googleapis.com');
  console.log('  /health -> Health check');
});
