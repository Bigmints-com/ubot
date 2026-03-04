/**
 * Messaging Tool Module
 *
 * Tools for sending, searching, and managing messages
 * across all connected messaging platforms (WhatsApp, Telegram, etc.)
 */

import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from '../tools/types.js';

const MESSAGING_TOOLS: ToolDefinition[] = [
  {
    name: 'send_message',
    description: 'Send a message to a contact or group on any connected messaging platform',
    parameters: [
      { name: 'to', type: 'string', description: 'Phone number with country code (e.g. +971501234567) or contact/group ID', required: true },
      { name: 'body', type: 'string', description: 'The message text to send', required: true },
      { name: 'channel', type: 'string', description: 'Messaging channel (whatsapp, telegram, imessage). Defaults to the connected one.', required: false },
    ],
  },
  {
    name: 'search_messages',
    description: 'Search through message history across all connected platforms',
    parameters: [
      { name: 'from', type: 'string', description: 'Filter by sender phone number or ID', required: false },
      { name: 'to', type: 'string', description: 'Filter by recipient phone number or ID', required: false },
      { name: 'query', type: 'string', description: 'Text to search for in message body', required: false },
      { name: 'limit', type: 'number', description: 'Max results to return (default 20)', required: false },
      { name: 'channel', type: 'string', description: 'Filter by messaging channel', required: false },
    ],
  },
  {
    name: 'get_contacts',
    description: 'List contacts from connected messaging platforms. Can search by name or number.',
    parameters: [
      { name: 'query', type: 'string', description: 'Search by name, phone number, or ID', required: false },
      { name: 'channel', type: 'string', description: 'Filter by messaging channel', required: false },
    ],
  },
  {
    name: 'get_conversations',
    description: 'List recent conversations across all connected platforms',
    parameters: [
      { name: 'limit', type: 'number', description: 'Max conversations to return (default 20)', required: false },
      { name: 'channel', type: 'string', description: 'Filter by messaging channel', required: false },
    ],
  },
  {
    name: 'delete_message',
    description: 'Delete a specific message by its ID',
    parameters: [
      { name: 'messageId', type: 'string', description: 'The ID of the message to delete', required: true },
      { name: 'channel', type: 'string', description: 'Messaging channel the message is on', required: false },
    ],
  },
  {
    name: 'reply_to_message',
    description: 'Reply to a specific message by its ID (quotes the original message)',
    parameters: [
      { name: 'messageId', type: 'string', description: 'The ID of the message to reply to', required: true },
      { name: 'body', type: 'string', description: 'The reply text', required: true },
      { name: 'channel', type: 'string', description: 'Messaging channel', required: false },
    ],
  },
  {
    name: 'get_connection_status',
    description: 'Get the connection status of messaging platforms',
    parameters: [
      { name: 'channel', type: 'string', description: 'Specific channel to check, or omit for all', required: false },
    ],
  },
  {
    name: 'forward_message',
    description: 'Forward a message to another contact. Finds the message in history and sends its content to the specified recipient.',
    parameters: [
      { name: 'to', type: 'string', description: 'Recipient phone number with country code or contact ID', required: true },
      { name: 'text', type: 'string', description: 'The text to forward. Use search_messages first to find the exact content.', required: true },
      { name: 'channel', type: 'string', description: 'Messaging channel (whatsapp, telegram). Defaults to connected one.', required: false },
    ],
  },
  {
    name: 'react_to_message',
    description: 'React to a message with an emoji. Supported on WhatsApp (emoji), Telegram (emoji), iMessage (tapback).',
    parameters: [
      { name: 'messageId', type: 'string', description: 'The ID of the message to react to', required: true },
      { name: 'emoji', type: 'string', description: 'Emoji reaction (e.g. "👍", "❤️", "😂")', required: true },
      { name: 'channel', type: 'string', description: 'Messaging channel', required: false },
    ],
  },
  {
    name: 'edit_message',
    description: 'Edit a previously sent message. Supported on WhatsApp and Telegram.',
    parameters: [
      { name: 'messageId', type: 'string', description: 'The ID of the message to edit', required: true },
      { name: 'body', type: 'string', description: 'New message text', required: true },
      { name: 'channel', type: 'string', description: 'Messaging channel', required: false },
    ],
  },
  {
    name: 'pin_message',
    description: 'Pin a message in a conversation. Supported on Telegram.',
    parameters: [
      { name: 'messageId', type: 'string', description: 'The ID of the message to pin', required: true },
      { name: 'channel', type: 'string', description: 'Messaging channel', required: false },
    ],
  },
  {
    name: 'create_poll',
    description: 'Create a poll in a conversation. Supported on WhatsApp and Telegram.',
    parameters: [
      { name: 'to', type: 'string', description: 'Chat/group ID to send the poll to', required: true },
      { name: 'question', type: 'string', description: 'Poll question', required: true },
      { name: 'options', type: 'string', description: 'Comma-separated poll options', required: true },
      { name: 'channel', type: 'string', description: 'Messaging channel', required: false },
    ],
  },
];

