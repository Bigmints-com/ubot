/**
 * Unified Message Handler
 * 
 * All channels (WhatsApp, Telegram, web) normalize their messages
 * into a UnifiedMessage and call handleIncomingMessage().
 * 
 * This is the SINGLE source of truth for:
 *   - Owner detection
 *   - Session routing
 *   - Approval handling
 *   - Skill event emission
 *   - Auto-reply policy
 *   - Response dispatch
 */

import type { AgentOrchestrator } from './orchestrator.js';
import type { Attachment } from './types.js';
import type { ApprovalStore } from '../memory/pending-approvals.js';
import type { EventBus } from '../capabilities/skills/event-bus.js';
import type { SkillEngine } from '../capabilities/skills/skill-engine.js';
import type { Skill, SkillEvent } from '../capabilities/skills/skill-types.js';
import { OWNER_SOUL_ID } from '../memory/soul.js';

// ─── Types ────────────────────────────────────────────────

export type Channel = 'whatsapp' | 'telegram' | 'imessage' | 'web';

export interface UnifiedMessage {
  /** Which transport delivered this message */
  channel: Channel;
  /** Channel-specific sender identifier (WhatsApp JID, Telegram chatId, 'web-console') */
  senderId: string;
  /** Human-readable sender name */
  senderName: string;
  /** Telegram username (without @), if available */
  senderUsername?: string;
  /** Message text */
  body: string;
  /** When the message was sent */
  timestamp: Date;
  /** Channel-specific reply function — sends text back through the original channel */
  replyFn: (text: string) => Promise<void>;
  /** Extra data for skill events (e.g., hasMedia, participant) */
  extra?: Record<string, unknown>;
  /** File attachments (images, documents) */
  attachments?: Attachment[];
}

export interface UnifiedDeps {
  orchestrator: AgentOrchestrator;
  approvalStore: ApprovalStore | null;
  eventBus: EventBus | null;
  skillEngine: SkillEngine | null;
  saveConfigValue: (key: string, value: string) => void;
  /** Send a message to a specific session/channel (for approval relays) */
  relayMessage?: (sessionId: string, message: string) => Promise<boolean>;
}

export interface UnifiedResult {
  /** Whether sender was detected as the owner */
  isOwner: boolean;
  /** The session ID used */
  sessionId: string;
  /** The agent's response text (empty if handled by approval or skill) */
  response: string;
  /** Whether the message was handled (approval, skill, or agent reply) */
  handled: boolean;
}

// ─── Owner Detection (Single Source of Truth) ─────────────

function detectOwner(
  msg: UnifiedMessage,
  deps: UnifiedDeps,
): { isOwner: boolean; ownerName: string } {
  const config = deps.orchestrator.getConfig();

  // Web source = always owner (Command Center)
  if (msg.channel === 'web') {
    return { isOwner: true, ownerName: '' };
  }

  // Read owner name from soul document
  const soul = deps.orchestrator.getSoul();
  const ownerDoc = soul.getDocument(OWNER_SOUL_ID);
  const nameMatch = ownerDoc?.match(/name:\s*(.+)/i);
  const ownerName = nameMatch ? nameMatch[1].trim() : '';

  // WhatsApp: match by phone number
  if (msg.channel === 'whatsapp') {
    const ownerPhone = (config.ownerPhone || '').replace(/\D/g, '');
    const senderNumber = msg.senderId.replace(/\D/g, '').replace(/@.*/, '');
    if (ownerPhone && senderNumber.includes(ownerPhone)) {
      return { isOwner: true, ownerName };
    }
  }

  // Telegram: match by chat ID, then username, then name
  if (msg.channel === 'telegram') {
    const ownerTelId = config.ownerTelegramId || '';
    const ownerTelUsername = (config.ownerTelegramUsername || '').replace(/^@/, '').toLowerCase();
    const senderUsername = (msg.senderUsername || '').toLowerCase();

    if (ownerTelId && msg.senderId === ownerTelId) {
      return { isOwner: true, ownerName };
    }
    if (ownerTelUsername && senderUsername && senderUsername === ownerTelUsername) {
      return { isOwner: true, ownerName };
    }
  }

  // Fallback: name match (any channel)
  if (ownerName && msg.senderName &&
      msg.senderName.toLowerCase().includes(ownerName.toLowerCase())) {
    return { isOwner: true, ownerName };
  }

  return { isOwner: false, ownerName };
}

// ─── Auto-Save Owner IDs ─────────────────────────────────

function autoSaveOwnerIds(msg: UnifiedMessage, deps: UnifiedDeps): void {
  const config = deps.orchestrator.getConfig();

  if (msg.channel === 'telegram') {
    if (!config.ownerTelegramId) {
      deps.orchestrator.updateConfig({ ownerTelegramId: msg.senderId });
      deps.saveConfigValue('ownerTelegramId', msg.senderId);
      console.log(`[Unified] 🔑 Auto-saved owner Telegram ID: ${msg.senderId}`);
    }
    if (!config.ownerTelegramUsername && msg.senderUsername) {
      deps.orchestrator.updateConfig({ ownerTelegramUsername: msg.senderUsername });
      deps.saveConfigValue('ownerTelegramUsername', msg.senderUsername);
      console.log(`[Unified] 🔑 Auto-saved owner Telegram username: @${msg.senderUsername}`);
    }
  }

  if (msg.channel === 'whatsapp') {
    const ownerPhone = (config.ownerPhone || '').replace(/\D/g, '');
    if (!ownerPhone) {
      const phone = msg.senderId.replace(/\D/g, '').replace(/@.*/, '');
      deps.orchestrator.updateConfig({ ownerPhone: phone });
      deps.saveConfigValue('ownerPhone', phone);
      console.log(`[Unified] 🔑 Auto-saved owner phone: ${phone}`);
    }
  }
}

