/**
 * API Router for Ubot Core
 * Handles all /api/* routes with JSON request/response
 */

import http from 'http';
import { createSkillsService, type SkillsService } from './skills/service.js';
import type { DatabaseConnection } from './skills/repository.js';
import type { DatabaseConnection as CoreDatabaseConnection } from './database/types.js';
import { createTaskScheduler, type TaskSchedulerService } from './scheduler/service.js';
import { DEFAULT_SAFETY_CONFIG, type SafetyConfig, type SafetyRule } from './safety/types.js';
import { DEFAULT_SAFETY_RULES } from './safety/utils.js';
import { DEFAULT_WHATSAPP_CONFIG, type WhatsAppConnectionConfig } from './whatsapp/types.js';
import { WhatsAppConnection } from './whatsapp/connection.js';
import { WhatsAppMessagingProvider } from './whatsapp/messaging-provider.js';
import { MessagingRegistry } from './messaging/registry.js';
import { createSkillRepository, type SkillRepository } from './skills/skill-repository.js';
import { createSkillEngine, type SkillEngine } from './skills/skill-engine.js';
import { createEventBus, type EventBus } from './skills/event-bus.js';
import type { SkillEvent } from './skills/skill-types.js';
import type { AgentOrchestrator } from './agent/orchestrator.js';
import { existsSync } from 'fs';
import { join } from 'path';

// In-memory stores for config data (no DB needed for these)
let safetyConfig: SafetyConfig = { ...DEFAULT_SAFETY_CONFIG };
let safetyRules: SafetyRule[] = DEFAULT_SAFETY_RULES.map((r, i) => ({
  ...r,
  id: `rule-${i + 1}`,
  createdAt: new Date(),
  updatedAt: new Date(),
})) as SafetyRule[];
let whatsappConfig: Partial<WhatsAppConnectionConfig> = { ...DEFAULT_WHATSAPP_CONFIG };

// WhatsApp connection state
let waConnection: WhatsAppConnection | null = null;
let waQrCode: string | null = null;
let waStatus: string = 'disconnected';
let waError: string | null = null;

// Recent WhatsApp messages log
const waMessages: Array<{ from: string; to: string; body: string; timestamp: string; isFromMe: boolean }> = [];
const MAX_WA_MESSAGES = 100;

let skillsService: SkillsService | null = null;
let scheduler: TaskSchedulerService | null = null;
let agentOrchestrator: AgentOrchestrator | null = null;

// Platform-agnostic messaging
const messagingRegistry = new MessagingRegistry();
let waProvider: WhatsAppMessagingProvider | null = null;

// Universal skill engine
let skillRepo: SkillRepository | null = null;
let skillEngine: SkillEngine | null = null;
let eventBus: EventBus | null = null;

/** Wire up WhatsApp event handlers on a connection instance */
function setupWhatsAppHandlers(conn: WhatsAppConnection): void {
  conn.on('connection.update', (status, qr) => {
    waStatus = status;
    if (qr) waQrCode = qr;
    if (status === 'connected') {
      waQrCode = null;
      console.log('[WhatsApp] ✅ Connected successfully');
      // Register the WhatsApp provider with the messaging registry
      waProvider = new WhatsAppMessagingProvider(conn);
      messagingRegistry.register(waProvider);
      console.log('[WhatsApp] 📬 Messaging provider registered');
    }
    if (status === 'logged_out') {
      waQrCode = null;
      waError = 'Logged out';
      console.log('[WhatsApp] ⚠️ Logged out');
    }
  });

  conn.on('message.received', async (msg) => {
    waMessages.push({
      from: msg.from || '',
      to: msg.to || '',
      body: msg.body || '',
      timestamp: msg.timestamp?.toISOString() || new Date().toISOString(),
      isFromMe: msg.isFromMe || false,
    });
    if (waMessages.length > MAX_WA_MESSAGES) waMessages.shift();

    // Auto-reply if enabled (config-based)
    if (agentOrchestrator && !msg.isFromMe && msg.body) {
      const config = agentOrchestrator.getConfig();
      if (config.autoReplyWhatsApp) {
        const jid = msg.from || '';
        const shouldReply = config.autoReplyContacts.length === 0 ||
          config.autoReplyContacts.some(c => jid.includes(c.replace(/[^0-9]/g, '')));

        if (shouldReply) {
          try {
            const response = await agentOrchestrator.chat(jid, msg.body, 'whatsapp', msg.from);
            const socket = waConnection?.getSocket();
            if (socket && response.content) {
              await socket.sendMessage(jid, { text: response.content });
              waMessages.push({
                from: 'me',
                to: jid,
                body: response.content,
                timestamp: new Date().toISOString(),
                isFromMe: true,
              });
            }
          } catch (err: any) {
            console.error('[API] Auto-reply error:', err.message);
          }
        }
      }
    }

    // Emit to universal event bus — skill engine handles matching & execution
    if (!msg.isFromMe && msg.body) {
      if (eventBus) {
        const event: SkillEvent = {
          source: 'whatsapp',
          type: 'message',
          from: msg.from || '',
          to: msg.to || '',
          body: msg.body || '',
          timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(),
          data: {
            participant: msg.participant,
            hasMedia: msg.hasMedia,
            quotedMessageId: msg.quotedMessageId,
          },
        };
        eventBus.emit(event);
      } else {
        console.log('[API] ⚠️ No eventBus — skill triggering disabled');
      }
    }
  });
}

