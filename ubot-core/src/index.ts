import http from 'http';
import fs from 'fs';
import path from 'path';

import { handleApiRoute, initializeApi } from './api/index.js';
import { metricsCollector } from './metrics/index.js';
import { log } from './logger/ring-buffer.js';
import { createConnection, createDefaultConfig } from './data/database/connection.js';
import { defaultMigrations } from './data/database/migrations.js';
import { createConversationStore, conversationMigrations } from './memory/conversation.js';
import { createMemoryStore, memoryMigrations } from './memory/memory-store.js';
import { createFollowUpStore, followUpMigrations } from './memory/followups.js';
import { todoMigrations } from './engine/todo-store.js';
import { initMetering } from './engine/metering.js';
import { createSoul } from './memory/soul.js';
import { createAgentOrchestrator } from './engine/orchestrator.js';
import { DEFAULT_AGENT_CONFIG } from './engine/types.js';
import { setSerperApiKey } from './capabilities/web-search/adapters/serper.js';
import { loadUbotConfig, type UbotConfig } from './data/config.js';
import { FEATURES, MODE } from './lib/features.js';
import { getHooks } from './hooks/extensions.js';

// ─── UBOT_HOME resolution ──────────────────────────────────────────────────────
const UBOT_HOME = process.env.UBOT_HOME || '';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const ubotConfig = loadUbotConfig();
const PORT = ubotConfig.server?.port ?? 11490;

// In-memory application state
interface AppState {
  name: string;
  version: string;
  startedAt: Date;
  requestCount: number;
}

const appState: AppState = {
  name: 'Ubot Core',
  version: '1.0.0',
  startedAt: new Date(),
  requestCount: 0,
};

// Initialize database
const dbPath = ubotConfig.database?.path
  ? (path.isAbsolute(ubotConfig.database.path)
    ? ubotConfig.database.path
    : path.join(UBOT_HOME || process.cwd(), ubotConfig.database.path))
  : (UBOT_HOME ? path.join(UBOT_HOME, 'data', 'ubot.db') : './data/ubot.db');
// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = createConnection({
  config: createDefaultConfig(dbPath),
  migrations: [...defaultMigrations, ...conversationMigrations, ...memoryMigrations, ...followUpMigrations, ...todoMigrations],
  autoMigrate: true,
});

// Initialize LLM usage metering
initMetering(db);

// Initialize agent — read LLM config from config.json
const WORKSPACE_PATH = UBOT_HOME 
  ? path.join(UBOT_HOME, 'workspace') 
  : path.join(process.cwd(), 'workspace');

const conversationStore = createConversationStore(db);
const memoryStore = createMemoryStore(db);
const followUpStore = createFollowUpStore(db);
const soul = createSoul(memoryStore, WORKSPACE_PATH);

// Initial sync of soul documents to filesystem
soul.syncToFilesystem();
const agent = createAgentOrchestrator(
  {
    ...DEFAULT_AGENT_CONFIG,
    llmBaseUrl: ubotConfig.llm?.base_url || DEFAULT_AGENT_CONFIG.llmBaseUrl,
    llmModel: ubotConfig.llm?.model || DEFAULT_AGENT_CONFIG.llmModel,
    llmApiKey: ubotConfig.llm?.api_key || ubotConfig.llm?.google_api_key || DEFAULT_AGENT_CONFIG.llmApiKey,
  },
  conversationStore,
  memoryStore,
  followUpStore,
  soul,
  db as any,
  WORKSPACE_PATH,
);

// Initialize integrations from config.json
const serperCfg = ubotConfig.capabilities?.search?.providers?.serper;
setSerperApiKey(serperCfg?.enabled !== false ? (serperCfg?.apiKey as string || null) : null);

// Initialize API with agent
initializeApi(db as any, agent, WORKSPACE_PATH, followUpStore);

// MIME types for static file serving
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

// In production, serve the static Next.js export from UBOT_HOME/web/
// In development, serve from ./public
const STATIC_DIRS = IS_PRODUCTION && UBOT_HOME
  ? [path.join(UBOT_HOME, 'web')]
  : [path.join(process.cwd(), 'public')];

function serveStatic(filePath: string): Promise<{ content: Buffer; contentType: string } | null> {
  return new Promise((resolve) => {
    // Try each static directory in order
    const tryDir = (dirs: string[]) => {
      if (dirs.length === 0) { resolve(null); return; }
      const fullPath = path.join(dirs[0], filePath);
      fs.readFile(fullPath, (err, data) => {
        if (err) {
          tryDir(dirs.slice(1));
        } else {
          resolve({ content: data, contentType: getMimeType(filePath) });
        }
      });
    };
    tryDir([...STATIC_DIRS]);
  });
}

import crypto from 'crypto';