// ─── Session Routing ─────────────────────────────────────

function resolveSessionId(msg: UnifiedMessage, isOwner: boolean): string {
  // Owner always routes to web-console (Command Center)
  if (isOwner) return 'web-console';

  // Visitors get channel-specific sessions
  switch (msg.channel) {
    case 'telegram': return `telegram:${msg.senderId}`;
    case 'imessage': return `imessage:${msg.senderId}`;
    case 'whatsapp': return msg.senderId; // WhatsApp JID is already the session
    case 'web': return 'web-console';
    default: return msg.senderId;
  }
}

// ─── Emit Skill Event ────────────────────────────────────

function emitSkillEvent(msg: UnifiedMessage, isOwner: boolean, deps: UnifiedDeps): void {
  if (!deps.eventBus) return;

  const event: SkillEvent = {
    source: msg.channel,
    type: 'message',
    from: msg.senderId,
    to: 'bot',
    body: msg.body,
    timestamp: msg.timestamp,
    data: {
      senderName: msg.senderName,
      senderUsername: msg.senderUsername,
      isOwner,
      ...msg.extra,
    },
  };
  deps.eventBus.emit(event);
}

// ─── Main Handler ────────────────────────────────────────

export async function handleIncomingMessage(
  msg: UnifiedMessage,
  deps: UnifiedDeps,
): Promise<UnifiedResult> {
  // 1. Detect owner
  const { isOwner } = detectOwner(msg, deps);

  // 2. Auto-save owner IDs for future detection
  if (isOwner) {
    autoSaveOwnerIds(msg, deps);
  }

  // 3. Log
  if (isOwner) {
    console.log(`[Unified] 👤 Owner via ${msg.channel} (id: ${msg.senderId}, name: ${msg.senderName})`);
  } else {
    console.log(`[Unified] 👥 Visitor via ${msg.channel} (id: ${msg.senderId}, name: ${msg.senderName})`);
  }

  // 4. Resolve session ID
  const sessionId = resolveSessionId(msg, isOwner);

  // 5. Master auto-reply switch (visitors only)
  //    If auto-reply is OFF → nothing fires. No skills, no orchestrator.
  //    If auto-reply is ON  → skills decide who gets a reply (contacts, groups, etc.)
  if (!isOwner) {
    const config = deps.orchestrator.getConfig();
    const autoReplyEnabled = msg.channel === 'whatsapp'
      ? config.autoReplyWhatsApp
      : msg.channel === 'telegram'
        ? (config.autoReplyTelegram ?? false)
        : false;

    if (!autoReplyEnabled) {
      return { isOwner, sessionId, response: '', handled: false };
    }

    // Auto-reply is ON → emit skill event.
    // Skills handle the fine-grained filtering:
    //   - filter_contacts: only reply to specific phone numbers
    //   - filter_dms_only: true = skip group messages
    //   - filter_groups_only: true = only reply in groups
    //   - filter_pattern: regex match on message body (e.g. @mentions)
    //   - condition: LLM-checked intent (e.g. "when someone asks about pricing")
    //
    // Skills with outcome 'reply' send the response back to the sender.
    // No hardcoded contact/group filtering needed here — skills do it all.
    if (deps.eventBus) {
      emitSkillEvent(msg, isOwner, deps);
    }

    // Don't fall through to the orchestrator — skills are the reply mechanism.
    // (If no skill matches, nobody replies — that's correct behavior.)
    return { isOwner, sessionId, response: '', handled: false };
  }

  // 6. Owner: check pending approvals
  if (isOwner && deps.approvalStore) {
    const pending = deps.approvalStore.getPending();
    if (pending.length > 0) {
      const approval = pending[0];
      deps.approvalStore.resolve(approval.id, msg.body);
      console.log(`[Unified] ✅ Owner responded to approval ${approval.id}`);

      // Feed approval response back to the requester's session
      if (approval.requesterJid) {
        const reqSessionId = approval.requesterJid;
        const reqSource = resolveChannelFromSessionId(reqSessionId);
        const systemMessage = `[SYSTEM] The owner responded to your approval request (ID: ${approval.id}): "${msg.body}"\n\nPlease relay this information to the visitor appropriately.`;

        deps.orchestrator.chat(reqSessionId, systemMessage, reqSource).then(async result => {
          if (result.content && deps.relayMessage) {
            const sent = await deps.relayMessage(reqSessionId, result.content);
            console.log(`[Unified] ↩ Approval follow-up ${sent ? 'sent' : 'FAILED'} to ${reqSessionId}`);
          } else if (result.content) {
            console.warn(`[Unified] ⚠️ No relayMessage function — approval response to ${reqSessionId} was NOT delivered`);
          }
        }).catch(err => console.error('[Unified] Approval follow-up failed:', err.message));
      }

      return { isOwner, sessionId, response: '', handled: true };
    }
  }

  // 7. Route owner messages to the orchestrator
  try {
    const response = await deps.orchestrator.chat(
      sessionId,
      msg.body,
      'web',
      msg.senderName || undefined,
      undefined,
      msg.attachments,
    );

    if (response.content) {
      await msg.replyFn(response.content);
    }

    return { isOwner, sessionId, response: response.content, handled: true };
  } catch (err: any) {
    console.error(`[Unified] Chat error (${msg.channel}):`, err.message);
    return { isOwner, sessionId, response: '', handled: false };
  }
}

// ─── Helpers ─────────────────────────────────────────

function resolveChannelFromSessionId(sessionId: string): Channel {
  if (sessionId.startsWith('telegram:')) return 'telegram';
  if (sessionId.startsWith('imessage:')) return 'imessage';
  if (sessionId === 'web-console') return 'web';
  return 'whatsapp';
}