/** Auto-connect WhatsApp if a saved session exists on disk */
async function autoConnectWhatsApp(): Promise<void> {
  const sessionPath = (whatsappConfig as any).sessionPath || './sessions';
  const sessionName = (whatsappConfig as any).sessionName || 'ubot-session';
  const credsPath = join(sessionPath, sessionName, 'creds.json');

  if (!existsSync(credsPath)) {
    console.log('[WhatsApp] No saved session found — waiting for manual connect via UI');
    return;
  }

  console.log('[WhatsApp] 🔄 Found saved session, auto-reconnecting...');
  waStatus = 'connecting';

  try {
    waConnection = new WhatsAppConnection({
      ...DEFAULT_WHATSAPP_CONFIG,
      ...whatsappConfig,
      printQRInTerminal: true,
    });

    setupWhatsAppHandlers(waConnection);

    waConnection.connect().catch((err: Error) => {
      console.error('[WhatsApp] Auto-connect failed:', err.message);
      waStatus = 'disconnected';
      waError = err.message;
      waQrCode = null;
    });
  } catch (e: any) {
    console.error('[WhatsApp] Auto-connect error:', e.message);
    waStatus = 'disconnected';
    waError = e.message;
  }
}

export function initializeApi(db?: DatabaseConnection, agent?: AgentOrchestrator): void {
  if (db) {
    skillsService = createSkillsService(db);
    // Initialize universal skill engine + event bus
    skillRepo = createSkillRepository(db as unknown as CoreDatabaseConnection);
    eventBus = createEventBus();
    if (agent) {
      skillEngine = createSkillEngine(
        skillRepo,
        // LLM generate function — direct text generation without tools
        async (systemPrompt: string, userMessage: string) => {
          return agent.generate(systemPrompt, userMessage);
        },
        // Agent chat function — runs through the full tool loop
        async (message: string, sessionId: string) => {
          const result = await agent.chat(sessionId, message, 'web');
          return {
            response: result.content,
            toolCalls: result.toolCalls?.map(tc => ({
              tool: tc.toolName,
              args: {},
              result: tc.result || tc.error,
            })) || [],
          };
        },
      );

      // Wire EventBus → SkillEngine
      eventBus.on(async (event) => {
        if (!skillEngine) return;
        const results = await skillEngine.processEvent(event);
        for (const result of results) {
          if (!result.success || !result.response?.trim()) continue;
          // Get the skill to check outcome
          const skill = skillEngine.getSkill(result.skillId);
          if (!skill) continue;
          const outcome = skill.outcome;
          const socket = waConnection?.getSocket();
          if (!socket) continue;

          if (outcome.action === 'reply') {
            const jid = event.from?.includes('@') ? event.from : `${event.from}@s.whatsapp.net`;
            await socket.sendMessage(jid, { text: result.response });
            console.log(`[SkillOutcome] Replied to ${jid}`);
          } else if (outcome.action === 'send' && outcome.target) {
            const jid = outcome.target.includes('@') ? outcome.target : `${outcome.target}@s.whatsapp.net`;
            await socket.sendMessage(jid, { text: result.response });
            console.log(`[SkillOutcome] Sent to ${jid}`);
          } else if (outcome.action === 'store') {
            console.log(`[SkillOutcome] Stored result for skill "${skill.name}":`, result.response.slice(0, 100));
            // TODO: Store to memory when memory system is wired
          }
          // 'silent' and 'custom' — no additional action needed
        }
      });
    }
  }
  scheduler = createTaskScheduler();
  if (agent) {
    agentOrchestrator = agent;
    registerAgentTools(agent);
  }

  // Auto-reconnect WhatsApp if a saved session exists
  autoConnectWhatsApp();
}