// ─── Session store for access gate ────────────────────────────────────────────
const activeSessions = new Map<string, { createdAt: number }>();
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SESSION_COOKIE_NAME = 'ubot_session';

function createSession(): string {
  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.set(token, { createdAt: Date.now() });
  return token;
}

function validateSession(token: string): boolean {
  const session = activeSessions.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_MAX_AGE_MS) {
    activeSessions.delete(token);
    return false;
  }
  return true;
}

function getSessionFromCookie(req: http.IncomingMessage): string | null {
  const cookies = req.headers.cookie || '';
  const match = cookies.split(';').map(c => c.trim()).find(c => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  return match ? match.split('=')[1] : null;
}

function setSessionCookie(res: http.ServerResponse, token: string): void {
  const maxAge = SESSION_MAX_AGE_MS / 1000;
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`);
}

function clearSessionCookie(res: http.ServerResponse): void {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  appState.requestCount++;
  
  const url = req.url || '/';
  const method = req.method || 'GET';

  // ── Extension middleware hook — runs before all routing ──
  const hooks = getHooks();
  if (hooks.middleware?.onRequest) {
    const handled = await hooks.middleware.onRequest(req, res, url, method);
    if (handled) return;
  }

  // ── Server-level access gate ──────────────────────────────
  // If server.access_password is set in config.json, require authentication
  // for API requests. Frontend pages are always served (AuthGate handles login UI).
  const accessPassword = ubotConfig.server?.access_password;
  const accessUsername = ubotConfig.server?.access_username || 'admin';
  
  if (accessPassword && method !== 'OPTIONS') {
    // Only gate API endpoints — frontend pages/assets must always load
    // so the AuthGate component can render the login form
    const isApiRoute = url.startsWith('/api/');
    const isPublicApi = url === '/api/health' 
      || url.startsWith('/api/webchat/')
      || url.startsWith('/api/auth/');
    
    if (isApiRoute && !isPublicApi) {
      const authHeader = req.headers['authorization'] || '';
      let authorized = false;
      
      // Check 1: Valid session cookie
      const sessionToken = getSessionFromCookie(req);
      if (sessionToken && validateSession(sessionToken)) {
        authorized = true;
      }
      
      // Check 2: Valid Bearer API key (for programmatic access)
      if (!authorized && authHeader.startsWith('Bearer ')) {
        const { authenticate: apiAuth } = await import('./api/middleware/auth.js');
        const result = apiAuth(req);
        if (result.authenticated && result.clientName !== 'default (no keys configured)') {
          authorized = true;
        }
      }
      
      if (!authorized) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }
  }

  // ── Auth endpoints (login / logout / status) ──────────────
  if (url === '/api/auth/status' && method === 'GET') {
    const requiresAuth = !!accessPassword;
    if (!requiresAuth) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ authenticated: true, authRequired: false }));
      return;
    }
    const token = getSessionFromCookie(req);
    const valid = token ? validateSession(token) : false;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ authenticated: valid, authRequired: true }));
    return;
  }

  if (url === '/api/auth/login' && method === 'POST') {
    if (!accessPassword) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'No auth required' }));
      return;
    }
    
    const body = await new Promise<string>((resolve) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => resolve(data));
    });
    
    try {
      const { username, password } = JSON.parse(body);
      if (username === accessUsername && password === accessPassword) {
        const token = createSession();
        setSessionCookie(res, token);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid username or password' }));
      }
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid request body' }));
    }
    return;
  }

  if (url === '/api/auth/logout' && method === 'POST') {
    const token = getSessionFromCookie(req);
    if (token) activeSessions.delete(token);
    clearSessionCookie(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }
  
  // Health check endpoint
  if (url === '/health' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  // Feature flags endpoint — used by frontend to know available features
  if (url === '/api/features' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ mode: MODE, features: FEATURES }));
    return;
  }
  
  // API endpoint for app state
  if (url === '/api/state' && method === 'GET') {
    const metrics = metricsCollector.getSummary();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ...appState,
      uptime: Date.now() - appState.startedAt.getTime(),
      metrics: {
        channels: metrics.channels,
        totals: metrics.totals,
      },
    }));
    return;
  }

  // Full metrics endpoint
  if (url === '/api/metrics' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(metricsCollector.getSummary()));
    return;
  }

  // Live logs endpoint (cursor-based polling)
  if (url.startsWith('/api/logs') && method === 'GET') {
    const params = new URL(url, `http://localhost`).searchParams;
    const since = params.has('since') ? Number(params.get('since')) : -1;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(log.getEntries(since)));
    return;
  }
  
  // Route all /api/* to the API router
  if (url.startsWith('/api/')) {
    const handled = await handleApiRoute(req, res, url, method);
    if (handled) return;

    // Extension route hook — handle fork-specific API routes
    if (hooks.routes?.handleRoute) {
      const extHandled = await hooks.routes.handleRoute(req, res, url, method);
      if (extHandled) return;
    }
  }

  // Serve frontend pages
  if (!IS_PRODUCTION) {
    // ── Dev mode: proxy to Next.js dev server for hot reload ──────────
    const DEV_FRONTEND_PORT = parseInt(process.env.DEV_FRONTEND_PORT || '3015', 10);
    const proxyReq = http.request(
      {
        hostname: 'localhost',
        port: DEV_FRONTEND_PORT,
        path: url,
        method: method,
        headers: { ...req.headers, host: `localhost:${DEV_FRONTEND_PORT}` },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      }
    );
    proxyReq.on('error', () => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`Frontend dev server not ready (port ${DEV_FRONTEND_PORT}). Run: cd web && npm run dev`);
    });
    req.pipe(proxyReq, { end: true });
    return;
  }

  // ── Production: serve static files (Next.js static export) ─────────
  let filePath = url === '/' ? '/index.html' : url;
  
  // Security: prevent directory traversal
  if (filePath.includes('..')) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  
  // Try exact path, then .html suffix, then /index.html (Next.js static export routes)
  let file = await serveStatic(filePath);
  if (!file && !path.extname(filePath)) {
    file = await serveStatic(filePath + '.html');
    if (!file) file = await serveStatic(filePath + '/index.html');
  }
  
  if (file) {
    // Cache static assets, no-cache for HTML
    const cacheControl = file.contentType === 'text/html' 
      ? 'no-cache, no-store, must-revalidate' 
      : 'public, max-age=31536000, immutable';
    res.writeHead(200, { 'Content-Type': file.contentType, 'Cache-Control': cacheControl });
    res.end(file.content);
  } else {
    // SPA fallback: serve index.html for non-API, non-static routes
    if (!url.startsWith('/api/') && !url.startsWith('/health')) {
      const indexFile = await serveStatic('/index.html');
      if (indexFile) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(indexFile.content);
        return;
      }
    }
    
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
}

