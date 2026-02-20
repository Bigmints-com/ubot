/**
 * Scheduler Tool Module
 *
 * Tools for scheduling messages, creating reminders,
 * listing/deleting/triggering scheduled tasks.
 */

import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from '../tools/types.js';
import * as chrono from 'chrono-node';

const SCHEDULER_TOOLS: ToolDefinition[] = [
  {
    name: 'schedule_message',
    description: 'Schedule a message to be sent at a specific time',
    parameters: [
      { name: 'to', type: 'string', description: 'Phone number with country code', required: true },
      { name: 'body', type: 'string', description: 'The message text to send', required: true },
      { name: 'time', type: 'string', description: 'When to send, e.g. "in 30 minutes", "tomorrow at 9am", or ISO date string', required: true },
      { name: 'channel', type: 'string', description: 'Messaging channel', required: false },
    ],
  },
  {
    name: 'set_auto_reply',
    description: 'Set up automatic replies for specific contacts.',
    parameters: [
      { name: 'contacts', type: 'string', description: 'Comma-separated phone numbers to monitor, or "all" for all contacts', required: true },
      { name: 'instructions', type: 'string', description: 'Instructions for how to reply', required: true },
      { name: 'enabled', type: 'boolean', description: 'true to enable, false to disable', required: true },
    ],
  },
  {
    name: 'create_reminder',
    description: 'Create a reminder for the owner. Will be sent via their connected messaging channel.',
    parameters: [
      { name: 'message', type: 'string', description: 'What to remind about', required: true },
      { name: 'time', type: 'string', description: 'When to remind. Supports natural language: "in 30 minutes", "at 3:00pm", "tomorrow at 9am"', required: true },
      { name: 'recurrence', type: 'string', description: 'Optional: "once" (default), "daily", "weekly", "monthly"', required: false },
    ],
  },
  {
    name: 'list_schedules',
    description: 'List all active scheduled tasks, reminders, and scheduled messages.',
    parameters: [
      { name: 'status', type: 'string', description: 'Filter by status: "pending", "running", "completed", "failed", "cancelled", "paused".', required: false },
    ],
  },
  {
    name: 'delete_schedule',
    description: 'Delete/cancel a scheduled task or reminder by its ID.',
    parameters: [
      { name: 'task_id', type: 'string', description: 'The ID of the scheduled task to delete', required: true },
    ],
  },
  {
    name: 'trigger_schedule',
    description: 'Run a scheduled task immediately, regardless of its next scheduled time.',
    parameters: [
      { name: 'task_id', type: 'string', description: 'The ID of the scheduled task to trigger now', required: true },
    ],
  },
];