/** Register platform-agnostic tool executors on the agent */
function registerAgentTools(agent: AgentOrchestrator): void {
  const registry = agent.getToolRegistry();

  // send_message — works across any messaging provider
  registry.register('send_message', async (args) => {
    const to = String(args.to || '');
    const body = String(args.body || args.message || '');
    if (!to || !body) {
      return { toolName: 'send_message', success: false, error: 'Missing "to" or "body" parameter', duration: 0 };
    }
    try {
      const provider = messagingRegistry.resolveProvider(args.channel as string | undefined);
      const msg = await provider.sendMessage(to, body);
      return { toolName: 'send_message', success: true, result: `Message sent to ${to} via ${provider.channel}: "${body}"`, duration: 0 };
    } catch (err: any) {
      return { toolName: 'send_message', success: false, error: err.message, duration: 0 };
    }
  });

  // search_messages — search across connected platforms
  registry.register('search_messages', async (args) => {
    try {
      const provider = messagingRegistry.resolveProvider(args.channel as string | undefined);
      const messages = await provider.searchMessages({
        from: args.from as string | undefined,
        to: args.to as string | undefined,
        query: args.query as string | undefined,
        limit: args.limit ? Number(args.limit) : 20,
      });
      if (messages.length === 0) {
        return { toolName: 'search_messages', success: true, result: 'No messages found matching the filter.', duration: 0 };
      }
      const formatted = messages.map(m =>
        `[${m.timestamp.toISOString()}] ${m.isFromMe ? 'Me' : m.from} → ${m.to}: ${m.body}`
      ).join('\n');
      return { toolName: 'search_messages', success: true, result: `Found ${messages.length} messages:\n${formatted}`, duration: 0 };
    } catch (err: any) {
      return { toolName: 'search_messages', success: false, error: err.message, duration: 0 };
    }
  });

  // get_contacts — list contacts from connected platforms
  registry.register('get_contacts', async (args) => {
    try {
      const provider = messagingRegistry.resolveProvider(args.channel as string | undefined);
      const contacts = await provider.getContacts(args.query as string | undefined);
      if (contacts.length === 0) {
        return { toolName: 'get_contacts', success: true, result: 'No contacts found.', duration: 0 };
      }
      const formatted = contacts.map(c =>
        `${c.displayName || c.name || c.phone || c.id}${c.isGroup ? ' (group)' : ''}`
      ).join('\n');
      return { toolName: 'get_contacts', success: true, result: `Found ${contacts.length} contacts:\n${formatted}`, duration: 0 };
    } catch (err: any) {
      return { toolName: 'get_contacts', success: false, error: err.message, duration: 0 };
    }
  });

  // get_conversations — list recent chats
  registry.register('get_conversations', async (args) => {
    try {
      const provider = messagingRegistry.resolveProvider(args.channel as string | undefined);
      const convos = await provider.getConversations(args.limit ? Number(args.limit) : 20);
      if (convos.length === 0) {
        return { toolName: 'get_conversations', success: true, result: 'No conversations found.', duration: 0 };
      }
      const formatted = convos.map(c =>
        `${c.contact.displayName || c.contact.name || c.contact.phone || c.id}: ${c.lastMessage?.body?.slice(0, 50) || '(no messages)'}`
      ).join('\n');
      return { toolName: 'get_conversations', success: true, result: `${convos.length} conversations:\n${formatted}`, duration: 0 };
    } catch (err: any) {
      return { toolName: 'get_conversations', success: false, error: err.message, duration: 0 };
    }
  });

  // delete_message
  registry.register('delete_message', async (args) => {
    const messageId = String(args.messageId || '');
    if (!messageId) {
      return { toolName: 'delete_message', success: false, error: 'Missing messageId', duration: 0 };
    }
    try {
      const provider = messagingRegistry.resolveProvider(args.channel as string | undefined);
      await provider.deleteMessage(messageId);
      return { toolName: 'delete_message', success: true, result: `Message ${messageId} deleted.`, duration: 0 };
    } catch (err: any) {
      return { toolName: 'delete_message', success: false, error: err.message, duration: 0 };
    }
  });

  // reply_to_message
  registry.register('reply_to_message', async (args) => {
    const messageId = String(args.messageId || '');
    const body = String(args.body || '');
    if (!messageId || !body) {
      return { toolName: 'reply_to_message', success: false, error: 'Missing messageId or body', duration: 0 };
    }
    try {
      const provider = messagingRegistry.resolveProvider(args.channel as string | undefined);
      await provider.replyToMessage(messageId, body);
      return { toolName: 'reply_to_message', success: true, result: `Replied to message ${messageId}: "${body}"`, duration: 0 };
    } catch (err: any) {
      return { toolName: 'reply_to_message', success: false, error: err.message, duration: 0 };
    }
  });

  // get_connection_status
  registry.register('get_connection_status', async (args) => {
    if (args.channel) {
      try {
        const provider = messagingRegistry.getProvider(args.channel as any);
        return {
          toolName: 'get_connection_status',
          success: true,
          result: JSON.stringify({ channel: provider.channel, status: provider.status }),
          duration: 0,
        };
      } catch (err: any) {
        return { toolName: 'get_connection_status', success: false, error: err.message, duration: 0 };
      }
    }
    const providers = messagingRegistry.getAllProviders();
    const statuses = providers.map(p => ({ channel: p.channel, status: p.status }));
    return {
      toolName: 'get_connection_status',
      success: true,
      result: statuses.length > 0
        ? JSON.stringify(statuses)
        : 'No messaging providers registered.',
      duration: 0,
    };
  });

  // schedule_message
  registry.register('schedule_message', async (args) => {
    const to = String(args.to || '');
    const body = String(args.body || args.message || '');
    const time = String(args.time || '');
    if (!to || !body || !time) {
      return { toolName: 'schedule_message', success: false, error: 'Missing required parameters', duration: 0 };
    }
    return {
      toolName: 'schedule_message',
      success: true,
      result: `Scheduled message to ${to}: "${body}" at ${time}. (Note: scheduler integration pending)`,
      duration: 0,
    };
  });

  // set_auto_reply
  registry.register('set_auto_reply', async (args) => {
    const contacts = String(args.contacts || '');
    const instructions = String(args.instructions || '');
    const enabled = args.enabled !== false;
    if (agent) {
      const contactList = contacts === 'all' ? [] : contacts.split(',').map(c => c.trim());
      agent.updateConfig({ autoReplyWhatsApp: enabled, autoReplyContacts: contactList });
    }
    return {
      toolName: 'set_auto_reply',
      success: true,
      result: `Auto-reply ${enabled ? 'enabled' : 'disabled'} for ${contacts === 'all' ? 'all contacts' : contacts}. Instructions: ${instructions}`,
      duration: 0,
    };
  });

  // web_search (placeholder)
  registry.register('web_search', async (args) => {
    const query = String(args.query || '');
    return {
      toolName: 'web_search',
      success: true,
      result: `Web search for "${query}" — this feature is coming soon.`,
      duration: 0,
    };
  });

  // ── Skill Management Tools ──────────────────────

  registry.register('list_skills', async () => {
    if (!skillEngine) {
      return { toolName: 'list_skills', success: false, result: 'Skill engine not initialized', duration: 0 };
    }
    const skills = skillEngine.getSkills();
    if (skills.length === 0) {
      return { toolName: 'list_skills', success: true, result: 'No skills configured yet.', duration: 0 };
    }
    const summary = skills.map(s => {
      const status = s.enabled ? '✅ Active' : '❌ Disabled';
      const events = s.trigger.events.join(', ');
      const cond = s.trigger.condition ? ` | condition: "${s.trigger.condition}"` : '';
      const filters = s.trigger.filters || {};
      const filterParts: string[] = [];
      if (filters.contacts?.length) filterParts.push(`contacts: ${filters.contacts.join(', ')}`);
      if (filters.groups?.length) filterParts.push(`groups: ${filters.groups.join(', ')}`);
      if (filters.groupsOnly) filterParts.push('groups only');
      if (filters.pattern) filterParts.push(`pattern: /${filters.pattern}/`);
      const filterStr = filterParts.length ? ` | ${filterParts.join(', ')}` : '';
      return `• [${s.id}] "${s.name}" — ${status}\n  Events: ${events}${cond}${filterStr}\n  Instructions: ${s.processor.instructions.slice(0, 100)}${s.processor.instructions.length > 100 ? '...' : ''}\n  Outcome: ${s.outcome.action}${s.outcome.target ? ' → ' + s.outcome.target : ''}`;
    }).join('\n');
    return { toolName: 'list_skills', success: true, result: `${skills.length} skill(s):\n${summary}`, duration: 0 };
  });

  registry.register('create_skill', async (args) => {
    if (!skillEngine) {
      return { toolName: 'create_skill', success: false, result: 'Skill engine not initialized', duration: 0 };
    }
    // Build trigger
    const events: string[] = [];
    if (args.events) {
      events.push(...String(args.events).split(',').map(e => e.trim()).filter(Boolean));
    } else {
      events.push('whatsapp:message'); // Default
    }
    const filters: Record<string, unknown> = {};
    if (args.contacts) filters.contacts = String(args.contacts).split(',').map(c => c.trim()).filter(Boolean);
    if (args.groups) filters.groups = String(args.groups).split(',').map(g => g.trim()).filter(Boolean);
    if (args.groups_only) filters.groupsOnly = true;
    if (args.pattern) filters.pattern = String(args.pattern);
    if (args.source) filters.source = String(args.source);

    const saved = skillEngine.saveSkill({
      name: String(args.name || ''),
      description: String(args.description || ''),
      trigger: {
        events,
        condition: args.condition ? String(args.condition) : undefined,
        filters: Object.keys(filters).length > 0 ? filters as any : undefined,
      },
      processor: {
        instructions: String(args.instructions || args.prompt || ''),
      },
      outcome: {
        action: (args.outcome || 'reply') as any,
        target: args.outcome_target ? String(args.outcome_target) : undefined,
        channel: args.outcome_channel ? String(args.outcome_channel) : undefined,
      },
      enabled: args.enabled !== false,
    });
    return {
      toolName: 'create_skill',
      success: true,
      result: `Created skill "${saved.name}" (ID: ${saved.id}), events: ${saved.trigger.events.join(', ')}, outcome: ${saved.outcome.action}, enabled: ${saved.enabled}`,
      duration: 0,
    };
  });

  registry.register('update_skill', async (args) => {
    if (!skillEngine) {
      return { toolName: 'update_skill', success: false, result: 'Skill engine not initialized', duration: 0 };
    }
    const id = String(args.skill_id || '');
    if (!id) {
      return { toolName: 'update_skill', success: false, result: 'skill_id is required', duration: 0 };
    }
    const existing = skillEngine.getSkill(id);
    if (!existing) {
      return { toolName: 'update_skill', success: false, result: `Skill not found: ${id}`, duration: 0 };
    }

    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) updates.name = String(args.name);
    if (args.description !== undefined) updates.description = String(args.description);
    if (args.enabled !== undefined) updates.enabled = Boolean(args.enabled);

    // Merge trigger updates
    if (args.events !== undefined || args.condition !== undefined || args.contacts !== undefined ||
        args.groups !== undefined || args.groups_only !== undefined || args.pattern !== undefined) {
      const trigger = { ...existing.trigger };
      if (args.events !== undefined) trigger.events = String(args.events).split(',').map(e => e.trim()).filter(Boolean);
      if (args.condition !== undefined) trigger.condition = String(args.condition) || undefined;
      const filters = { ...(trigger.filters || {}) };
      if (args.contacts !== undefined) filters.contacts = String(args.contacts).split(',').map(c => c.trim()).filter(Boolean);
      if (args.groups !== undefined) filters.groups = String(args.groups).split(',').map(g => g.trim()).filter(Boolean);
      if (args.groups_only !== undefined) filters.groupsOnly = Boolean(args.groups_only);
      if (args.pattern !== undefined) filters.pattern = String(args.pattern) || undefined;
      trigger.filters = Object.keys(filters).length > 0 ? filters as any : undefined;
      updates.trigger = trigger;
    }

    // Merge processor updates
    if (args.instructions !== undefined || args.prompt !== undefined) {
      updates.processor = {
        ...existing.processor,
        instructions: String(args.instructions || args.prompt),
      };
    }

    // Merge outcome updates
    if (args.outcome !== undefined || args.outcome_target !== undefined) {
      updates.outcome = {
        ...existing.outcome,
        ...(args.outcome ? { action: String(args.outcome) } : {}),
        ...(args.outcome_target !== undefined ? { target: String(args.outcome_target) } : {}),
      };
    }

    const updated = skillEngine.updateSkill(id, updates as any);
    if (!updated) {
      return { toolName: 'update_skill', success: false, result: `Failed to update skill: ${id}`, duration: 0 };
    }
    return {
      toolName: 'update_skill',
      success: true,
      result: `Updated skill "${updated.name}" (ID: ${id}). Changes: ${Object.keys(updates).join(', ')}`,
      duration: 0,
    };
  });

  registry.register('delete_skill', async (args) => {
    if (!skillEngine) {
      return { toolName: 'delete_skill', success: false, result: 'Skill engine not initialized', duration: 0 };
    }
    const id = String(args.skill_id || '');
    if (!id) {
      return { toolName: 'delete_skill', success: false, result: 'skill_id is required', duration: 0 };
    }
    const deleted = skillEngine.deleteSkill(id);
    if (!deleted) {
      return { toolName: 'delete_skill', success: false, result: `Skill not found: ${id}`, duration: 0 };
    }
    return {
      toolName: 'delete_skill',
      success: true,
      result: `Deleted skill "${id}" successfully.`,
      duration: 0,
    };
  });
}

