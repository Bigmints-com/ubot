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
import { TelegramConnection } from './telegram/connection.js';
import { TelegramMessagingProvider } from './telegram/messaging-provider.js';
import { MessagingRegistry } from './messaging/registry.js';
import { createSkillRepository, type SkillRepository } from './skills/skill-repository.js';
import { createSkillEngine, type SkillEngine } from './skills/skill-engine.js';
import { createEventBus, type EventBus } from './skills/event-bus.js';
import type { SkillEvent } from './skills/skill-types.js';
import { createApprovalStore, type ApprovalStore } from './agent/pending-approvals.js';
import { getBrowserSkill } from './browser-skill.js';
import type { AgentOrchestrator } from './agent/orchestrator.js';
import { log } from './logger.js';
import { handleIncomingMessage, type UnifiedMessage, type UnifiedDeps } from './unified-message.js';
import { existsSync } from 'fs';
import { join } from 'path';
import * as chrono from 'chrono-node';

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

// Telegram connection state
let tgConnection: TelegramConnection | null = null;
let tgStatus: string = 'disconnected';
let tgError: string | null = null;
let tgProvider: TelegramMessagingProvider | null = null;

// Recent Telegram messages log
const tgMessages: Array<{ from: string; to: string; body: string; timestamp: string; isFromMe: boolean }> = [];
const MAX_TG_MESSAGES = 100;

// Universal skill engine
let skillRepo: SkillRepository | null = null;
let skillEngine: SkillEngine | null = null;
let eventBus: EventBus | null = null;

// Owner approval system
let approvalStore: ApprovalStore | null = null;

// Database reference for config persistence
let coreDb: CoreDatabaseConnection | null = null;

