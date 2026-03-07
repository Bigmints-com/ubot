/**
 * CLI API Routes
 *
 * REST endpoints for managing CLI coding sessions from the dashboard.
 * Includes SSE streaming for live output.
 */

import type { RouteHandler } from '../context.js';
import { json, parseBody, error as apiError } from '../context.js';
import { loadUbotConfig, saveUbotConfig } from '../../data/config.js';
import { getCliService } from '../../capabilities/cli/service.js';

export const handleCliRoutes: RouteHandler = async (req, res, url, method, _ctx) => {
  // ── Feature status ────────────────────────────────────
  if (url === '/api/cli/status' && method === 'GET') {
    const config = loadUbotConfig();
    const defaultProvider = config.capabilities?.cli?.default || 'gemini';
    const providerCfg = config.capabilities?.cli?.providers?.[defaultProvider];
    const enabled = providerCfg?.enabled !== false && !!config.capabilities?.cli?.providers;
    const timeout = (providerCfg?.timeout as number) || 300000;

    let providerAvailable = false;
    let providerAuthenticated = false;
    if (enabled) {
      try {
        const service = getCliService({
          provider: defaultProvider,
          workDir: config.capabilities?.cli?.workDir || 'custom/staging',
          timeout,
        });
        providerAvailable = service.isProviderAvailable(defaultProvider);
        providerAuthenticated = service.isProviderAuthenticated(defaultProvider);
      } catch { /* ignore */ }
    }

    json(res, {
      enabled,
      provider: defaultProvider,
      providerAvailable,
      providerAuthenticated,
      workDir: config.capabilities?.cli?.workDir || 'custom/staging',
      timeout,
    });
    return true;
  }

  // ── Toggle CLI on/off ─────────────────────────────────
  if (url === '/api/cli/toggle' && method === 'PUT') {
    const body = await parseBody(req) as any;
    const config = loadUbotConfig();
    if (!config.capabilities) config.capabilities = {};
    if (!config.capabilities.cli) config.capabilities.cli = {};
    if (!config.capabilities.cli.providers) config.capabilities.cli.providers = {};
    const provider = body?.provider || config.capabilities.cli.default || 'gemini';
    if (!config.capabilities.cli.providers[provider]) config.capabilities.cli.providers[provider] = {};
    config.capabilities.cli.providers[provider].enabled = !!body?.enabled;
    if (body?.provider) config.capabilities.cli.default = body.provider;
    saveUbotConfig(config);
    json(res, { enabled: config.capabilities.cli.providers[provider].enabled, provider });
    return true;
  }

  // ── Install CLI provider ─────────────────────────────
  if (url === '/api/cli/install' && method === 'POST') {
    const config = loadUbotConfig();
    const provider = config.capabilities?.cli?.default || 'gemini';
    const providerCfg = config.capabilities?.cli?.providers?.[provider];
    try {
      const service = getCliService({
        provider,
        workDir: config.capabilities?.cli?.workDir || 'custom/staging',
        timeout: (providerCfg?.timeout as number) || 300000,
      });
      const result = await service.installProvider(provider);
      json(res, result);
    } catch (err: any) {
      apiError(res, err.message, 500);
    }
    return true;
  }

  // ── Authenticate CLI provider ────────────────────────
  if (url === '/api/cli/authenticate' && method === 'POST') {
    const config = loadUbotConfig();
    const provider = config.capabilities?.cli?.default || 'gemini';
    const providerCfg = config.capabilities?.cli?.providers?.[provider];
    try {
      const service = getCliService({
        provider,
        workDir: config.capabilities?.cli?.workDir || 'custom/staging',
        timeout: (providerCfg?.timeout as number) || 300000,
      });
      const result = await service.authenticateProvider(provider);
      json(res, result);
    } catch (err: any) {
      apiError(res, err.message, 500);
    }
    return true;
  }

  // ── Update CLI settings ───────────────────────────────
  if (url === '/api/cli/settings' && method === 'PUT') {
    const body = await parseBody(req) as any;
    const config = loadUbotConfig();
    if (!config.capabilities) config.capabilities = {};
    if (!config.capabilities.cli) config.capabilities.cli = {};
    if (!config.capabilities.cli.providers) config.capabilities.cli.providers = {};
    if (body?.provider) config.capabilities.cli.default = body.provider;
    if (body?.workDir) config.capabilities.cli.workDir = body.workDir;
    const provider = config.capabilities.cli.default || 'gemini';
    if (!config.capabilities.cli.providers[provider]) config.capabilities.cli.providers[provider] = {};
    if (body?.timeout !== undefined) config.capabilities.cli.providers[provider].timeout = Number(body.timeout);
    saveUbotConfig(config);
    json(res, { cli: config.capabilities.cli });
    return true;
  }

  // Gate remaining routes behind enabled check
  const config = loadUbotConfig();
  const cliDefault = config.capabilities?.cli?.default || 'gemini';
  const cliProviderCfg = config.capabilities?.cli?.providers?.[cliDefault];
  const cliEnabled = cliProviderCfg?.enabled !== false && !!config.capabilities?.cli?.providers;
  if (!cliEnabled && url.startsWith('/api/cli/sessions')) {
    apiError(res, 'CLI capability is disabled. Enable it from the CLI page.', 403);
    return true;
  }

  const getService = () => getCliService({
    provider: cliDefault,
    workDir: config.capabilities?.cli?.workDir || 'custom/staging',
    timeout: (cliProviderCfg?.timeout as number) || 300000,
  });

  // ── List sessions ─────────────────────────────────────
  if (url === '/api/cli/sessions' && method === 'GET') {
    try {
      const service = getService();
      const sessions = service.listSessions().map(s => ({
        id: s.id,
        prompt: s.prompt,
        provider: s.provider,
        status: s.status,
        projectName: s.projectName,
        workDir: s.workDir,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt?.toISOString(),
        exitCode: s.exitCode,
        outputLineCount: s.outputLines.length,
      }));
      json(res, { sessions });
    } catch (err: any) {
      apiError(res, err.message, 500);
    }
    return true;
  }

  // ── Start session ─────────────────────────────────────
  if (url === '/api/cli/sessions' && method === 'POST') {
    try {
      const body = await parseBody(req) as any;
      const prompt = body?.prompt;
      if (!prompt) {
        apiError(res, 'prompt is required', 400);
        return true;
      }
      const service = getService();
      const session = await service.startSession(prompt, body?.projectName);
      json(res, {
        id: session.id,
        status: session.status,
        provider: session.provider,
        projectName: session.projectName,
        workDir: session.workDir,
      });
    } catch (err: any) {
      apiError(res, err.message, 500);
    }
    return true;
  }

  // ── Session detail routes (with ID) ───────────────────
  const sessionMatch = url.match(/^\/api\/cli\/sessions\/([^/]+)(\/.*)?$/);
  if (sessionMatch) {
    const sessionId = sessionMatch[1];
    const sub = sessionMatch[2] || '';
    const service = getService();

    // GET /api/cli/sessions/:id — session details + output
    if (!sub && method === 'GET') {
      const session = service.getSession(sessionId);
      if (!session) {
        apiError(res, 'Session not found', 404);
        return true;
      }

      const urlObj = new URL(url, `http://${req.headers.host || 'localhost'}`);
      const fromLine = parseInt(urlObj.searchParams.get('fromLine') || '0', 10);

      json(res, {
        id: session.id,
        prompt: session.prompt,
        provider: session.provider,
        status: session.status,
        projectName: session.projectName,
        workDir: session.workDir,
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt?.toISOString(),
        exitCode: session.exitCode,
        totalLines: session.outputLines.length,
        output: service.getOutput(sessionId, fromLine),
      });
      return true;
    }

    // GET /api/cli/sessions/:id/stream — SSE stream
    if (sub === '/stream' && method === 'GET') {
      const session = service.getSession(sessionId);
      if (!session) {
        apiError(res, 'Session not found', 404);
        return true;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      let lastLine = 0;
      const interval = setInterval(() => {
        const newLines = service.getOutput(sessionId, lastLine);
        if (newLines.length > 0) {
          lastLine += newLines.length;
          res.write(`data: ${JSON.stringify({ lines: newLines, totalLines: lastLine })}\n\n`);
        }

        const currentSession = service.getSession(sessionId);
        if (currentSession && currentSession.status !== 'running') {
          res.write(`data: ${JSON.stringify({ done: true, status: currentSession.status, exitCode: currentSession.exitCode })}\n\n`);
          clearInterval(interval);
          res.end();
        }
      }, 500);

      req.on('close', () => {
        clearInterval(interval);
      });

      return true;
    }

    // POST /api/cli/sessions/:id/stop — stop session
    if (sub === '/stop' && method === 'POST') {
      const stopped = service.stopSession(sessionId);
      if (!stopped) {
        apiError(res, 'Session not found', 404);
        return true;
      }
      json(res, { stopped: true, sessionId });
      return true;
    }

    // POST /api/cli/sessions/:id/input — send input
    if (sub === '/input' && method === 'POST') {
      const body = await parseBody(req) as any;
      const input = body?.input;
      if (!input) {
        apiError(res, 'input is required', 400);
        return true;
      }
      const sent = service.sendInput(sessionId, input + '\n');
      if (!sent) {
        apiError(res, 'Session not found or not running', 404);
        return true;
      }
      json(res, { sent: true, sessionId });
      return true;
    }
  }

  // ── Custom Module Endpoints (not gated behind cli.enabled) ──

  // GET /api/cli/custom-modules
  if (url === '/api/cli/custom-modules' && method === 'GET') {
    try {
      const { listCustomModules } = await import('../../capabilities/cli/test-pipeline.js');
      const { getLoadedModules } = await import('../../capabilities/cli/custom-loader.js');
      const modules = listCustomModules();
      const loaded = getLoadedModules();
      const loadedMap = new Map(loaded.map(m => [m.name, m]));

      const result = modules.map(m => ({
        name: m.name,
        status: m.status,
        ...(loadedMap.has(m.name) ? {
          toolCount: loadedMap.get(m.name)!.toolCount,
          toolNames: loadedMap.get(m.name)!.toolNames,
        } : {}),
      }));

      json(res, { modules: result });
    } catch (err: any) {
      json(res, { error: err.message }, 500);
    }
    return true;
  }

  // POST /api/cli/test-module
  if (url === '/api/cli/test-module' && method === 'POST') {
    try {
      const body = await parseBody(req) as Record<string, any>;
      const moduleName = body.module_name || body.moduleName;
      if (!moduleName) { json(res, { error: 'module_name required' }, 400); return true; }

      const { testStagedModule } = await import('../../capabilities/cli/test-pipeline.js');
      const result = await testStagedModule(moduleName);
      json(res, result);
    } catch (err: any) {
      json(res, { error: err.message }, 500);
    }
    return true;
  }

  // POST /api/cli/promote-module
  if (url === '/api/cli/promote-module' && method === 'POST') {
    try {
      const body = await parseBody(req) as Record<string, any>;
      const moduleName = body.module_name || body.moduleName;
      if (!moduleName) { json(res, { error: 'module_name required' }, 400); return true; }

      if (!_ctx.agentOrchestrator) {
        json(res, { error: 'Agent not initialized' }, 500);
        return true;
      }

      const { promoteModule } = await import('../../capabilities/cli/test-pipeline.js');
      const registry = _ctx.agentOrchestrator.getToolRegistry();
      // Build minimal tool context for hot-reload registration
      const toolContext = {
        getMessagingRegistry: () => _ctx.messagingRegistry,
        getScheduler: () => _ctx.scheduler,
        getApprovalStore: () => _ctx.approvalStore,
        getSkillEngine: () => _ctx.skillEngine,
        getWhatsApp: () => _ctx.waConnection,
        getTelegram: () => _ctx.tgConnection,
        getAgent: () => _ctx.agentOrchestrator,
        getEventBus: () => _ctx.eventBus,
        getWorkspacePath: () => null,
        getCliService: () => null,
        getFollowUpStore: () => null,
      };
      const result = await promoteModule(moduleName, registry, toolContext);
      json(res, result);
    } catch (err: any) {
      json(res, { error: err.message }, 500);
    }
    return true;
  }

  return false;
};