async function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: string) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function notFound(res: http.ServerResponse): void {
  json(res, { error: 'Not found' }, 404);
}

function error(res: http.ServerResponse, message: string, status = 400): void {
  json(res, { error: message }, status);
}

export async function handleApiRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string
): Promise<boolean> {
  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return true;
  }

  // ── Chat / Agent ────────────────────────────────────────

  if (url === '/api/chat' && method === 'POST') {
    if (!agentOrchestrator) {
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
      const response = await agentOrchestrator.chat(sessionId, message, 'web');
      json(res, response);
    } catch (e: any) {
      console.error('[API] Chat error:', e);
      error(res, e.message, 500);
    }
    return true;
  }

  if (url === '/api/chat/history' && method === 'GET') {
    if (!agentOrchestrator) {
      json(res, { messages: [] });
      return true;
    }
    const urlObj = new URL(url, 'http://localhost');
    const sessionId = urlObj.searchParams.get('sessionId') || 'web-console';
    const limit = parseInt(urlObj.searchParams.get('limit') || '50', 10);
    const store = agentOrchestrator.getConversationStore();
    const messages = store.getHistory(sessionId, limit);
    json(res, { messages });
    return true;
  }

  if (url.startsWith('/api/chat/history') && method === 'GET') {
    if (!agentOrchestrator) {
      json(res, { messages: [] });
      return true;
    }
    // Parse query params from URL
    const qIdx = url.indexOf('?');
    const params = qIdx >= 0 ? new URLSearchParams(url.slice(qIdx)) : new URLSearchParams();
    const sessionId = params.get('sessionId') || 'web-console';
    const limit = parseInt(params.get('limit') || '50', 10);
    const store = agentOrchestrator.getConversationStore();
    const messages = store.getHistory(sessionId, limit);
    json(res, { messages });
    return true;
  }

  if (url === '/api/chat/clear' && method === 'POST') {
    if (!agentOrchestrator) {
      json(res, { cleared: true });
      return true;
    }
    const body = await parseBody(req) as any;
    const sessionId = body.sessionId || 'web-console';
    agentOrchestrator.getConversationStore().clearSession(sessionId);
    json(res, { cleared: true, sessionId });
    return true;
  }

  if (url === '/api/chat/sessions' && method === 'GET') {
    if (!agentOrchestrator) {
      json(res, { sessions: [] });
      return true;
    }
    const sessions = agentOrchestrator.getConversationStore().listSessions();
    json(res, { sessions });
    return true;
  }

  if (url === '/api/chat/config' && method === 'GET') {
    if (!agentOrchestrator) {
      json(res, { error: 'Agent not initialized' }, 503);
      return true;
    }
    const config = agentOrchestrator.getConfig();
    // Don't expose the API key
    json(res, {
      llmBaseUrl: config.llmBaseUrl,
      llmModel: config.llmModel,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      maxHistoryMessages: config.maxHistoryMessages,
      autoReplyWhatsApp: config.autoReplyWhatsApp,
      autoReplyContacts: config.autoReplyContacts,
    });
    return true;
  }

  if (url === '/api/chat/config' && method === 'PUT') {
    if (!agentOrchestrator) {
      json(res, { error: 'Agent not initialized' }, 503);
      return true;
    }
    const body = await parseBody(req) as any;
    const updated = agentOrchestrator.updateConfig(body);
    json(res, {
      llmBaseUrl: updated.llmBaseUrl,
      llmModel: updated.llmModel,
      temperature: updated.temperature,
      maxTokens: updated.maxTokens,
      autoReplyWhatsApp: updated.autoReplyWhatsApp,
      saved: true,
    });
    return true;
  }

  if (url === '/api/whatsapp/messages' && method === 'GET') {
    json(res, { messages: waMessages.slice(-50) });
    return true;
  }

  // ── User Skills (prompt-generated) ─────────────────────
  if (url === '/api/skills' && method === 'GET') {
    if (!skillEngine) {
      json(res, { skills: [] });
      return true;
    }
    json(res, { skills: skillEngine.getSkills() });
    return true;
  }

  if (url === '/api/skills' && method === 'POST') {
    if (!skillEngine) {
      error(res, 'Skill engine not initialized', 503);
      return true;
    }
    const body = await parseBody(req) as any;
    try {
      const saved = skillEngine.saveSkill(body);
      json(res, saved, 201);
    } catch (e: any) {
      error(res, e.message);
    }
    return true;
  }

  // /api/skills/generate — deprecated in universal engine
  if (url === '/api/skills/generate' && method === 'POST') {
    error(res, 'Skill generation via API is deprecated. Use chat to create skills with natural language.', 410);
    return true;
  }

  if (url.match(/^\/api\/skills\/[^/]+\/run$/) && method === 'POST') {
    if (!skillEngine) {
      error(res, 'Skill engine not initialized', 503);
      return true;
    }
    const parts = url.split('/');
    const id = parts[parts.length - 2];
    const body = await parseBody(req) as any;
    try {
      const event: SkillEvent = {
        source: 'api',
        type: 'manual_run',
        body: body.message || '',
        from: body.from || 'api',
        timestamp: new Date(),
        data: body.parameters || {},
      };
      const result = await skillEngine.runSkill(id, event);
      json(res, result);
    } catch (e: any) {
      error(res, e.message, 500);
    }
    return true;
  }

  if (url.match(/^\/api\/skills\/[^/]+$/) && method === 'PUT') {
    if (!skillEngine) {
      error(res, 'Skill engine not initialized', 503);
      return true;
    }
    const id = url.split('/').pop()!;
    const body = await parseBody(req) as any;
    try {
      const updated = skillEngine.updateSkill(id, body);
      if (updated) json(res, updated);
      else notFound(res);
    } catch (e: any) {
      error(res, e.message, 500);
    }
    return true;
  }

  if (url.match(/^\/api\/skills\/[^/]+$/) && method === 'DELETE') {
    if (!skillEngine) {
      error(res, 'Skill engine not initialized', 503);
      return true;
    }
    const id = url.split('/').pop()!;
    try {
      const deleted = skillEngine.deleteSkill(id);
      json(res, { deleted });
    } catch (e: any) {
      error(res, e.message, 500);
    }
    return true;
  }

  // ── WhatsApp Config ───────────────────────────────────
  if (url === '/api/whatsapp/config' && method === 'GET') {
    json(res, { config: whatsappConfig, status: waStatus });
    return true;
  }

  if (url === '/api/whatsapp/config' && method === 'PUT') {
    const body = await parseBody(req) as any;
    whatsappConfig = { ...whatsappConfig, ...body };
    json(res, { config: whatsappConfig, saved: true });
    return true;
  }

  // ── WhatsApp QR & Connection ──────────────────────────
  if (url === '/api/whatsapp/qr' && method === 'GET') {
    json(res, { qr: waQrCode, status: waStatus, error: waError });
    return true;
  }

  if (url === '/api/whatsapp/status' && method === 'GET') {
    json(res, { status: waStatus, qr: waQrCode, error: waError });
    return true;
  }

  if (url === '/api/whatsapp/connect' && method === 'POST') {
    if (waStatus === 'connected') {
      json(res, { status: 'connected', message: 'Already connected' });
      return true;
    }
    waError = null;
    waQrCode = null;
    waStatus = 'connecting';

    try {
      waConnection = new WhatsAppConnection({
        ...DEFAULT_WHATSAPP_CONFIG,
        ...whatsappConfig,
        printQRInTerminal: true,
      });

      waConnection.on('connection.update', (status, qr) => {
        waStatus = status;
        if (qr) waQrCode = qr;
        if (status === 'connected') waQrCode = null;
        if (status === 'logged_out') {
          waQrCode = null;
          waError = 'Logged out';
        }
      });

      // Wire incoming WhatsApp messages to the agent
      waConnection.on('message.received', async (msg) => {
        // Log the message
        waMessages.push({
          from: msg.from || '',
          to: msg.to || '',
          body: msg.body || '',
          timestamp: msg.timestamp?.toISOString() || new Date().toISOString(),
          isFromMe: msg.isFromMe || false,
        });
        if (waMessages.length > MAX_WA_MESSAGES) waMessages.shift();

        // Auto-reply if enabled
        if (agentOrchestrator && !msg.isFromMe && msg.body) {
          const config = agentOrchestrator.getConfig();
          if (config.autoReplyWhatsApp) {
            const jid = msg.from || '';
            const shouldReply = config.autoReplyContacts.length === 0 ||
              config.autoReplyContacts.some(c => jid.includes(c.replace(/[^0-9]/g, '')));
            
            if (shouldReply) {
              try {
                const response = await agentOrchestrator.chat(jid, msg.body, 'whatsapp', msg.from);
                // Send the reply back via WhatsApp
                const socket = waConnection?.getSocket();
                if (socket && response.content) {
                  await socket.sendMessage(jid, { text: response.content });
                  waMessages.push({
                    from: 'me',
                    to: jid,
                    body: response.content,
                    timestamp: new Date().toISOString(),
                    isFromMe: true,
                  });
                }
              } catch (err: any) {
                console.error('[API] Auto-reply error:', err.message);
              }
            }
          }
        }
      });

      // Start connection in the background (don't await — it blocks until connected)
      waConnection.connect().catch((err: Error) => {
        waStatus = 'disconnected';
        waError = err.message;
        waQrCode = null;
      });

      json(res, { status: 'connecting', message: 'Connection initiated — poll /api/whatsapp/qr for QR code' });
    } catch (e: any) {
      waStatus = 'disconnected';
      waError = e.message;
      error(res, e.message, 500);
    }
    return true;
  }

  if (url === '/api/whatsapp/disconnect' && method === 'POST') {
    if (waConnection) {
      try {
        await waConnection.disconnect();
      } catch {}
      waConnection = null;
    }
    waStatus = 'disconnected';
    waQrCode = null;
    waError = null;
    json(res, { status: 'disconnected' });
    return true;
  }

  // ── Safety Rules ──────────────────────────────────────
  if (url === '/api/safety/rules' && method === 'GET') {
    json(res, { rules: safetyRules, total: safetyRules.length });
    return true;
  }

  if (url === '/api/safety/rules' && method === 'POST') {
    const body = await parseBody(req) as any;
    const rule: SafetyRule = {
      id: `rule-${Date.now()}`,
      name: body.name || 'New Rule',
      description: body.description || '',
      category: body.category || 'custom',
      level: body.level || 'medium',
      action: body.action || 'warn',
      keywords: body.keywords || [],
      pattern: body.pattern,
      enabled: body.enabled !== false,
      priority: body.priority || 50,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    safetyRules.push(rule);
    json(res, rule, 201);
    return true;
  }

  if (url.match(/^\/api\/safety\/rules\/[^/]+$/) && method === 'PUT') {
    const id = url.split('/').pop()!;
    const body = await parseBody(req) as any;
    const idx = safetyRules.findIndex(r => r.id === id);
    if (idx === -1) { notFound(res); return true; }
    safetyRules[idx] = { ...safetyRules[idx], ...body, updatedAt: new Date() };
    json(res, safetyRules[idx]);
    return true;
  }

  if (url.match(/^\/api\/safety\/rules\/[^/]+$/) && method === 'DELETE') {
    const id = url.split('/').pop()!;
    const idx = safetyRules.findIndex(r => r.id === id);
    if (idx === -1) { notFound(res); return true; }
    safetyRules.splice(idx, 1);
    json(res, { deleted: true });
    return true;
  }

  if (url === '/api/safety/config' && method === 'GET') {
    json(res, safetyConfig);
    return true;
  }

  if (url === '/api/safety/config' && method === 'PUT') {
    const body = await parseBody(req) as any;
    safetyConfig = { ...safetyConfig, ...body };
    json(res, { config: safetyConfig, saved: true });
    return true;
  }

  // ── Scheduler/Tasks ───────────────────────────────────
  if (url === '/api/scheduler/tasks' && method === 'GET') {
    if (!scheduler) {
      json(res, { tasks: [], total: 0 });
      return true;
    }
    const result = scheduler.listTasks();
    json(res, result);
    return true;
  }

  if (url === '/api/scheduler/stats' && method === 'GET') {
    if (!scheduler) {
      json(res, { totalTasks: 0, runningTasks: 0, completedTasks: 0, failedTasks: 0 });
      return true;
    }
    const stats = scheduler.getStats();
    json(res, stats);
    return true;
  }

  return false; // Not handled
}