const schedulerToolModule: ToolModule = {
  name: 'scheduler',
  tools: SCHEDULER_TOOLS,
  register(registry: ToolRegistry, ctx: ToolContext) {
    const mr = ctx.getMessagingRegistry();

    registry.register('schedule_message', async (args) => {
      const to = String(args.to || '');
      const body = String(args.body || args.message || '');
      const time = String(args.time || '');
      if (!to || !body || !time) return { toolName: 'schedule_message', success: false, error: 'Missing required parameters (to, body/message, time)', duration: 0 };

      const scheduledDate = chrono.parseDate(time, new Date()) || new Date(time);
      if (!scheduledDate || isNaN(scheduledDate.getTime())) return { toolName: 'schedule_message', success: false, error: `Could not parse time: "${time}".`, duration: 0 };
      if (scheduledDate.getTime() <= Date.now()) return { toolName: 'schedule_message', success: false, error: `Scheduled time "${time}" resolves to the past.`, duration: 0 };

      const sched = ctx.getScheduler();
      if (!sched) return { toolName: 'schedule_message', success: false, error: 'Scheduler service not initialized', duration: 0 };

      try {
        const safeTo = to.replace(/[^a-zA-Z0-9_\-.\s]/g, '');
        const task = await sched.createTask({
          name: `Send message to ${safeTo || 'recipient'}`,
          description: `Send "${body.slice(0, 80)}${body.length > 80 ? '...' : ''}" to ${to}`,
          schedule: { recurrence: 'once', startDate: scheduledDate },
          data: { to, body, channel: String(args.channel || '') },
          tags: ['scheduled_message'],
          metadata: { createdBy: 'chat', to, body },
          handler: async (_ctx: any, data: { to: string; body: string; channel: string }) => {
            const provider = mr.resolveProvider(data.channel || undefined);
            await provider.sendMessage(data.to, data.body);
            console.log(`[Scheduler] Sent scheduled message to ${data.to}`);
            return { sent: true, to: data.to };
          },
        });
        return { toolName: 'schedule_message', success: true, result: `Scheduled message to ${to}: "${body}" at ${scheduledDate.toLocaleString()}. Task ID: ${task.id}`, duration: 0 };
      } catch (err: any) {
        return { toolName: 'schedule_message', success: false, error: err.message, duration: 0 };
      }
    });

    registry.register('set_auto_reply', async (args) => {
      const contacts = String(args.contacts || '');
      const instructions = String(args.instructions || '');
      const enabled = args.enabled !== false;
      const agent = ctx.getAgent();
      if (agent) {
        const contactList = contacts === 'all' ? [] : contacts.split(',').map(c => c.trim());
        agent.updateConfig({ autoReplyWhatsApp: enabled, autoReplyContacts: contactList });
      }
      return { toolName: 'set_auto_reply', success: true, result: `Auto-reply ${enabled ? 'enabled' : 'disabled'} for ${contacts === 'all' ? 'all contacts' : contacts}. Instructions: ${instructions}`, duration: 0 };
    });

    registry.register('create_reminder', async (args) => {
      const message = String(args.message || '');
      const time = String(args.time || '');
      const recurrence = String(args.recurrence || 'once') as 'once' | 'daily' | 'weekly' | 'monthly';
      if (!message || !time) return { toolName: 'create_reminder', success: false, error: 'Missing required parameters (message, time)', duration: 0 };

      const scheduledDate = chrono.parseDate(time, new Date()) || new Date(time);
      if (!scheduledDate || isNaN(scheduledDate.getTime())) return { toolName: 'create_reminder', success: false, error: `Could not parse time: "${time}".`, duration: 0 };
      if (scheduledDate.getTime() <= Date.now() && recurrence === 'once') return { toolName: 'create_reminder', success: false, error: `Time "${time}" resolves to the past.`, duration: 0 };

      const sched = ctx.getScheduler();
      if (!sched) return { toolName: 'create_reminder', success: false, error: 'Scheduler service not initialized', duration: 0 };

      try {
        const agent = ctx.getAgent();
        const config = agent?.getConfig();
        const ownerTelegramId = config?.ownerTelegramId;
        const tg = ctx.getTelegram();
        const wa = ctx.getWhatsApp();

        const task = await sched.createTask({
          name: `Reminder: ${message.slice(0, 50)}`,
          description: `Remind owner: "${message}" at ${scheduledDate.toLocaleString()}`,
          schedule: { recurrence, startDate: scheduledDate },
          data: { message, ownerTelegramId },
          tags: ['reminder'],
          metadata: { createdBy: 'chat', message },
          handler: async (_ctx: any, data: { message: string; ownerTelegramId?: string }) => {
            const reminderText = `⏰ **Reminder:** ${data.message}`;
            if (data.ownerTelegramId && tg) {
              try { await tg.sendMessage(Number(data.ownerTelegramId), reminderText); return { sent: true, channel: 'telegram' }; } catch {}
            }
            const ownerPhone = config?.ownerPhone;
            if (wa?.isConnected && ownerPhone) {
              try {
                const jid = `${ownerPhone.replace(/\D/g, '')}@s.whatsapp.net`;
                await wa.sendMessage(jid, { text: reminderText });
                return { sent: true, channel: 'whatsapp' };
              } catch {}
            }
            return { sent: false, stored: true };
          },
        });
        return { toolName: 'create_reminder', success: true, result: `Reminder set: "${message}" at ${scheduledDate.toLocaleString()}${recurrence !== 'once' ? ` (${recurrence})` : ''}. Task ID: ${task.id}`, duration: 0 };
      } catch (err: any) {
        return { toolName: 'create_reminder', success: false, error: err.message, duration: 0 };
      }
    });

    registry.register('list_schedules', async (args) => {
      const sched = ctx.getScheduler();
      if (!sched) return { toolName: 'list_schedules', success: false, error: 'Scheduler service not initialized', duration: 0 };
      const statusFilter = args.status ? String(args.status) as any : undefined;
      const filter = statusFilter ? { status: statusFilter } : { enabled: true };
      const result = sched.listTasks(filter, { field: 'createdAt', direction: 'desc' });
      if (result.tasks.length === 0) return { toolName: 'list_schedules', success: true, result: 'No scheduled tasks found.', duration: 0 };
      const lines = result.tasks.map((t: any) => {
        const nextRun = t.nextRunAt ? t.nextRunAt.toLocaleString() : 'N/A';
        const tags = t.tags.length > 0 ? ` [${t.tags.join(', ')}]` : '';
        return `• **${t.name}** (ID: ${t.id})\n  Status: ${t.status} | Next run: ${nextRun} | Recurrence: ${t.schedule.recurrence}${tags}`;
      });
      return { toolName: 'list_schedules', success: true, result: `Found ${result.tasks.length} scheduled task(s):\n\n${lines.join('\n\n')}`, duration: 0 };
    });

    registry.register('delete_schedule', async (args) => {
      const taskId = String(args.task_id || '');
      if (!taskId) return { toolName: 'delete_schedule', success: false, error: 'Missing required parameter: task_id', duration: 0 };
      const sched = ctx.getScheduler();
      if (!sched) return { toolName: 'delete_schedule', success: false, error: 'Scheduler service not initialized', duration: 0 };
      const deleted = await sched.deleteTask(taskId);
      if (deleted) return { toolName: 'delete_schedule', success: true, result: `Deleted scheduled task ${taskId}.`, duration: 0 };
      return { toolName: 'delete_schedule', success: false, error: `Task ${taskId} not found.`, duration: 0 };
    });

    registry.register('trigger_schedule', async (args) => {
      const taskId = String(args.task_id || '');
      if (!taskId) return { toolName: 'trigger_schedule', success: false, error: 'Missing required parameter: task_id', duration: 0 };
      const sched = ctx.getScheduler();
      if (!sched) return { toolName: 'trigger_schedule', success: false, error: 'Scheduler service not initialized', duration: 0 };
      try {
        const result = await sched.runTaskNow(taskId);
        return { toolName: 'trigger_schedule', success: result.success, result: result.success ? `Task ${taskId} executed successfully.` : `Task ${taskId} failed: ${result.error}`, duration: result.duration };
      } catch (err: any) {
        return { toolName: 'trigger_schedule', success: false, error: err.message, duration: 0 };
      }
    });
  },
};

export default schedulerToolModule;
