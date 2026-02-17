import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = parseInt(process.env.PORT || '3100', 10);

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
  
  // API endpoint for app state
  if (url === '/api/state' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ...appState,
      uptime: Date.now() - appState.startedAt.getTime(),
    }));
    return;
  }
  
  // Health check endpoint
  if (url === '/health' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }
  
  // Serve static files
  let filePath = url === '/' ? '/index.html' : url;
  
  // Security: prevent directory traversal
  if (filePath.includes('..')) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  
  const file = await serveStatic(filePath);
  
  if (file) {
    res.writeHead(200, { 'Content-Type': file.contentType });
    res.end(file.content);
  } else {
    // For SPA: serve index.html for unmatched routes (except API routes)
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