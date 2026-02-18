import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { handleApiRoute, initializeApi } from './api.js';
import { createConnection, createDefaultConfig } from './database/connection.js';
import { defaultMigrations } from './database/migrations.js';
import { createConversationStore, conversationMigrations } from './agent/conversation.js';
import { createMemoryStore, memoryMigrations } from './agent/memory-store.js';
import { createSoul } from './agent/soul.js';
import { createAgentOrchestrator } from './agent/orchestrator.js';
import { DEFAULT_AGENT_CONFIG } from './agent/types.js';

const PORT = parseInt(process.env.PORT || '4080', 10);

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
const dbPath = process.env.DATABASE_PATH || './data/ubot.db';
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

// Initialize agent
const conversationStore = createConversationStore(db);
const memoryStore = createMemoryStore(db);
const soul = createSoul(memoryStore);
const agent = createAgentOrchestrator(
  {
    ...DEFAULT_AGENT_CONFIG,
    llmBaseUrl: process.env.LLM_BASE_URL || DEFAULT_AGENT_CONFIG.llmBaseUrl,
    llmModel: process.env.LLM_MODEL || DEFAULT_AGENT_CONFIG.llmModel,
    llmApiKey: process.env.LLM_API_KEY || DEFAULT_AGENT_CONFIG.llmApiKey,
  },
  conversationStore,
  memoryStore,
  soul,
);

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

function serveStatic(filePath: string): Promise<{ content: Buffer; contentType: string } | null> {
  return new Promise((resolve) => {
    const fullPath = path.join(process.cwd(), 'public', filePath);
    
    fs.readFile(fullPath, (err, data) => {
      if (err) {
        resolve(null);
      } else {
        resolve({
          content: data,
          contentType: getMimeType(filePath),
        });
      }
    });
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
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ...appState,
      uptime: Date.now() - appState.startedAt.getTime(),
    }));
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