const messagingToolModule: ToolModule = {
  name: 'messaging',
  tools: MESSAGING_TOOLS,
  register(registry: ToolRegistry, ctx: ToolContext) {
    const mr = ctx.getMessagingRegistry();

    registry.register('send_message', async (args) => {
      const to = String(args.to || '');
      const body = String(args.body || args.message || '');
      if (!to || !body) return { toolName: 'send_message', success: false, error: 'Missing "to" or "body" parameter', duration: 0 };
      try {
        const provider = mr.resolveProvider(args.channel as string | undefined);
        await provider.sendMessage(to, body);
        return { toolName: 'send_message', success: true, result: `Message sent to ${to} via ${provider.channel}: "${body}"`, duration: 0 };
      } catch (err: any) {
        return { toolName: 'send_message', success: false, error: err.message, duration: 0 };
      }
    });

    registry.register('search_messages', async (args) => {
      try {
        const provider = mr.resolveProvider(args.channel as string | undefined);
        const messages = await provider.searchMessages({
          from: args.from as string | undefined,
          to: args.to as string | undefined,
          query: args.query as string | undefined,
          limit: args.limit ? Number(args.limit) : 20,
        });
        if (messages.length === 0) return { toolName: 'search_messages', success: true, result: 'No messages found matching the filter.', duration: 0 };
        const formatted = messages.map((m: any) => `[${m.timestamp.toISOString()}] ${m.isFromMe ? 'Me' : m.from} → ${m.to}: ${m.body}`).join('\n');
        return { toolName: 'search_messages', success: true, result: `Found ${messages.length} messages:\n${formatted}`, duration: 0 };
      } catch (err: any) {
        return { toolName: 'search_messages', success: false, error: err.message, duration: 0 };
      }
    });

    registry.register('get_contacts', async (args) => {
      try {
        const provider = mr.resolveProvider(args.channel as string | undefined);
        const contacts = await provider.getContacts(args.query as string | undefined);
        if (contacts.length === 0) return { toolName: 'get_contacts', success: true, result: 'No contacts found.', duration: 0 };
        const formatted = contacts.map((c: any) => `${c.displayName || c.name || c.phone || c.id}${c.isGroup ? ' (group)' : ''}`).join('\n');
        return { toolName: 'get_contacts', success: true, result: `Found ${contacts.length} contacts:\n${formatted}`, duration: 0 };
      } catch (err: any) {
        return { toolName: 'get_contacts', success: false, error: err.message, duration: 0 };
      }
    });

    registry.register('get_conversations', async (args) => {
      try {
        const provider = mr.resolveProvider(args.channel as string | undefined);
        const convos = await provider.getConversations(args.limit ? Number(args.limit) : 20);
        if (convos.length === 0) return { toolName: 'get_conversations', success: true, result: 'No conversations found.', duration: 0 };
        const formatted = convos.map((c: any) => `${c.contact.displayName || c.contact.name || c.contact.phone || c.id}: ${c.lastMessage?.body?.slice(0, 50) || '(no messages)'}`).join('\n');
        return { toolName: 'get_conversations', success: true, result: `${convos.length} conversations:\n${formatted}`, duration: 0 };
      } catch (err: any) {
        return { toolName: 'get_conversations', success: false, error: err.message, duration: 0 };
      }
    });

    registry.register('delete_message', async (args) => {
      const messageId = String(args.messageId || '');
      if (!messageId) return { toolName: 'delete_message', success: false, error: 'Missing messageId', duration: 0 };
      try {
        const provider = mr.resolveProvider(args.channel as string | undefined);
        await provider.deleteMessage(messageId);
        return { toolName: 'delete_message', success: true, result: `Message ${messageId} deleted.`, duration: 0 };
      } catch (err: any) {
        return { toolName: 'delete_message', success: false, error: err.message, duration: 0 };
      }
    });

    registry.register('reply_to_message', async (args) => {
      const messageId = String(args.messageId || '');
      const body = String(args.body || '');
      if (!messageId || !body) return { toolName: 'reply_to_message', success: false, error: 'Missing messageId or body', duration: 0 };
      try {
        const provider = mr.resolveProvider(args.channel as string | undefined);
        await provider.replyToMessage(messageId, body);
        return { toolName: 'reply_to_message', success: true, result: `Replied to message ${messageId}: "${body}"`, duration: 0 };
      } catch (err: any) {
        return { toolName: 'reply_to_message', success: false, error: err.message, duration: 0 };
      }
    });

    registry.register('get_connection_status', async (args) => {
      if (args.channel) {
        try {
          const provider = mr.getProvider(args.channel as any);
          return { toolName: 'get_connection_status', success: true, result: JSON.stringify({ channel: provider.channel, status: provider.status }), duration: 0 };
        } catch (err: any) {
          return { toolName: 'get_connection_status', success: false, error: err.message, duration: 0 };
        }
      }
      const providers = mr.getAllProviders();
      const statuses = providers.map((p: any) => ({ channel: p.channel, status: p.status }));
      return { toolName: 'get_connection_status', success: true, result: statuses.length > 0 ? JSON.stringify(statuses) : 'No messaging providers registered.', duration: 0 };
    });

    registry.register('forward_message', async (args) => {
      const to = String(args.to || '');
      const text = String(args.text || '');
      const channel = String(args.channel || '');
      if (!to || !text) return { toolName: 'forward_message', success: false, error: 'Missing required parameters (to, text)', duration: 0 };
      try {
        const provider = mr.resolveProvider(channel || undefined);
        await provider.sendMessage(to, `↩️ Forwarded:\n\n${text}`);
        return { toolName: 'forward_message', success: true, result: `Message forwarded to ${to}.`, duration: 0 };
      } catch (err: any) {
        return { toolName: 'forward_message', success: false, error: `Failed to forward message: ${err.message}`, duration: 0 };
      }
    });

    registry.register('react_to_message', async (args) => {
      const messageId = String(args.messageId || '');
      const emoji = String(args.emoji || '');
      if (!messageId || !emoji) return { toolName: 'react_to_message', success: false, error: 'Missing messageId or emoji', duration: 0 };
      try {
        const provider = mr.resolveProvider(args.channel as string | undefined);
        if (typeof provider.reactToMessage !== 'function') {
          return { toolName: 'react_to_message', success: false, error: `Reactions not supported on ${provider.channel}`, duration: 0 };
        }
        await provider.reactToMessage(messageId, emoji);
        return { toolName: 'react_to_message', success: true, result: `Reacted ${emoji} to message ${messageId}`, duration: 0 };
      } catch (err: any) {
        return { toolName: 'react_to_message', success: false, error: err.message, duration: 0 };
      }
    });

    registry.register('edit_message', async (args) => {
      const messageId = String(args.messageId || '');
      const body = String(args.body || '');
      if (!messageId || !body) return { toolName: 'edit_message', success: false, error: 'Missing messageId or body', duration: 0 };
      try {
        const provider = mr.resolveProvider(args.channel as string | undefined);
        if (typeof provider.editMessage !== 'function') {
          return { toolName: 'edit_message', success: false, error: `Edit not supported on ${provider.channel}`, duration: 0 };
        }
        await provider.editMessage(messageId, body);
        return { toolName: 'edit_message', success: true, result: `Message ${messageId} edited`, duration: 0 };
      } catch (err: any) {
        return { toolName: 'edit_message', success: false, error: err.message, duration: 0 };
      }
    });

    registry.register('pin_message', async (args) => {
      const messageId = String(args.messageId || '');
      if (!messageId) return { toolName: 'pin_message', success: false, error: 'Missing messageId', duration: 0 };
      try {
        const provider = mr.resolveProvider(args.channel as string | undefined);
        if (typeof provider.pinMessage !== 'function') {
          return { toolName: 'pin_message', success: false, error: `Pin not supported on ${provider.channel}`, duration: 0 };
        }
        await provider.pinMessage(messageId);
        return { toolName: 'pin_message', success: true, result: `Message ${messageId} pinned`, duration: 0 };
      } catch (err: any) {
        return { toolName: 'pin_message', success: false, error: err.message, duration: 0 };
      }
    });

    registry.register('create_poll', async (args) => {
      const to = String(args.to || '');
      const question = String(args.question || '');
      const optionsStr = String(args.options || '');
      if (!to || !question || !optionsStr) return { toolName: 'create_poll', success: false, error: 'Missing to, question, or options', duration: 0 };
      const options = optionsStr.split(',').map(o => o.trim()).filter(Boolean);
      if (options.length < 2) return { toolName: 'create_poll', success: false, error: 'At least 2 options required', duration: 0 };
      try {
        const provider = mr.resolveProvider(args.channel as string | undefined);
        if (typeof provider.createPoll !== 'function') {
          return { toolName: 'create_poll', success: false, error: `Polls not supported on ${provider.channel}`, duration: 0 };
        }
        await provider.createPoll(to, question, options);
        return { toolName: 'create_poll', success: true, result: `Poll created: "${question}" with ${options.length} options`, duration: 0 };
      } catch (err: any) {
        return { toolName: 'create_poll', success: false, error: err.message, duration: 0 };
      }
    });
  },
};

export default messagingToolModule;
