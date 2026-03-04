/**
 * Integration Routes
 * /api/google/*
 */

import http from 'http';
import { parseBody, json, error, type ApiContext } from '../context.js';

export async function handleIntegrationRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
  ctx: ApiContext,
): Promise<boolean> {

  // ── Google Auth API ──────────────────────────────────
  if (url === '/api/google/auth/status' && method === 'GET') {
    try {
      const { getGoogleAuthStatus } = await import('../../capabilities/google/auth.js');
      const status = getGoogleAuthStatus();
      json(res, status);
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  if (url === '/api/google/auth/start' && method === 'POST') {
    try {
      const { startGoogleAuth } = await import('../../capabilities/google/auth.js');
      await startGoogleAuth();
      json(res, { success: true, message: 'Google authorization complete. Tokens saved.' });
    } catch (err: any) {
      error(res, `Google auth failed: ${err.message}`, 500);
    }
    return true;
  }

  if (url === '/api/google/auth/clear' && method === 'POST') {
    try {
      const { clearGoogleAuth } = await import('../../capabilities/google/auth.js');
      await clearGoogleAuth();
      json(res, { success: true, message: 'Google auth cleared.' });
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  if (url === '/api/google/services/config' && method === 'GET') {
    try {
      const { getGoogleServicesConfig } = await import('../../capabilities/google/auth.js');
      const services = getGoogleServicesConfig();
      json(res, { services });
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  if (url === '/api/google/services/config' && method === 'PUT') {
    try {
      const body = await parseBody(req) as any;
      const { saveGoogleServicesConfig } = await import('../../capabilities/google/auth.js');
      const updated = await saveGoogleServicesConfig(body.services || {});
      json(res, { services: updated });
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  // ── MCP Servers ─────────────────────────────────────────

  if (url === '/api/mcp/servers' && method === 'GET') {
    const mgr = ctx.mcpManager;
    if (!mgr) { json(res, { servers: [] }); return true; }
    json(res, { servers: mgr.getServers() });
    return true;
  }

  if (url === '/api/mcp/servers' && method === 'POST') {
    const mgr = ctx.mcpManager;
    if (!mgr) { error(res, 'MCP manager not initialized', 503); return true; }
    const body = await parseBody(req) as any;
    if (!body.name || !body.command) { error(res, 'name and command are required'); return true; }

    const config = {
      id: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: body.name,
      command: body.command,
      args: body.args || [],
      env: body.env || {},
      enabledTools: body.enabledTools || [],
      discoveredTools: body.discoveredTools || [],
    };
    mgr.addServer(config);

    // Auto-connect if requested
    if (body.autoConnect !== false) {
      await mgr.connectServer(config.id).catch(() => {});
    }

    const status = mgr.getServer(config.id);
    json(res, { server: status }, 201);
    return true;
  }

  if (url === '/api/mcp/servers/validate' && method === 'POST') {
    const mgr = ctx.mcpManager;
    if (!mgr) { error(res, 'MCP manager not initialized', 503); return true; }
    const body = await parseBody(req) as any;
    if (!body.command) { error(res, 'command is required'); return true; }
    try {
      const tools = await mgr.validateServer({
        command: body.command,
        args: body.args || [],
        env: body.env || {},
      });
      json(res, { valid: true, tools });
    } catch (err: any) {
      json(res, { valid: false, error: err.message, tools: [] });
    }
    return true;
  }

  if (url.match(/^\/api\/mcp\/servers\/[^/]+$/) && method === 'PUT') {
    const mgr = ctx.mcpManager;
    if (!mgr) { error(res, 'MCP manager not initialized', 503); return true; }
    const id = url.split('/').pop()!;
    const body = await parseBody(req) as any;
    const updated = mgr.updateServer(id, body);
    if (!updated) { error(res, 'Server not found', 404); return true; }

    // Reconnect if tools changed
    if (body.enabledTools !== undefined || body.command !== undefined) {
      await mgr.connectServer(id).catch(() => {});
    }

    const status = mgr.getServer(id);
    json(res, { server: status });
    return true;
  }

  if (url.match(/^\/api\/mcp\/servers\/[^/]+$/) && method === 'DELETE') {
    const mgr = ctx.mcpManager;
    if (!mgr) { error(res, 'MCP manager not initialized', 503); return true; }
    const id = url.split('/').pop()!;
    const removed = await mgr.removeServer(id);
    if (!removed) { error(res, 'Server not found', 404); return true; }
    json(res, { deleted: true });
    return true;
  }

  if (url.match(/^\/api\/mcp\/servers\/[^/]+\/reconnect$/) && method === 'POST') {
    const mgr = ctx.mcpManager;
    if (!mgr) { error(res, 'MCP manager not initialized', 503); return true; }
    const parts = url.split('/');
    const id = parts[parts.length - 2];
    try {
      await mgr.connectServer(id);
      const status = mgr.getServer(id);
      json(res, { server: status });
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  return false;
}
