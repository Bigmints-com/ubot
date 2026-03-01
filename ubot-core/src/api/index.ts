/**
 * API Router for Ubot Core
 * Handles all /api/* routes with JSON request/response
 * 
 * Route handlers are in ./routes/ — this file manages state and initialization.
 */

import http from 'http';
import type { LLMProviderConfig } from '../engine/types.js';
import type { DatabaseConnection } from '../capabilities/skills/repository.js';
import type { DatabaseConnection as CoreDatabaseConnection } from '../data/database/types.js';
import { createTaskScheduler, type TaskSchedulerService } from '../capabilities/scheduler/service.js';
import { DEFAULT_SAFETY_CONFIG, type SafetyConfig, type SafetyRule } from '../safety/types.js';
import { DEFAULT_SAFETY_RULES } from '../safety/utils.js';
import { DEFAULT_WHATSAPP_CONFIG, type WhatsAppConnectionConfig } from '../channels/whatsapp/types.js';
import { WhatsAppConnection } from '../channels/whatsapp/connection.js';
import { WhatsAppMessagingProvider } from '../channels/whatsapp/messaging-provider.js';
import { TelegramConnection } from '../channels/telegram/connection.js';
import { TelegramMessagingProvider } from '../channels/telegram/messaging-provider.js';
import { BlueBubblesConnection } from '../channels/imessage/connection.js';
import { IMessageMessagingProvider } from '../channels/imessage/messaging-provider.js';
import { MessagingRegistry } from '../channels/registry.js';
import { createSkillRepository, type SkillRepository } from '../capabilities/skills/skill-repository.js';
import { createSkillEngine, type SkillEngine } from '../capabilities/skills/skill-engine.js';
import { createEventBus, type EventBus } from '../capabilities/skills/event-bus.js';
import { loadUbotConfig, saveUbotConfig } from '../data/config.js';

import { createApprovalStore, type ApprovalStore } from '../memory/pending-approvals.js';

import type { AgentOrchestrator } from '../engine/orchestrator.js';
import { log } from '../logger/ring-buffer.js';
import { handleIncomingMessage, type UnifiedMessage, type UnifiedDeps } from '../engine/handler.js';
import { existsSync } from 'fs';
import { join } from 'path';


// Route handlers
import { handleChatRoutes } from './routes/chat.js';
import { handleSkillRoutes } from './routes/skills.js';
import { handleSafetyRoutes } from './routes/safety.js';
import { handleMemoryRoutes } from './routes/memory.js';
import { handleIntegrationRoutes } from './routes/integrations.js';
import { handleToolsRoutes } from './routes/tools.js';
import { handleCliRoutes } from './routes/cli.js';
import { json, parseBody, error as apiError, type ApiContext } from './context.js';

// Middleware
import { requiresAuth, authenticate, sendUnauthorized } from './middleware/auth.js';
import { ApiRateLimiter, sendRateLimited, setRateLimitHeaders } from './middleware/rate-limiter.js';
import { logRequest, wrapResponse } from './middleware/request-logger.js';

// ─── Rate Limiter Instance ───────────────────────────────

const rateLimiter = new ApiRateLimiter();

// ─── CORS Configuration ─────────────────────────────────

function getAllowedOrigins(): string[] {
  try {
    const config = loadUbotConfig();
    const origins = (config as any).api?.cors_origins;
    if (Array.isArray(origins) && origins.length > 0) return origins;
  } catch {}
  // Default: allow localhost dev servers
  return ['http://localhost:4080', 'http://localhost:4081', 'http://localhost:3000'];
}

function getCorsOrigin(req: http.IncomingMessage): string {
  const origin = req.headers['origin'] || '';
  const allowed = getAllowedOrigins();
  // If wildcard is in the list, allow everything
  if (allowed.includes('*')) return '*';
  // Check if request origin is in the allowlist
  if (allowed.includes(origin)) return origin;
  // Default deny — return first allowed origin
  return allowed[0] || '';
}

// ─── In-memory State ─────────────────────────────────────

let safetyConfig: SafetyConfig = { ...DEFAULT_SAFETY_CONFIG };
let safetyRules: SafetyRule[] = DEFAULT_SAFETY_RULES.map((r, i) => ({
  ...r,
  id: `rule-${i + 1}`,
  createdAt: new Date(),
  updatedAt: new Date(),
})) as SafetyRule[];
let whatsappConfig: Partial<WhatsAppConnectionConfig> = { ...DEFAULT_WHATSAPP_CONFIG };
let workspacePath: string | null = null;

