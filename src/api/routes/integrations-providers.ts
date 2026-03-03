/**
 * Unified Integration Provider CRUD Routes (v2 — keyed providers)
 * 
 * Routes:
 *   GET    /api/integrations/:category           — List providers
 *   POST   /api/integrations/:category           — Add provider (key in body)
 *   PUT    /api/integrations/:category/:key       — Update provider
 *   DELETE /api/integrations/:category/:key       — Delete provider
 *   PUT    /api/integrations/:category/:key/default — Set as default
 *   PUT    /api/integrations/:category/:key/toggle  — Enable/disable
 *   GET    /api/integrations/:category/models     — Discover models
 */

import type { ApiContext } from '../context.js';
import type { ProviderConfig, ProvidersSection } from '../../data/config.js';
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

type Category = 'models' | 'search' | 'cli';
const VALID_CATEGORIES: Category[] = ['models', 'search', 'cli'];

// ─── Config Access ───────────────────────────────────────

function getSection(category: Category): ProvidersSection {
  const cfg = loadUbotConfig();
  const caps = cfg.capabilities || {};
  return (caps[category] as ProvidersSection) || {};
}

function saveSection(category: Category, section: ProvidersSection): void {
  const cfg = loadUbotConfig();
  if (!cfg.capabilities) cfg.capabilities = {};
  if (category === 'cli') {
    const existingWorkDir = (cfg.capabilities.cli as any)?.workDir;
    cfg.capabilities.cli = { ...section, workDir: existingWorkDir };
  } else {
    (cfg.capabilities as any)[category] = section;
  }
  saveUbotConfig(cfg);
}

function parseCategory(url: string): Category | null {
  const match = url.match(/^\/api\/integrations\/([\w-]+)/);
  if (!match) return null;
  const cat = match[1] as Category;
  return VALID_CATEGORIES.includes(cat) ? cat : null;
}

function parseProviderKey(url: string): string | null {
  // Match /api/integrations/models/gemini or /api/integrations/models/gemini/default
  const match = url.match(/^\/api\/integrations\/[\w-]+\/([a-zA-Z0-9_-]+)/);
  if (!match) return null;
  // Don't match "models" as a key (it's the /models endpoint for discovery)
  if (match[1] === 'models') return null;
  return match[1];
}

// ─── Route Handler ───────────────────────────────────────

