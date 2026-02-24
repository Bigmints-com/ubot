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
import { createSoul } from './memory/soul.js';
import { createAgentOrchestrator } from './engine/orchestrator.js';
import { DEFAULT_AGENT_CONFIG } from './engine/types.js';
import { setSerperApiKey } from './capabilities/skills/web-search/adapters/serper.js';

// ─── UBOT_HOME + config.json resolution ────────────────────────────────────────
const UBOT_HOME = process.env.UBOT_HOME || '';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/** Shape of ~/.ubot/config.json */
export interface UbotConfig {
  server?: { port?: number };
  database?: { path?: string };
  llm?: { base_url?: string; model?: string; api_key?: string; google_api_key?: string };
  integrations?: { serper_api_key?: string };
  channels?: {
    whatsapp?: { enabled?: boolean };
    telegram?: { enabled?: boolean; token?: string };
  };
}

function loadUbotConfig(): UbotConfig {
  // Try UBOT_HOME first, then current directory
  const candidates = [
    UBOT_HOME ? path.join(UBOT_HOME, 'config.json') : '',
    path.join(process.cwd(), 'config.json'),
  ].filter(Boolean);

  for (const configPath of candidates) {
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(raw) as UbotConfig;
    } catch { /* try next */ }
  }
  return {}; // no config file found — use defaults
}

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
  migrations: [...defaultMigrations, ...conversationMigrations, ...memoryMigrations],
  autoMigrate: true,
});

// Initialize agent — read LLM config from config.json
const conversationStore = createConversationStore(db);
const memoryStore = createMemoryStore(db);
const soul = createSoul(memoryStore);
const agent = createAgentOrchestrator(
  {
    ...DEFAULT_AGENT_CONFIG,
    llmBaseUrl: ubotConfig.llm?.base_url || DEFAULT_AGENT_CONFIG.llmBaseUrl,
    llmModel: ubotConfig.llm?.model || DEFAULT_AGENT_CONFIG.llmModel,
    llmApiKey: ubotConfig.llm?.api_key || ubotConfig.llm?.google_api_key || DEFAULT_AGENT_CONFIG.llmApiKey,
  },
  conversationStore,
  memoryStore,
  soul,
);

// Initialize integrations from config.json
setSerperApiKey(ubotConfig.integrations?.serper_api_key);

// Initialize API with agent
initializeApi(db as any, agent);

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
  ? [path.join(UBOT_HOME, 'web'), path.join(UBOT_HOME, 'public'), path.join(process.cwd(), 'public')]
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

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  appState.requestCount++;
  
  const url = req.url || '/';
  const method = req.method || 'GET';
  
  // Health check endpoint
  if (url === '/health' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
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
  }
  
  // Serve static files (Next.js static export)
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
  
  return server;
}

function getAppState(): AppState {
  return { ...appState };
}

function resetState(): void {
  appState.requestCount = 0;
  appState.startedAt = new Date();
}

// Only start server if this is the main module (not during tests)
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`🚀 ${appState.name} v${appState.version} running at http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`📈 State API: http://localhost:${PORT}/api/state`);
  });
}

export { createServer, getAppState, AppState, handleRequest, resetState };