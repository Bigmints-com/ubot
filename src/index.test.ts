import { describe, it, expect, beforeEach } from 'vitest';
import { createServer, getMimeType, getAppState } from './index.js';
import http from 'node:http';

describe('Ubot Core', () => {
  describe('getMimeType', () => {
    it('should return correct mime type for HTML files', () => {
      expect(getMimeType('index.html')).toBe('text/html');
    });

    it('should return correct mime type for CSS files', () => {
      expect(getMimeType('styles.css')).toBe('text/css');
    });

    it('should return correct mime type for JavaScript files', () => {
      expect(getMimeType('app.js')).toBe('application/javascript');
    });

    it('should return correct mime type for JSON files', () => {
      expect(getMimeType('data.json')).toBe('application/json');
    });

    it('should return correct mime type for PNG files', () => {
      expect(getMimeType('image.png')).toBe('image/png');
    });

    it('should return octet-stream for unknown extensions', () => {
      expect(getMimeType('file.unknown')).toBe('application/octet-stream');
    });
  });

  describe('getAppState', () => {
    it('should return app state with startedAt', () => {
      const state = getAppState();
      expect(state).toHaveProperty('startedAt');
      expect(typeof state.startedAt).toBe('string');
    });

    it('should return app state with requests counter', () => {
      const state = getAppState();
      expect(state).toHaveProperty('requests');
      expect(typeof state.requests).toBe('number');
    });
  });

  describe('createServer', () => {
    let server: http.Server;

    beforeEach(() => {
      server = createServer();
    });

    it('should create an HTTP server', () => {
      expect(server).toBeInstanceOf(http.Server);
    });

    it('should respond to /api/state endpoint', async () => {
      await new Promise<void>((resolve) => {
        server.listen(0, () => {
          const address = server.address() as { port: number };
          const options = {
            hostname: 'localhost',
            port: address.port,
            path: '/api/state',
            method: 'GET',
          };

          const req = http.request(options, (res) => {
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toBe('application/json');
            
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              const body = JSON.parse(data);
              expect(body).toHaveProperty('startedAt');
              expect(body).toHaveProperty('requests');
              server.close(() => resolve());
            });
          });

          req.on('error', () => {
            server.close(() => resolve());
          });
          req.end();
        });
      });
    });

    it('should return 404 for non-existent paths', async () => {
      await new Promise<void>((resolve) => {
        server.listen(0, () => {
          const address = server.address() as { port: number };
          const options = {
            hostname: 'localhost',
            port: address.port,
            path: '/non-existent-path-12345',
            method: 'GET',
          };

          const req = http.request(options, (res) => {
            expect(res.statusCode).toBe(404);
            server.close(() => resolve());
          });

          req.on('error', () => {
            server.close(() => resolve());
          });
          req.end();
        });
      });
    });
  });
});