/** Save a value to the config_store table */
function saveConfigValue(key: string, value: string): void {
  if (!coreDb) return;
  try {
    const now = new Date().toISOString();
    coreDb.execute(
      `INSERT INTO config_store (key, value, source, created_at, updated_at)
       VALUES (?, ?, 'database', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, now, now]
    );
  } catch (err: any) {
    console.error(`[Config] Failed to save ${key}:`, err.message);
  }
}

/** Load a value from the config_store table */
function loadConfigValue(key: string): string | null {
  if (!coreDb) return null;
  try {
    const row = coreDb.queryOne<{ value: string }>(
      `SELECT value FROM config_store WHERE key = ?`,
      [key]
    );
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/** Relay an approval response to the requester via the correct channel */
async function relayApprovalResponse(requesterJid: string, message: string): Promise<boolean> {
  // Telegram requester — stored as "telegram:<chatId>"
  if (requesterJid.startsWith('telegram:')) {
    const chatId = Number(requesterJid.replace('telegram:', ''));
    if (tgConnection && !isNaN(chatId)) {
      try {
        await tgConnection.sendMessage(chatId, message);
        console.log(`[Approvals] Relayed response to Telegram chat ${chatId}`);
        tgMessages.push({ from: 'bot', to: String(chatId), body: message, timestamp: new Date().toISOString(), isFromMe: true });
        return true;
      } catch (err: any) {
        console.error('[Approvals] Failed to relay to Telegram:', err.message);
      }
    }
    return false;
  }

  // WhatsApp requester
  if (waConnection?.isConnected) {
    try {
      const jid = requesterJid.includes('@')
        ? requesterJid
        : `${requesterJid.replace(/\D/g, '')}@s.whatsapp.net`;
      await waConnection.sendMessage(jid, { text: message });
      console.log(`[Approvals] Relayed response to WhatsApp ${jid}`);
      waMessages.push({ from: 'me', to: jid, body: message, timestamp: new Date().toISOString(), isFromMe: true });
      return true;
    } catch (err: any) {
      console.error('[Approvals] Failed to relay to WhatsApp:', err.message);
    }
  }

  // Fallback: bare numeric ID might be a Telegram chatId (LLM sometimes omits the prefix)
  if (tgConnection && /^\d+$/.test(requesterJid)) {
    try {
      const chatId = Number(requesterJid);
      await tgConnection.sendMessage(chatId, message);
      console.log(`[Approvals] Relayed response to Telegram (fallback) chat ${chatId}`);
      tgMessages.push({ from: 'bot', to: requesterJid, body: message, timestamp: new Date().toISOString(), isFromMe: true });
      return true;
    } catch (err: any) {
      console.error('[Approvals] Failed to relay to Telegram (fallback):', err.message);
    }
  }

  return false;
}

/** Wire up WhatsApp event handlers on a connection instance */
function setupWhatsAppHandlers(conn: WhatsAppConnection): void {
  conn.on('connection.update', (status, qr) => {
    waStatus = status;
    if (qr) waQrCode = qr;
    if (status === 'connected') {
      waQrCode = null;
      log.info('WhatsApp', 'Connected successfully');
      // Register the WhatsApp provider with the messaging registry
      waProvider = new WhatsAppMessagingProvider(conn);
      messagingRegistry.register(waProvider);
      log.info('WhatsApp', 'Messaging provider registered');
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

    if (!msg.body || msg.isFromMe || !agentOrchestrator) return;

    const jid = msg.from || '';
    const replyJid = msg.rawJid || jid; // Use original LID/JID for replies
    const unified: UnifiedMessage = {
      channel: 'whatsapp',
      senderId: jid,  // Resolved phone JID for identification
      senderName: msg.from || '',
      body: msg.body,
      timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(),
      replyFn: async (text: string) => {
        if (waConnection?.isConnected) {
          log.info('WhatsApp', `Sending reply to rawJid=${replyJid} (resolved=${jid})`);
          await waConnection.sendMessage(replyJid, { text });
          waMessages.push({ from: 'me', to: jid, body: text, timestamp: new Date().toISOString(), isFromMe: true });
        }
      },
      extra: {
        rawJid: replyJid,
        participant: msg.participant,
        hasMedia: msg.hasMedia,
        quotedMessageId: msg.quotedMessageId,
      },
    };

    const deps: UnifiedDeps = {
      orchestrator: agentOrchestrator,
      approvalStore,
      eventBus,
      skillEngine,
      saveConfigValue,
      relayMessage: relayApprovalResponse,
    };

    await handleIncomingMessage(unified, deps);
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

  log.info('WhatsApp', 'Found saved session, auto-reconnecting...');
  waStatus = 'connecting';

  try {
    waConnection = new WhatsAppConnection({
      ...DEFAULT_WHATSAPP_CONFIG,
      ...whatsappConfig,
      printQRInTerminal: true,
    });

    setupWhatsAppHandlers(waConnection);

    waConnection.connect().catch((err: Error) => {
      log.error('WhatsApp', `Auto-connect failed: ${err.message}`);
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

/** Set up all event handlers on a TelegramConnection instance */
function setupTelegramHandlers(conn: TelegramConnection): void {
  // Clear any previously registered handlers to prevent duplicate responses
  conn.removeAllListeners();
  conn.on('connection.update', (status) => {
    tgStatus = status;
    if (status === 'connected') {
      log.info('Telegram', 'Connected');
      tgProvider = new TelegramMessagingProvider(conn);
      messagingRegistry.register(tgProvider);
      log.info('Telegram', 'Messaging provider registered');
    }
    if (status === 'error') {
      tgError = 'Connection error';
    }
  });

  conn.on('message.received', async (msg) => {
    tgMessages.push({
      from: msg.from || '',
      to: 'bot',
      body: msg.body || '',
      timestamp: msg.timestamp?.toISOString() || new Date().toISOString(),
      isFromMe: msg.isFromMe || false,
    });
    if (tgMessages.length > MAX_TG_MESSAGES) tgMessages.shift();

    if (!msg.body || msg.isFromMe || !agentOrchestrator) return;

    const senderChatId = String(msg.chatId);
    const unified: UnifiedMessage = {
      channel: 'telegram',
      senderId: senderChatId,
      senderName: msg.from || '',
      senderUsername: (msg.fromUsername || '').toLowerCase(),
      body: msg.body,
      timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(),
      replyFn: async (text: string) => {
        if (conn) {
          await conn.sendMessage(msg.chatId, text);
          tgMessages.push({ from: 'bot', to: senderChatId, body: text, timestamp: new Date().toISOString(), isFromMe: true });
        }
      },
      extra: { chatId: msg.chatId },
    };

    const deps: UnifiedDeps = {
      orchestrator: agentOrchestrator,
      approvalStore,
      eventBus,
      skillEngine,
      saveConfigValue,
      relayMessage: relayApprovalResponse,
    };

    await handleIncomingMessage(unified, deps);
  });

  conn.on('error', (err) => {
    tgError = err.message;
    log.error('Telegram', `Error: ${err.message}`);
  });
}

/** Auto-connect Telegram if a saved bot token exists in the database */
async function autoConnectTelegram(): Promise<void> {
  const savedToken = loadConfigValue('telegram_bot_token');
  if (!savedToken) {
    console.log('[Telegram] No saved bot token — waiting for manual connect via UI');
    return;
  }

  log.info('Telegram', 'Found saved bot token, auto-reconnecting...');
  tgStatus = 'connecting';

  try {
    if (tgConnection) {
      try { await tgConnection.disconnect(); } catch { /* ignore */ }
    }
    tgConnection = new TelegramConnection({ botToken: savedToken });
    setupTelegramHandlers(tgConnection);
    await tgConnection.connect();
    log.info('Telegram', 'Auto-reconnected successfully');
  } catch (e: any) {
    log.error('Telegram', `Auto-connect failed: ${e.message}`);
    tgStatus = 'disconnected';
    tgError = e.message;
  }
}

export function initializeApi(db?: DatabaseConnection, agent?: AgentOrchestrator): void {
  if (db) {
    skillsService = createSkillsService(db);
    // Initialize universal skill engine + event bus
    skillRepo = createSkillRepository(db as unknown as CoreDatabaseConnection);
    coreDb = db as unknown as CoreDatabaseConnection;
    eventBus = createEventBus();
    // Initialize approval store
    approvalStore = createApprovalStore(db as unknown as CoreDatabaseConnection);

    // Load saved owner identity + auto-reply settings from DB
    if (agent) {
      const savedOwnerPhone = loadConfigValue('ownerPhone');
      const savedOwnerTelegramId = loadConfigValue('ownerTelegramId');
      const savedOwnerTelegramUsername = loadConfigValue('ownerTelegramUsername');
      const savedAutoReplyWA = loadConfigValue('autoReplyWhatsApp');
      const savedAutoReplyTG = loadConfigValue('autoReplyTelegram');

      const configUpdates: Record<string, unknown> = {};
      if (savedOwnerPhone) configUpdates.ownerPhone = savedOwnerPhone;
      if (savedOwnerTelegramId) configUpdates.ownerTelegramId = savedOwnerTelegramId;
      if (savedOwnerTelegramUsername) configUpdates.ownerTelegramUsername = savedOwnerTelegramUsername;
      if (savedAutoReplyWA) configUpdates.autoReplyWhatsApp = savedAutoReplyWA === 'true';
      if (savedAutoReplyTG) configUpdates.autoReplyTelegram = savedAutoReplyTG === 'true';

      if (Object.keys(configUpdates).length > 0) {
        agent.updateConfig(configUpdates);
        log.info('Config', `Loaded saved settings: ${Object.keys(configUpdates).join(', ')}`);
      }
    }
    if (agent) {
      skillEngine = createSkillEngine(
        skillRepo,
        // LLM generate function — direct text generation without tools
        async (systemPrompt: string, userMessage: string) => {
          return agent.generate(systemPrompt, userMessage);
        },
        // Agent chat function — runs through the full tool loop
        async (message: string, sessionId: string, source?: string, contactName?: string) => {
          const chatSource = (source || 'web') as 'web' | 'whatsapp' | 'telegram';
          const result = await agent.chat(sessionId, message, chatSource, contactName);
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

      // Seed browsing playbook skills on first run
      import('./skills/browsing-playbooks.js').then(({ seedBrowsingPlaybooks }) => {
        seedBrowsingPlaybooks(skillEngine!);
      }).catch((err: any) => {
        console.error('[Skills] Failed to seed browsing playbooks:', err.message);
      });

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

          if (outcome.action === 'reply') {
            if (event.source === 'telegram') {
              // Reply via Telegram
              const chatId = Number(event.from);
              if (tgConnection && !isNaN(chatId)) {
                await tgConnection.sendMessage(chatId, result.response);
                console.log(`[SkillOutcome] Replied via Telegram to chat ${chatId}`);
                tgMessages.push({ from: 'bot', to: String(chatId), body: result.response, timestamp: new Date().toISOString(), isFromMe: true });
              }
            } else {
              // Reply via WhatsApp — use rawJid (original LID) for delivery
              if (waConnection?.isConnected) {
                const rawJid = event.data?.rawJid as string | undefined;
                const resolvedJid = event.from?.includes('@') ? event.from : `${event.from}@s.whatsapp.net`;
                const replyJid = rawJid || resolvedJid;
                await waConnection.sendMessage(replyJid, { text: result.response });
                console.log(`[SkillOutcome] Replied via WhatsApp to ${replyJid} (resolved=${resolvedJid})`);
              }
            }
          } else if (outcome.action === 'send' && outcome.target) {
            // For 'send', check if the target starts with 'telegram:'
            if (outcome.target.startsWith('telegram:') || outcome.channel === 'telegram') {
              const chatId = Number(outcome.target.replace('telegram:', ''));
              if (tgConnection && !isNaN(chatId)) {
                await tgConnection.sendMessage(chatId, result.response);
                console.log(`[SkillOutcome] Sent via Telegram to chat ${chatId}`);
              }
            } else {
              if (waConnection?.isConnected) {
                const jid = outcome.target.includes('@') ? outcome.target : `${outcome.target}@s.whatsapp.net`;
                await waConnection.sendMessage(jid, { text: result.response });
                console.log(`[SkillOutcome] Sent via WhatsApp to ${jid}`);
              }
            }
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
  scheduler.start().catch(err => console.error('[Scheduler] Failed to start:', err));
  if (agent) {
    agentOrchestrator = agent;
    registerAgentTools(agent);
  }

  // Auto-reconnect WhatsApp if a saved session exists
  autoConnectWhatsApp();
  // Auto-reconnect Telegram if a saved token exists
  autoConnectTelegram();
}

/** Register platform-agnostic tool executors on the agent */
function registerAgentTools(agent: AgentOrchestrator): void {
  const { registerAllToolModules } = require('./tools/registry.js');
  const registry = agent.getToolRegistry();

  // Build the shared context for all tool modules
  const toolContext = {
    getMessagingRegistry: () => messagingRegistry,
    getScheduler: () => scheduler,
    getApprovalStore: () => approvalStore,
    getSkillEngine: () => skillEngine,
    getWhatsApp: () => waConnection,
    getTelegram: () => tgConnection,
    getAgent: () => agent,
    getEventBus: () => eventBus,
  };

  registerAllToolModules(registry, toolContext);
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
      autoReplyTelegram: config.autoReplyTelegram,
      autoReplyContacts: config.autoReplyContacts,
      ownerPhone: config.ownerPhone || '',
      ownerTelegramId: config.ownerTelegramId || '',
      ownerTelegramUsername: config.ownerTelegramUsername || '',
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

    // Persist owner identity + auto-reply settings to DB
    if (body.ownerPhone !== undefined) saveConfigValue('ownerPhone', updated.ownerPhone || '');
    if (body.ownerTelegramId !== undefined) saveConfigValue('ownerTelegramId', updated.ownerTelegramId || '');
    if (body.ownerTelegramUsername !== undefined) saveConfigValue('ownerTelegramUsername', updated.ownerTelegramUsername || '');
    if (body.autoReplyWhatsApp !== undefined) saveConfigValue('autoReplyWhatsApp', String(updated.autoReplyWhatsApp));
    if (body.autoReplyTelegram !== undefined) saveConfigValue('autoReplyTelegram', String(updated.autoReplyTelegram));

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
      // If a previous connection exists, tear it down cleanly
      if (waConnection) {
        try { await waConnection.disconnect(); } catch { /* ignore */ }
        // Clear stale session so Baileys generates a fresh QR
        await waConnection.clearSession();
        waConnection = null;
      }

      waConnection = new WhatsAppConnection({
        ...DEFAULT_WHATSAPP_CONFIG,
        ...whatsappConfig,
      });

      setupWhatsAppHandlers(waConnection);

      // Start connection in the background (don't await — it blocks until connected)
      waConnection.connect().catch((err: Error) => {
        // Only treat as error if we're not already reconnecting
        if (waStatus !== 'connecting' && waStatus !== 'connected') {
          waStatus = 'disconnected';
          waError = err.message;
          waQrCode = null;
        }
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

  // ── Telegram ──────────────────────────────────────────
  if (url === '/api/telegram/status' && method === 'GET') {
    json(res, {
      status: tgStatus,
      error: tgError,
      botUsername: tgConnection?.botUsername ?? null,
      botName: tgConnection?.botName ?? null,
    });
    return true;
  }

  if (url === '/api/telegram/connect' && method === 'POST') {

    const body = await parseBody(req) as any;
    const botToken = body?.botToken;
    if (!botToken) {
      error(res, 'botToken is required', 400);
      return true;
    }

    tgError = null;
    tgStatus = 'connecting';

    try {
      // Disconnect existing connection to prevent duplicate polling
      if (tgConnection) {
        try {
          await tgConnection.disconnect();
          console.log('[Telegram] Disconnected previous connection');
        } catch { /* ignore */ }
      }

      tgConnection = new TelegramConnection({ botToken });

      setupTelegramHandlers(tgConnection);

      await tgConnection.connect();

      // Persist the token so it survives restarts
      saveConfigValue('telegram_bot_token', botToken);
      console.log('[Telegram] Bot token saved to database');

      json(res, {
        status: 'connected',
        message: `Connected as @${tgConnection.botUsername}`,
        botUsername: tgConnection.botUsername,
        botName: tgConnection.botName,
      });
    } catch (e: any) {
      tgStatus = 'disconnected';
      tgError = e.message;
      error(res, e.message, 500);
    }
    return true;
  }

  if (url === '/api/telegram/disconnect' && method === 'POST') {
    if (tgConnection) {
      try {
        await tgConnection.disconnect();
      } catch {}
      tgConnection = null;
    }
    if (tgProvider) {
      messagingRegistry.unregister('telegram');
      tgProvider = null;
    }
    tgStatus = 'disconnected';
    tgError = null;
    // Clear the saved token so we don't auto-reconnect on next restart
    saveConfigValue('telegram_bot_token', '');
    json(res, { status: 'disconnected' });
    return true;
  }

  if (url === '/api/telegram/messages' && method === 'GET') {
    json(res, { messages: [...tgMessages].reverse().slice(0, 50) });
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

  // ── Personas / Soul ─────────────────────────────────────
  if (url === '/api/personas' && method === 'GET') {
    if (!agentOrchestrator) {
      json(res, { personas: [] });
      return true;
    }
    const personas = agentOrchestrator.getSoul().listPersonas();
    json(res, { personas });
    return true;
  }

  if (url.match(/^\/api\/personas\/[^/]+$/) && method === 'GET') {
    if (!agentOrchestrator) { json(res, { content: '' }); return true; }
    const parts = url.split('/');
    const personaId = decodeURIComponent(parts[3]);
    const content = agentOrchestrator.getSoul().getDocument(personaId);
    json(res, { personaId, content });
    return true;
  }

  if (url.match(/^\/api\/personas\/[^/]+$/) && method === 'PUT') {
    if (!agentOrchestrator) { json(res, { error: 'Agent not initialized' }, 500); return true; }
    const parts = url.split('/');
    const personaId = decodeURIComponent(parts[3]);
    const body = await parseBody(req) as any;
    if (typeof body.content !== 'string') {
      json(res, { error: 'Missing required field: content' }, 400);
      return true;
    }
    agentOrchestrator.getSoul().saveDocument(personaId, body.content);
    json(res, { personaId, content: body.content, saved: true });
    return true;
  }

  if (url.match(/^\/api\/personas\/[^/]+$/) && method === 'DELETE') {
    if (!agentOrchestrator) { json(res, { error: 'Agent not initialized' }, 500); return true; }
    const parts = url.split('/');
    const personaId = decodeURIComponent(parts[3]);
    const deleted = agentOrchestrator.getSoul().deleteDocument(personaId);
    json(res, { deleted, personaId });
    return true;
  }

  // ── Memories (Structured Profile Data) ──────────────────
  if (url.match(/^\/api\/memories\/[^/]+$/) && method === 'GET') {
    if (!agentOrchestrator) { json(res, { memories: [] }); return true; }
    const parts = url.split('/');
    const contactId = decodeURIComponent(parts[3]);
    const memories = agentOrchestrator.getMemoryStore().getMemories(contactId);
    json(res, { memories });
    return true;
  }

  if (url === '/api/memories' && method === 'POST') {
    if (!agentOrchestrator) { json(res, { error: 'Agent not initialized' }, 500); return true; }
    const body = await parseBody(req) as any;
    if (!body.contactId || !body.category || !body.key || !body.value) {
      json(res, { error: 'contactId, category, key, and value are required' }, 400);
      return true;
    }
    const memory = agentOrchestrator.getMemoryStore().saveMemory(
      body.contactId, body.category, body.key, body.value, body.source || 'manual', body.confidence || 1.0
    );
    json(res, { memory });
    return true;
  }

  if (url.match(/^\/api\/memories\/[^/]+$/) && method === 'DELETE') {
    if (!agentOrchestrator) { json(res, { error: 'Agent not initialized' }, 500); return true; }
    const parts = url.split('/');
    const memoryId = decodeURIComponent(parts[3]);
    const deleted = agentOrchestrator.getMemoryStore().deleteMemory(memoryId);
    json(res, { deleted });
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

  // ── Approvals ───────────────────────────────────────────
  if (url === '/api/approvals' && method === 'GET') {
    if (!approvalStore) {
      json(res, { approvals: [] });
      return true;
    }
    const params = new URLSearchParams(url.split('?')[1] || '');
    const status = params.get('status');
    const approvals = status === 'pending' ? approvalStore.getPending() : approvalStore.getAll();
    json(res, { approvals });
    return true;
  }

  if (url.match(/^\/api\/approvals\/[^/]+\/respond$/) && method === 'POST') {
    if (!approvalStore) {
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

    const approval = approvalStore.getById(approvalId);
    if (!approval) {
      notFound(res);
      return true;
    }

    // Resolve the approval
    const resolved = approvalStore.resolve(approvalId, response);

    // Instead of direct relay, feed it back to the agent loop
    if (approval.requesterJid && agentOrchestrator) {
      const source = approval.requesterJid.startsWith('telegram:') ? 'telegram' : 'whatsapp';
      const sessionId = approval.requesterJid;
      
      // Inject the owner's response as a system-originated message to the agent.
      // The LLM should compose a natural reply; the code below delivers it directly.
      const systemMessage = `[SYSTEM] The owner has responded to the pending approval request (ID: ${approvalId}). The owner's answer is: "${response}"\n\nCompose a natural, friendly reply to the visitor incorporating the owner's answer. Do NOT use send_message or any other tool — just write the reply text. It will be delivered automatically.`;
      
      agentOrchestrator.chat(sessionId, systemMessage, source).then(result => {
        const reply = result.content || response; // fallback to raw owner response
        if (source === 'telegram' && tgConnection) {
          const chatId = Number(sessionId.replace('telegram:', ''));
          tgConnection.sendMessage(chatId, reply);
        } else if (source === 'whatsapp' && waConnection?.isConnected) {
          const jid = sessionId.includes('@') ? sessionId : `${sessionId.replace(/\D/g, '')}@s.whatsapp.net`;
          waConnection.sendMessage(jid, { text: reply });
        }
        log.info('Approvals', `Relayed to ${sessionId}: ${reply.slice(0, 100)}...`);
      }).catch(err => {
        log.error('Approvals', `Follow-up chat turn failed for ${sessionId}: ${err.message}`);
      });
    }

    json(res, { approval: resolved, relayed: true });
    return true;
  }

  if (url.match(/^\/api\/approvals\/[^/]+$/) && method === 'GET') {
    if (!approvalStore) {
      notFound(res);
      return true;
    }
    const parts = url.split('/');
    const approvalId = decodeURIComponent(parts[3]);
    const approval = approvalStore.getById(approvalId);
    if (!approval) {
      notFound(res);
      return true;
    }
    json(res, { approval });
    return true;
  }

  // ── Google Auth API Endpoints ──────────────────────
  if (url === '/api/google/auth/status' && method === 'GET') {
    try {
      const { getGoogleAuthStatus } = await import('./google/auth.js');
      const status = getGoogleAuthStatus();
      json(res, status);
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  if (url === '/api/google/auth/start' && method === 'POST') {
    try {
      const { startGoogleAuth } = await import('./google/auth.js');
      await startGoogleAuth();
      json(res, { success: true, message: 'Google authorization complete. Tokens saved.' });
    } catch (err: any) {
      error(res, `Google auth failed: ${err.message}`, 500);
    }
    return true;
  }

  if (url === '/api/google/auth/clear' && method === 'POST') {
    try {
      const { clearGoogleAuth } = await import('./google/auth.js');
      await clearGoogleAuth();
      json(res, { success: true, message: 'Google auth cleared.' });
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  if (url === '/api/google/services/config' && method === 'GET') {
    try {
      const { getGoogleServicesConfig } = await import('./google/auth.js');
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
      const { saveGoogleServicesConfig } = await import('./google/auth.js');
      const updated = await saveGoogleServicesConfig(body.services || {});
      json(res, { services: updated });
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  return false; // Not handled
}
