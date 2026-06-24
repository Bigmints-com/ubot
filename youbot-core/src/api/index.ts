/**
 * API Router for Youbot Core
 * Handles all /api/* routes with JSON request/response
 * 
 * Route handlers are in ./routes/ — this file manages state and initialization.
 */

import http from 'http';
import type { LLMProviderConfig } from '../engine/types.js';

import type { DatabaseConnection } from '../data/database/types.js';
import { createTaskScheduler, type TaskSchedulerService } from '../automation/scheduler/service.js';
import { DEFAULT_SAFETY_CONFIG, type SafetyConfig, type SafetyRule } from '../agents/safety/types.js';
import { DEFAULT_SAFETY_RULES } from '../agents/safety/utils.js';
import { DEFAULT_WHATSAPP_CONFIG, type WhatsAppConnectionConfig } from '../channels/whatsapp/types.js';
import { WhatsAppConnection } from '../channels/whatsapp/connection.js';
import { WhatsAppMessagingProvider } from '../channels/whatsapp/messaging-provider.js';
import { TelegramConnection } from '../channels/telegram/connection.js';
import { WebchatConnection } from '../channels/webchat/connection.js';
import { TelegramMessagingProvider } from '../channels/telegram/messaging-provider.js';

import { MessagingRegistry } from '../channels/registry.js';
import { createFileSkillRepository } from '../agents/skills/file-skill-repository.js';
import type { SkillRepository } from '../agents/skills/skill-repository.js';
import type { WorkspaceProvider } from '../data/workspace-provider.js';
import { createSkillEngine, type SkillEngine } from '../agents/skills/skill-engine.js';
import { createEventBus, type EventBus } from '../agents/skills/event-bus.js';
import { loadYoubotConfig, saveYoubotConfig } from '../data/config.js';

import { createApprovalStore, type ApprovalStore } from '../automation/approvals/service.js';
import { createAsyncJobStore, type AsyncJobStore } from './job-store.js';

import type { AgentOrchestrator } from '../engine/orchestrator.js';
import { metricsCollector } from '../metrics/index.js';
import { log } from '../logger/ring-buffer.js';
import { handleIncomingMessage, type UnifiedMessage, type UnifiedDeps } from '../engine/handler.js';
import { existsSync } from 'fs';
import { join } from 'path';
import { transcribeAudio } from '../capabilities/transcription/service.js';

import { FEATURES, MODE } from '../lib/features.js';

// Catch unhandled Promise rejections (e.g. from node-telegram-bot-api) to prevent Node crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Route handlers
import { handleChatRoutes } from './routes/chat.js';
import { handleSkillRoutes } from './routes/skills.js';
import { handleSafetyRoutes } from './routes/safety.js';
import { handleVaultRoutes } from './routes/vault.js';
import { handleMemoryRoutes } from './routes/memory.js';
import { handleIntegrationRoutes } from './routes/integrations.js';
import { handleIntegrationProviderRoutes } from './routes/integrations-providers.js';
import { handleToolsRoutes } from './routes/tools.js';
import { handleWebchatRoutes, ensureWebchatToken } from './routes/webchat.js';
import { handleModulesRoutes } from './routes/modules.js';
import { handleAgentsRoutes } from './routes/agents.js';
import { handleTasksRoutes } from './routes/tasks.js';
import { getPromptExperiments } from '../engine/prompt-experiment.js';
import { json, parseBody, error as apiError, type ApiContext } from './context.js';

// Middleware
import { requiresAuth, authenticate, sendUnauthorized } from './middleware/auth.js';
import { getHooks } from '../hooks/extensions.js';
import { ApiRateLimiter, sendRateLimited, setRateLimitHeaders } from './middleware/rate-limiter.js';
import { logRequest, wrapResponse } from './middleware/request-logger.js';

// ─── Rate Limiter Instance ───────────────────────────────

const rateLimiter = new ApiRateLimiter();

// ─── CORS Configuration ─────────────────────────────────

