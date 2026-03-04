/**
 * Approvals Tool Module
 *
 * Tools for the owner approval system — ask_owner, respond, list pending.
 */

import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from '../../tools/types.js';

const APPROVAL_TOOLS: ToolDefinition[] = [
  {
    name: 'ask_owner',
    description: 'Ask the owner for approval or guidance. Use when a third party requests specific private information, wants to make financial or scheduling commitments, or asks for anything sensitive. You MUST actually call this tool — do not just say you will check with the owner.',
    parameters: [
      { name: 'question', type: 'string', description: 'The specific sensitive question requiring owner input', required: true },
      { name: 'context', type: 'string', description: 'Who is asking and why this cannot be answered from persona', required: true },
      { name: 'requester_jid', type: 'string', description: 'The JID or phone number of the person waiting for a response', required: true },
    ],
  },
  {
    name: 'respond_to_approval',
    description: 'Respond to a pending approval request. The response will be relayed back to the original requester.',
    parameters: [
      { name: 'approval_id', type: 'string', description: 'The approval ID. If not provided, responds to the most recent pending approval.', required: false },
      { name: 'response', type: 'string', description: "The owner's response message to relay to the requester", required: true },
    ],
  },
  {
    name: 'list_pending_approvals',
    description: "List all pending approval requests that are waiting for the owner's response.",
    parameters: [],
  },
];