export async function handleIntegrationProviderRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
  ctx: ApiContext,
): Promise<boolean> {

  if (!url.startsWith('/api/integrations/')) return false;
  const category = parseCategory(url);
  if (!category) return false;

  // ── LIST providers ──
  if (url === `/api/integrations/${category}` && method === 'GET') {
    const section = getSection(category);
    json(res, {
      default: section.default || '',
      providers: section.providers || {},
      category,
    });
    return true;
  }

  // ── ADD provider ──
  if (url === `/api/integrations/${category}` && method === 'POST') {
    const body = await parseBody(req) as { key?: string } & ProviderConfig;
    if (!body.key) {
      error(res, 'key is required (provider name, e.g. "gemini")');
      return true;
    }

    const section = getSection(category);
    if (!section.providers) section.providers = {};

    const key = body.key.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    section.providers[key] = {
      enabled: body.enabled !== false,
      baseUrl: body.baseUrl || undefined,
      apiKey: body.apiKey || undefined,
      model: body.model || undefined,
      timeout: body.timeout || undefined,
    };

    // First provider becomes default
    if (!section.default || Object.keys(section.providers).length === 1) {
      section.default = key;
    }

    saveSection(category, section);
    if (category === 'models') syncModelsToAgent(ctx);
    if (category === 'search') syncSearchToSerper();

    json(res, { key, provider: section.providers[key] }, 201);
    return true;
  }

  // ── DISCOVER models ──
  if (url === `/api/integrations/${category}/models` && method === 'GET') {
    const fullUrl = new URL(req.url || '', 'http://localhost');
    const baseUrl = fullUrl.searchParams.get('baseUrl');
    const apiKey = fullUrl.searchParams.get('apiKey') || '';
    const providerType = fullUrl.searchParams.get('provider') || '';
    const providerKey = fullUrl.searchParams.get('providerKey') || '';

    if (!baseUrl) {
      json(res, { models: [], error: 'baseUrl is required' });
      return true;
    }

    try {
      let resolvedKey = apiKey;
      if (!resolvedKey && providerKey) {
        const section = getSection(category);
        resolvedKey = section.providers?.[providerKey]?.apiKey as string || '';
      }

      // Ollama uses different endpoint
      if (providerType === 'ollama') {
        const ollamaHost = baseUrl.replace(/\/v1\/?$/, '');
        const resp = await fetch(`${ollamaHost}/api/tags`);
        if (resp.ok) {
          const data = await resp.json() as any;
          const models = (data.models || []).map((m: any) => ({
            id: m.name || m.model,
            name: `${m.name}${m.details?.parameter_size ? ` (${m.details.parameter_size})` : ''}`,
          }));
          json(res, { models });
          return true;
        }
      }

      const modelsUrl = baseUrl.replace(/\/+$/, '') + '/models';
      const headers: Record<string, string> = {};
      if (resolvedKey) headers['Authorization'] = `Bearer ${resolvedKey}`;

      const resp = await fetch(modelsUrl, { headers });
      if (!resp.ok) {
        json(res, { models: [], error: `Failed: ${resp.status}` });
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

  // ── Routes with provider key ──
  const providerKey = parseProviderKey(url);
  if (!providerKey) return false;

  const section = getSection(category);
  if (!section.providers?.[providerKey]) {
    error(res, `Provider "${providerKey}" not found`, 404);
    return true;
  }

  // ── SET DEFAULT ──
  if (url.endsWith('/default') && method === 'PUT') {
    section.default = providerKey;
    saveSection(category, section);

    // Sync to config.defaults so Agent Defaults page reflects the change
    const CATEGORY_TO_PURPOSE: Record<string, string> = {
      models: 'chat', search: 'search', cli: 'cli',
    };
    const purpose = CATEGORY_TO_PURPOSE[category];
    if (purpose) {
      const cfg = loadUbotConfig();
      if (!cfg.defaults) cfg.defaults = {};
      cfg.defaults[purpose] = `${category}.${providerKey}`;
      saveUbotConfig(cfg);
    }

    if (category === 'models') syncModelsToAgent(ctx);
    json(res, { success: true, default: providerKey });
    return true;
  }

  // ── TOGGLE enable/disable ──
  if (url.endsWith('/toggle') && method === 'PUT') {
    const provider = section.providers![providerKey];
    provider.enabled = provider.enabled === false ? true : false;
    saveSection(category, section);
    if (category === 'models') syncModelsToAgent(ctx);
    if (category === 'search') syncSearchToSerper();
    json(res, { success: true, enabled: provider.enabled });
    return true;
  }

  // ── UPDATE provider ──
  if (method === 'PUT' && !url.endsWith('/default') && !url.endsWith('/toggle')) {
    const body = await parseBody(req) as Partial<ProviderConfig>;
    const existing = section.providers![providerKey];

    if (body.baseUrl !== undefined) existing.baseUrl = body.baseUrl;
    if (body.apiKey !== undefined && body.apiKey !== '') existing.apiKey = body.apiKey;
    if (body.model !== undefined) existing.model = body.model;
    if (body.enabled !== undefined) existing.enabled = body.enabled;
    if (body.timeout !== undefined) existing.timeout = body.timeout;

    saveSection(category, section);
    if (category === 'models') syncModelsToAgent(ctx);
    if (category === 'search') syncSearchToSerper();
    json(res, { provider: existing });
    return true;
  }

  // ── DELETE provider ──
  if (method === 'DELETE') {
    const wasDefault = section.default === providerKey;
    delete section.providers![providerKey];

    // Reassign default
    if (wasDefault) {
      const remaining = Object.keys(section.providers || {});
      section.default = remaining[0] || '';
    }

    saveSection(category, section);
    if (category === 'models') syncModelsToAgent(ctx);
    if (category === 'search') syncSearchToSerper();
    json(res, { success: true });
    return true;
  }

  return false;
}

// ─── Sync Helpers ────────────────────────────────────────

function syncModelsToAgent(ctx: ApiContext): void {
  if (!ctx.agentOrchestrator) return;
  const cfg = loadUbotConfig();
  const section = cfg.capabilities?.models;
  if (!section?.providers) return;

  const defaultKey = section.default || Object.keys(section.providers)[0] || '';
  const defaultProvider = section.providers[defaultKey];

  if (defaultProvider) {
    const oldProviders = Object.entries(section.providers)
      .filter(([_, p]) => p.enabled !== false)
      .map(([key, p]) => ({
        id: key,
        name: key,
        provider: key as any,
        baseUrl: (p.baseUrl || '') as string,
        apiKey: (p.apiKey || '') as string,
        model: (p.model || '') as string,
        isDefault: key === defaultKey,
      }));

    ctx.agentOrchestrator.updateConfig({
      llmProviders: oldProviders,
      defaultLlmProviderId: defaultKey,
      llmBaseUrl: (defaultProvider.baseUrl || '') as string,
      llmModel: (defaultProvider.model || '') as string,
      llmApiKey: (defaultProvider.apiKey || '') as string,
    });
  }
}

async function syncSearchToSerper(): Promise<void> {
  const cfg = loadUbotConfig();
  const serper = cfg.capabilities?.search?.providers?.serper;
  try {
    const { setSerperApiKey } = await import('../../capabilities/skills/web-search/adapters/serper.js');
    setSerperApiKey(serper?.enabled !== false ? (serper?.apiKey as string || null) : null);
  } catch { /* ignore */ }
}
