import { describe, it, expect, beforeEach, vi } from 'vitest';
import http from 'http';
import { createServer, getAppState, handleRequest, resetState } from './index';

describe('Ubot Core', () => {
  describe('getAppState', () => {
    it('should return the current application state', () => {
      const state = getAppState();
      expect(state.name).toBe('Ubot Core');
      expect(state.version).toBe('1.0.0');
      expect(state.startedAt).toBeInstanceOf(Date);
      expect(typeof state.requestCount).toBe('number');
    });
  });

  describe('createServer', () => {
    it('should create an HTTP server instance', () => {
      const server = createServer();
      expect(server).toBeInstanceOf(http.Server);
    });
  });

  describe('handleRequest', () => {
    let mockRes: {
      writeHead: ReturnType<typeof vi.fn>;
      end: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      resetState();
      mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
      };
    });

    it('should handle /health endpoint', async () => {
      const req = { url: '/health', method: 'GET' } as http.IncomingMessage;
      await handleRequest(req, mockRes as unknown as http.ServerResponse);
      
      expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
      const responseData = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(responseData.status).toBe('ok');
      expect(responseData.timestamp).toBeDefined();
    });

    it('should handle /api/state endpoint', async () => {
      const req = { url: '/api/state', method: 'GET' } as http.IncomingMessage;
      await handleRequest(req, mockRes as unknown as http.ServerResponse);
      
      expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
      const responseData = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(responseData.name).toBe('Ubot Core');
      expect(responseData.version).toBe('1.0.0');
      expect(responseData.uptime).toBeDefined();
    });

    it('should increment request count on each request', async () => {
      const req = { url: '/health', method: 'GET' } as http.IncomingMessage;
      
      await handleRequest(req, mockRes as unknown as http.ServerResponse);
      const state1 = getAppState();
      
      await handleRequest(req, mockRes as unknown as http.ServerResponse);
      const state2 = getAppState();
      
      expect(state2.requestCount).toBeGreaterThan(state1.requestCount);
    });

    it('should return 403 for directory traversal attempts', async () => {
      const req = { url: '/../../../etc/passwd', method: 'GET' } as http.IncomingMessage;
      await handleRequest(req, mockRes as unknown as http.ServerResponse);
      
      expect(mockRes.writeHead).toHaveBeenCalledWith(403, { 'Content-Type': 'text/plain' });
      expect(mockRes.end).toHaveBeenCalledWith('Forbidden');
    });
  });
});