// WhatsApp connection state
let waConnection: WhatsAppConnection | null = null;
let waQrCode: string | null = null;
let waStatus: string = 'disconnected';
let waError: string | null = null;

const waMessages: Array<{ from: string; to: string; body: string; timestamp: string; isFromMe: boolean }> = [];
const MAX_WA_MESSAGES = 100;


let scheduler: TaskSchedulerService | null = null;
let agentOrchestrator: AgentOrchestrator | null = null;

// MCP server manager
import { getMcpServerManager, type McpServerManager } from '../integrations/mcp/mcp-manager.js';
let mcpManager: McpServerManager | null = null;

const messagingRegistry = new MessagingRegistry();
let waProvider: WhatsAppMessagingProvider | null = null;

// Telegram connection state
let tgConnection: TelegramConnection | null = null;
let tgStatus: string = 'disconnected';
let tgError: string | null = null;
let tgProvider: TelegramMessagingProvider | null = null;

const tgMessages: Array<{ from: string; to: string; body: string; timestamp: string; isFromMe: boolean }> = [];
const MAX_TG_MESSAGES = 100;

// iMessage (BlueBubbles) connection state
let imConnection: BlueBubblesConnection | null = null;
let imStatus: string = 'disconnected';
let imError: string | null = null;
let imProvider: IMessageMessagingProvider | null = null;

const imMessages: Array<{ from: string; to: string; body: string; timestamp: string; isFromMe: boolean }> = [];
const MAX_IM_MESSAGES = 100;

// Universal skill engine
let skillRepo: SkillRepository | null = null;
let skillEngine: SkillEngine | null = null;
let eventBus: EventBus | null = null;

// Owner approval system
let approvalStore: ApprovalStore | null = null;

// Database reference for config persistence
let coreDb: CoreDatabaseConnection | null = null;

// ─── Config Persistence (Unified JSON) ──────────────────

function saveConfigValue(key: string, value: string): void {
  try {
    const config = loadUbotConfig();
    
    // Map existing DB keys to JSON structure
    if (key === 'ownerPhone') {
      if (!config.owner) config.owner = {};
      config.owner.phone = value;
    } else if (key === 'ownerTelegramId') {
      if (!config.owner) config.owner = {};
      config.owner.telegram_id = value;
    } else if (key === 'ownerTelegramUsername') {
      if (!config.owner) config.owner = {};
      config.owner.telegram_username = value;
    } else if (key === 'autoReplyWhatsApp') {
      if (!config.channels) config.channels = {};
      if (!config.channels.whatsapp) config.channels.whatsapp = {};
      config.channels.whatsapp.auto_reply = value === 'true';
    } else if (key === 'autoReplyTelegram') {
      if (!config.channels) config.channels = {};
      if (!config.channels.telegram) config.channels.telegram = {};
      config.channels.telegram.auto_reply = value === 'true';
    } else if (key === 'llm_providers') {
      if (!config.llm) config.llm = {};
      config.llm.providers = JSON.parse(value);
    } else if (key === 'default_llm_provider_id') {
      if (!config.llm) config.llm = {};
      config.llm.default_provider_id = value;
    } else if (key === 'telegram_bot_token') {
      if (!config.channels) config.channels = {};
      if (!config.channels.telegram) config.channels.telegram = {};
      config.channels.telegram.token = value;
    } else {
      // Fallback for unknown keys (e.g. MCP)
      (config as any)[key] = value;
    }

    saveUbotConfig(config);
    log.info('Config', `Saved ${key} to config.json`);
  } catch (err: any) {
    console.error(`[Config] Failed to save ${key} to JSON:`, err.message);
  }
}

function loadConfigValue(key: string): string | null {
  try {
    const config = loadUbotConfig();
    let val: any = null;

    if (key === 'ownerPhone') val = config.owner?.phone;
    else if (key === 'ownerTelegramId') val = config.owner?.telegram_id;
    else if (key === 'ownerTelegramUsername') val = config.owner?.telegram_username;
    else if (key === 'autoReplyWhatsApp') val = config.channels?.whatsapp?.auto_reply === true ? 'true' : 'false';
    else if (key === 'autoReplyTelegram') val = config.channels?.telegram?.auto_reply === true ? 'true' : 'false';
    else if (key === 'llm_providers') val = config.llm?.providers ? JSON.stringify(config.llm.providers) : null;
    else if (key === 'default_llm_provider_id') val = config.llm?.default_provider_id;
    else if (key === 'telegram_bot_token') val = config.channels?.telegram?.token;
    else val = (config as any)[key];

    return val ? String(val) : null;
  } catch {
    return null;
  }
}

