/**
 * Unified Integration Provider CRUD Routes
 * 
 * Handles all integration categories (llm-chat, llm-image, llm-transcript, search)
 * with a consistent API surface.
 * 
 * Routes:
 *   GET    /api/integrations/:category           — List providers
 *   POST   /api/integrations/:category           — Add provider
 *   PUT    /api/integrations/:category/:id        — Update provider
 *   DELETE /api/integrations/:category/:id        — Delete provider
 *   PUT    /api/integrations/:category/:id/default — Set as default
 *   PUT    /api/integrations/:category/:id/toggle  — Enable/disable
 *   GET    /api/integrations/:category/models     — Discover models
 */

import type { ApiContext } from '../context.js';
import type { IntegrationProvider, IntegrationCategory } from '../../data/integration-types.js';
import { loadUbotConfig, saveUbotConfig } from '../../data/config.js';
import http from 'http';

// ─── Helpers ─────────────────────────────────────────────

function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function error(res: http.ServerResponse, msg: string, status = 400) {
  json(res, { error: msg }, status);
}

async function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

function generateId(): string {
  return `prov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Config Access ───────────────────────────────────────

function getProviders(category: IntegrationCategory): IntegrationProvider[] {
  const cfg = loadUbotConfig();
  const int = cfg.integrations || {};

  switch (category) {
    case 'llm-chat':     return int.llm?.chat || [];
    case 'llm-image':    return int.llm?.image || [];
    case 'llm-transcript': return int.llm?.transcript || [];
    case 'search':       return int.search?.providers || [];
    default:             return [];
  }
}

function saveProviders(category: IntegrationCategory, providers: IntegrationProvider[]): void {
  const cfg = loadUbotConfig();
  if (!cfg.integrations) cfg.integrations = {};

  switch (category) {
    case 'llm-chat':
      if (!cfg.integrations.llm) cfg.integrations.llm = {};
      cfg.integrations.llm.chat = providers;
      break;
    case 'llm-image':
      if (!cfg.integrations.llm) cfg.integrations.llm = {};
      cfg.integrations.llm.image = providers;
      break;
    case 'llm-transcript':
      if (!cfg.integrations.llm) cfg.integrations.llm = {};
      cfg.integrations.llm.transcript = providers;
      break;
    case 'search':
      if (!cfg.integrations.search) cfg.integrations.search = {};
      cfg.integrations.search.providers = providers;
      break;
  }

  saveUbotConfig(cfg);
}

const VALID_CATEGORIES: IntegrationCategory[] = ['llm-chat', 'llm-image', 'llm-transcript', 'search'];

function parseCategory(url: string): IntegrationCategory | null {
  // Match /api/integrations/llm-chat, /api/integrations/search, etc.
  const match = url.match(/^\/api\/integrations\/([\w-]+)/);
  if (!match) return null;
  const cat = match[1] as IntegrationCategory;
  return VALID_CATEGORIES.includes(cat) ? cat : null;
}

function parseProviderId(url: string): string | null {
  // Match /api/integrations/llm-chat/:id or /api/integrations/llm-chat/:id/default
  const match = url.match(/^\/api\/integrations\/[\w-]+\/(prov_[\w]+)/);
  return match ? match[1] : null;
}

// ─── Route Handler ───────────────────────────────────────

export async function handleIntegrationProviderRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
  _ctx: ApiContext,
): Promise<boolean> {

  // Only handle /api/integrations/* (but not /api/integrations/mcp which is the old MCP route)
  if (!url.startsWith('/api/integrations/')) return false;
  const category = parseCategory(url);
  if (!category) return false;

  // ── LIST providers ──
  if (url === `/api/integrations/${category}` && method === 'GET') {
    const providers = getProviders(category);
    const defaultProvider = providers.find(p => p.isDefault) || providers[0];
    json(res, {
      providers,
      defaultId: defaultProvider?.id || '',
      category,
    });
    return true;
  }

  // ── ADD provider ──
  if (url === `/api/integrations/${category}` && method === 'POST') {
    const body = await parseBody(req) as Partial<IntegrationProvider>;
    if (!body.name || !body.type) {
      error(res, 'name and type are required');
      return true;
    }

    const providers = getProviders(category);
    const newProvider: IntegrationProvider = {
      id: generateId(),
      name: body.name,
      type: body.type,
      baseUrl: body.baseUrl || '',
      apiKey: body.apiKey || '',
      model: body.model || '',
      enabled: body.enabled !== false,
      isDefault: providers.length === 0, // first provider is default
      config: body.config || {},
    };

    providers.push(newProvider);
    saveProviders(category, providers);

    // If this is the first or only provider, also apply it to the agent
    if (category === 'llm-chat') {
      syncLlmToAgent(providers, _ctx);
    }
    if (category === 'search') {
      syncSearchToSerper(providers);
    }

    json(res, { provider: newProvider }, 201);
    return true;
  }

  // ── DISCOVER models ──
  if (url === `/api/integrations/${category}/models` && method === 'GET') {
    const params = new URL(url, 'http://localhost').searchParams;
    // Fall through — this is handled via query params in the URL
    // We need to parse from the full request URL
    const fullUrl = new URL(req.url || '', 'http://localhost');
    const baseUrl = fullUrl.searchParams.get('baseUrl');
    const apiKey = fullUrl.searchParams.get('apiKey') || '';
    const providerType = fullUrl.searchParams.get('provider') || '';
    const providerId = fullUrl.searchParams.get('providerId') || '';

    if (!baseUrl) {
      json(res, { models: [], error: 'baseUrl is required' });
      return true;
    }

    try {
      // Reuse existing model discovery logic
      let resolvedKey = apiKey;
      if (!resolvedKey && providerId) {
        const existing = getProviders(category).find(p => p.id === providerId);
        if (existing?.apiKey) resolvedKey = existing.apiKey;
      }

      const modelsUrl = baseUrl.replace(/\/+$/, '') + '/models';
      const headers: Record<string, string> = {};
      if (resolvedKey) headers['Authorization'] = `Bearer ${resolvedKey}`;

      const resp = await fetch(modelsUrl, { headers });
      if (!resp.ok) {
        json(res, { models: [], error: `Failed to fetch models: ${resp.status}` });
        return true;
      }
      const data = await resp.json() as { data?: Array<{ id: string }> };
      const models = (data.data || []).map((m: any) => ({ id: m.id, name: m.id }));
      json(res, { models });
    } catch (err: any) {
      json(res, { models: [], error: err.message });
    }
    return true;
  }

  // ── Routes with provider ID ──
  const providerId = parseProviderId(url);
  if (!providerId) return false;

  const providers = getProviders(category);
  const providerIndex = providers.findIndex(p => p.id === providerId);
  if (providerIndex < 0) {
    error(res, 'Provider not found', 404);
    return true;
  }

  // ── SET DEFAULT ──
  if (url.endsWith('/default') && method === 'PUT') {
    providers.forEach(p => p.isDefault = false);
    providers[providerIndex].isDefault = true;
    saveProviders(category, providers);

    if (category === 'llm-chat') syncLlmToAgent(providers, _ctx);

    json(res, { success: true, defaultId: providerId });
    return true;
  }

  // ── TOGGLE enable/disable ──
  if (url.endsWith('/toggle') && method === 'PUT') {
    providers[providerIndex].enabled = !providers[providerIndex].enabled;
    saveProviders(category, providers);

    if (category === 'llm-chat') syncLlmToAgent(providers, _ctx);
    if (category === 'search') syncSearchToSerper(providers);

    json(res, { success: true, enabled: providers[providerIndex].enabled });
    return true;
  }

  // ── UPDATE provider ──
  if (method === 'PUT' && !url.endsWith('/default') && !url.endsWith('/toggle')) {
    const body = await parseBody(req) as Partial<IntegrationProvider>;
    const existing = providers[providerIndex];

    if (body.name !== undefined) existing.name = body.name;
    if (body.type !== undefined) existing.type = body.type;
    if (body.baseUrl !== undefined) existing.baseUrl = body.baseUrl;
    if (body.apiKey !== undefined && body.apiKey !== '') existing.apiKey = body.apiKey;
    if (body.model !== undefined) existing.model = body.model;
    if (body.enabled !== undefined) existing.enabled = body.enabled;
    if (body.config !== undefined) existing.config = body.config;

    providers[providerIndex] = existing;
    saveProviders(category, providers);

    if (category === 'llm-chat') syncLlmToAgent(providers, _ctx);
    if (category === 'search') syncSearchToSerper(providers);

    json(res, { provider: existing });
    return true;
  }

  // ── DELETE provider ──
  if (method === 'DELETE') {
    const wasDefault = providers[providerIndex].isDefault;
    providers.splice(providerIndex, 1);

    // If deleted provider was default, make first remaining provider default
    if (wasDefault && providers.length > 0) {
      providers[0].isDefault = true;
    }

    saveProviders(category, providers);

    if (category === 'llm-chat') syncLlmToAgent(providers, _ctx);
    if (category === 'search') syncSearchToSerper(providers);

    json(res, { success: true });
    return true;
  }

  return false;
}

// ─── Sync Helpers ────────────────────────────────────────

/**
 * Sync LLM chat providers to the agent orchestrator.
 * Maps new IntegrationProvider format to old LLMProviderConfig for backward compat.
 */
function syncLlmToAgent(providers: IntegrationProvider[], ctx: ApiContext): void {
  if (!ctx.agentOrchestrator) return;

  const enabledProviders = providers.filter(p => p.enabled);
  const defaultProvider = enabledProviders.find(p => p.isDefault) || enabledProviders[0];

  if (defaultProvider) {
    // Map to old format for agent
    const oldProviders = enabledProviders.map(p => ({
      id: p.id,
      name: p.name,
      provider: p.type as 'openai' | 'gemini' | 'ollama' | 'custom',
      baseUrl: p.baseUrl || '',
      apiKey: p.apiKey || '',
      model: p.model || '',
      isDefault: p.isDefault,
    }));

    ctx.agentOrchestrator.updateConfig({
      llmProviders: oldProviders,
      defaultLlmProviderId: defaultProvider.id,
      llmBaseUrl: defaultProvider.baseUrl || '',
      llmModel: defaultProvider.model || '',
      llmApiKey: defaultProvider.apiKey || '',
    });
  }

  // Also save in old format for backward compat
  const oldFormat = providers.map(p => ({
    id: p.id,
    name: p.name,
    provider: p.type,
    baseUrl: p.baseUrl || '',
    apiKey: p.apiKey || '',
    model: p.model || '',
    isDefault: p.isDefault,
  }));
  ctx.saveConfigValue('llm_providers', JSON.stringify(oldFormat));
  ctx.saveConfigValue('default_llm_provider_id', (providers.find(p => p.isDefault) || providers[0])?.id || '');
}

/**
 * Sync search providers — update the Serper API key in memory.
 */
async function syncSearchToSerper(providers: IntegrationProvider[]): Promise<void> {
  const serperProvider = providers.find(p => p.type === 'serper' && p.enabled);
  try {
    const { setSerperApiKey } = await import('../../capabilities/skills/web-search/adapters/serper.js');
    setSerperApiKey(serperProvider?.apiKey || null);
  } catch { /* ignore */ }
}