function getAllowedOrigins(): string[] {
  try {
    const config = loadYoubotConfig();
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
let workspaceProvider: WorkspaceProvider | null = null;

// WhatsApp connection state
let waConnection: WhatsAppConnection | null = null;
let waQrCode: string | null = null;
let waStatus: string = 'disconnected';
let waError: string | null = null;

const waMessages: Array<{ from: string; to: string; body: string; timestamp: string; isFromMe: boolean }> = [];
const MAX_WA_MESSAGES = 100;

import { crewRegistry } from '../engine/crew-registry.js';
let scheduler: TaskSchedulerService | null = null;
let agentOrchestrator: AgentOrchestrator | null = null;

// MCP server manager
import { getMcpServerManager, type McpServerManager } from '../capabilities/mcp/mcp-manager.js';
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

// Webchat connection state
let webchatConnection: WebchatConnection | null = null;
let webchatStatus: string = 'disconnected';
let webchatError: string | null = null;

// Universal skill engine
let skillRepo: SkillRepository | null = null;
let skillEngine: SkillEngine | null = null;
let eventBus: EventBus | null = null;

// Owner approval system
let approvalStore: ApprovalStore | null = null;

// Follow-up store for conversation continuity
let followUpStoreInstance: any | null = null;

// Database reference for config persistence
let coreDb: DatabaseConnection | null = null;
let asyncJobStore: AsyncJobStore | null = null;

// ─── Config Persistence (Direct JSON — single source of truth) ──

function saveConfigDirect(updates: Partial<import('../data/config.js').YoubotConfig>): void {
  try {
    const config = loadYoubotConfig();
    Object.assign(config, updates);
    saveYoubotConfig(config);
  } catch (err: any) {
    console.error('[Config] Failed to save:', err.message);
  }
}

// Legacy wrapper — still used by some routes, delegates to direct save
function saveConfigValue(key: string, value: string): void {
  try {
    const config = loadYoubotConfig();

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

    saveYoubotConfig(config);
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
      waError = null;
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

    if (msg.isFromMe || !agentOrchestrator) return;
    // Allow audio-only messages through (they have no body but will be transcribed)
    if (!msg.body && !msg.hasMedia) return;

    const jid = msg.from || '';
    const replyJid = msg.rawJid || jid;

    // Always prefer pushName (WhatsApp display name) over raw JID
    const senderName = msg.pushName || msg.from || '';

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
            : media.mimeType.startsWith('audio/') ? (media.mimeType.includes('ogg') ? '.ogg' : media.mimeType.includes('mp4') || media.mimeType.includes('m4a') ? '.m4a' : '.mp3')
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

          // For audio: auto-transcribe via configured provider or local Whisper fallback
          if (media.mimeType.startsWith('audio/')) {
            try {
              log.info('WhatsApp', `🎤 Transcribing audio (${media.mimeType})...`);
              const cfg = agentOrchestrator?.getConfig?.() as any;
              // llmProviders is LLMProviderConfig[] — find the transcription-routed provider
              const providerList: any[] = Array.isArray(cfg?.llmProviders) ? cfg.llmProviders : [];
              const routing: Record<string, string> = cfg?.modelRouting || {};
              const transcriptionProviderId = routing['transcription'] ? routing['transcription'].split('/')[0] : cfg?.defaultLlmProviderId;
              const llmProvider = providerList.find((p: any) => p.id === transcriptionProviderId) || providerList.find((p: any) => p.isDefault) || providerList[0];
              const transcription = await transcribeAudio(filePath, {
                language: 'auto',
                providerBaseUrl: llmProvider?.baseUrl,
                providerApiKey: llmProvider?.apiKey,
              });
              attachment.textContent = transcription.text;
              msg.body = `[Voice message transcription]: ${transcription.text}`;
              log.info('WhatsApp', `🎤 Transcription: "${transcription.text.slice(0, 80)}"`);
            } catch (err: any) {
              log.warn('WhatsApp', `Transcription unavailable: ${err.message}`);
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
      senderName,
      body: msg.body || '[Media message]',
      timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(),
      replyFn: async (text: string) => {
        log.info('WhatsApp', `Sending reply to rawJid=${replyJid} (resolved=${jid})`);
        try {
          await conn.sendMessage(replyJid, { text });
          waMessages.push({ from: 'me', to: jid, body: text, timestamp: new Date().toISOString(), isFromMe: true });
        } catch (err: any) {
          log.error('WhatsApp', `Failed to send reply to ${replyJid}: ${err.message}`);
          throw err;
        }
      },
      typingFn: async () => {
        try {
          await conn.sendPresenceUpdate('composing', replyJid);
        } catch {}
      },
      extra: {
        rawJid: replyJid,
        participant: msg.participant,
        hasMedia: msg.hasMedia,
        quotedMessageId: msg.quotedMessageId,
        pushName: msg.pushName,
        interactiveOptions: msg.interactiveOptions,
      },
      attachments,
    };

    const deps: UnifiedDeps = {
      orchestrator: agentOrchestrator,
      approvalStore,
      followUpStore: followUpStoreInstance,
      eventBus,
      skillEngine,
      saveConfigValue,
      relayMessage: relayApprovalResponse,
    };

    const result = await handleIncomingMessage(unified, deps);
    if (result.response && result.response.trim()) {
      await unified.replyFn(result.response);
    }
  });
}

async function autoConnectWhatsApp(): Promise<void> {
  const cfg = loadYoubotConfig();
  if (cfg.channels?.whatsapp?.enabled === false) {
    console.log('[WhatsApp] Auto-connect skipped — channel is disabled in config.');
    return;
  }

  const sessionPath = (whatsappConfig as any).sessionPath || DEFAULT_WHATSAPP_CONFIG.sessionPath;
  const sessionName = (whatsappConfig as any).sessionName || 'youbot-session';
  const credsPath = join(sessionPath, sessionName, 'creds.json');

  console.log(`[WhatsApp] Auto-connect: checking session at ${credsPath}`);

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

    if (msg.isFromMe || !agentOrchestrator) return;
    // Allow audio-only messages through (they have no body but will be transcribed)
    if (!msg.body && !msg.hasMedia) return;

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
            : media.mimeType.startsWith('audio/') ? (media.mimeType.includes('ogg') ? '.ogg' : media.mimeType.includes('mp4') || media.mimeType.includes('m4a') ? '.m4a' : '.mp3')
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

          // For audio: auto-transcribe via configured provider or local Whisper fallback
          if (media.mimeType.startsWith('audio/')) {
            try {
              log.info('Telegram', `🎤 Transcribing audio (${media.mimeType})...`);
              const cfg = agentOrchestrator?.getConfig?.() as any;
              // llmProviders is LLMProviderConfig[] — find the transcription-routed provider
              const providerList: any[] = Array.isArray(cfg?.llmProviders) ? cfg.llmProviders : [];
              const routing: Record<string, string> = cfg?.defaults || {};
              const transcriptionProviderId = routing['transcription'] ? routing['transcription'].split('/')[0] : cfg?.defaultLlmProviderId;
              const llmProvider = providerList.find((p: any) => p.id === transcriptionProviderId) || providerList.find((p: any) => p.isDefault) || providerList[0];
              const transcription = await transcribeAudio(filePath, {
                language: 'auto',
                providerBaseUrl: llmProvider?.baseUrl,
                providerApiKey: llmProvider?.apiKey,
              });
              attachment.textContent = transcription.text;
              msg.body = `[Voice message transcription]: ${transcription.text}`;
              log.info('Telegram', `🎤 Transcription: "${transcription.text.slice(0, 80)}"`);
            } catch (err: any) {
              log.warn('Telegram', `Transcription unavailable: ${err.message}`);
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
      body: msg.body || '[Media message]',
      timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(),
      replyFn: async (text: string) => {
        if (conn) {
          await conn.sendMessage(msg.chatId, text);
          tgMessages.push({ from: 'bot', to: senderChatId, body: text, timestamp: new Date().toISOString(), isFromMe: true });
        }
      },
      typingFn: async () => {
        if (conn) {
          await conn.sendTyping(msg.chatId);
        }
      },
      extra: { chatId: msg.chatId },
      attachments,
    };

    const deps: UnifiedDeps = {
      orchestrator: agentOrchestrator,
      approvalStore,
      followUpStore: followUpStoreInstance,
      eventBus,
      skillEngine,
      saveConfigValue,
      relayMessage: relayApprovalResponse,
    };

    const result = await handleIncomingMessage(unified, deps);
    if (result.response && result.response.trim()) {
      await unified.replyFn(result.response);
    }
  });

  conn.on('error', (err) => {
    tgError = err.message;
    log.error('Telegram', `Error: ${err.message}`);
  });
}

async function autoConnectTelegram(): Promise<void> {
  const cfg = loadYoubotConfig();
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


// ─── Webchat Event Handlers ──────────────────────────────

function setupWebchatHandlers(conn: WebchatConnection): void {
  conn.removeAllListeners();
  conn.on('connection.update', (status) => {
    webchatStatus = status;
    if (status === 'connected') {
      log.info('Webchat', `Connected to relay: ${conn.relayUrl}`);
      // Push widget config to relay
      const cfg = loadYoubotConfig();
      const wc = cfg.channels?.webchat || {};
      conn.pushConfig({
        title: wc.widget_title || 'Chat with us',
        color: wc.widget_color || '#6366f1',
        welcomeMessage: wc.welcome_message || 'Hi there! How can I help you today?',
        avatarUrl: wc.avatar_url || '',
      }).catch(() => {});
    }
    if (status === 'error') {
      webchatError = 'Connection error';
    }
  });

  conn.on('message.received', async (msg) => {
    if (!agentOrchestrator) return;

    // Build attachments from audio/image
    const attachments: Array<{ id: string; mimeType: string; base64: string; filename: string; path: string }> = [];
    if (msg.audio) {
      const audioData = msg.audio.includes(',') ? msg.audio.split(',')[1] : msg.audio;
      attachments.push({ id: `wc-audio-${Date.now()}`, mimeType: 'audio/webm', base64: audioData, filename: 'voice.webm', path: '' });
    }
    if (msg.image) {
      const imgData = msg.image.includes(',') ? msg.image.split(',')[1] : msg.image;
      const mimeMatch = msg.image.match(/data:([^;]+);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/png';
      attachments.push({ id: `wc-img-${Date.now()}`, mimeType: mime, base64: imgData, filename: 'image.png', path: '' });
    }

    const extra: Record<string, unknown> = {};
    if (msg.ownerKey) extra.ownerKey = msg.ownerKey;
    if (msg.audio) extra.hasMedia = true;
    if (msg.image) extra.hasMedia = true;

    // Send typing keepalive every 20s to prevent relay from timing out
    // during long agentic tasks (Playwright browsing, web search, etc.)
    let replied = false;
    const typingInterval = setInterval(() => {
      if (!replied) conn.sendTyping(msg.id).catch(() => {});
    }, 20000);

    const unified: UnifiedMessage = {
      channel: 'webchat',
      senderId: msg.session,
      senderName: msg.name || 'Website Visitor',
      body: msg.message || (msg.audio ? '[Voice message]' : '') || (msg.image ? '[Image]' : ''),
      timestamp: new Date(),
      replyFn: async (text: string) => {
        replied = true;
        clearInterval(typingInterval);
        // Send response back to relay
        await conn.respond(msg.id, text);
      },
      extra: Object.keys(extra).length ? extra : undefined,
      attachments: attachments.length ? attachments : undefined,
    };

    const deps: UnifiedDeps = {
      orchestrator: agentOrchestrator,
      approvalStore,
      followUpStore: followUpStoreInstance,
      eventBus,
      skillEngine,
      saveConfigValue,
      relayMessage: relayApprovalResponse,
    };

    try {
      await handleIncomingMessage(unified, deps);
    } finally {
      replied = true;
      clearInterval(typingInterval);
    }
  });


  conn.on('error', (err) => {
    webchatError = err.message;
    log.error('Webchat', `Error: ${err.message}`);
  });
}

async function autoConnectWebchat(): Promise<void> {
  const cfg = loadYoubotConfig();
  const wc = cfg.channels?.webchat;
  if (!wc?.relay_url || wc?.enabled === false) {
    console.log('[Webchat] No relay URL configured or channel disabled — skipping');
    return;
  }

  log.info('Webchat', `Connecting to relay: ${wc.relay_url}`);
  webchatStatus = 'connecting';

  try {
    if (webchatConnection) {
      try { await webchatConnection.disconnect(); } catch { /* ignore */ }
    }
    webchatConnection = new WebchatConnection({
      relayUrl: wc.relay_url,
      botSecret: wc.bot_secret || '',
    });
    setupWebchatHandlers(webchatConnection);
    await webchatConnection.connect();
    log.info('Webchat', 'Connected successfully');
  } catch (e: any) {
    log.error('Webchat', `Auto-connect failed: ${e.message}`);
    webchatStatus = 'disconnected';
    webchatError = e.message;
  }
}



// ─── Initialization ──────────────────────────────────────

/**
 * Migrate config to v2 keyed provider format.
 * Handles: v1 (llm.providers[], integrations.*), v2 (top-level models/search/cli)
 */
function migrateConfig(): void {
  const cfg = loadYoubotConfig();
  const currentVersion = cfg.meta?.version;
  if (currentVersion === '3.0') return; // Already at latest

  let changed = false;
  if (!cfg.capabilities) cfg.capabilities = {};

  // ── v1 → v2: Migrate old array-based formats to keyed ──
  // LLM providers from llm.providers[] or integrations.llm.chat[]
  const oldLlmProviders = cfg.llm?.providers || cfg.integrations?.llm?.chat || [];
  if (Array.isArray(oldLlmProviders) && oldLlmProviders.length > 0 && !cfg.capabilities.models?.providers && !cfg.models?.providers) {
    const modelsSection: any = { enabled: true, providers: {} };
    for (const p of oldLlmProviders) {
      const key = (p.provider || p.type || p.name || 'custom').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      let finalKey = key;
      let suffix = 2;
      while (modelsSection.providers[finalKey]) { finalKey = `${key}-${suffix++}`; }
      modelsSection.providers[finalKey] = { enabled: p.enabled !== false, baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model };
      if (p.isDefault || p.id === cfg.llm?.default_provider_id) modelsSection.default = finalKey;
    }
    if (!modelsSection.default) modelsSection.default = Object.keys(modelsSection.providers)[0];
    cfg.capabilities.models = modelsSection;
    log.info('Migration', `Migrated ${oldLlmProviders.length} LLM providers → capabilities.models`);
    changed = true;
  }

  // Serper API key from integrations.serper_api_key
  const oldSerperKey = cfg.integrations?.serper_api_key;
  if (oldSerperKey && !cfg.capabilities.search?.providers && !cfg.search?.providers) {
    cfg.capabilities.search = {
      enabled: true, default: 'serper',
      providers: { serper: { enabled: true, apiKey: oldSerperKey }, duckduckgo: { enabled: true } },
    };
    log.info('Migration', 'Migrated serper_api_key → capabilities.search');
    changed = true;
  }

  // ── v2 → v3: Move top-level sections into capabilities ──
  if (cfg.models?.providers && !cfg.capabilities.models?.providers) {
    cfg.capabilities.models = { enabled: true, ...cfg.models };
    log.info('Migration', 'Moved models → capabilities.models');
    changed = true;
  }
  if (cfg.search?.providers && !cfg.capabilities.search?.providers) {
    cfg.capabilities.search = { enabled: true, ...cfg.search };
    log.info('Migration', 'Moved search → capabilities.search');
    changed = true;
  }
  if (cfg.cli?.providers && !cfg.capabilities.cli?.providers) {
    cfg.capabilities.cli = { enabled: true, ...cfg.cli };
    log.info('Migration', 'Moved cli → capabilities.cli');
    changed = true;
  }
  if (cfg.filesystem?.allowed_paths && !cfg.capabilities.filesystem) {
    cfg.capabilities.filesystem = { enabled: true, ...cfg.filesystem };
    log.info('Migration', 'Moved filesystem → capabilities.filesystem');
    changed = true;
  }
  if (cfg.mcp?.servers && !cfg.capabilities.mcp) {
    cfg.capabilities.mcp = cfg.mcp;
    log.info('Migration', 'Moved mcp → capabilities.mcp');
    changed = true;
  }

  // ── Ensure defaults ──
  if (!cfg.capabilities.models) cfg.capabilities.models = { enabled: true };
  if (!cfg.capabilities.search) {
    cfg.capabilities.search = { enabled: true, default: 'duckduckgo', providers: { duckduckgo: { enabled: true } } };
  }
  if (!cfg.capabilities.filesystem) cfg.capabilities.filesystem = { enabled: true, allowed_paths: [] };
  if (!cfg.agent) cfg.agent = { max_history_messages: 20 };

  // ── Clean up legacy top-level fields ──
  delete cfg.llm;
  delete cfg.integrations;
  delete cfg.models;
  delete cfg.search;
  delete cfg.cli;
  delete cfg.filesystem;
  delete cfg.mcp;

  // ── Set version ──
  cfg.meta = { version: '3.0' };
  changed = true;

  saveYoubotConfig(cfg);
  log.info('Migration', 'Config migrated to v3.0 (capabilities)');
}

/**
 * Seed default skills from default-data/skills/ into the workspace.
 * Only copies skills that don't already exist in the workspace (preserves user edits).
 * Marks seeded skills as system: true so they can be shown as read-only in the UI.
 */
function seedDefaultSkills(ws: WorkspaceProvider): void {
  const fs = require('fs');
  const path = require('path');

  // Resolve the default-data/skills directory relative to this source file
  // In production: dist/api/index.js → ../../default-data/skills
  // In dev (tsx): src/api/index.ts → ../../default-data/skills
  const candidates = [
    path.resolve(__dirname, '..', '..', 'default-data', 'skills'),
    path.resolve(process.cwd(), 'default-data', 'skills'),
  ];
  
  const defaultSkillsDir = candidates.find((d: string) => fs.existsSync(d));
  if (!defaultSkillsDir) {
    console.log('[Skills] No default-data/skills directory found — skipping seed');
    return;
  }

  let seeded = 0;
  const entries = fs.readdirSync(defaultSkillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillName = entry.name;
    const skillMdPath = path.join(defaultSkillsDir, skillName, 'SKILL.md');
    
    if (!fs.existsSync(skillMdPath)) continue;

    // Check if skill already exists in workspace
    const existingContent = ws.readFile(path.join('skills', skillName, 'SKILL.md'));
    if (existingContent) continue; // Don't overwrite user-modified skills

    // Copy the skill directory into workspace
    const skillDir = path.join(defaultSkillsDir, skillName);
    const files = fs.readdirSync(skillDir);
    for (const file of files) {
      const srcPath = path.join(skillDir, file);
      const stat = fs.statSync(srcPath);
      if (stat.isFile()) {
        const content = fs.readFileSync(srcPath, 'utf8');
        ws.writeFile(path.join('skills', skillName, file), content);
      }
    }
    seeded++;
  }

  if (seeded > 0) {
    console.log(`[Skills] Seeded ${seeded} default skill(s) from ${defaultSkillsDir}`);
  }
}
export function initializeApi(
  db?: DatabaseConnection, 
  agent?: AgentOrchestrator, 
  wsPath?: string, 
  followUpStore?: any,
  workspace?: WorkspaceProvider,
): { skillRepo: SkillRepository | null, skillEngine: SkillEngine | null } {
  migrateConfig();
  workspacePath = wsPath || null;
  if (workspacePath) {
    crewRegistry.initialize(workspacePath);
  }
  if (workspace) workspaceProvider = workspace;
  if (db) {

    // File-based skills via workspace provider (or legacy path fallback)
    if (workspaceProvider) {
      skillRepo = createFileSkillRepository(workspaceProvider, 'skills');
    } else {
      // Legacy: build skills dir from wsPath
      const skillsDir = wsPath
        ? require('path').join(wsPath, 'skills')
        : (process.env.YOUBOT_HOME
          ? require('path').join(process.env.YOUBOT_HOME, 'workspace', 'skills')
          : './skills');
      const { LocalWorkspaceProvider } = require('../data/local-workspace.js');
      const fallbackWs = new LocalWorkspaceProvider(wsPath || './workspace');
      skillRepo = createFileSkillRepository(fallbackWs, 'skills');
    }
    coreDb = db as unknown as DatabaseConnection;
    asyncJobStore = createAsyncJobStore(coreDb);
    asyncJobStore.failAllProcessingJobs('Server restarted while job was processing');
    eventBus = createEventBus();
    approvalStore = createApprovalStore(db as unknown as DatabaseConnection);

    if (agent) {
      const cfg = loadYoubotConfig();
      const configUpdates: Record<string, unknown> = {};

      // Owner identity
      if (cfg.owner?.phone) configUpdates.ownerPhone = cfg.owner.phone;
      if (cfg.owner?.telegram_id) configUpdates.ownerTelegramId = cfg.owner.telegram_id;
      if (cfg.owner?.telegram_username) configUpdates.ownerTelegramUsername = cfg.owner.telegram_username;

      // Auto-reply
      if (cfg.channels?.whatsapp?.auto_reply !== undefined) configUpdates.autoReplyWhatsApp = cfg.channels.whatsapp.auto_reply;
      if (cfg.channels?.telegram?.auto_reply !== undefined) configUpdates.autoReplyTelegram = cfg.channels.telegram.auto_reply;
      if (cfg.channels?.webchat?.auto_reply !== undefined) configUpdates.autoReplyWebchat = cfg.channels.webchat.auto_reply;
      if (cfg.channels?.webchat?.owner_key) configUpdates.ownerWebchatKey = cfg.channels.webchat.owner_key;

      // Agent settings
      if (cfg.agent?.max_history_messages) configUpdates.maxHistoryMessages = cfg.agent.max_history_messages;

      // LLM providers from capabilities.models
      const models = cfg.capabilities?.models;
      if (models?.providers) {
        const defaultKey = models.default || Object.keys(models.providers)[0] || '';
        const llmProviders: LLMProviderConfig[] = Object.entries(models.providers)
          .filter(([_, p]) => p.enabled !== false)
          .map(([key, p]) => {
            let baseUrl = ((p.baseUrl || '') as string).trim();
            // Auto-fix: Gemini's OpenAI-compatible endpoint requires /openai/ suffix
            if (baseUrl.includes('generativelanguage.googleapis.com') && !baseUrl.includes('/openai')) {
              baseUrl = baseUrl.replace(/\/?$/, '') + '/openai/';
            }
            return {
              id: key,
              name: key,
              provider: key as any,
              baseUrl,
              apiKey: ((p.apiKey || '') as string).trim(),
              model: ((p.model || '') as string).trim(),
              isDefault: key === defaultKey,
              models: p.models as any,
            };
          });

        if (llmProviders.length > 0) {
          configUpdates.llmProviders = llmProviders;
          configUpdates.defaultLlmProviderId = defaultKey;
          const dp = models.providers[defaultKey];
          if (dp) {
            let baseUrl = (dp.baseUrl || '').trim();
            // Auto-fix: Gemini's OpenAI-compatible endpoint requires /openai/ suffix
            if (baseUrl.includes('generativelanguage.googleapis.com') && !baseUrl.includes('/openai')) {
              baseUrl = baseUrl.replace(/\/?$/, '') + '/openai/';
              log.info('Config', `Auto-fixed Gemini base URL to use OpenAI-compatible endpoint`);
            }
            configUpdates.llmBaseUrl = baseUrl;
            configUpdates.llmModel = (dp.model || '').trim();
            configUpdates.llmApiKey = (dp.apiKey || '').trim();
          }
          log.info('Config', `Loaded ${llmProviders.length} model providers from config`);
        }
      }

      // Purpose-based model routing
      if ((cfg as any).modelRouting) {
        configUpdates.modelRouting = (cfg as any).modelRouting;
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
        async (message: string, sessionId: string, source?: string, contactName?: string, skillContext?: string, isOwner?: boolean) => {
          const chatSource = (source || 'web') as 'web' | 'whatsapp' | 'telegram';
          const result = await agent.chat(sessionId, message, chatSource, contactName, isOwner, undefined, skillContext);
          return {
            response: result.content,
            toolCalls: result.toolCalls?.map(tc => ({
              tool: tc.toolName,
              args: {},
              result: tc.result || tc.error,
            })) || [],
          };
        },
        agent.getConversationStore(),
      );

      // Seed default skills from default-data/skills/ into workspace
      seedDefaultSkills(workspaceProvider || (() => {
        const { LocalWorkspaceProvider } = require('../data/local-workspace.js');
        return new LocalWorkspaceProvider(wsPath || './workspace');
      })());

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
  if (coreDb) {
    scheduler.setDatabase(coreDb);
  }
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

  // Store follow-up store reference and start checker
  if (followUpStore) {
    followUpStoreInstance = followUpStore;
    if (agent) {
      import('../automation/followups/checker.js').then(({ startFollowUpChecker }) => {
        // sendMessage: route messages to the correct channel based on the channel parameter
        const sendMessage = async (channel: string, contactId: string, message: string): Promise<boolean> => {
          // Telegram
          if (channel === 'telegram' || contactId.startsWith('telegram:')) {
            const chatId = contactId.startsWith('telegram:')
              ? Number(contactId.replace('telegram:', ''))
              : Number(contactId);
            if (tgConnection && !isNaN(chatId)) {
              try {
                await tgConnection.sendMessage(chatId, message);
                console.log(`[FollowUpChecker] ✅ Sent to Telegram ${chatId}`);
                return true;
              } catch (err: any) {
                console.error(`[FollowUpChecker] Failed to send to Telegram ${chatId}:`, err.message);
                return false;
              }
            }
            return false;
          }

          // WhatsApp
          if (waConnection && (channel === 'whatsapp' || waConnection.isConnected)) {
            try {
              const jid = contactId.includes('@')
                ? contactId
                : `${contactId.replace(/\D/g, '')}@s.whatsapp.net`;
              await waConnection.sendMessage(jid, { text: message });
              console.log(`[FollowUpChecker] ✅ Sent to WhatsApp ${jid}`);
              return true;
            } catch (err: any) {
              console.error(`[FollowUpChecker] Failed to send to WhatsApp ${contactId}:`, err.message);
              return false;
            }
          }

          // Web: add to conversation store for UI pickup
          if (agent) {
            try {
              const convStore = agent.getConversationStore();
              convStore.getOrCreateSession(contactId, 'web', contactId);
              convStore.addMessage(contactId, 'assistant', message, { source: 'scheduler' });
              console.log(`[FollowUpChecker] ✅ Added message to web session ${contactId}`);
              return true;
            } catch (err: any) {
              console.error(`[FollowUpChecker] Failed to add message to web session ${contactId}:`, err.message);
              return false;
            }
          }

          console.warn(`[FollowUpChecker] ⚠️ No channel available to send to ${contactId}`);
          return false;
        };

        startFollowUpChecker({
          followUpStore,
          chat: (sessionId: string, message: string, source: string, contactName?: string, isOwner?: boolean) => {
            return agent.chat(sessionId, message, source as any, contactName, isOwner);
          },
          sendMessage,
        });
        console.log('[FollowUps] Follow-up checker started');
      }).catch(err => console.error('[FollowUps] Failed to start checker:', err.message));
    }
  }

  // Log deployment mode
  console.log(`[YOUBOT] Mode: ${MODE.toUpperCase()} | Features: WA=${FEATURES.whatsapp} TG=${FEATURES.telegram} FS=${FEATURES.filesystem} CLI=${FEATURES.cli}`);

  // Gate channel auto-connect based on deployment mode and extension hooks
  const startupHooks = getHooks().startup;
  if (FEATURES.whatsapp && !startupHooks?.shouldSkipChannel?.('whatsapp')) {
    autoConnectWhatsApp();
  } else {
    console.log('[WhatsApp] Skipped — not available in this deployment mode');
  }

  if (FEATURES.telegram && !startupHooks?.shouldSkipChannel?.('telegram')) {
    autoConnectTelegram();
  } else {
    console.log('[Telegram] Skipped — not available in this deployment mode');
  }

  // Ensure webchat connection token exists
  ensureWebchatToken();

  // Auto-connect webchat relay (available in all modes)
  if (!startupHooks?.shouldSkipChannel?.('webchat')) {
    autoConnectWebchat();
  }

  // Extension startup hook
  if (startupHooks?.onInitialize && agent) {
    startupHooks.onInitialize({ db, agent, workspacePath }).catch((err: any) => {
      console.error('[Hooks] Startup hook failed:', err.message);
    });
  }

  return { skillRepo, skillEngine };
}

async function registerAgentTools(agent: AgentOrchestrator): Promise<void> {
  const { registerAllToolModules } = await import('../tools/registry.js');
  const registry = agent.getToolRegistry();

  const toolContext = {
    getDatabase: () => coreDb,
    getMessagingRegistry: () => messagingRegistry,
    getScheduler: () => scheduler,
    getApprovalStore: () => approvalStore,
    getSkillEngine: () => skillEngine,
    getWhatsApp: () => waConnection,
    getTelegram: () => tgConnection,
    getAgent: () => agent,
    getEventBus: () => eventBus,
    getWorkspacePath: () => workspacePath,
    getWorkspaceProvider: () => workspaceProvider,
    getCliService: () => null, // CLI service is lazily loaded in the tool module
    getFollowUpStore: () => followUpStoreInstance,
  };

  await registerAllToolModules(registry, toolContext);

  // Load custom tool modules from custom/modules/
  const { registerCustomModules } = await import('../tools/registry.js');
  await registerCustomModules(registry, toolContext);


  // Initialize MCP server manager and connect saved servers
  mcpManager = getMcpServerManager();
  mcpManager.init(
    { get: (key: string) => {
      const c = loadYoubotConfig();
      if (key === 'mcp_servers') return JSON.stringify(c.capabilities?.mcp?.servers || {});
      return (c as any)[key] ?? null;
    }, set: saveConfigValue },
    registry,
  );
  mcpManager.connectAll().catch(err => console.error('[MCP] connectAll failed:', err));

  // Start Chrome CDP health monitor if Playwright is configured
  const hasPlaywright = mcpManager.getServers().some(s => s.name === 'playwright');
  if (hasPlaywright) {
    import('../capabilities/mcp/health-monitor.js').then(({ startHealthMonitor }) => {
      startHealthMonitor(60_000); // check every 60 seconds
    }).catch(() => {}); // silently ignore if module not available
  }
}

// ─── Build API Context ───────────────────────────────────

function getApiContext(): ApiContext {
  return {
    agentOrchestrator,
    coreDb,
    asyncJobStore,
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
    skillRepo: skillRepo as any,
    eventBus,
    scheduler,
    approvalStore,
    safetyConfig,
    safetyRules,
    mcpManager,
    workspacePath,
    workspaceProvider,
    saveConfigValue,
    loadConfigValue: (key: string) => {
      const c = loadYoubotConfig();
      if (key === 'mcp_servers') return JSON.stringify(c.capabilities?.mcp?.servers || {});
      if (key === 'telegram_bot_token') return c.channels?.telegram?.token || null;
      return (c as any)[key] ?? null;
    },
    relayMessage: relayApprovalResponse,
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
    const cfg = loadYoubotConfig();
    const caps = cfg.capabilities || {};
    const serperKey = caps.search?.providers?.serper?.apiKey as string || '';
    json(res, {
      serper_api_key: serperKey ? '••••' + serperKey.slice(-4) : '',
      serper_configured: !!serperKey,
      cli: caps.cli || { enabled: false, default: 'gemini' },
      filesystem: caps.filesystem || { enabled: true, allowed_paths: [] },
    });
    return true;
  }

  if (url === '/api/config/integrations' && method === 'PUT') {
    const body = await parseBody(req) as any;
    const cfg = loadYoubotConfig();
    if (!cfg.capabilities) cfg.capabilities = {};

    if (body.serper_api_key !== undefined && !body.serper_api_key.includes('••••')) {
      if (!cfg.capabilities.search) cfg.capabilities.search = { enabled: true, providers: {} };
      if (!cfg.capabilities.search.providers) cfg.capabilities.search.providers = {};
      if (!cfg.capabilities.search.providers.serper) cfg.capabilities.search.providers.serper = { enabled: true };
      cfg.capabilities.search.providers.serper.apiKey = body.serper_api_key;
      process.env.SERPER_API_KEY = body.serper_api_key;
    }
    if (body.cli !== undefined) {
      cfg.capabilities.cli = { ...cfg.capabilities.cli, ...body.cli };
    }
    if (body.filesystem !== undefined) {
      cfg.capabilities.filesystem = { ...cfg.capabilities.filesystem, ...body.filesystem };
    }

    saveYoubotConfig(cfg);
    json(res, { saved: true });
    return true;
  }

  // ── Defaults GET ────────────────────────────────────────

  // ── Defaults PUT ────────────────────────────────────────

  // ── Apple Capabilities Config ───────────────────────────
  if (url === '/api/config/capabilities/apple' && method === 'GET') {
    const cfg = loadYoubotConfig();
    const apple = (cfg.capabilities as any)?.apple || { enabled: true, services: { calendar: { enabled: true }, contacts: { enabled: true }, notes: { enabled: true }, mail: { enabled: true } } };
    json(res, apple);
    return true;
  }

  if (url === '/api/config/capabilities/apple' && method === 'PUT') {
    const body = await parseBody(req) as any;
    const cfg = loadYoubotConfig();
    if (!cfg.capabilities) cfg.capabilities = {};
    (cfg.capabilities as any).apple = body;
    saveYoubotConfig(cfg);
    json(res, { saved: true });
    return true;
  }

  // ── Defaults Options (available choices per purpose) ────
  if (url === '/api/config/defaults/options' && method === 'GET') {
    const cfg = loadYoubotConfig();
    const caps = cfg.capabilities || {};

    // Build available options for each purpose from capabilities
    const options: Record<string, Array<{ value: string; label: string }>> = {};

    // Chat / LLM models
    if (caps.models?.providers) {
      options.chat = Object.entries(caps.models.providers)
        .filter(([, p]: [string, any]) => p.enabled !== false)
        .map(([key]) => ({ value: `models.${key}`, label: key.charAt(0).toUpperCase() + key.slice(1) }));
    }

    // Web search
    if (caps.search?.providers) {
      options.search = Object.entries(caps.search.providers)
        .filter(([, p]: [string, any]) => p.enabled !== false)
        .map(([key]) => ({ value: `search.${key}`, label: key.charAt(0).toUpperCase() + key.slice(1) }));
    }

    // CLI agents
    if (caps.cli?.providers) {
      options.cli = Object.entries(caps.cli.providers)
        .filter(([, p]: [string, any]) => p.enabled !== false)
        .map(([key]) => ({ value: `cli.${key}`, label: key.charAt(0).toUpperCase() + key.slice(1) + ' CLI' }));
    }

    // Google services — each service becomes a choice for its purpose
    if (caps.google?.services) {
      const svc = caps.google.services as Record<string, any>;
      if (svc.gmail?.enabled !== false) {
        options.email = [...(options.email || []), { value: 'google.gmail', label: 'Gmail' }];
      }
      if (svc.calendar?.enabled !== false) {
        options.calendar = [...(options.calendar || []), { value: 'google.calendar', label: 'Google Calendar' }];
      }
      if (svc.drive?.enabled !== false) {
        options.storage = [...(options.storage || []), { value: 'google.drive', label: 'Google Drive' }];
      }
      if (svc.docs?.enabled !== false) {
        options.documents = [...(options.documents || []), { value: 'google.docs', label: 'Google Docs' }];
      }
      if (svc.sheets?.enabled !== false) {
        options.spreadsheets = [...(options.spreadsheets || []), { value: 'google.sheets', label: 'Google Sheets' }];
      }
      if (svc.contacts?.enabled !== false) {
        options.contacts = [...(options.contacts || []), { value: 'google.contacts', label: 'Google Contacts' }];
      }
      if (svc.places?.enabled !== false) {
        options.maps = [...(options.maps || []), { value: 'google.places', label: 'Google Places' }];
      }
    }

    // Apple services (macOS-only)
    if ((caps as any).apple?.enabled !== false) {
      const appleSvc = (caps as any).apple?.services || {};
      if (appleSvc.calendar?.enabled !== false) {
        options.calendar = [...(options.calendar || []), { value: 'apple.calendar', label: 'Apple Calendar' }];
      }
      if (appleSvc.contacts?.enabled !== false) {
        options.contacts = [...(options.contacts || []), { value: 'apple.contacts', label: 'Apple Contacts' }];
      }
      if (appleSvc.notes?.enabled !== false) {
        if (!options.notes) options.notes = [];
        options.notes = [...options.notes, { value: 'apple.notes', label: 'Apple Notes' }];
      }
      if (appleSvc.mail?.enabled !== false) {
        options.email = [...(options.email || []), { value: 'apple.mail', label: 'Apple Mail' }];
      }
    }



    // Browser options
    options.browser = [
      { value: 'mcp.playwright', label: 'MCP Playwright' },
    ];

    // Add MCP Tavily as a search option
    options.search = [...(options.search || []), { value: 'mcp.tavily', label: 'MCP Tavily' }];

    json(res, { options });
    return true;
  }

  // ── WhatsApp Config ───────────────────────────────────


  // ── Metering ──────────────────────────────────────────
  if (url.startsWith('/api/metering/usage') && method === 'GET') {
    const { getMetering } = await import('../engine/metering.js');
    const metering = getMetering();
    if (!metering) {
      json(res, { error: 'Metering not initialized' }, 500);
      return true;
    }
    const params = new URL(url, 'http://localhost').searchParams;
    const period = (params.get('period') || '30d') as 'today' | '7d' | '30d' | 'all';
    const summary = metering.getSummary(period);
    json(res, summary);
    return true;
  }

  // ── Tool Metrics ──────────────────────────────────────
  if (url.startsWith('/api/metrics/tools') && method === 'GET') {
    const params = new URL(url, 'http://localhost').searchParams;
    const hours = parseInt(params.get('hours') || '24', 10);
    
    const current = metricsCollector.getToolMetrics();
    const historical = await metricsCollector.getHistoricalMetrics(hours);
    
    json(res, {
      current,
      historical,
      hours
    });
    return true;
  }

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

  // ── Webchat Status ─────────────────────────────────────
  if (url === '/api/webchat/status' && method === 'GET') {
    const status = webchatConnection?.status || 'disconnected';
    const relayUrl = webchatConnection?.relayUrl || '';
    json(res, { status, relayUrl, error: webchatError || '' });
    return true;
  }

  if (url === '/api/whatsapp/status' && method === 'GET') {
    const user = waConnection?.getUser?.() ?? null;
    const cfg = loadYoubotConfig();
    const autoReply = cfg.channels?.whatsapp?.auto_reply ?? false;
    json(res, { status: waStatus, qr: waQrCode, error: waError, user, autoReply });
    return true;
  }

  if (url === '/api/whatsapp/auto-reply' && method === 'PUT') {
    const body = await parseBody(req) as any;
    const enabled = !!body?.enabled;
    const cfg = loadYoubotConfig();
    if (!cfg.channels) cfg.channels = {};
    if (!cfg.channels.whatsapp) cfg.channels.whatsapp = {};
    cfg.channels.whatsapp.auto_reply = enabled;
    saveYoubotConfig(cfg);
    if (agentOrchestrator) {
      agentOrchestrator.updateConfig({ autoReplyWhatsApp: enabled });
    }
    json(res, { autoReply: enabled, saved: true });
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

      // Mark as enabled in config
      const cfg = loadYoubotConfig();
      if (!cfg.channels) cfg.channels = {};
      if (!cfg.channels.whatsapp) cfg.channels.whatsapp = {};
      cfg.channels.whatsapp.enabled = true;
      saveYoubotConfig(cfg);

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
        // For manual disconnect, we also clear the session so it doesn't auto-reconnect
        await waConnection.clearSession();
      } catch {}
      waConnection = null;
    }
    waStatus = 'disconnected';
    waQrCode = null;
    waError = null;

    // Mark as disabled in config
    const cfg = loadYoubotConfig();
    if (!cfg.channels) cfg.channels = {};
    if (!cfg.channels.whatsapp) cfg.channels.whatsapp = {};
    cfg.channels.whatsapp.enabled = false;
    saveYoubotConfig(cfg);

    json(res, { status: 'disconnected' });
    return true;
  }

  // ── Telegram ──────────────────────────────────────────
  if (url === '/api/telegram/status' && method === 'GET') {
    const cfg = loadYoubotConfig();
    json(res, {
      status: tgStatus,
      error: tgError,
      botUsername: tgConnection?.botUsername ?? null,
      botName: tgConnection?.botName ?? null,
      autoReply: cfg.channels?.telegram?.auto_reply ?? false,
    });
    return true;
  }

  if (url === '/api/telegram/auto-reply' && method === 'POST') {
    const body = await parseBody(req) as any;
    const cfg = loadYoubotConfig();
    if (!cfg.channels) cfg.channels = {} as any;
    if (!cfg.channels!.telegram) cfg.channels!.telegram = {} as any;
    cfg.channels!.telegram!.auto_reply = !!body?.enabled;
    saveYoubotConfig(cfg);
    json(res, { autoReply: cfg.channels!.telegram!.auto_reply });
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

  // ── App Theme ─────────────────────────────────────────
  // Returns the active custom app's theme metadata for branding injection.
  // Returns { theme: null } for vanilla YOUBOT (uses built-in skin).
  if (url === '/api/app/theme' && method === 'GET') {
    const { getActiveTheme } = await import('../lib/app-loader.js');
    const theme = getActiveTheme();
    // Add cssUrl if the theme has a CSS file
    const response: any = { theme };
    if (theme?.cssPath) {
      response.theme = { ...theme, cssUrl: '/api/app/theme.css' };
    }
    json(res, response);
    return true;
  }

  // ── App Theme CSS ────────────────────────────────────
  // Serves the active theme's CSS file for <link> injection.
  if (url === '/api/app/theme.css' && method === 'GET') {
    const { getActiveTheme } = await import('../lib/app-loader.js');
    const theme = getActiveTheme();
    if (theme?.cssPath) {
      try {
        const { readFileSync } = await import('fs');
        const css = readFileSync(theme.cssPath, 'utf-8');
        res.writeHead(200, {
          'Content-Type': 'text/css',
          'Cache-Control': 'public, max-age=3600',
        });
        res.end(css);
        return true;
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Theme CSS not found');
        return true;
      }
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('No theme CSS configured');
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

  if (url === '/api/config/model-routing' && method === 'GET') {
    const cfg = loadYoubotConfig();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cfg.modelRouting || {}));
    return true;
  }

  if (url === '/api/config/model-routing' && method === 'PUT') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        import('../data/config.js').then(({ loadYoubotConfig, saveYoubotConfig }) => {
          const cfg = loadYoubotConfig();
          cfg.modelRouting = payload.routing || {};
          saveYoubotConfig(cfg);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        });
      } catch (e: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return true;
  }

  // ── Health check (unauthenticated) ─────────────────────
  if (url === '/api/health' && method === 'GET') {
    const { getHealthStatus } = await import('../capabilities/mcp/health-monitor.js');
    const { getAllToolDefinitions } = await import('../tools/registry.js');
    
    const cdpHealth = getHealthStatus();
    const toolDefs = await getAllToolDefinitions().catch(() => []);
    const mem = process.memoryUsage();
    
    const health = {
      status: 'ok',
      server: {
        uptime: Math.floor(process.uptime()),
        version: '1.0.0',
        pid: process.pid,
      },
      cdp: cdpHealth,
      mcp: {
        connected: mcpManager ? mcpManager.getServers().filter(s => s.status === 'connected').length : 0,
        total: mcpManager ? mcpManager.getServers().length : 0,
      },
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
      },
      channels: {
        whatsapp: waStatus,
        telegram: tgStatus,
      },
      tools: {
        registered: toolDefs.length,
      }
    };

    const isHealthy = !!agentOrchestrator;
    json(res, health, isHealthy ? 200 : 503);
    return true;
  }

  // ── Webchat routes (public, pre-auth — uses its own token validation) ──
  if (url.startsWith('/api/webchat/')) {
    // Permissive CORS for webchat (embedded on third-party sites)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Webchat-Token');
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Webchat-Token',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
      return true;
    }
    const ctx = getApiContext();
    if (await handleWebchatRoutes(req, res, url, method, ctx)) return true;
  }

  // ── Authentication ─────────────────────────────────────
  if (requiresAuth(method, url)) {
    // Try extension auth hook first (e.g., SSO in cloud deployments)
    const authHook = getHooks().auth;
    if (authHook) {
      const hookResult = await authHook.authenticate(req);
      if (hookResult !== null) {
        // Hook handled auth
        if (!hookResult.authenticated) {
          sendUnauthorized(res, hookResult.error || 'Unauthorized');
          return true;
        }
        clientName = hookResult.clientName;
      } else {
        // Hook returned null — fall through to default auth
        const authResult = authenticate(req);
        if (!authResult.authenticated) {
          sendUnauthorized(res, authResult.error || 'Unauthorized');
          return true;
        }
        clientName = authResult.clientName;
      }
    } else {
      // No hook — use default API key auth
      const authResult = authenticate(req);
      if (!authResult.authenticated) {
        sendUnauthorized(res, authResult.error || 'Unauthorized');
        return true;
      }
      clientName = authResult.clientName;
    }
  }

  // ── Rate limiting ──────────────────────────────────────
  // Skip rate limiting for dashboard requests (same-origin UI polling).
  // Rate limiting is for external API consumers, not the built-in dashboard.
  // The dashboard can be accessed via localhost or LAN IP, so we check
  // known dashboard ports rather than requiring "localhost" in the origin.
  const origin = String(req.headers['origin'] || req.headers['referer'] || '');
  const serverPort = process.env.PORT || '11490';
  const dashboardPorts = [serverPort, '4080', '4081', '11490', '3000', '5080', '5081'];
  const isDashboard = dashboardPorts.some(port => origin.includes(`:${port}`)) || req.headers.host?.includes(':5080') || req.headers.host?.includes(':5081');
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
async function handleExperimentRoutes(req: http.IncomingMessage, res: http.ServerResponse, url: string, method: string): Promise<boolean> {
  const experiments = getPromptExperiments();
  if (!experiments) return false;

  if (url === '/api/experiments' && method === 'GET') {
    json(res, experiments.getAllExperiments());
    return true;
  }

  if (url === '/api/experiments' && method === 'POST') {
    const body = await parseBody(req) as any;
    experiments.createExperiment(body);
    json(res, { success: true });
    return true;
  }

  const resultsMatch = url.match(/^\/api\/experiments\/([^\/]+)\/results$/);
  if (resultsMatch && method === 'GET') {
    const id = resultsMatch[1];
    json(res, experiments.getResults(id));
    return true;
  }

  const deactivateMatch = url.match(/^\/api\/experiments\/([^\/]+)\/deactivate$/);
  if (deactivateMatch && method === 'POST') {
    const id = deactivateMatch[1];
    experiments.deactivateExperiment(id);
    json(res, { success: true });
    return true;
  }

  return false;
}
  if (await handleVaultRoutes(req, res, url, method, ctx)) return true;
  if (await handleModulesRoutes(req, res, url, method, ctx)) return true;
  if (await handleExperimentRoutes(req, res, url, method)) return true;
  if (await handleAgentsRoutes(req, res, url, method, ctx)) return true;
  if (await handleTasksRoutes(req, res, url, method, ctx)) return true;

  return false;
}

// ─── Graceful Shutdown ─────────────────────────────────────

let _isShuttingDown = false;

export async function gracefulShutdown(): Promise<void> {
  if (_isShuttingDown) return;
  _isShuttingDown = true;

  console.log('[Shutdown] Starting graceful shutdown...');

  // 1. Disconnect WhatsApp gracefully
  if (waConnection) {
    console.log('[Shutdown] Disconnecting WhatsApp...');
    try {
      await waConnection.disconnect();
      console.log('[Shutdown] WhatsApp disconnected gracefully.');
    } catch (err: any) {
      console.error('[Shutdown] WhatsApp disconnect error:', err.message);
    }
    waConnection = null;
  }

  // 2. Disconnect Telegram gracefully
  if (tgConnection) {
    console.log('[Shutdown] Disconnecting Telegram...');
    try {
      await tgConnection.disconnect();
      console.log('[Shutdown] Telegram disconnected gracefully.');
    } catch (err: any) {
      console.error('[Shutdown] Telegram disconnect error:', err.message);
    }
    tgConnection = null;
  }

  // 3. Disconnect Webchat gracefully
  if (webchatConnection) {
    console.log('[Shutdown] Disconnecting Webchat...');
    try {
      await webchatConnection.disconnect();
      console.log('[Shutdown] Webchat disconnected gracefully.');
    } catch (err: any) {
      console.error('[Shutdown] Webchat disconnect error:', err.message);
    }
    webchatConnection = null;
  }

  // 4. Stop MCP servers
  if (mcpManager) {
    console.log('[Shutdown] Stopping MCP servers...');
    try {
      const statuses = mcpManager.getServers();
      for (const status of statuses) {
        try {
          await mcpManager.disconnectServer(status.id);
        } catch { /* ignore individual failures */ }
      }
      console.log('[Shutdown] MCP servers stopped.');
    } catch (err: any) {
      console.error('[Shutdown] MCP disconnect error:', err.message);
    }
  }

  console.log('[Shutdown] Graceful shutdown complete.');
}
