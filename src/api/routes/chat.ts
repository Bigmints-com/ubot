import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { LLMProviderConfig, Attachment } from '../../engine/types.js';
import { parseBody, parseLargeBody, json, notFound, error, type ApiContext } from '../context.js';

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
    // Use large body parser for file uploads
    const body = await parseLargeBody(req) as any;
    
    if ((body as any)._error) {
      error(res, 'Payload too large (max 15MB)', 413);
      return true;
    }
    
    const message = body.message || body.content || '';
    const sessionId = body.sessionId || 'web-console';
    
    if (!message.trim()) {
      error(res, 'Message is required');
      return true;
    }

    // Process attachments if present
    let attachments: Attachment[] | undefined;
    console.log(`[Upload] body.attachments present: ${Array.isArray(body.attachments)}, count: ${body.attachments?.length || 0}`);
    if (Array.isArray(body.attachments) && body.attachments.length > 0) {
      attachments = [];
      
      // Ensure uploads directory exists
      const uploadsDir = path.join(ctx.workspacePath || path.join(process.cwd(), 'workspace'), 'uploads');
      console.log(`[Upload] Uploads dir: ${uploadsDir}`);
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      for (const att of body.attachments) {
        console.log(`[Upload] Processing: ${att.filename}, type: ${att.mimeType}, base64 len: ${att.base64?.length || 0}`);
        if (!att.filename || !att.base64 || !att.mimeType) {
          console.log(`[Upload] Skipping — missing fields: filename=${!!att.filename}, base64=${!!att.base64}, mimeType=${!!att.mimeType}`);
          continue;
        }

        const id = crypto.randomUUID();
        const ext = path.extname(att.filename) || '';
        const safeName = `${id}${ext}`;
        const filePath = path.join(uploadsDir, safeName);

        // Decode and save the file
        const buffer = Buffer.from(att.base64, 'base64');
        fs.writeFileSync(filePath, buffer);
        console.log(`[Upload] Saved ${safeName} (${buffer.length} bytes)`);

        const attachment: Attachment = {
          id,
          filename: att.filename,
          mimeType: att.mimeType,
          path: filePath,
          size: buffer.length,
        };

        // For images: keep base64 for LLM vision
        if (att.mimeType.startsWith('image/')) {
          attachment.base64 = att.base64;
        }

        // For PDFs: extract text
        if (att.mimeType === 'application/pdf') {
          try {
            console.log(`[Upload] Parsing PDF: ${att.filename}`);
            const { PDFParse } = await import('pdf-parse');
            const parser = new PDFParse({ data: new Uint8Array(buffer) });
            let text = String(await parser.getText() || '');
            console.log(`[Upload] PDF text extracted: ${text.length} chars`);
            if (text.length > 100000) {
              text = text.slice(0, 100000) + '\n\n... (truncated)';
            }
            attachment.textContent = text;
          } catch (err: any) {
            console.error('[Upload] PDF parse error:', err.message);
            attachment.textContent = `[Failed to extract PDF text: ${err.message}]`;
          }
        }

        // For text-based documents: read as text
        if (/^text\/|application\/json|application\/xml/.test(att.mimeType)) {
          attachment.textContent = buffer.toString('utf8');
          if (attachment.textContent.length > 100000) {
            attachment.textContent = attachment.textContent.slice(0, 100000) + '\n\n... (truncated)';
          }
        }

        console.log(`[Upload] Attachment ready: ${att.filename}, hasText: ${!!attachment.textContent}, textLen: ${attachment.textContent?.length || 0}`);
        attachments.push(attachment);
      }

      if (attachments.length === 0) attachments = undefined;
    }

    try {
      const response = await ctx.agentOrchestrator.chat(
        sessionId, message, 'web', undefined, undefined, attachments
      );
      json(res, response);
    } catch (e: any) {
      console.error('[API] Chat error:', e);
      error(res, e.message, 500);
    }
    return true;
  }

  // ── Serve uploaded files ────────────────────────────────
  if (url.startsWith('/api/chat/uploads/') && method === 'GET') {
    const fileId = url.replace('/api/chat/uploads/', '').split('?')[0];
    const uploadsDir = path.join(ctx.workspacePath || path.join(process.cwd(), 'workspace'), 'uploads');
    
    // Find the file by ID prefix
    try {
      const files = fs.readdirSync(uploadsDir);
      const match = files.find(f => f.startsWith(fileId));
      if (match) {
        const filePath = path.join(uploadsDir, match);
        const stat = fs.statSync(filePath);
        const ext = path.extname(match).toLowerCase();
        const mimeMap: Record<string, string> = {
          '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
          '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf',
          '.svg': 'image/svg+xml',
        };
        res.writeHead(200, {
          'Content-Type': mimeMap[ext] || 'application/octet-stream',
          'Content-Length': stat.size,
          'Cache-Control': 'public, max-age=86400',
        });
        fs.createReadStream(filePath).pipe(res);
      } else {
        error(res, 'File not found', 404);
      }
    } catch {
      error(res, 'File not found', 404);
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

    // Save directly to config.json (single source of truth)
    const { loadUbotConfig, saveUbotConfig } = await import('../../data/config.js');
    const cfg = loadUbotConfig();
    if (body.ownerPhone !== undefined) { if (!cfg.owner) cfg.owner = {}; cfg.owner.phone = updated.ownerPhone || ''; }
    if (body.ownerTelegramId !== undefined) { if (!cfg.owner) cfg.owner = {}; cfg.owner.telegram_id = updated.ownerTelegramId || ''; }
    if (body.ownerTelegramUsername !== undefined) { if (!cfg.owner) cfg.owner = {}; cfg.owner.telegram_username = updated.ownerTelegramUsername || ''; }
    if (body.autoReplyWhatsApp !== undefined) { if (!cfg.channels) cfg.channels = {}; if (!cfg.channels.whatsapp) cfg.channels.whatsapp = {}; cfg.channels.whatsapp.auto_reply = updated.autoReplyWhatsApp; }
    if (body.autoReplyTelegram !== undefined) { if (!cfg.channels) cfg.channels = {}; if (!cfg.channels.telegram) cfg.channels.telegram = {}; cfg.channels.telegram.auto_reply = updated.autoReplyTelegram; }
    if (body.maxHistoryMessages !== undefined) { if (!cfg.agent) cfg.agent = {}; cfg.agent.max_history_messages = updated.maxHistoryMessages; }
    saveUbotConfig(cfg);

    json(res, {
      llmBaseUrl: updated.llmBaseUrl,
      llmModel: updated.llmModel,
      temperature: updated.temperature,
      maxTokens: updated.maxTokens,
      maxHistoryMessages: updated.maxHistoryMessages,
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

  // Legacy /api/llm-providers GET — reads from new keyed format
  if (url === '/api/llm-providers' && method === 'GET') {
    const { loadUbotConfig } = await import('../../data/config.js');
    const cfg = loadUbotConfig();
    const providers = Object.entries(cfg.models?.providers || {})
      .filter(([_, p]) => p.enabled !== false)
      .map(([key, p]) => ({
        id: key,
        name: key,
        provider: key,
        baseUrl: p.baseUrl || '',
        apiKey: p.apiKey ? `${String(p.apiKey).slice(0, 4)}${'*'.repeat(8)}${String(p.apiKey).slice(-4)}` : '',
        model: p.model || '',
        isDefault: key === cfg.models?.default,
      }));
    json(res, { providers, defaultId: cfg.models?.default || '' });
    return true;
  }

  return false;
}