function createServer(): http.Server {
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      console.error('Request handler error:', error);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    });
  });

  // In dev mode, proxy WebSocket upgrades to Next.js dev server for HMR
  if (!IS_PRODUCTION) {
    const net = require('net');
    const DEV_FRONTEND_PORT = parseInt(process.env.DEV_FRONTEND_PORT || '3015', 10);
    server.on('upgrade', (req: http.IncomingMessage, socket: any, head: Buffer) => {
      const proxySocket = net.connect(DEV_FRONTEND_PORT, 'localhost', () => {
        proxySocket.write(
          `${req.method} ${req.url} HTTP/1.1\r\n` +
          Object.entries(req.headers)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\r\n') +
          '\r\n\r\n'
        );
        if (head.length) proxySocket.write(head);
        socket.pipe(proxySocket).pipe(socket);
      });
      proxySocket.on('error', () => socket.destroy());
      socket.on('error', () => proxySocket.destroy());
    });
  }

  // Extension server start hook
  const hooks = getHooks();
  if (hooks.middleware?.onServerStart) {
    hooks.middleware.onServerStart(server);
  }
  
  return server;
}

function getAppState(): AppState {
  return { ...appState };
}

function resetState(): void {
  appState.requestCount = 0;
  appState.startedAt = new Date();
}

// Load extensions if available
async function loadExtensions(): Promise<void> {
  // Try to load ubot.extensions.ts/js from UBOT_HOME or current directory
  const searchDirs = UBOT_HOME ? [UBOT_HOME, process.cwd()] : [process.cwd()];
  for (const dir of searchDirs) {
    for (const ext of ['ubot.extensions.js', 'ubot.extensions.ts']) {
      const extPath = path.join(dir, ext);
      if (fs.existsSync(extPath)) {
        try {
          const mod = await import(extPath);
          if (mod.default && typeof mod.default === 'function') {
            await mod.default();
          } else if (mod.register && typeof mod.register === 'function') {
            await mod.register();
          }
          console.log(`[Extensions] Loaded: ${extPath}`);
          return;
        } catch (err: any) {
          console.error(`[Extensions] Failed to load ${extPath}:`, err.message);
        }
      }
    }
  }
}

// Only start server if this is the main module (not during tests)
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  // Load extensions first, then start
  loadExtensions().then(() => {
    const server = createServer();
    server.listen(PORT, () => {
      console.log(`🚀 ${appState.name} v${appState.version} running at http://localhost:${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`📈 State API: http://localhost:${PORT}/api/state`);
      console.log(`[UBOT] Mode: ${MODE.toUpperCase()} | Features: WA=${FEATURES.whatsapp} TG=${FEATURES.telegram} FS=${FEATURES.filesystem} CLI=${FEATURES.cli}`);
    });
  });
}

export { createServer, getAppState, AppState, handleRequest, resetState };