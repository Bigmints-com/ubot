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
import { handleVaultRoutes } from './routes/vault.js';
import { handleMemoryRoutes } from './routes/memory.js';
import { handleIntegrationRoutes } from './routes/integrations.js';
import { handleIntegrationProviderRoutes } from './routes/integrations-providers.js';
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

// ─── Config Persistence (Direct JSON — single source of truth) ──

function saveConfigDirect(updates: Partial<import('../data/config.js').UbotConfig>): void {
  try {
    const config = loadUbotConfig();
    Object.assign(config, updates);
    saveUbotConfig(config);
  } catch (err: any) {
    console.error('[Config] Failed to save:', err.message);
  }
}

// Legacy wrapper — still used by some routes, delegates to direct save
function saveConfigValue(key: string, value: string): void {
  try {
    const config = loadUbotConfig();

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
    } else if (key === 'telegram_bot_token') {
      if (!config.channels) config.channels = {};
      if (!config.channels.telegram) config.channels.telegram = {};
      config.channels.telegram.token = value;
    } else {
      (config as any)[key] = value;
    }

    saveUbotConfig(config);
    log.info('Config', `Saved ${key} to config.json`);
  } catch (err: any) {
    console.error(`[Config] Failed to save ${key}:`, err.message);
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

    // Download media if present
    let attachments: import('../engine/types.js').Attachment[] | undefined;
    if (msg.hasMedia && msg.id && waConnection) {
      try {
        const media = await waConnection.downloadMedia(msg.id);
        if (media) {
          const { randomUUID } = await import('crypto');
          const { join } = await import('path');
          const { mkdirSync, writeFileSync, existsSync } = await import('fs');
          
          const uploadsDir = join(process.cwd(), 'workspace', 'uploads');
          if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

          const id = randomUUID();
          const ext = media.mimeType.startsWith('image/') ? '.jpg'
            : media.mimeType.includes('pdf') ? '.pdf'
            : media.mimeType.startsWith('video/') ? '.mp4'
            : '';
          const filePath = join(uploadsDir, `${id}${ext}`);
          writeFileSync(filePath, media.buffer);

          const attachment: import('../engine/types.js').Attachment = {
            id,
            filename: `whatsapp-media-${id}${ext}`,
            mimeType: media.mimeType,
            path: filePath,
            size: media.buffer.length,
          };

          // For images: encode base64 for LLM vision
          if (media.mimeType.startsWith('image/')) {
            attachment.base64 = media.buffer.toString('base64');
          }

          // For PDFs: extract text
          if (media.mimeType === 'application/pdf') {
            try {
              const { PDFParse } = await import('pdf-parse');
              const parser = new PDFParse({ data: new Uint8Array(media.buffer) });
              const text = String(await parser.getText() || '');
              attachment.textContent = text;
            } catch (err: any) {
              log.error('WhatsApp', `PDF parse error: ${err.message}`);
            }
          }

          attachments = [attachment];
          log.info('WhatsApp', `Downloaded media: ${media.mimeType} (${media.buffer.length} bytes)`);
        }
      } catch (err: any) {
        log.error('WhatsApp', `Media download failed: ${err.message}`);
      }
    }

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
      attachments,
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

    // Download media if present
    let attachments: import('../engine/types.js').Attachment[] | undefined;
    if (msg.hasMedia && msg.id && tgConnection) {
      try {
        const media = await tgConnection.downloadMedia(msg.id);
        if (media) {
          const { randomUUID } = await import('crypto');
          const { join } = await import('path');
          const { mkdirSync, writeFileSync, existsSync } = await import('fs');

          const uploadsDir = join(process.cwd(), 'workspace', 'uploads');
          if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

          const id = randomUUID();
          const ext = media.mimeType.startsWith('image/') ? '.jpg'
            : media.mimeType.includes('pdf') ? '.pdf'
            : '';
          const filePath = join(uploadsDir, `${id}${ext}`);
          writeFileSync(filePath, media.buffer);

          const attachment: import('../engine/types.js').Attachment = {
            id,
            filename: media.filename,
            mimeType: media.mimeType,
            path: filePath,
            size: media.buffer.length,
          };

          if (media.mimeType.startsWith('image/')) {
            attachment.base64 = media.buffer.toString('base64');
          }

          if (media.mimeType === 'application/pdf') {
            try {
              const { PDFParse } = await import('pdf-parse');
              const parser = new PDFParse({ data: new Uint8Array(media.buffer) });
              attachment.textContent = String(await parser.getText() || '');
            } catch (err: any) {
              log.error('Telegram', `PDF parse error: ${err.message}`);
            }
          }

          attachments = [attachment];
          log.info('Telegram', `Downloaded media: ${media.mimeType} (${media.buffer.length} bytes)`);
        }
      } catch (err: any) {
        log.error('Telegram', `Media download failed: ${err.message}`);
      }
    }

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
      attachments,
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
  const cfg = loadUbotConfig();
  const savedToken = cfg.channels?.telegram?.token;
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
    if (config.channels?.imessage?.auto_reply && agentOrchestrator && imProvider) {
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
  const config = loadUbotConfig();
  const imConfig = config.channels?.imessage;
  if (!imConfig?.server_url || !imConfig?.password) {
    console.log('[iMessage] No saved BlueBubbles config — waiting for manual connect via UI');
    return;
  }
  const savedServerUrl = imConfig.server_url;
  const savedPassword = imConfig.password;

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

/**
 * Migrate config to v2 keyed provider format.
 * Handles: llm.providers[], integrations.llm.chat[], integrations.serper_api_key
 */
function migrateConfigV2(): void {
  const cfg = loadUbotConfig();
  if (cfg.meta?.version === '2.0') return; // Already migrated
  
  let changed = false;

  // ── Migrate LLM providers to models.providers ──
  // Source: old llm.providers[] OR integrations.llm.chat[]
  if (!cfg.models?.providers) {
    const oldProviders = cfg.llm?.providers || cfg.integrations?.llm?.chat || [];
    if (Array.isArray(oldProviders) && oldProviders.length > 0) {
      if (!cfg.models) cfg.models = {};
      cfg.models.providers = {};
      
      for (const p of oldProviders) {
        const key = (p.provider || p.type || p.name || 'custom').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
        // Deduplicate keys
        let finalKey = key;
        let suffix = 2;
        while (cfg.models.providers[finalKey]) { finalKey = `${key}-${suffix++}`; }
        
        cfg.models.providers[finalKey] = {
          enabled: p.enabled !== false,
          baseUrl: p.baseUrl || undefined,
          apiKey: p.apiKey || undefined,
          model: p.model || undefined,
        };
        
        if (p.isDefault || p.id === cfg.llm?.default_provider_id) {
          cfg.models.default = finalKey;
        }
      }
      
      if (!cfg.models.default) {
        cfg.models.default = Object.keys(cfg.models.providers)[0];
      }
      
      log.info('Migration', `Migrated ${oldProviders.length} LLM providers → models.providers`);
      changed = true;
    }
  }

  // ── Migrate search providers ──
  const oldSerperKey = cfg.integrations?.serper_api_key;
  const oldSearchProviders = cfg.integrations?.search?.providers;
  
  if (!cfg.search?.providers) {
    if (!cfg.search) cfg.search = {};
    cfg.search.providers = {};
    
    if (oldSerperKey) {
      cfg.search.providers.serper = { enabled: true, apiKey: oldSerperKey };
      cfg.search.default = 'serper';
    } else if (Array.isArray(oldSearchProviders)) {
      for (const p of oldSearchProviders) {
        const key = (p.type || p.name || 'custom').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
        cfg.search.providers[key] = {
          enabled: p.enabled !== false,
          apiKey: p.apiKey || undefined,
        };
        if (p.isDefault) cfg.search.default = key;
      }
    }
    
    // Always add duckduckgo as fallback
    if (!cfg.search.providers.duckduckgo) {
      cfg.search.providers.duckduckgo = { enabled: true };
    }
    if (!cfg.search.default) {
      cfg.search.default = Object.keys(cfg.search.providers)[0];
    }
    
    if (oldSerperKey || oldSearchProviders?.length) {
      log.info('Migration', 'Migrated search providers → search.providers');
      changed = true;
    }
  }

  // ── Migrate CLI to standard provider format ──
  const oldCli = cfg.cli;
  if (oldCli && !oldCli.providers) {
    const cliProviders: Record<string, any> = {
      gemini: { enabled: oldCli.default === 'gemini' || (oldCli as any).provider === 'gemini', timeout: (oldCli as any).timeout || 300000 },
      claude: { enabled: (oldCli as any).provider === 'claude', timeout: 300000 },
      codex: { enabled: (oldCli as any).provider === 'codex', timeout: 300000 },
    };
    cfg.cli = {
      default: (oldCli as any).provider || 'gemini',
      providers: cliProviders,
      workDir: (oldCli as any).workDir,
    };
    log.info('Migration', 'Migrated CLI → cli.providers');
    changed = true;
  }

  // ── Migrate agent settings ──
  if (!cfg.agent) {
    cfg.agent = { max_history_messages: 20 };
    changed = true;
  }

  // ── Clean up legacy fields ──
  if (cfg.integrations) {
    delete cfg.integrations;
    changed = true;
  }
  if (cfg.llm) {
    delete cfg.llm;
    changed = true;
  }

  // ── Set version ──
  cfg.meta = { version: '2.0' };

  if (changed) {
    saveUbotConfig(cfg);
    log.info('Migration', 'Config migrated to v2.0');
  }
}

export function initializeApi(db?: DatabaseConnection, agent?: AgentOrchestrator, wsPath?: string): void {
  migrateConfigV2();
  workspacePath = wsPath || null;
  if (db) {

    skillRepo = createSkillRepository(db as unknown as CoreDatabaseConnection);
    coreDb = db as unknown as CoreDatabaseConnection;
    eventBus = createEventBus();
    approvalStore = createApprovalStore(db as unknown as CoreDatabaseConnection);

    if (agent) {
      // Load config directly from config.json (single source of truth)
      const cfg = loadUbotConfig();
      const configUpdates: Record<string, unknown> = {};

      // Owner identity
      if (cfg.owner?.phone) configUpdates.ownerPhone = cfg.owner.phone;
      if (cfg.owner?.telegram_id) configUpdates.ownerTelegramId = cfg.owner.telegram_id;
      if (cfg.owner?.telegram_username) configUpdates.ownerTelegramUsername = cfg.owner.telegram_username;

      // Auto-reply
      if (cfg.channels?.whatsapp?.auto_reply !== undefined) configUpdates.autoReplyWhatsApp = cfg.channels.whatsapp.auto_reply;
      if (cfg.channels?.telegram?.auto_reply !== undefined) configUpdates.autoReplyTelegram = cfg.channels.telegram.auto_reply;

      // Agent settings
      if (cfg.agent?.max_history_messages) configUpdates.maxHistoryMessages = cfg.agent.max_history_messages;

      // LLM providers — map from v2 keyed format to agent's array format
      if (cfg.models?.providers) {
        const defaultKey = cfg.models.default || Object.keys(cfg.models.providers)[0] || '';
        const llmProviders: LLMProviderConfig[] = Object.entries(cfg.models.providers)
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

        if (llmProviders.length > 0) {
          configUpdates.llmProviders = llmProviders;
          configUpdates.defaultLlmProviderId = defaultKey;
          const dp = cfg.models.providers[defaultKey];
          if (dp) {
            configUpdates.llmBaseUrl = dp.baseUrl || '';
            configUpdates.llmModel = dp.model || '';
            configUpdates.llmApiKey = dp.apiKey || '';
          }
          log.info('Config', `Loaded ${llmProviders.length} model providers from config.json`);
        }
      }

      if (Object.keys(configUpdates).length > 0) {
        agent.updateConfig(configUpdates);
        log.info('Config', `Applied settings: ${Object.keys(configUpdates).join(', ')}`);
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
    { get: (key: string) => {
      const c = loadUbotConfig();
      if (key === 'mcp_servers') return JSON.stringify(c.mcp?.servers || {});
      return (c as any)[key] ?? null;
    }, set: saveConfigValue },
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
    workspacePath,
    saveConfigValue,
    loadConfigValue: (key: string) => {
      const c = loadUbotConfig();
      if (key === 'mcp_servers') return JSON.stringify(c.mcp?.servers || {});
      if (key === 'telegram_bot_token') return c.channels?.telegram?.token || null;
      return (c as any)[key] ?? null;
    },
  };
}

// ─── Channel Routes (kept inline — they mutate connection state) ──

async function handleChannelRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
): Promise<boolean> {

  // ── Integrations Config ────────────────────────────────
  if (url === '/api/config/integrations' && method === 'GET') {
    const cfg = loadUbotConfig();
    json(res, {
      serper_api_key: cfg.integrations?.serper_api_key ? '••••' + (cfg.integrations.serper_api_key).slice(-4) : '',
      serper_configured: !!cfg.integrations?.serper_api_key,
      cli: cfg.cli || { enabled: false, provider: 'gemini', workDir: 'workspace/cli-projects', timeout: 300000 },
      filesystem: cfg.filesystem || { allowed_paths: [] },
    });
    return true;
  }

  if (url === '/api/config/integrations' && method === 'PUT') {
    const body = await parseBody(req) as any;
    const cfg = loadUbotConfig();

    if (body.serper_api_key !== undefined && !body.serper_api_key.includes('••••')) {
      if (!cfg.integrations) cfg.integrations = {};
      cfg.integrations.serper_api_key = body.serper_api_key;
      // Update env and in-memory serper key for immediate use
      process.env.SERPER_API_KEY = body.serper_api_key;
      try {
        const { setSerperApiKey } = await import('../capabilities/skills/web-search/adapters/serper.js');
        setSerperApiKey(body.serper_api_key);
      } catch { /* ignore */ }
    }
    if (body.cli !== undefined) {
      cfg.cli = { ...cfg.cli, ...body.cli };
    }
    if (body.filesystem !== undefined) {
      cfg.filesystem = { ...cfg.filesystem, ...body.filesystem };
    }

    saveUbotConfig(cfg);
    json(res, { saved: true });
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
      serverUrl: loadUbotConfig().channels?.imessage?.server_url ? '(configured)' : null,
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

      // Save config under channels.imessage
      const cfg = loadUbotConfig();
      if (!cfg.channels) cfg.channels = {};
      cfg.channels.imessage = { enabled: true, server_url: serverUrl, password, auto_reply: cfg.channels.imessage?.auto_reply ?? false };
      saveUbotConfig(cfg);
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
    const cfg = loadUbotConfig();
    if (cfg.channels?.imessage) {
      cfg.channels.imessage = { enabled: false };
      saveUbotConfig(cfg);
    }
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
  // The dashboard can be accessed via localhost or LAN IP, so we check
  // known dashboard ports rather than requiring "localhost" in the origin.
  const origin = String(req.headers['origin'] || req.headers['referer'] || '');
  const serverPort = process.env.PORT || '11490';
  const dashboardPorts = [serverPort, '4080', '4081', '11490', '3000'];
  const isDashboard = dashboardPorts.some(port => origin.includes(`:${port}`));
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
  if (await handleIntegrationProviderRoutes(req, res, url, method, ctx)) return true;
  if (await handleIntegrationRoutes(req, res, url, method, ctx)) return true;
  if (await handleToolsRoutes(req, res, url, method, ctx)) return true;
  if (await handleCliRoutes(req, res, url, method, ctx)) return true;
  if (await handleVaultRoutes(req, res, url, method, ctx)) return true;

  return false;
}
