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
  const socket = waConnection?.getSocket();
  if (socket) {
    try {
      const jid = requesterJid.includes('@')
        ? requesterJid
        : `${requesterJid.replace(/\D/g, '')}@s.whatsapp.net`;
      await socket.sendMessage(jid, { text: message });
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
      console.log('[WhatsApp] ✅ Connected successfully');
      // Register the WhatsApp provider with the messaging registry
      waProvider = new WhatsAppMessagingProvider(conn);
      messagingRegistry.register(waProvider);
      console.log('[WhatsApp] 📬 Messaging provider registered');
    }
    if (status === 'logged_out') {
      waQrCode = null;
      waError = 'Logged out — reconnecting for new QR...';
      console.log('[WhatsApp] ⚠️ Logged out — will auto-reconnect for new QR');
      // The connection.ts handler clears the session and reconnects;
      // reset error after a short delay so the UI shows the new QR
      setTimeout(() => { waError = null; }, 5000);
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
    const unified: UnifiedMessage = {
      channel: 'whatsapp',
      senderId: jid,
      senderName: msg.from || '',
      body: msg.body,
      timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(),
      replyFn: async (text: string) => {
        const socket = waConnection?.getSocket();
        if (socket) {
          await socket.sendMessage(jid, { text });
          waMessages.push({ from: 'me', to: jid, body: text, timestamp: new Date().toISOString(), isFromMe: true });
        }
      },
      extra: {
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

/** Set up all event handlers on a TelegramConnection instance */
function setupTelegramHandlers(conn: TelegramConnection): void {
  // Clear any previously registered handlers to prevent duplicate responses
  conn.removeAllListeners();
  conn.on('connection.update', (status) => {
    tgStatus = status;
    if (status === 'connected') {
      console.log('[Telegram] ✅ Connected');
      tgProvider = new TelegramMessagingProvider(conn);
      messagingRegistry.register(tgProvider);
      console.log('[Telegram] 📬 Messaging provider registered');
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
    console.error('[Telegram] Error:', err.message);
  });
}

/** Auto-connect Telegram if a saved bot token exists in the database */
async function autoConnectTelegram(): Promise<void> {
  const savedToken = loadConfigValue('telegram_bot_token');
  if (!savedToken) {
    console.log('[Telegram] No saved bot token — waiting for manual connect via UI');
    return;
  }

  console.log('[Telegram] 🔄 Found saved bot token, auto-reconnecting...');
  tgStatus = 'connecting';

  try {
    if (tgConnection) {
      try { await tgConnection.disconnect(); } catch { /* ignore */ }
    }
    tgConnection = new TelegramConnection({ botToken: savedToken });
    setupTelegramHandlers(tgConnection);
    await tgConnection.connect();
    console.log('[Telegram] ✅ Auto-reconnected successfully');
  } catch (e: any) {
    console.error('[Telegram] Auto-connect failed:', e.message);
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
        console.log('[Config] Loaded saved settings:', Object.keys(configUpdates).join(', '));
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
              // Reply via WhatsApp
              const socket = waConnection?.getSocket();
              if (socket) {
                const jid = event.from?.includes('@') ? event.from : `${event.from}@s.whatsapp.net`;
                await socket.sendMessage(jid, { text: result.response });
                console.log(`[SkillOutcome] Replied via WhatsApp to ${jid}`);
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
              const socket = waConnection?.getSocket();
              if (socket) {
                const jid = outcome.target.includes('@') ? outcome.target : `${outcome.target}@s.whatsapp.net`;
                await socket.sendMessage(jid, { text: result.response });
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
      return { toolName: 'schedule_message', success: false, error: 'Missing required parameters (to, body/message, time)', duration: 0 };
    }

    // Parse time with chrono-node (natural language) then fallback to Date
    const scheduledDate = chrono.parseDate(time, new Date()) || new Date(time);
    if (!scheduledDate || isNaN(scheduledDate.getTime())) {
      return { toolName: 'schedule_message', success: false, error: `Could not parse time: "${time}". Try "in 30 minutes", "at 3pm", "tomorrow at 9am", or ISO format.`, duration: 0 };
    }

    if (scheduledDate.getTime() <= Date.now()) {
      return { toolName: 'schedule_message', success: false, error: `Scheduled time "${time}" resolves to the past (${scheduledDate.toLocaleString()}).`, duration: 0 };
    }

    if (!scheduler) {
      return { toolName: 'schedule_message', success: false, error: 'Scheduler service not initialized', duration: 0 };
    }

    try {
      const safeTo = to.replace(/[^a-zA-Z0-9_\-.\s]/g, '');
      const taskName = `Send message to ${safeTo || 'recipient'}`;

      const task = await scheduler.createTask({
        name: taskName,
        description: `Send "${body.slice(0, 80)}${body.length > 80 ? '...' : ''}" to ${to} at ${scheduledDate.toISOString()}`,
        schedule: {
          recurrence: 'once',
          startDate: scheduledDate,
        },
        data: { to, body, channel: String(args.channel || '') },
        tags: ['scheduled_message'],
        metadata: { createdBy: 'chat', to, body },
        handler: async (_ctx, data: { to: string; body: string; channel: string }) => {
          try {
            const provider = messagingRegistry.resolveProvider(data.channel || undefined);
            await provider.sendMessage(data.to, data.body);
            console.log(`[Scheduler] Sent scheduled message to ${data.to}`);
            return { sent: true, to: data.to };
          } catch (err: any) {
            console.error(`[Scheduler] Failed to send scheduled message to ${data.to}:`, err.message);
            throw err;
          }
        },
      });

      return {
        toolName: 'schedule_message',
        success: true,
        result: `Scheduled message to ${to}: "${body}" at ${scheduledDate.toLocaleString()}. Task ID: ${task.id}`,
        duration: 0,
      };
    } catch (err: any) {
      return { toolName: 'schedule_message', success: false, error: `Failed to create scheduled task: ${err.message}`, duration: 0 };
    }
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

  // ask_owner — ask the owner for approval before responding
  registry.register('ask_owner', async (args) => {
    if (!approvalStore) {
      return { toolName: 'ask_owner', success: false, error: 'Approval system not initialized', duration: 0 };
    }

    const question = String(args.question || '');
    const context = String(args.context || '');
    const requesterJid = String(args.requester_jid || '');

    if (!question) {
      return { toolName: 'ask_owner', success: false, error: 'Missing "question" parameter', duration: 0 };
    }

    // Create the pending approval
    const approval = approvalStore.create({
      question,
      context,
      requesterJid,
      sessionId: requesterJid,
    });

    console.log(`[Approvals] Created approval ${approval.id}: "${question.slice(0, 80)}"`);

    // Inject approval notification into Command Center chat
    const convStore = agent.getConversationStore();
    convStore.getOrCreateSession('web-console', 'web', 'Command Center');
    const approvalNotification = `🔔 **Approval Request** (ID: ${approval.id})\n\n**From:** ${context || 'Unknown'}\n**Question:** ${question}\n\n👉 Go to the Approvals page to respond, or reply here with your answer.`;
    convStore.addMessage('web-console', 'assistant', approvalNotification, { source: 'web' });

    // Try to notify the owner via WhatsApp if they have a different number
    const config = agent.getConfig();
    const ownerPhone = config.ownerPhone?.replace(/\D/g, '') || '';
    const ownerName = config.ownerName || 'owner';

    if (ownerPhone) {
      const socket = waConnection?.getSocket();
      if (socket) {
        try {
          const ownerJid = `${ownerPhone}@s.whatsapp.net`;
          const notificationText = `🔔 *Approval Request*\n\n${context}\n\n*Question:* ${question}\n\nReply to this message with your response.`;
          await socket.sendMessage(ownerJid, { text: notificationText });
          console.log(`[Approvals] Sent notification to owner at ${ownerJid}`);
        } catch (err: any) {
          console.error('[Approvals] Failed to notify owner via WhatsApp:', err.message);
        }
      }
    }

    // Also try notifying via Telegram if connected
    if (tgConnection && config.ownerTelegramId) {
      try {
        const chatId = Number(config.ownerTelegramId);
        if (!isNaN(chatId)) {
          const notificationText = `🔔 *Approval Request*\n\n${context}\n\n*Question:* ${question}\n\nReply to this message with your response.`;
          await tgConnection.sendMessage(chatId, notificationText);
          console.log(`[Approvals] Sent notification to owner via Telegram at ${chatId}`);
        }
      } catch (err: any) {
        console.error('[Approvals] Failed to notify owner via Telegram:', err.message);
      }
    }

    return {
      toolName: 'ask_owner',
      success: true,
      result: `Approval request created (ID: ${approval.id}). The owner "${ownerName}" has been notified. Tell the requester you'll check with ${ownerName} and get back to them.`,
      duration: 0,
    };
  });

  // respond_to_approval — owner responds to a pending approval from Command Center
  registry.register('respond_to_approval', async (args) => {
    if (!approvalStore) {
      return { toolName: 'respond_to_approval', success: false, error: 'Approval system not initialized', duration: 0 };
    }

    const response = String(args.response || '');
    if (!response) {
      return { toolName: 'respond_to_approval', success: false, error: 'Missing "response" parameter', duration: 0 };
    }

    let approvalId = String(args.approval_id || '');

    // If no approval ID provided, use the most recent pending one
    if (!approvalId) {
      const pending = approvalStore.getPending();
      if (pending.length === 0) {
        return { toolName: 'respond_to_approval', success: true, result: 'No pending approvals to respond to.', duration: 0 };
      }
      approvalId = pending[0].id;
    }

    const approval = approvalStore.getById(approvalId);
    if (!approval) {
      return { toolName: 'respond_to_approval', success: false, error: `Approval not found: ${approvalId}`, duration: 0 };
    }
    if (approval.status === 'resolved') {
      return { toolName: 'respond_to_approval', success: true, result: `Approval ${approvalId} was already resolved.`, duration: 0 };
    }

    // Resolve the approval
    approvalStore.resolve(approvalId, response);
    console.log(`[Approvals] Owner responded via Command Center to approval ${approvalId}: "${response.slice(0, 80)}"`);

    // Relay response to the requester via their channel
    if (approval.requesterJid && agentOrchestrator) {
      const source = approval.requesterJid.startsWith('telegram:') ? 'telegram' : 'whatsapp';
      const sessionId = approval.requesterJid;
      const systemMessage = `[SYSTEM] The owner responded to your approval request (ID: ${approvalId}): "${response}"\n\nPlease relay this information to the visitor appropriately.`;

      agentOrchestrator.chat(sessionId, systemMessage, source).then(result => {
        if (result.content) {
          if (source === 'telegram' && tgConnection) {
            const chatId = Number(sessionId.replace('telegram:', ''));
            tgConnection.sendMessage(chatId, result.content);
          } else if (source === 'whatsapp' && waConnection) {
            const socket = waConnection.getSocket();
            const jid = sessionId.includes('@') ? sessionId : `${sessionId.replace(/\D/g, '')}@s.whatsapp.net`;
            socket?.sendMessage(jid, { text: result.content });
          }
        }
        console.log(`[Approvals] Relayed owner response to ${sessionId}`);
      }).catch(err => {
        console.error(`[Approvals] Failed to relay response to ${sessionId}:`, err.message);
      });
    }

    return {
      toolName: 'respond_to_approval',
      success: true,
      result: `Approval ${approvalId} resolved. Your response "${response}" is being relayed to the requester.`,
      duration: 0,
    };
  });

  // list_pending_approvals — show pending approvals to the owner
  registry.register('list_pending_approvals', async () => {
    if (!approvalStore) {
      return { toolName: 'list_pending_approvals', success: false, error: 'Approval system not initialized', duration: 0 };
    }

    const pending = approvalStore.getPending();
    if (pending.length === 0) {
      return { toolName: 'list_pending_approvals', success: true, result: 'No pending approvals.', duration: 0 };
    }

    const summary = pending.map(a => {
      const ago = Math.round((Date.now() - new Date(a.createdAt).getTime()) / 60000);
      return `• [${a.id}] "${a.question}" — from: ${a.context || a.requesterJid} (${ago}m ago)`;
    }).join('\n');

    return {
      toolName: 'list_pending_approvals',
      success: true,
      result: `${pending.length} pending approval(s):\n${summary}`,
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

  // ── Browser Automation Tools ──────────────────────

  registry.register('browse_url', async (args) => {
    const url = String(args.url || '');
    if (!url) return { toolName: 'browse_url', success: false, error: 'Missing "url" parameter', duration: 0 };
    const browser = getBrowserSkill();
    const result = await browser.navigate(url);
    return {
      toolName: 'browse_url',
      success: result.success,
      result: result.data || '',
      error: result.error,
      duration: 0,
    };
  });

  registry.register('browser_click', async (args) => {
    const selector = String(args.selector || '');
    if (!selector) return { toolName: 'browser_click', success: false, error: 'Missing "selector" parameter', duration: 0 };
    const browser = getBrowserSkill();
    const result = await browser.click(selector);
    return {
      toolName: 'browser_click',
      success: result.success,
      result: result.data || '',
      error: result.error,
      duration: 0,
    };
  });

  registry.register('browser_type', async (args) => {
    const selector = String(args.selector || '');
    const text = String(args.text || '');
    if (!selector || !text) return { toolName: 'browser_type', success: false, error: 'Missing "selector" or "text" parameter', duration: 0 };
    const browser = getBrowserSkill();
    const result = await browser.type(selector, text);
    return {
      toolName: 'browser_type',
      success: result.success,
      result: result.data || '',
      error: result.error,
      duration: 0,
    };
  });

  registry.register('browser_read_page', async (args) => {
    const browser = getBrowserSkill();
    const selector = args.selector ? String(args.selector) : undefined;
    const result = await browser.readPage(selector);
    return {
      toolName: 'browser_read_page',
      success: result.success,
      result: result.data || '',
      error: result.error,
      duration: 0,
    };
  });

  registry.register('browser_screenshot', async () => {
    const browser = getBrowserSkill();
    const result = await browser.screenshot();
    return {
      toolName: 'browser_screenshot',
      success: result.success,
      result: result.success ? 'Screenshot captured (base64 image)' : '',
      error: result.error,
      duration: 0,
    };
  });

  // ── Gmail & Calendar (Browser-based) ──────────────────

  registry.register('read_emails', async (args) => {
    const browser = getBrowserSkill();
    const query = args.query ? String(args.query) : undefined;
    const maxResults = args.max_results ? Number(args.max_results) : undefined;
    const result = await browser.readGmail({ query, maxEmails: maxResults });
    return {
      toolName: 'read_emails',
      success: result.success,
      result: result.data || '',
      error: result.error,
      duration: 0,
    };
  });

  registry.register('read_calendar', async (args) => {
    const browser = getBrowserSkill();
    const date = args.date ? String(args.date) : undefined;
    const result = await browser.readCalendar({ date });
    return {
      toolName: 'read_calendar',
      success: result.success,
      result: result.data || '',
      error: result.error,
      duration: 0,
    };
  });

  // ── Scheduler & Reminder Tools ──────────────────────────

  registry.register('create_reminder', async (args) => {
    const message = String(args.message || '');
    const time = String(args.time || '');
    const recurrence = String(args.recurrence || 'once') as 'once' | 'daily' | 'weekly' | 'monthly';
    if (!message || !time) {
      return { toolName: 'create_reminder', success: false, error: 'Missing required parameters (message, time)', duration: 0 };
    }

    const scheduledDate = chrono.parseDate(time, new Date()) || new Date(time);
    if (!scheduledDate || isNaN(scheduledDate.getTime())) {
      return { toolName: 'create_reminder', success: false, error: `Could not parse time: "${time}". Try "in 30 minutes", "at 3pm", "tomorrow at 9am".`, duration: 0 };
    }

    if (scheduledDate.getTime() <= Date.now() && recurrence === 'once') {
      return { toolName: 'create_reminder', success: false, error: `Time "${time}" resolves to the past (${scheduledDate.toLocaleString()}).`, duration: 0 };
    }

    if (!scheduler) {
      return { toolName: 'create_reminder', success: false, error: 'Scheduler service not initialized', duration: 0 };
    }

    try {
      const config = agentOrchestrator?.getConfig();
      const ownerTelegramId = config?.ownerTelegramId;

      const task = await scheduler.createTask({
        name: `Reminder: ${message.slice(0, 50)}`,
        description: `Remind owner: "${message}" at ${scheduledDate.toLocaleString()}`,
        schedule: {
          recurrence,
          startDate: scheduledDate,
        },
        data: { message, ownerTelegramId },
        tags: ['reminder'],
        metadata: { createdBy: 'chat', message },
        handler: async (_ctx, data: { message: string; ownerTelegramId?: string }) => {
          const reminderText = `⏰ **Reminder:** ${data.message}`;
          // Try Telegram first, then WhatsApp, then web-console
          if (data.ownerTelegramId && tgConnection) {
            try {
              await tgConnection.sendMessage(Number(data.ownerTelegramId), reminderText);
              console.log(`[Scheduler] Sent reminder to owner via Telegram`);
              return { sent: true, channel: 'telegram' };
            } catch (err: any) {
              console.error(`[Scheduler] Telegram reminder failed:`, err.message);
            }
          }
          const socket = waConnection?.getSocket();
          const ownerPhone = config?.ownerPhone;
          if (socket && ownerPhone) {
            try {
              const jid = `${ownerPhone.replace(/\D/g, '')}@s.whatsapp.net`;
              await socket.sendMessage(jid, { text: reminderText });
              console.log(`[Scheduler] Sent reminder to owner via WhatsApp`);
              return { sent: true, channel: 'whatsapp' };
            } catch (err: any) {
              console.error(`[Scheduler] WhatsApp reminder failed:`, err.message);
            }
          }
          console.log(`[Scheduler] Reminder stored (no messaging channel available): ${data.message}`);
          return { sent: false, stored: true };
        },
      });

      return {
        toolName: 'create_reminder',
        success: true,
        result: `Reminder set: "${message}" at ${scheduledDate.toLocaleString()}${recurrence !== 'once' ? ` (${recurrence})` : ''}. Task ID: ${task.id}`,
        duration: 0,
      };
    } catch (err: any) {
      return { toolName: 'create_reminder', success: false, error: `Failed to create reminder: ${err.message}`, duration: 0 };
    }
  });

  registry.register('list_schedules', async (args) => {
    if (!scheduler) {
      return { toolName: 'list_schedules', success: false, error: 'Scheduler service not initialized', duration: 0 };
    }

    const statusFilter = args.status ? String(args.status) as any : undefined;
    const filter = statusFilter ? { status: statusFilter } : { enabled: true };
    const result = scheduler.listTasks(filter, { field: 'createdAt', direction: 'desc' });

    if (result.tasks.length === 0) {
      return { toolName: 'list_schedules', success: true, result: 'No scheduled tasks found.', duration: 0 };
    }

    const lines = result.tasks.map(t => {
      const nextRun = t.nextRunAt ? t.nextRunAt.toLocaleString() : 'N/A';
      const tags = t.tags.length > 0 ? ` [${t.tags.join(', ')}]` : '';
      return `• **${t.name}** (ID: ${t.id})\n  Status: ${t.status} | Next run: ${nextRun} | Recurrence: ${t.schedule.recurrence}${tags}`;
    });

    return {
      toolName: 'list_schedules',
      success: true,
      result: `Found ${result.tasks.length} scheduled task(s):\n\n${lines.join('\n\n')}`,
      duration: 0,
    };
  });

  registry.register('delete_schedule', async (args) => {
    const taskId = String(args.task_id || '');
    if (!taskId) {
      return { toolName: 'delete_schedule', success: false, error: 'Missing required parameter: task_id', duration: 0 };
    }
    if (!scheduler) {
      return { toolName: 'delete_schedule', success: false, error: 'Scheduler service not initialized', duration: 0 };
    }

    const deleted = await scheduler.deleteTask(taskId);
    if (deleted) {
      return { toolName: 'delete_schedule', success: true, result: `Deleted scheduled task ${taskId}.`, duration: 0 };
    }
    return { toolName: 'delete_schedule', success: false, error: `Task ${taskId} not found.`, duration: 0 };
  });

  registry.register('trigger_schedule', async (args) => {
    const taskId = String(args.task_id || '');
    if (!taskId) {
      return { toolName: 'trigger_schedule', success: false, error: 'Missing required parameter: task_id', duration: 0 };
    }
    if (!scheduler) {
      return { toolName: 'trigger_schedule', success: false, error: 'Scheduler service not initialized', duration: 0 };
    }

    try {
      const result = await scheduler.runTaskNow(taskId);
      return {
        toolName: 'trigger_schedule',
        success: result.success,
        result: result.success ? `Task ${taskId} executed successfully.` : `Task ${taskId} execution failed: ${result.error}`,
        duration: result.duration,
      };
    } catch (err: any) {
      return { toolName: 'trigger_schedule', success: false, error: `Failed to trigger task: ${err.message}`, duration: 0 };
    }
  });

  registry.register('forward_message', async (args) => {
    const to = String(args.to || '');
    const text = String(args.text || '');
    const channel = String(args.channel || '');
    if (!to || !text) {
      return { toolName: 'forward_message', success: false, error: 'Missing required parameters (to, text)', duration: 0 };
    }

    try {
      const provider = messagingRegistry.resolveProvider(channel || undefined);
      await provider.sendMessage(to, `↩️ Forwarded:\n\n${text}`);
      return {
        toolName: 'forward_message',
        success: true,
        result: `Message forwarded to ${to}.`,
        duration: 0,
      };
    } catch (err: any) {
      return { toolName: 'forward_message', success: false, error: `Failed to forward message: ${err.message}`, duration: 0 };
    }
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
      waConnection = new WhatsAppConnection({
        ...DEFAULT_WHATSAPP_CONFIG,
        ...whatsappConfig,
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

        // Always respond to incoming messages — skills govern behavior
        if (agentOrchestrator && !msg.isFromMe && msg.body) {
          const jid = msg.from || '';
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
            console.error('[API] WhatsApp reply error:', err.message);
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
      
      // Inject the owner's response as a system-originated message to the agent
      // The orchestrator will handle sending the resulting LLM response to the visitor
      const systemMessage = `[SYSTEM] The owner responded to your approval request (ID: ${approvalId}): "${response}"\n\nPlease relay this information to the visitor appropriately.`;
      
      agentOrchestrator.chat(sessionId, systemMessage, source).then(result => {
        if (result.content) {
          if (source === 'telegram' && tgConnection) {
            const chatId = Number(sessionId.replace('telegram:', ''));
            tgConnection.sendMessage(chatId, result.content);
          } else if (source === 'whatsapp' && waConnection) {
            const socket = waConnection.getSocket();
            const jid = sessionId.includes('@') ? sessionId : `${sessionId.replace(/\D/g, '')}@s.whatsapp.net`;
            socket?.sendMessage(jid, { text: result.content });
          }
        }
        console.log(`[Approvals] Follow-up chat turn completed for ${sessionId}. Response: ${result.content.slice(0, 100)}...`);
      }).catch(err => {
        console.error(`[Approvals] Follow-up chat turn failed for ${sessionId}:`, err.message);
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

  return false; // Not handled
}
