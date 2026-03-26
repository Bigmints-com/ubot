/**
 * UBOT Webchat Relay Server
 * 
 * A public cloud relay that sits between website visitors and a local UBOT instance.
 * 
 * Architecture:
 *   Visitor → Relay (this server, public) ← UBOT (local, polls outbound)
 * 
 * Visitor-facing:
 *   GET  /               — Standalone chat page (PWA-enabled)
 *   GET  /widget.js      — Embeddable widget script
 *   GET  /manifest.json  — PWA manifest
 *   GET  /sw.js          — Service worker
 *   GET  /api/config     — Widget config (title, color, welcome message)
 *   POST /api/message    — Send message (holds response until UBOT replies, 45s timeout)
 *   GET  /api/history    — Conversation history for a session
 * 
 * Bot-facing (authenticated with bot_secret):
 *   GET  /api/bot/poll   — Long-poll for pending visitor messages (25s timeout)
 *   POST /api/bot/reply  — Send response for a pending message
 *   POST /api/bot/config — Push widget config from UBOT
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const VERSION = '1.2.0'; // Extended timeout + typing indicators
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;

// ── In-Memory State ──────────────────────────────────────

/** Widget config (pushed by UBOT) */
let widgetConfig = {
  title: 'Chat with us',
  color: '#6366f1',
  welcomeMessage: 'Hi there! How can I help you today?',
  avatarUrl: '',
};

/** Bot secret for authenticating UBOT connections */
const BOT_SECRET = process.env.BOT_SECRET || '';

/**
 * Pending messages waiting for UBOT to process.
 * Map<messageId, { session, name, message, ownerKey, resolve, reject, timer }>
 */
const pendingMessages = new Map();

/**
 * Conversation history per session.
 * Map<sessionId, Array<{ role, content, timestamp }>>
 */
const conversationHistory = new Map();
const MAX_HISTORY = 100;

/**
 * Poll waiters — UBOT long-poll connections waiting for messages.
 * Set<{ resolve, timer }>
 */
const pollWaiters = new Set();

// ── Helpers ──────────────────────────────────────────────

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function jsonResponse(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Bot-Secret',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  });
  res.end(JSON.stringify(data));
}

