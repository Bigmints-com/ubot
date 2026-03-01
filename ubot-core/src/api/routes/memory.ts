/**
 * Memory & Persona Routes
 * /api/personas/*, /api/memories/*
 */

import http from 'http';
import { parseBody, json, notFound, error, type ApiContext } from '../context.js';
import { BOT_SOUL_ID, OWNER_SOUL_ID } from '../../memory/soul.js';

export async function handleMemoryRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
  ctx: ApiContext,
): Promise<boolean> {

  // ── Personas / Soul ─────────────────────────────────────
  if (url === '/api/personas' && method === 'GET') {
    if (!ctx.agentOrchestrator) {
      json(res, { personas: [] });
      return true;
    }
    const soulPersonas = ctx.agentOrchestrator.getSoul().listPersonas();
    const agents = ctx.agentOrchestrator.listAgents().map(a => ({
      id: a.id,
      label: a.name || a.id,
      updatedAt: new Date(),
      contentLength: 0,
      type: 'agent'
    }));
    
    json(res, { personas: [...soulPersonas.map(p => ({ ...p, type: 'core' })), ...agents] });
    return true;
  }

  if (url.match(/^\/api\/personas\/[^/]+$/) && method === 'GET') {
    if (!ctx.agentOrchestrator) { json(res, { content: '' }); return true; }
    const parts = url.split('/');
    const personaId = decodeURIComponent(parts[3]);
    let content = ctx.agentOrchestrator.getSoul().getDocument(personaId);
    
    if (!content && personaId !== BOT_SOUL_ID && personaId !== OWNER_SOUL_ID) {
      content = ctx.agentOrchestrator.getAgentMarkdown(personaId) || '';
    }
    
    json(res, { personaId, content });
    return true;
  }

  if (url.match(/^\/api\/personas\/[^/]+$/) && method === 'PUT') {
    if (!ctx.agentOrchestrator) { json(res, { error: 'Agent not initialized' }, 500); return true; }
    const parts = url.split('/');
    const personaId = decodeURIComponent(parts[3]);
    const body = await parseBody(req) as any;
    if (typeof body.content !== 'string') {
      json(res, { error: 'Missing required field: content' }, 400);
      return true;
    }
    
    if (personaId === BOT_SOUL_ID || personaId === OWNER_SOUL_ID || ctx.agentOrchestrator.getSoul().getDocument(personaId)) {
      ctx.agentOrchestrator.getSoul().saveDocument(personaId, body.content);
    } else {
      ctx.agentOrchestrator.saveAgentMarkdown(personaId, body.content);
    }
    
    json(res, { personaId, content: body.content, saved: true });
    return true;
  }

  if (url.match(/^\/api\/personas\/[^/]+$/) && method === 'DELETE') {
    if (!ctx.agentOrchestrator) { json(res, { error: 'Agent not initialized' }, 500); return true; }
    const parts = url.split('/');
    const personaId = decodeURIComponent(parts[3]);
    const deleted = ctx.agentOrchestrator.getSoul().deleteDocument(personaId);
    json(res, { deleted, personaId });
    return true;
  }

  // ── Memories (Structured Profile Data) ──────────────────
  if (url.match(/^\/api\/memories\/[^/]+$/) && method === 'GET') {
    if (!ctx.agentOrchestrator) { json(res, { memories: [] }); return true; }
    const parts = url.split('/');
    const contactId = decodeURIComponent(parts[3]);
    const memories = ctx.agentOrchestrator.getMemoryStore().getMemories(contactId);
    json(res, { memories });
    return true;
  }

  if (url === '/api/memories' && method === 'POST') {
    if (!ctx.agentOrchestrator) { json(res, { error: 'Agent not initialized' }, 500); return true; }
    const body = await parseBody(req) as any;
    if (!body.contactId || !body.category || !body.key || !body.value) {
      json(res, { error: 'contactId, category, key, and value are required' }, 400);
      return true;
    }
    const memory = ctx.agentOrchestrator.getMemoryStore().saveMemory(
      body.contactId, body.category, body.key, body.value, body.source || 'manual', body.confidence || 1.0
    );
    json(res, { memory });
    return true;
  }

  if (url.match(/^\/api\/memories\/[^/]+$/) && method === 'DELETE') {
    if (!ctx.agentOrchestrator) { json(res, { error: 'Agent not initialized' }, 500); return true; }
    const parts = url.split('/');
    const memoryId = decodeURIComponent(parts[3]);
    const deleted = ctx.agentOrchestrator.getMemoryStore().deleteMemory(memoryId);
    json(res, { deleted });
    return true;
  }

  // ── Scheduler/Tasks ───────────────────────────────────
  if (url === '/api/scheduler/tasks' && method === 'GET') {
    if (!ctx.scheduler) {
      json(res, { tasks: [], total: 0 });
      return true;
    }
    const result = ctx.scheduler.listTasks();
    json(res, result);
    return true;
  }

  if (url === '/api/scheduler/stats' && method === 'GET') {
    if (!ctx.scheduler) {
      json(res, { totalTasks: 0, runningTasks: 0, completedTasks: 0, failedTasks: 0 });
      return true;
    }
    const stats = ctx.scheduler.getStats();
    json(res, stats);
    return true;
  }

  // ── Approvals ───────────────────────────────────────────
  if (url === '/api/approvals' && method === 'GET') {
    if (!ctx.approvalStore) {
      json(res, { approvals: [] });
      return true;
    }
    const params = new URLSearchParams(url.split('?')[1] || '');
    const status = params.get('status');
    const approvals = status === 'pending' ? ctx.approvalStore.getPending() : ctx.approvalStore.getAll();
    json(res, { approvals });
    return true;
  }

  if (url.match(/^\/api\/approvals\/[^/]+\/respond$/) && method === 'POST') {
    if (!ctx.approvalStore) {
      error(res, 'Approval system not initialized', 503);
      return true;
    }
    const parts = url.split('/');
    const approvalId = decodeURIComponent(parts[3]);
    const body = await parseBody(req) as any;
    const response = body.response || body.message || '';

    if (!response.trim()) {
      error(res, 'Response is required');
      return true;
    }

    const approval = ctx.approvalStore.getById(approvalId);
    if (!approval) {
      notFound(res);
      return true;
    }

    const resolved = ctx.approvalStore.resolve(approvalId, response);

    if (approval.requesterJid && ctx.agentOrchestrator) {
      const source = approval.requesterJid.startsWith('telegram:') ? 'telegram' : 'whatsapp';
      const sessionId = approval.requesterJid;
      
      const systemMessage = `[SYSTEM] The owner has responded to the pending approval request (ID: ${approvalId}). The owner's answer is: "${response}"\n\nCompose a natural, friendly reply to the visitor incorporating the owner's answer. Do NOT use send_message or any other tool — just write the reply text. It will be delivered automatically.`;
      
      ctx.agentOrchestrator.chat(sessionId, systemMessage, source).then(result => {
        const reply = result.content || response;
        if (source === 'telegram' && ctx.tgConnection) {
          const chatId = Number(sessionId.replace('telegram:', ''));
          ctx.tgConnection.sendMessage(chatId, reply);
        } else if (source === 'whatsapp' && ctx.waConnection?.isConnected) {
          const jid = sessionId.includes('@') ? sessionId : `${sessionId.replace(/\D/g, '')}@s.whatsapp.net`;
          ctx.waConnection.sendMessage(jid, { text: reply });
        }
      }).catch(err => {
        console.error(`[Approvals] Follow-up failed for ${sessionId}:`, err.message);
      });
    }

    json(res, { approval: resolved, relayed: true });
    return true;
  }

  if (url.match(/^\/api\/approvals\/[^/]+$/) && method === 'GET') {
    if (!ctx.approvalStore) {
      notFound(res);
      return true;
    }
    const parts = url.split('/');
    const approvalId = decodeURIComponent(parts[3]);
    const approval = ctx.approvalStore.getById(approvalId);
    if (!approval) {
      notFound(res);
      return true;
    }
    json(res, { approval });
    return true;
  }

  return false;
}
