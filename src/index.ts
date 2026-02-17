import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3100', 10);

// In-memory state storage
const appState: Record<string, unknown> = {
  startedAt: new Date().toISOString(),
  requests: 0,
};

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

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

export function serveStatic(filePath: string): Promise<{ content: Buffer; contentType: string } | null> {
  return new Promise((resolve) => {
    const fullPath = path.join(__dirname, '..', 'public', filePath);

    fs.readFile(fullPath, (err, data) => {
      if (err) {
        resolve(null);
        return;
      }
      resolve({
        content: data,
        contentType: getMimeType(filePath),
      });
    });
  });
}

export async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  appState.requests = (appState.requests as number) + 1;

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  let pathname = url.pathname;

  // Default to index.html for root path
  if (pathname === '/') {
    pathname = '/index.html';
  }

  // API endpoint for state
  if (pathname === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(appState, null, 2));
    return;
  }

  // Serve static files
  const staticFile = await serveStatic(pathname);
  if (staticFile) {
    res.writeHead(200, { 'Content-Type': staticFile.contentType });
    res.end(staticFile.content);
    return;
  }

  // 404 for missing files
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found', path: pathname }));
}

export function createServer(): http.Server {
  return http.createServer(handleRequest);
}

export function getAppState(): Record<string, unknown> {
  return appState;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createServer();

  server.listen(PORT, () => {
    console.log(`🚀 Ubot Core server running at http://localhost:${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}