const approvalsToolModule: ToolModule = {
  name: 'approvals',
  tools: APPROVAL_TOOLS,
  register(registry: ToolRegistry, ctx: ToolContext) {
    registry.register('ask_owner', async (args) => {
      const store = ctx.getApprovalStore();
      if (!store) return { toolName: 'ask_owner', success: false, error: 'Approval system not initialized', duration: 0 };

      const question = String(args.question || '');
      const context = String(args.context || '');
      let requesterJid = String(args.requester_jid || '');
      if (!question) return { toolName: 'ask_owner', success: false, error: 'Missing "question" parameter', duration: 0 };

      // Normalize: if the LLM provides a raw Telegram ID (no prefix), check if
      // we have a telegram: session for it so the relay goes to the right channel.
      const agent = ctx.getAgent();
      if (requesterJid && agent && !requesterJid.includes('@') && !requesterJid.startsWith('telegram:')) {
        const convStore = agent.getConversationStore();
        const telegramSession = convStore.getSession(`telegram:${requesterJid}`);
        if (telegramSession) {
          requesterJid = `telegram:${requesterJid}`;
        }
      }

      const approval = store.create({ question, context, requesterJid, sessionId: requesterJid });
      console.log(`[Approvals] Created approval ${approval.id}: "${question.slice(0, 80)}" (requester: ${requesterJid})`);

      // Inject into Command Center
      if (agent) {
        const convStore = agent.getConversationStore();
        convStore.getOrCreateSession('web-console', 'web', 'Command Center');
        const notification = `🔔 **Approval Request** (ID: ${approval.id})\n\n**From:** ${context || 'Unknown'}\n**Question:** ${question}\n\n👉 Go to the Approvals page to respond, or reply here with your answer.`;
        convStore.addMessage('web-console', 'assistant', notification, { source: 'web' });

        // Notify owner via WhatsApp
        const config = agent.getConfig();
        const ownerPhone = config.ownerPhone?.replace(/\D/g, '') || '';
        const wa = ctx.getWhatsApp();
        if (ownerPhone && wa?.isConnected) {
          try {
            const ownerJid = `${ownerPhone}@s.whatsapp.net`;
            await wa.sendMessage(ownerJid, { text: `🔔 *Approval Request*\n\n${context}\n\n*Question:* ${question}\n\nReply to this message with your response.` });
          } catch (err: any) {
            console.error('[Approvals] Failed to notify owner via WhatsApp:', err.message);
          }
        }

        // Notify owner via Telegram
        const tg = ctx.getTelegram();
        if (tg && config.ownerTelegramId) {
          try {
            const chatId = Number(config.ownerTelegramId);
            if (!isNaN(chatId)) {
              await tg.sendMessage(chatId, `🔔 *Approval Request*\n\n${context}\n\n*Question:* ${question}\n\nReply to this message with your response.`);
            }
          } catch (err: any) {
            console.error('[Approvals] Failed to notify owner via Telegram:', err.message);
          }
        }

        const ownerName = config.ownerName || 'owner';
        return { toolName: 'ask_owner', success: true, result: `Approval request created (ID: ${approval.id}). The owner "${ownerName}" has been notified. Tell the requester you'll check with ${ownerName} and get back to them.`, duration: 0 };
      }

      return { toolName: 'ask_owner', success: true, result: `Approval request created (ID: ${approval.id}).`, duration: 0 };
    });

    registry.register('respond_to_approval', async (args) => {
      const store = ctx.getApprovalStore();
      if (!store) return { toolName: 'respond_to_approval', success: false, error: 'Approval system not initialized', duration: 0 };

      const response = String(args.response || '');
      if (!response) return { toolName: 'respond_to_approval', success: false, error: 'Missing "response" parameter', duration: 0 };

      let approvalId = String(args.approval_id || '');
      if (!approvalId) {
        const pending = store.getPending();
        if (pending.length === 0) return { toolName: 'respond_to_approval', success: true, result: 'No pending approvals to respond to.', duration: 0 };
        approvalId = pending[0].id;
      }

      const approval = store.getById(approvalId);
      if (!approval) return { toolName: 'respond_to_approval', success: false, error: `Approval not found: ${approvalId}`, duration: 0 };
      if (approval.status === 'resolved') return { toolName: 'respond_to_approval', success: true, result: `Approval ${approvalId} was already resolved.`, duration: 0 };

      store.resolve(approvalId, response);
      console.log(`[Approvals] Owner responded to approval ${approvalId}: "${response.slice(0, 80)}"`);

      // Relay response to the requester
      const agent = ctx.getAgent();
      if (approval.requesterJid && agent) {
        const source = approval.requesterJid.startsWith('telegram:') ? 'telegram' : 'whatsapp';
        const sessionId = approval.requesterJid;
        const systemMessage = `[SYSTEM] The owner has responded to the pending approval request (ID: ${approvalId}). The owner's answer is: "${response}"\n\nCompose a natural, friendly reply to the visitor incorporating the owner's answer. Do NOT use send_message or any other tool — just write the reply text. It will be delivered automatically.`;

        agent.chat(sessionId, systemMessage, source as any).then((result: any) => {
          const reply = result.content || response; // fallback to raw owner response
          const tg = ctx.getTelegram();
          const wa = ctx.getWhatsApp();
          if (source === 'telegram' && tg) {
            const chatId = Number(sessionId.replace('telegram:', ''));
            tg.sendMessage(chatId, reply);
          } else if (source === 'whatsapp' && wa?.isConnected) {
            const jid = sessionId.includes('@') ? sessionId : `${sessionId.replace(/\D/g, '')}@s.whatsapp.net`;
            wa.sendMessage(jid, { text: reply });
          }
          console.log(`[Approvals] Relayed to ${sessionId}: ${reply.slice(0, 100)}...`);
        }).catch((err: any) => {
          console.error(`[Approvals] Failed to relay response to ${sessionId}:`, err.message);
        });
      }

      return { toolName: 'respond_to_approval', success: true, result: `Approval ${approvalId} resolved. Your response "${response}" is being relayed to the requester.`, duration: 0 };
    });

    registry.register('list_pending_approvals', async () => {
      const store = ctx.getApprovalStore();
      if (!store) return { toolName: 'list_pending_approvals', success: false, error: 'Approval system not initialized', duration: 0 };
      const pending = store.getPending();
      if (pending.length === 0) return { toolName: 'list_pending_approvals', success: true, result: 'No pending approvals.', duration: 0 };
      const summary = pending.map((a: any) => {
        const ago = Math.round((Date.now() - new Date(a.createdAt).getTime()) / 60000);
        return `• [${a.id}] "${a.question}" — from: ${a.context || a.requesterJid} (${ago}m ago)`;
      }).join('\n');
      return { toolName: 'list_pending_approvals', success: true, result: `${pending.length} pending approval(s):\n${summary}`, duration: 0 };
    });
  },
};

export default approvalsToolModule;
