/**
 * Chat & LLM Provider Routes
 * /api/chat/*, /api/llm-providers/*
 */

import http from 'http';
import crypto from 'crypto';
import type { LLMProviderConfig } from '../../engine/types.js';
import { parseBody, json, notFound, error, type ApiContext } from '../context.js';

export async function handleChatRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
  ctx: ApiContext,
): Promise<boolean> {

  // ── Chat / Agent ────────────────────────────────────────

  if (url === '/api/chat' && method === 'POST') {
    if (!ctx.agentOrchestrator) {
      error(res, 'Agent not initialized', 503);
      return true;
    }
    const body = await parseBody(req) as any;
    const message = body.message || body.content || '';
    const sessionId = body.sessionId || 'web-console';
    
    if (!message.trim()) {
      error(res, 'Message is required');
      return true;
    }

    try {
      const response = await ctx.agentOrchestrator.chat(sessionId, message, 'web');
      json(res, response);
    } catch (e: any) {
      console.error('[API] Chat error:', e);
      error(res, e.message, 500);
    }
    return true;
  }

  if (url === '/api/chat/history' && method === 'GET') {
    if (!ctx.agentOrchestrator) {
      json(res, { messages: [] });
      return true;
    }
    const urlObj = new URL(url, 'http://localhost');
    const sessionId = urlObj.searchParams.get('sessionId') || 'web-console';
    const limit = parseInt(urlObj.searchParams.get('limit') || '50', 10);
    const store = ctx.agentOrchestrator.getConversationStore();
    const messages = store.getHistory(sessionId, limit);
    json(res, { messages });
    return true;
  }

  if (url.startsWith('/api/chat/history') && method === 'GET') {
    if (!ctx.agentOrchestrator) {
      json(res, { messages: [] });
      return true;
    }
    const qIdx = url.indexOf('?');
    const params = qIdx >= 0 ? new URLSearchParams(url.slice(qIdx)) : new URLSearchParams();
    const sessionId = params.get('sessionId') || 'web-console';
    const limit = parseInt(params.get('limit') || '50', 10);
    const store = ctx.agentOrchestrator.getConversationStore();
    const messages = store.getHistory(sessionId, limit);
    json(res, { messages });
    return true;
  }

  if (url === '/api/chat/clear' && method === 'POST') {
    if (!ctx.agentOrchestrator) {
      json(res, { cleared: true });
      return true;
    }
    const body = await parseBody(req) as any;
    const sessionId = body.sessionId || 'web-console';
    ctx.agentOrchestrator.getConversationStore().clearSession(sessionId);
    json(res, { cleared: true, sessionId });
    return true;
  }

  if (url === '/api/chat/sessions' && method === 'GET') {
    if (!ctx.agentOrchestrator) {
      json(res, { sessions: [] });
      return true;
    }
    const sessions = ctx.agentOrchestrator.getConversationStore().listSessions();
    json(res, { sessions });
    return true;
  }

  if (url === '/api/chat/config' && method === 'GET') {
    if (!ctx.agentOrchestrator) {
      json(res, { error: 'Agent not initialized' }, 503);
      return true;
    }
    const config = ctx.agentOrchestrator.getConfig();
    json(res, {
      llmBaseUrl: config.llmBaseUrl,
      llmModel: config.llmModel,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      maxHistoryMessages: config.maxHistoryMessages,
      autoReplyWhatsApp: config.autoReplyWhatsApp,
      autoReplyTelegram: config.autoReplyTelegram,
      autoReplyContacts: config.autoReplyContacts,
      ownerPhone: config.ownerPhone || '',
      ownerTelegramId: config.ownerTelegramId || '',
      ownerTelegramUsername: config.ownerTelegramUsername || '',
    });
    return true;
  }

  if (url === '/api/chat/config' && method === 'PUT') {
    if (!ctx.agentOrchestrator) {
      json(res, { error: 'Agent not initialized' }, 503);
      return true;
    }
    const body = await parseBody(req) as any;
    const updated = ctx.agentOrchestrator.updateConfig(body);

    if (body.ownerPhone !== undefined) ctx.saveConfigValue('ownerPhone', updated.ownerPhone || '');
    if (body.ownerTelegramId !== undefined) ctx.saveConfigValue('ownerTelegramId', updated.ownerTelegramId || '');
    if (body.ownerTelegramUsername !== undefined) ctx.saveConfigValue('ownerTelegramUsername', updated.ownerTelegramUsername || '');
    if (body.autoReplyWhatsApp !== undefined) ctx.saveConfigValue('autoReplyWhatsApp', String(updated.autoReplyWhatsApp));
    if (body.autoReplyTelegram !== undefined) ctx.saveConfigValue('autoReplyTelegram', String(updated.autoReplyTelegram));

    json(res, {
      llmBaseUrl: updated.llmBaseUrl,
      llmModel: updated.llmModel,
      temperature: updated.temperature,
      maxTokens: updated.maxTokens,
      autoReplyWhatsApp: updated.autoReplyWhatsApp,
      autoReplyTelegram: updated.autoReplyTelegram,
      ownerPhone: updated.ownerPhone || '',
      ownerTelegramId: updated.ownerTelegramId || '',
      ownerTelegramUsername: updated.ownerTelegramUsername || '',
      saved: true,
    });
    return true;
  }

  if (url === '/api/whatsapp/messages' && method === 'GET') {
    json(res, { messages: ctx.waMessages.slice(-50) });
    return true;
  }

  // ── LLM Providers ─────────────────────────────────────

  if (url.startsWith('/api/llm-providers/models') && method === 'GET') {
    const params = new URL(url, 'http://localhost').searchParams;
    let baseUrl = params.get('baseUrl') || '';
    let apiKey = params.get('apiKey') || '';
    const providerType = params.get('provider') || 'custom';
    const providerId = params.get('providerId') || '';

    if (providerId && ctx.agentOrchestrator) {
      const config = ctx.agentOrchestrator.getConfig();
      const stored = (config.llmProviders || []).find(p => p.id === providerId);
      if (stored) {
        if (!apiKey || apiKey.includes('*')) apiKey = stored.apiKey;
        if (!baseUrl) baseUrl = stored.baseUrl;
      }
    }

    if (!baseUrl) {
      error(res, 'baseUrl is required');
      return true;
    }

    try {
      let models: Array<{ id: string; name: string }> = [];

      if (providerType === 'ollama') {
        const ollamaHost = baseUrl.replace(/\/v1\/?$/, '');
        const ollamaRes = await fetch(`${ollamaHost}/api/tags`);
        if (ollamaRes.ok) {
          const data = await ollamaRes.json() as any;
          models = (data.models || []).map((m: any) => ({
            id: m.name || m.model,
            name: `${m.name}${m.details?.parameter_size ? ` (${m.details.parameter_size})` : ''}`,
          }));
        }
      } else {
        const normalizedUrl = baseUrl.replace(/\/+$/, '');
        const modelsUrl = `${normalizedUrl}/models`;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

        const modelsRes = await fetch(modelsUrl, { headers });
        if (modelsRes.ok) {
          const data = await modelsRes.json() as any;
          models = (data.data || []).map((m: any) => ({
            id: m.id,
            name: m.id,
          }));
        }
      }

      models.sort((a, b) => a.id.localeCompare(b.id));
      json(res, { models });
    } catch (err: any) {
      json(res, { models: [], error: err.message });
    }
    return true;
  }

  if (url === '/api/llm-providers' && method === 'GET') {
    if (!ctx.agentOrchestrator) {
      json(res, { providers: [], defaultId: '' });
      return true;
    }
    const config = ctx.agentOrchestrator.getConfig();
    const providers = (config.llmProviders || []).map(p => ({
      ...p,
      apiKey: p.apiKey ? `${p.apiKey.slice(0, 4)}${'*'.repeat(Math.max(0, p.apiKey.length - 8))}${p.apiKey.slice(-4)}` : '',
    }));
    json(res, { providers, defaultId: config.defaultLlmProviderId });
    return true;
  }

  if (url === '/api/llm-providers' && method === 'POST') {
    if (!ctx.agentOrchestrator) {
      error(res, 'Agent not initialized', 503);
      return true;
    }
    const body = await parseBody(req) as any;
    if (!body.name || !body.model || !body.baseUrl) {
      error(res, 'name, model, and baseUrl are required');
      return true;
    }
    const config = ctx.agentOrchestrator.getConfig();
    const providers = [...(config.llmProviders || [])];
    const newProvider: LLMProviderConfig = {
      id: crypto.randomUUID(),
      name: body.name,
      provider: body.provider || 'custom',
      baseUrl: body.baseUrl,
      apiKey: body.apiKey || '',
      model: body.model,
      isDefault: providers.length === 0,
    };
    providers.push(newProvider);
    const defaultId = newProvider.isDefault ? newProvider.id : config.defaultLlmProviderId;
    ctx.agentOrchestrator.updateConfig({ llmProviders: providers, defaultLlmProviderId: defaultId });
    ctx.saveConfigValue('llm_providers', JSON.stringify(providers));
    ctx.saveConfigValue('default_llm_provider_id', defaultId);
    json(res, { provider: { ...newProvider, apiKey: newProvider.apiKey ? '***' : '' }, saved: true }, 201);
    return true;
  }

  if (url.match(/^\/api\/llm-providers\/[^/]+\/default$/) && method === 'PUT') {
    if (!ctx.agentOrchestrator) {
      error(res, 'Agent not initialized', 503);
      return true;
    }
    const parts = url.split('/');
    const id = parts[parts.length - 2];
    const config = ctx.agentOrchestrator.getConfig();
    const providers = (config.llmProviders || []).map(p => ({
      ...p,
      isDefault: p.id === id,
    }));
    if (!providers.find(p => p.id === id)) {
      error(res, 'Provider not found', 404);
      return true;
    }
    ctx.agentOrchestrator.updateConfig({ llmProviders: providers, defaultLlmProviderId: id });
    ctx.saveConfigValue('llm_providers', JSON.stringify(providers));
    ctx.saveConfigValue('default_llm_provider_id', id);
    json(res, { defaultId: id, saved: true });
    return true;
  }

  if (url.match(/^\/api\/llm-providers\/[^/]+$/) && method === 'PUT') {
    if (!ctx.agentOrchestrator) {
      error(res, 'Agent not initialized', 503);
      return true;
    }
    const id = url.split('/').pop()!;
    const body = await parseBody(req) as any;
    const config = ctx.agentOrchestrator.getConfig();
    const providers = [...(config.llmProviders || [])];
    const idx = providers.findIndex(p => p.id === id);
    if (idx === -1) {
      error(res, 'Provider not found', 404);
      return true;
    }
    const existing = providers[idx];
    providers[idx] = {
      ...existing,
      name: body.name ?? existing.name,
      provider: body.provider ?? existing.provider,
      baseUrl: body.baseUrl ?? existing.baseUrl,
      apiKey: (body.apiKey && !body.apiKey.includes('*')) ? body.apiKey : existing.apiKey,
      model: body.model ?? existing.model,
    };
    ctx.agentOrchestrator.updateConfig({ llmProviders: providers });
    ctx.saveConfigValue('llm_providers', JSON.stringify(providers));
    json(res, { provider: { ...providers[idx], apiKey: '***' }, saved: true });
    return true;
  }

  if (url.match(/^\/api\/llm-providers\/[^/]+$/) && method === 'DELETE') {
    if (!ctx.agentOrchestrator) {
      error(res, 'Agent not initialized', 503);
      return true;
    }
    const id = url.split('/').pop()!;
    const config = ctx.agentOrchestrator.getConfig();
    const providers = (config.llmProviders || []).filter(p => p.id !== id);
    if (providers.length === config.llmProviders?.length) {
      error(res, 'Provider not found', 404);
      return true;
    }
    let defaultId = config.defaultLlmProviderId;
    if (defaultId === id && providers.length > 0) {
      providers[0].isDefault = true;
      defaultId = providers[0].id;
    }
    ctx.agentOrchestrator.updateConfig({ llmProviders: providers, defaultLlmProviderId: defaultId });
    ctx.saveConfigValue('llm_providers', JSON.stringify(providers));
    ctx.saveConfigValue('default_llm_provider_id', defaultId);
    json(res, { deleted: true });
    return true;
  }

  return false;
}