// ─── Approval Relay ──────────────────────────────────────

async function relayApprovalResponse(requesterJid: string, message: string): Promise<boolean> {
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

// ─── WhatsApp Event Handlers ─────────────────────────────

function setupWhatsAppHandlers(conn: WhatsAppConnection): void {
  conn.on('connection.update', (status, qr) => {
    waStatus = status;
    if (qr) waQrCode = qr;
    if (status === 'connected') {
      waQrCode = null;
      log.info('WhatsApp', 'Connected successfully');
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
    const replyJid = msg.rawJid || jid;
    const unified: UnifiedMessage = {
      channel: 'whatsapp',
      senderId: jid,
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

// ─── Telegram Event Handlers ─────────────────────────────

function setupTelegramHandlers(conn: TelegramConnection): void {
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

// ─── iMessage (BlueBubbles) ──────────────────────────────

function setupIMessageHandlers(conn: BlueBubblesConnection): void {
  conn.on('connection.update', (status) => {
    imStatus = status;
    log.info('iMessage', `Status: ${status}`);
  });

  conn.on('message.received', (bbMsg) => {
    const from = bbMsg.handle?.address || 'unknown';
    const displayName = [bbMsg.handle?.firstName, bbMsg.handle?.lastName].filter(Boolean).join(' ') || from;

    imMessages.push({
      from: displayName,
      to: 'me',
      body: bbMsg.text || '',
      timestamp: new Date(bbMsg.dateCreated).toISOString(),
      isFromMe: false,
    });
    if (imMessages.length > MAX_IM_MESSAGES) imMessages.shift();

    log.info('iMessage', `Message from ${displayName}: ${(bbMsg.text || '').slice(0, 50)}`);

    // Auto-reply via agent if enabled
    const config = loadUbotConfig();
    if (config.imessage?.autoReply && agentOrchestrator && imProvider) {
      const chatGuid = bbMsg.chats?.[0]?.guid;
      if (!chatGuid) return;

      const unified: UnifiedMessage = {
        channel: 'imessage' as any,
        senderId: chatGuid,
        senderName: displayName,
        body: bbMsg.text || '',
        timestamp: new Date(bbMsg.dateCreated),
        replyFn: async (text: string) => {
          if (imConnection) {
            await imConnection.sendMessage(chatGuid, text);
            imMessages.push({ from: 'me', to: displayName, body: text, timestamp: new Date().toISOString(), isFromMe: true });
          }
        },
        extra: { rawJid: chatGuid },
      };

      const deps: UnifiedDeps = {
        orchestrator: agentOrchestrator,
        approvalStore,
        eventBus,
        skillEngine,
        saveConfigValue,
        relayMessage: relayApprovalResponse,
      };

      handleIncomingMessage(unified, deps).catch(err => {
        log.error('iMessage', `Agent reply error: ${err.message}`);
      });
    }
  });

  conn.on('error', (err) => {
    imError = err.message;
    log.error('iMessage', `Error: ${err.message}`);
  });
}

async function autoConnectIMessage(): Promise<void> {
  const savedServerUrl = loadConfigValue('imessage_server_url');
  const savedPassword = loadConfigValue('imessage_password');
  if (!savedServerUrl || !savedPassword) {
    console.log('[iMessage] No saved BlueBubbles config — waiting for manual connect via UI');
    return;
  }

  log.info('iMessage', 'Found saved BlueBubbles config, auto-reconnecting...');
  imStatus = 'connecting';

  try {
    if (imConnection) {
      try { await imConnection.disconnect(); } catch { /* ignore */ }
    }
    imConnection = new BlueBubblesConnection({ serverUrl: savedServerUrl, password: savedPassword });
    setupIMessageHandlers(imConnection);
    await imConnection.connect();

    imProvider = new IMessageMessagingProvider(imConnection);
    messagingRegistry.register(imProvider);
    log.info('iMessage', 'Messaging provider registered');
    log.info('iMessage', 'Auto-reconnected successfully');
  } catch (e: any) {
    log.error('iMessage', `Auto-connect failed: ${e.message}`);
    imStatus = 'disconnected';
    imError = e.message;
  }
}

// ─── Initialization ──────────────────────────────────────

export function initializeApi(db?: DatabaseConnection, agent?: AgentOrchestrator, wsPath?: string): void {
  workspacePath = wsPath || null;
  if (db) {

    skillRepo = createSkillRepository(db as unknown as CoreDatabaseConnection);
    coreDb = db as unknown as CoreDatabaseConnection;
    eventBus = createEventBus();
    approvalStore = createApprovalStore(db as unknown as CoreDatabaseConnection);

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

      const savedProviders = loadConfigValue('llm_providers');
      const savedDefaultId = loadConfigValue('default_llm_provider_id');
      if (savedProviders) {
        try {
          const providers = JSON.parse(savedProviders) as LLMProviderConfig[];
          if (Array.isArray(providers) && providers.length > 0) {
            configUpdates.llmProviders = providers;
            configUpdates.defaultLlmProviderId = savedDefaultId || providers.find(p => p.isDefault)?.id || providers[0].id;
            log.info('Config', `Loaded ${providers.length} LLM providers from DB`);
          }
        } catch {
          log.error('Config', 'Failed to parse saved LLM providers');
        }
      }

      if (Object.keys(configUpdates).length > 0) {
        agent.updateConfig(configUpdates);
        log.info('Config', `Loaded saved settings: ${Object.keys(configUpdates).join(', ')}`);
      }
    }
    if (agent) {
      skillEngine = createSkillEngine(
        skillRepo,
        async (systemPrompt: string, userMessage: string) => {
          return agent.generate(systemPrompt, userMessage);
        },
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

      import('../capabilities/skills/browsing-playbooks.js').then(({ seedBrowsingPlaybooks }) => {
        seedBrowsingPlaybooks(skillEngine!);
      }).catch((err: any) => {
        console.error('[Skills] Failed to seed browsing playbooks:', err.message);
      });

      eventBus.on(async (event) => {
        if (!skillEngine) return;
        const results = await skillEngine.processEvent(event);
        for (const result of results) {
          if (!result.success || !result.response?.trim()) continue;
          const skill = skillEngine.getSkill(result.skillId);
          if (!skill) continue;
          const outcome = skill.outcome;

          if (outcome.action === 'reply') {
            if (event.source === 'telegram') {
              const chatId = Number(event.from);
              if (tgConnection && !isNaN(chatId)) {
                await tgConnection.sendMessage(chatId, result.response);
                console.log(`[SkillOutcome] Replied via Telegram to chat ${chatId}`);
                tgMessages.push({ from: 'bot', to: String(chatId), body: result.response, timestamp: new Date().toISOString(), isFromMe: true });
              }
            } else {
              if (waConnection?.isConnected) {
                const rawJid = event.data?.rawJid as string | undefined;
                const resolvedJid = event.from?.includes('@') ? event.from : `${event.from}@s.whatsapp.net`;
                const replyJid = rawJid || resolvedJid;
                await waConnection.sendMessage(replyJid, { text: result.response });
                console.log(`[SkillOutcome] Replied via WhatsApp to ${replyJid} (resolved=${resolvedJid})`);
              }
            }
          } else if (outcome.action === 'send' && outcome.target) {
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
          }
        }
      });
    }
  }
  scheduler = createTaskScheduler();
  scheduler.start().catch(err => console.error('[Scheduler] Failed to start:', err));

  // Bridge scheduler events to the skill engine's EventBus
  if (eventBus && scheduler) {
    import('../engine/scheduler-adapter.js').then(({ wireSchedulerToEventBus }) => {
      wireSchedulerToEventBus(scheduler!, eventBus!);
    }).catch(err => console.error('[SchedulerAdapter] Failed to wire:', err.message));
  }
  if (agent) {
    agentOrchestrator = agent;
    registerAgentTools(agent);
  }

  autoConnectWhatsApp();
  autoConnectTelegram();
  autoConnectIMessage();
}

async function registerAgentTools(agent: AgentOrchestrator): Promise<void> {
  const { registerAllToolModules } = await import('../tools/registry.js');
  const registry = agent.getToolRegistry();

  const toolContext = {
    getMessagingRegistry: () => messagingRegistry,
    getScheduler: () => scheduler,
    getApprovalStore: () => approvalStore,
    getSkillEngine: () => skillEngine,
    getWhatsApp: () => waConnection,
    getTelegram: () => tgConnection,
    getAgent: () => agent,
    getEventBus: () => eventBus,
    getWorkspacePath: () => workspacePath,
    getCliService: () => null, // CLI service is lazily loaded in the tool module
  };

  registerAllToolModules(registry, toolContext);

  // Load custom tool modules from custom/modules/
  const { registerCustomModules } = await import('../tools/registry.js');
  await registerCustomModules(registry, toolContext);

  // Initialize capability audit log
  if (coreDb) {
    const { initCapabilityLog } = await import('../capabilities/cli/capability-log.js');
    initCapabilityLog(coreDb);
  }

  // Initialize MCP server manager and connect saved servers
  mcpManager = getMcpServerManager();
  mcpManager.init(
    { get: loadConfigValue, set: saveConfigValue },
    registry,
  );
  mcpManager.connectAll().catch(err => console.error('[MCP] connectAll failed:', err));
}

// ─── Build API Context ───────────────────────────────────

function getApiContext(): ApiContext {
  return {
    agentOrchestrator,
    coreDb,
    waConnection,
    waQrCode,
    waStatus,
    waError,
    waMessages,
    waProvider,
    whatsappConfig,
    tgConnection,
    tgStatus,
    tgError,
    tgProvider,
    tgMessages,
    messagingRegistry,
    skillEngine,
    eventBus,
    scheduler,
    approvalStore,
    safetyConfig,
    safetyRules,
    mcpManager,
    saveConfigValue,
    loadConfigValue,
  };
}

// ─── Channel Routes (kept inline — they mutate connection state) ──

async function handleChannelRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
): Promise<boolean> {

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
      if (waConnection) {
        try { await waConnection.disconnect(); } catch { /* ignore */ }
        await waConnection.clearSession();
        waConnection = null;
      }

      waConnection = new WhatsAppConnection({
        ...DEFAULT_WHATSAPP_CONFIG,
        ...whatsappConfig,
      });

      setupWhatsAppHandlers(waConnection);

      waConnection.connect().catch((err: Error) => {
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
      apiError(res, e.message, 500);
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
      apiError(res, 'botToken is required', 400);
      return true;
    }

    tgError = null;
    tgStatus = 'connecting';

    try {
      if (tgConnection) {
        try {
          await tgConnection.disconnect();
          console.log('[Telegram] Disconnected previous connection');
        } catch { /* ignore */ }
      }

      tgConnection = new TelegramConnection({ botToken });
      setupTelegramHandlers(tgConnection);
      await tgConnection.connect();

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
      apiError(res, e.message, 500);
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
    saveConfigValue('telegram_bot_token', '');
    json(res, { status: 'disconnected' });
    return true;
  }

  if (url === '/api/telegram/messages' && method === 'GET') {
    json(res, { messages: [...tgMessages].reverse().slice(0, 50) });
    return true;
  }

  // ── iMessage (BlueBubbles) ─────────────────────────────
  if (url === '/api/imessage/status' && method === 'GET') {
    json(res, {
      status: imStatus,
      error: imError,
      serverUrl: loadConfigValue('imessage_server_url') ? '(configured)' : null,
    });
    return true;
  }

  if (url === '/api/imessage/connect' && method === 'POST') {
    const body = await parseBody(req) as any;
    const serverUrl = body?.serverUrl;
    const password = body?.password;
    if (!serverUrl || !password) {
      apiError(res, 'serverUrl and password are required', 400);
      return true;
    }

    imError = null;
    imStatus = 'connecting';

    try {
      if (imConnection) {
        try { await imConnection.disconnect(); } catch { /* ignore */ }
      }

      imConnection = new BlueBubblesConnection({ serverUrl, password });
      setupIMessageHandlers(imConnection);
      await imConnection.connect();

      // Save config
      saveConfigValue('imessage_server_url', serverUrl);
      saveConfigValue('imessage_password', password);
      log.info('iMessage', 'BlueBubbles config saved');

      // Register messaging provider
      if (imProvider) {
        messagingRegistry.unregister('imessage');
      }
      imProvider = new IMessageMessagingProvider(imConnection);
      messagingRegistry.register(imProvider);
      log.info('iMessage', 'Messaging provider registered');

      json(res, { status: 'connected', message: 'Connected to BlueBubbles' });
    } catch (e: any) {
      imStatus = 'disconnected';
      imError = e.message;
      apiError(res, e.message, 500);
    }
    return true;
  }

  if (url === '/api/imessage/disconnect' && method === 'POST') {
    if (imConnection) {
      try { await imConnection.disconnect(); } catch {}
      imConnection = null;
    }
    if (imProvider) {
      messagingRegistry.unregister('imessage');
      imProvider = null;
    }
    imStatus = 'disconnected';
    imError = null;
    saveConfigValue('imessage_server_url', '');
    saveConfigValue('imessage_password', '');
    json(res, { status: 'disconnected' });
    return true;
  }

  if (url === '/api/imessage/messages' && method === 'GET') {
    json(res, { messages: [...imMessages].reverse().slice(0, 50) });
    return true;
  }

  // BlueBubbles webhook endpoint (receives incoming messages)
  if (url === '/api/imessage/webhook' && method === 'POST') {
    const body = await parseBody(req) as any;
    const event = body?.type || body?.event;
    const data = body?.data;
    if (imConnection && event && data) {
      imConnection.handleWebhook(event, data);
    }
    json(res, { ok: true });
    return true;
  }

  return false;
}

// ─── Main Router ─────────────────────────────────────────

export async function handleApiRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string
): Promise<boolean> {
  const corsOrigin = getCorsOrigin(req);

  // ── CORS preflight ─────────────────────────────────────
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return true;
  }

  // Set CORS header on all responses
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);

  // ── Request logging (wrap response to capture status) ──
  wrapResponse(res);
  let clientName: string | undefined;

  // ── Health check (unauthenticated) ─────────────────────
  if (url === '/api/health' && method === 'GET') {
    const uptime = process.uptime();
    json(res, {
      status: 'ok',
      uptime: Math.floor(uptime),
      version: '1.0.0',
      channels: {
        whatsapp: waStatus,
        telegram: tgStatus,
      },
      llm: agentOrchestrator ? 'online' : 'offline',
      tools: agentOrchestrator ? (() => { try { const { getAllToolDefinitions } = require('../tools/registry.js'); return getAllToolDefinitions().length; } catch { return 0; } })() : 0,
    });
    return true;
  }

  // ── Authentication ─────────────────────────────────────
  if (requiresAuth(method, url)) {
    const authResult = authenticate(req);
    if (!authResult.authenticated) {
      sendUnauthorized(res, authResult.error || 'Unauthorized');
      return true;
    }
    clientName = authResult.clientName;
  }

  // ── Rate limiting ──────────────────────────────────────
  // Skip rate limiting for dashboard requests (same-origin UI polling).
  // Rate limiting is for external API consumers, not the built-in dashboard.
  const origin = req.headers['origin'] || req.headers['referer'] || '';
  const isDashboard = origin.includes('localhost:11490') || origin.includes('localhost:4080');
  if (!isDashboard) {
    const rateLimitId = clientName || req.socket.remoteAddress || 'unknown';
    const rateLimitResult = rateLimiter.check(rateLimitId, url);
    if (!rateLimitResult.allowed) {
      sendRateLimited(res, rateLimitResult);
      return true;
    }
    setRateLimitHeaders(res, rateLimitResult);
  }

  // ── Request logging ────────────────────────────────────
  const finishLog = logRequest(req, url, method, clientName);
  res.on('finish', finishLog);

  // ── Route handlers ─────────────────────────────────────
  const ctx = getApiContext();

  if (await handleChatRoutes(req, res, url, method, ctx)) return true;
  if (await handleChannelRoutes(req, res, url, method)) return true;
  if (await handleSkillRoutes(req, res, url, method, ctx)) return true;
  if (await handleSafetyRoutes(req, res, url, method, ctx)) return true;
  if (await handleMemoryRoutes(req, res, url, method, ctx)) return true;
  if (await handleIntegrationRoutes(req, res, url, method, ctx)) return true;
  if (await handleToolsRoutes(req, res, url, method, ctx)) return true;
  if (await handleCliRoutes(req, res, url, method, ctx)) return true;

  return false;
}
