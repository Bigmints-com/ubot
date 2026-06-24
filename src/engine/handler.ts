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

import type { AgentOrchestrator } from "./orchestrator.js";
import type { Attachment } from "./types.js";
import type { ApprovalStore } from "../automation/approvals/service.js";
import type { FollowUpStore } from "../memory/followups.js";
import type { EventBus } from "../agents/skills/event-bus.js";
import type { SkillEngine } from "../agents/skills/skill-engine.js";
import type { Skill, SkillEvent } from "../agents/skills/skill-types.js";
import { OWNER_SOUL_ID } from "../memory/soul.js";

// ─── Processing Tracker ───────────────────────────────────

/** Tracks which sessions are currently being processed by the LLM */
const activeSessions = new Set<string>();

/** Get all currently processing session IDs */
export function getProcessingSessions(): string[] {
  return Array.from(activeSessions);
}

/** Check if a specific session is being processed */
export function isSessionProcessing(sessionId: string): boolean {
  return activeSessions.has(sessionId);
}

// ─── Types ────────────────────────────────────────────────

export type Channel = "whatsapp" | "telegram" | "web" | "webchat";

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
  /** Optional function to broadcast typing state while processing */
  typingFn?: () => Promise<void>;
}

export interface UnifiedDeps {
  orchestrator: AgentOrchestrator;
  approvalStore: ApprovalStore | null;
  followUpStore: FollowUpStore | null;
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

async function detectOwner(
  msg: UnifiedMessage,
  deps: UnifiedDeps,
): Promise<{ isOwner: boolean; ownerName: string }> {
  const config = deps.orchestrator.getConfig();

  // Web source = always owner (Command Center)
  if (msg.channel === "web") {
    return { isOwner: true, ownerName: "" };
  }

  // Webchat: check owner key, otherwise treat as visitor
  if (msg.channel === "webchat") {
    const ownerKey = (msg.extra?.ownerKey as string) || "";
    if (ownerKey) {
      // Owner key is stored in the raw config file, read it at startup
      // and pass via the extra field. For simplicity, compare against
      // ownerWebchatKey stored in agent config.
      const configuredKey = (config as any).ownerWebchatKey || "";
      if (configuredKey && ownerKey === configuredKey) {
        const soul = deps.orchestrator.getSoul();
        const ownerDoc = await soul.getDocument(OWNER_SOUL_ID);
        const nameMatch = ownerDoc?.match(/name:\s*(.+)/i);
        return {
          isOwner: true,
          ownerName: nameMatch ? nameMatch[1].trim() : "",
        };
      }
    }
    return { isOwner: false, ownerName: "" };
  }

  // Read owner name from soul document
  const soul = deps.orchestrator.getSoul();
  const ownerDoc = await soul.getDocument(OWNER_SOUL_ID);
  const nameMatch = ownerDoc?.match(/name:\s*(.+)/i);
  const ownerName = nameMatch ? nameMatch[1].trim() : "";

  // WhatsApp: match by phone number
  if (msg.channel === "whatsapp") {
    const ownerPhone = (config.ownerPhone || "").replace(/\D/g, "");
    const senderNumber = msg.senderId.replace(/\D/g, "").replace(/@.*/, "");
    if (ownerPhone && senderNumber.includes(ownerPhone)) {
      return { isOwner: true, ownerName };
    }
  }

  // Telegram: match by chat ID, then username, then name
  if (msg.channel === "telegram") {
    const ownerTelId = config.ownerTelegramId || "";
    const ownerTelUsername = (config.ownerTelegramUsername || "")
      .replace(/^@/, "")
      .toLowerCase();
    const senderUsername = (msg.senderUsername || "").toLowerCase();

    if (ownerTelId && msg.senderId === ownerTelId) {
      return { isOwner: true, ownerName };
    }
    if (
      ownerTelUsername &&
      senderUsername &&
      senderUsername === ownerTelUsername
    ) {
      return { isOwner: true, ownerName };
    }
  }

  // Fallback: name match (any channel)
  if (
    ownerName &&
    msg.senderName &&
    msg.senderName.toLowerCase().includes(ownerName.toLowerCase())
  ) {
    return { isOwner: true, ownerName };
  }

  return { isOwner: false, ownerName };
}

// ─── Auto-Save Owner IDs ─────────────────────────────────

function autoSaveOwnerIds(msg: UnifiedMessage, deps: UnifiedDeps): void {
  const config = deps.orchestrator.getConfig();

  if (msg.channel === "telegram") {
    if (!config.ownerTelegramId) {
      deps.orchestrator.updateConfig({ ownerTelegramId: msg.senderId });
      deps.saveConfigValue("ownerTelegramId", msg.senderId);
      console.log(`[Unified] 🔑 Auto-saved owner Telegram ID: ${msg.senderId}`);
    }
    if (!config.ownerTelegramUsername && msg.senderUsername) {
      deps.orchestrator.updateConfig({
        ownerTelegramUsername: msg.senderUsername,
      });
      deps.saveConfigValue("ownerTelegramUsername", msg.senderUsername);
      console.log(
        `[Unified] 🔑 Auto-saved owner Telegram username: @${msg.senderUsername}`,
      );
    }
  }

  if (msg.channel === "whatsapp") {
    const ownerPhone = (config.ownerPhone || "").replace(/\D/g, "");
    if (!ownerPhone) {
      const phone = msg.senderId.replace(/\D/g, "").replace(/@.*/, "");
      deps.orchestrator.updateConfig({ ownerPhone: phone });
      deps.saveConfigValue("ownerPhone", phone);
      console.log(`[Unified] 🔑 Auto-saved owner phone: ${phone}`);
    }
  }
}

// ─── Session Routing ─────────────────────────────────────

function resolveSessionId(msg: UnifiedMessage, isOwner: boolean): string {
  // Owner always routes to web-console (Command Center)
  if (isOwner) return "web-console";

  // Visitors get channel-specific sessions
  switch (msg.channel) {
    case "telegram":
      return `telegram:${msg.senderId}`;
    case "webchat":
      return `webchat:${msg.senderId}`;
    case "whatsapp":
      return msg.senderId; // WhatsApp JID is already the session
    case "web":
      return "web-console";
    default:
      return msg.senderId;
  }
}

// ─── Emit Skill Event ────────────────────────────────────

function emitSkillEvent(
  msg: UnifiedMessage,
  isOwner: boolean,
  deps: UnifiedDeps,
): void {
  if (!deps.eventBus) return;

  const event: SkillEvent = {
    source: msg.channel,
    type: "message",
    from: msg.senderId,
    to: "bot",
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
  const { isOwner } = await detectOwner(msg, deps);

  // 2. Auto-save owner IDs for future detection
  if (isOwner) {
    autoSaveOwnerIds(msg, deps);
  }

  // 3. Log
  if (isOwner) {
    console.log(
      `[Unified] 👤 Owner via ${msg.channel} (id: ${msg.senderId}, name: ${msg.senderName})`,
    );
  } else {
    console.log(
      `[Unified] 👥 Visitor via ${msg.channel} (id: ${msg.senderId}, name: ${msg.senderName})`,
    );
  }

  // 4. Resolve session ID
  const sessionId = resolveSessionId(msg, isOwner);

  // 5. Master auto-reply switch (visitors only)
  //    If auto-reply is OFF → nothing fires. No orchestrator, no skills.
  //    If auto-reply is ON  → LLM handles everything (with skill context injected).
  //
  //    Architecture: LLM-FIRST (see .agents/specs/message-flow.md)
  //    The orchestrator receives ALL valid visitor messages. Skills are injected as
  //    context/instructions — the LLM decides how to act. No silent message drops.
  if (!isOwner) {
    const config = deps.orchestrator.getConfig();
    const autoReplyEnabled =
      msg.channel === "whatsapp"
        ? config.autoReplyWhatsApp !== false
        : msg.channel === "telegram"
          ? config.autoReplyTelegram !== false
          : msg.channel === "webchat"
            ? config.autoReplyWebchat !== false
            : false;

    if (!autoReplyEnabled) {
      return { isOwner, sessionId, response: "", handled: false };
    }

    // Build skill context: gather instructions from enabled skills whose
    // fast filters match this event (no LLM cost — just filter checks).
    let skillContext = "";
    if (deps.skillEngine) {
      const event: SkillEvent = {
        source: msg.channel,
        type: "message",
        from: msg.senderId,
        to: "bot",
        body: msg.body,
        timestamp: msg.timestamp,
        data: {
          senderName: msg.senderName,
          senderUsername: msg.senderUsername,
          isOwner: false,
          ...msg.extra,
        },
      };
      const matchedSkills = deps.skillEngine.getMatchingSkills(event);
      if (matchedSkills.length > 0) {
        const skillInstructions = matchedSkills
          .map(
            (s) =>
              `### Skill: ${s.name}\n${s.processor.instructions || s.trigger.condition || "(no specific instructions)"}`,
          )
          .join("\n\n");
        skillContext = [
          `[SKILL CONTEXT] The following skill instructions are relevant to this conversation.`,
          `Follow them when the visitor's message matches their intent:\n`,
          skillInstructions,
          ``,
          `RULES:`,
          `- USE tools first if the request needs information you don't have`,
          `- After using tools, compose the final reply with the actual information found`,
          `- NEVER say "I'll check" or "let me get back to you" — DO the action RIGHT NOW`,
          `- If you need owner approval, call ask_owner IMMEDIATELY`,
          `- COMPLETE every action in this turn. There is no "later"`,
          `- Write the reply message directly — not a description of what you'll do`,
          `- Do NOT use send_message. Follow visitor security policy.`,
        ].join("\n");
        console.log(
          `[Unified] 📋 Injecting ${matchedSkills.length} skill(s) as context: ${matchedSkills.map((s) => s.name).join(", ")}`,
        );
      }
    }

    // Route to orchestrator — the LLM handles everything:
    // conversational replies, tool calls, skill instructions, asking for details.
    activeSessions.add(sessionId);
    try {
      const response = await deps.orchestrator.chat(
        sessionId,
        msg.body,
        msg.channel,
        msg.senderName || undefined,
        false, // isOwner = false
        msg.attachments,
        skillContext || undefined,
      );

      if (response.content) {
        // Promise Tracker: scan for vague promises and auto-schedule follow-ups
        await promiseTracker(
          response.content,
          response.toolCalls,
          sessionId,
          deps.followUpStore,
          async () => {
            const convStore = deps.orchestrator.getConversationStore();
            const history = await convStore.getHistory(sessionId, 10);
            return history.map((m) => ({
              role: m.role,
              content: m.content || "",
            }));
          },
          msg.channel,
          msg.senderId,
        );
      }

      return { isOwner, sessionId, response: response.content, handled: true };
    } catch (err: any) {
      console.error(
        `[Unified] Visitor chat error (${msg.channel}):`,
        err.message,
      );
      return { isOwner, sessionId, response: "", handled: false };
    } finally {
      activeSessions.delete(sessionId);
    }
  }

  // 6. Owner: check pending approvals — only consume if the message explicitly
  //    references an approval (e.g. "approve: yes" or the approval ID).
  //    Otherwise, let it flow to the orchestrator where the LLM can decide
  //    to use the respond_to_approval tool if appropriate.
  if (isOwner && deps.approvalStore) {
    const pending = await deps.approvalStore.getPending();
    if (pending.length > 0) {
      const trimmed = msg.body.trim().toLowerCase();
      // Only auto-consume if the message starts with "approve:" or contains an approval ID
      const isExplicitApproval =
        trimmed.startsWith("approve:") ||
        trimmed.startsWith("approve ") ||
        pending.some((a: any) => msg.body.includes(a.id));

      if (isExplicitApproval) {
        const approval = pending[0];
        // Strip "approve:" prefix if present
        const response =
          msg.body.replace(/^approve:\s*/i, "").trim() || msg.body;
        await deps.approvalStore.resolve(approval.id, response);
        console.log(`[Unified] ✅ Owner responded to approval ${approval.id}`);

        // Feed approval response back to the requester's session using generate() (no tools)
        if (approval.requesterJid) {
          const reqSessionId = approval.requesterJid;
          const systemPrompt = `You are composing a reply to a visitor who asked a question that required the owner's approval. Compose a natural, friendly response incorporating the owner's answer. Keep it brief and conversational. Do NOT mention "approval" or "system" or internal processes.`;
          const userPrompt = `The visitor's original question was: "${approval.question}"\nThe owner's response is: "${response}"\n\nWrite a natural reply to send to the visitor.`;

          deps.orchestrator
            .generate(systemPrompt, userPrompt)
            .then(async (reply: string) => {
              const finalReply = reply.trim() || response;
              if (deps.relayMessage) {
                const sent = await deps.relayMessage(reqSessionId, finalReply);
                console.log(
                  `[Unified] ↩ Approval follow-up ${sent ? "sent" : "FAILED"} to ${reqSessionId}`,
                );
              } else {
                console.warn(
                  `[Unified] ⚠️ No relayMessage function — approval response to ${reqSessionId} was NOT delivered`,
                );
              }
            })
            .catch((err) =>
              console.error(
                "[Unified] Approval follow-up failed:",
                err.message,
              ),
            );
        }

        return { isOwner, sessionId, response: "", handled: true };
      }
    }
  }

  // 7. Route owner messages to the orchestrator
  activeSessions.add(sessionId);
  try {
    // Inject pending approval context so the LLM can connect the owner's reply
    let messageToSend = msg.body;
    if (isOwner && deps.approvalStore) {
      const pending = await deps.approvalStore.getPending();
      if (pending.length > 0) {
        const approvalContext = pending
          .slice(0, 3)
          .map((a: any) => {
            const ago = Math.round(
              (Date.now() - new Date(a.createdAt).getTime()) / 60000,
            );
            return `  • [${a.id}] "${a.question}" (from: ${a.context || a.requesterJid}, ${ago}m ago)`;
          })
          .join("\n");
        messageToSend = `${msg.body}\n\n[SYSTEM: There are ${pending.length} pending approval(s) awaiting your response:\n${approvalContext}\nIf the owner's message above is a response to one of these, use the respond_to_approval tool to relay it.]`;
      }
    }

    // Start typing indicator loop
    let typingInterval: NodeJS.Timeout | null = null;
    if (msg.typingFn) {
      msg.typingFn().catch(() => {});
      typingInterval = setInterval(() => {
        if (msg.typingFn) msg.typingFn().catch(() => {});
      }, 4000);
    }

    let response;
    try {
      response = await deps.orchestrator.chat(
        sessionId,
        messageToSend,
        "web",
        msg.senderName || undefined,
        isOwner,
        msg.attachments,
      );
    } finally {
      if (typingInterval) clearInterval(typingInterval);
    }

    if (response.content) {
      // Promise Tracker: scan for vague promises and auto-schedule follow-ups
      await promiseTracker(
        response.content,
        response.toolCalls,
        sessionId,
        deps.followUpStore,
        async () => {
          const convStore = deps.orchestrator.getConversationStore();
          const history = await convStore.getHistory(sessionId, 10);
          return history.map((m) => ({
            role: m.role,
            content: m.content || "",
          }));
        },
        msg.channel,
        msg.senderId,
      );
    }

    return { isOwner, sessionId, response: response.content, handled: true };
  } catch (err: any) {
    console.error(`[Unified] Chat error (${msg.channel}):`, err.message);
    // Send error response so the message is cleared from pending queues (prevents infinite retry loops)
    try {
      await msg.replyFn(
        "Sorry, I encountered an error processing your message. Please try again.",
      );
    } catch {
      /* ignore reply errors */
    }
    return { isOwner, sessionId, response: "", handled: false };
  } finally {
    activeSessions.delete(sessionId);
  }
}

// ─── Promise Tracker Middleware ────────────────────────

/** Vague promise phrases that indicate the LLM made an empty promise */
const VAGUE_PROMISE_PATTERNS = [
  /i'll get back to [iy]/i,
  /let me check/i,
  /i'll follow up/i,
  /i'll let you know/i,
  /i'll update you/i,
  /i'll check and/i,
  /let me get back/i,
  /i'll circle back/i,
  /i'll get back to you on that/i,
  /i'll look into it and/i,
  /i'll check on that/i,
  /i'll see and/i,
  /i'll get back/,
];

/** Check if a response contains vague promise phrases */
function hasVaguePromise(text: string): boolean {
  if (!text) return false;
  return VAGUE_PROMISE_PATTERNS.some((pattern) => pattern.test(text));
}

/** Check if schedule_followup was called in the tool execution results */
function wasFollowupScheduled(toolCalls: Array<{ toolName: string }>): boolean {
  return toolCalls.some((tc) => tc.toolName === "schedule_followup");
}

/** Check if any messaging tool was called (send_message, send_email, etc.) */
function hasMessagingToolCall(toolCalls: Array<{ toolName: string }>): boolean {
  const messagingTools = [
    "send_message",
    "send",
    "send_email",
    "gmail_send",
    "mcp_playwright_browser_navigate",
    "mcp_playwright_browser_click",
  ];
  return toolCalls.some((tc) =>
    messagingTools.some((mt) => tc.toolName.includes(mt)),
  );
}

/**
 * Promise Tracker Middleware — scans LLM responses for vague promises
 * and auto-schedules a follow-up if none was already scheduled.
 * This is a safety net — the system prompt should prevent vague promises,
 * but this catches any that slip through.
 */
async function promiseTracker(
  response: string,
  toolCalls: Array<{ toolName: string }>,
  sessionId: string,
  followUpStore: FollowUpStore | null,
  getConversationHistory: () => Promise<
    Array<{ role: string; content: string }>
  >,
  channel: Channel = "web",
  senderId: string = sessionId,
): Promise<void> {
  if (!followUpStore) return;

  // Skip if no vague promise detected
  if (!hasVaguePromise(response)) return;

  // Skip if the agent already scheduled a follow-up
  if (wasFollowupScheduled(toolCalls)) return;

  // Skip if the agent called a messaging tool (it's handling the response)
  if (hasMessagingToolCall(toolCalls)) return;

  // Get recent conversation context for the follow-up
  let conversationContext = "";
  try {
    const history = await getConversationHistory();
    const recent = history.slice(-10);
    conversationContext = recent
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");
  } catch {
    conversationContext = "Conversation context unavailable";
  }

  // Auto-schedule a follow-up
  const followUpAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour
  try {
    await followUpStore.create({
      sessionId,
      contactId: senderId,
      channel,
      reason: "Follow up on previous conversation — agent made a vague promise",
      context: conversationContext,
      priority: "normal",
      followUpAt,
      maxAttempts: 2,
    });
    console.log(
      `[PromiseTracker] ⚠️ Detected vague promise in response, auto-scheduled follow-up for ${senderId} via ${channel}`,
    );
  } catch (err: any) {
    console.error(
      `[PromiseTracker] Failed to auto-schedule follow-up:`,
      err.message,
    );
  }
}

// ─── Helpers ─────────────────────────────────────────

function resolveChannelFromSessionId(sessionId: string): Channel {
  if (sessionId.startsWith("telegram:")) return "telegram";
  if (sessionId.startsWith("webchat:")) return "webchat";
  if (sessionId === "web-console") return "web";
  return "whatsapp";
}