function addToHistory(sessionId, role, content) {
  if (!conversationHistory.has(sessionId)) {
    conversationHistory.set(sessionId, []);
  }
  const history = conversationHistory.get(sessionId);
  history.push({ role, content, timestamp: new Date().toISOString() });
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

function validateBotSecret(req) {
  if (!BOT_SECRET) return true; // No secret configured = dev mode
  const header = req.headers['x-bot-secret'];
  const url = new URL(req.url, 'http://localhost');
  const param = url.searchParams.get('secret');
  return header === BOT_SECRET || param === BOT_SECRET;
}

function servePublicFile(res, filename, contentType) {
  try {
    const content = fs.readFileSync(path.join(__dirname, 'public', filename));
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': contentType.includes('javascript') ? 'public, max-age=300' : 'no-cache',
    });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

// ── Notify poll waiters ──────────────────────────────────

function notifyPollWaiters(message) {
  for (const waiter of pollWaiters) {
    clearTimeout(waiter.timer);
    waiter.resolve(message);
    pollWaiters.delete(waiter);
    break; // Only notify one waiter
  }
}

// ── Request Handler ──────────────────────────────────────

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Bot-Secret',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  // ── Static Files ───────────────────────────────────────

  if ((pathname === '/' || pathname.startsWith('/k/')) && method === 'GET') {
    if (servePublicFile(res, 'index.html', 'text/html')) return;
  }
  if (pathname === '/widget.js' && method === 'GET') {
    if (servePublicFile(res, 'widget.js', 'application/javascript')) return;
  }
  // Dynamic manifest — embeds owner key in start_url for PWA installs
  if (pathname === '/manifest.json' && method === 'GET') {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const key = urlObj.searchParams.get('key') || '';
    // Use path-based start_url so iOS preserves it on Add to Home Screen
    const startUrl = key ? `/k/${encodeURIComponent(key)}` : '/';
    const title = widgetConfig.title || 'UBOT Chat';
    const manifest = {
      name: title,
      short_name: title.length > 12 ? title.slice(0, 12) : title,
      description: `Chat — ${title}`,
      start_url: startUrl,
      scope: '/',
      display: 'standalone',
      background_color: '#09090b',
      theme_color: '#09090b',
      orientation: 'portrait',
      icons: [
        { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
        { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
      ],
    };
    jsonResponse(res, manifest);
    return;
  }
  if (pathname === '/sw.js' && method === 'GET') {
    if (servePublicFile(res, 'sw.js', 'application/javascript')) return;
  }
  if (pathname === '/icon-192.svg' && method === 'GET') {
    if (servePublicFile(res, 'icon-192.svg', 'image/svg+xml')) return;
  }
  if (pathname === '/icon-512.svg' && method === 'GET') {
    if (servePublicFile(res, 'icon-512.svg', 'image/svg+xml')) return;
  }

  // ── Visitor API ────────────────────────────────────────

  // Widget config
  if (pathname === '/api/config' && method === 'GET') {
    jsonResponse(res, widgetConfig);
    return;
  }

  // Send message (blocks until UBOT responds or timeout)
  if (pathname === '/api/message' && method === 'POST') {
    const body = await parseBody(req);
    const message = body.message || '';
    const session = body.session || '';
    const name = body.name || 'Website Visitor';
    const ownerKey = body.ownerKey || '';
    const audio = body.audio || '';    // base64 data URL for voice
    const image = body.image || '';    // base64 data URL for image

    if (!message.trim() && !audio && !image) {
      jsonResponse(res, { error: 'Message, audio, or image is required' }, 400);
      return;
    }

    if (!session) {
      jsonResponse(res, { error: 'Session is required' }, 400);
      return;
    }

    // Store in history
    addToHistory(session, 'user', message);

    // Create a pending message and wait for UBOT response
    const messageId = crypto.randomUUID();

    const responsePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingMessages.delete(messageId);
        resolve({ response: "I'm taking a bit longer than usual. Please try again in a moment.", timeout: true });
      }, 180000); // 180s timeout — agentic tasks (Playwright, web browsing) can take 2+ min

      pendingMessages.set(messageId, {
        id: messageId,
        session,
        name,
        message,
        ownerKey,
        audio,
        image,
        resolve,
        reject,
        timer,
        createdAt: Date.now(),
      });
    });

    // Notify any waiting UBOT poll
    notifyPollWaiters({
      id: messageId,
      session,
      name,
      message,
      ownerKey,
      audio,
      image,
    });

    // Wait for response
    const result = await responsePromise;

    // Store bot response in history
    if (result.response) {
      addToHistory(session, 'assistant', result.response);
    }

    jsonResponse(res, {
      response: result.response || '',
      sessionId: session,
    });
    return;
  }

  // Conversation history
  if (pathname === '/api/history' && method === 'GET') {
    const session = url.searchParams.get('session');
    if (!session) {
      jsonResponse(res, { error: 'session parameter is required' }, 400);
      return;
    }

    const history = conversationHistory.get(session) || [];
    jsonResponse(res, { messages: history, sessionId: session });
    return;
  }

  // ── Bot API (UBOT-facing) ─────────────────────────────

  // Long-poll for pending messages
  if (pathname === '/api/bot/poll' && method === 'GET') {
    if (!validateBotSecret(req)) {
      jsonResponse(res, { error: 'Invalid bot secret' }, 401);
      return;
    }

    // Check if there are already pending messages
    if (pendingMessages.size > 0) {
      const [, msg] = pendingMessages.entries().next().value;
      jsonResponse(res, {
        messages: [{
          id: msg.id,
          session: msg.session,
          name: msg.name,
          message: msg.message,
          ownerKey: msg.ownerKey || '',
          audio: msg.audio || '',
          image: msg.image || '',
        }],
      });
      return;
    }

    // No pending messages — long-poll (wait up to 25s)
    const pollResult = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        pollWaiters.delete(waiter);
        resolve(null);
      }, 25000);

      const waiter = { resolve, timer };
      pollWaiters.add(waiter);
    });

    if (pollResult) {
      jsonResponse(res, { messages: [pollResult] });
    } else {
      jsonResponse(res, { messages: [] });
    }
    return;
  }

  // UBOT sends a typing indicator to reset the pending message timer
  // and keep the visitor connection alive during long agentic tasks.
  if (pathname === '/api/bot/typing' && method === 'POST') {
    if (!validateBotSecret(req)) {
      jsonResponse(res, { error: 'Invalid bot secret' }, 401);
      return;
    }

    const body = await parseBody(req);
    const messageId = body.messageId;

    if (!messageId) {
      jsonResponse(res, { error: 'messageId is required' }, 400);
      return;
    }

    const pending = pendingMessages.get(messageId);
    if (!pending) {
      // Already replied or timed out — not an error
      jsonResponse(res, { ok: true, status: 'already_resolved' });
      return;
    }

    // Reset the timeout to give another 120s for complex tasks
    clearTimeout(pending.timer);
    pending.timer = setTimeout(() => {
      pendingMessages.delete(messageId);
      pending.resolve({ response: "I'm still working on this. Please check back in a moment.", timeout: true });
    }, 120000);

    jsonResponse(res, { ok: true });
    return;
  }

  // UBOT sends response for a pending message
  if (pathname === '/api/bot/reply' && method === 'POST') {
    if (!validateBotSecret(req)) {
      jsonResponse(res, { error: 'Invalid bot secret' }, 401);
      return;
    }

    const body = await parseBody(req);
    const messageId = body.messageId;
    const response = body.response || '';

    if (!messageId) {
      jsonResponse(res, { error: 'messageId is required' }, 400);
      return;
    }

    const pending = pendingMessages.get(messageId);
    if (!pending) {
      jsonResponse(res, { error: 'Message not found or already replied' }, 404);
      return;
    }

    clearTimeout(pending.timer);
    pending.resolve({ response });
    pendingMessages.delete(messageId);

    jsonResponse(res, { ok: true });
    return;
  }

  // UBOT pushes widget config
  if (pathname === '/api/bot/config' && method === 'POST') {
    if (!validateBotSecret(req)) {
      jsonResponse(res, { error: 'Invalid bot secret' }, 401);
      return;
    }

    const body = await parseBody(req);
    if (body.title) widgetConfig.title = body.title;
    if (body.color) widgetConfig.color = body.color;
    if (body.welcomeMessage) widgetConfig.welcomeMessage = body.welcomeMessage;
    if (body.avatarUrl) widgetConfig.avatarUrl = body.avatarUrl;

    jsonResponse(res, { ok: true, config: widgetConfig });
    return;
  }

  // Health check
  if (pathname === '/health') {
    jsonResponse(res, {
      status: 'ok',
      version: VERSION,
      pending: pendingMessages.size,
      sessions: conversationHistory.size,
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
}

// ── Start Server ─────────────────────────────────────────

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error('Request error:', err);
    res.writeHead(500);
    res.end('Internal Server Error');
  });
});

server.listen(PORT, () => {
  console.log(`🌐 Webchat Relay running on port ${PORT}`);
  console.log(`   Bot secret: ${BOT_SECRET ? '••••' + BOT_SECRET.slice(-4) : '(none - dev mode)'}`);
});
