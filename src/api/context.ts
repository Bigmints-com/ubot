/**
 * Shared API Context & Utilities
 * All route handlers receive this context for accessing shared state.
 */

import http from 'http';
import type { AgentOrchestrator } from '../engine/orchestrator.js';
import type { ApprovalStore } from '../memory/pending-approvals.js';
import type { SkillEngine } from '../capabilities/skills/skill-engine.js';
import type { EventBus } from '../capabilities/skills/event-bus.js';
import type { TaskSchedulerService } from '../capabilities/scheduler/service.js';
import type { WhatsAppConnection } from '../channels/whatsapp/connection.js';
import type { TelegramConnection } from '../channels/telegram/connection.js';
import type { MessagingRegistry } from '../channels/registry.js';
import type { WhatsAppMessagingProvider } from '../channels/whatsapp/messaging-provider.js';
import type { TelegramMessagingProvider } from '../channels/telegram/messaging-provider.js';
import type { WhatsAppConnectionConfig } from '../channels/whatsapp/types.js';
import type { SafetyConfig, SafetyRule } from '../safety/types.js';
import type { DatabaseConnection as CoreDatabaseConnection } from '../data/database/types.js';
import type { McpServerManager } from '../integrations/mcp/mcp-manager.js';

export interface ApiContext {
  // Core
  agentOrchestrator: AgentOrchestrator | null;
  coreDb: CoreDatabaseConnection | null;

  // Channels
  waConnection: WhatsAppConnection | null;
  waQrCode: string | null;
  waStatus: string;
  waError: string | null;
  waMessages: Array<{ from: string; to: string; body: string; timestamp: string; isFromMe: boolean }>;
  waProvider: WhatsAppMessagingProvider | null;
  whatsappConfig: Partial<WhatsAppConnectionConfig>;

  tgConnection: TelegramConnection | null;
  tgStatus: string;
  tgError: string | null;
  tgProvider: TelegramMessagingProvider | null;
  tgMessages: Array<{ from: string; to: string; body: string; timestamp: string; isFromMe: boolean }>;

  messagingRegistry: MessagingRegistry;

  // Services
  skillEngine: SkillEngine | null;
  eventBus: EventBus | null;
  scheduler: TaskSchedulerService | null;
  approvalStore: ApprovalStore | null;

  // Safety
  safetyConfig: SafetyConfig;
  safetyRules: SafetyRule[];

  // MCP
  mcpManager: McpServerManager | null;

  // Helpers
  saveConfigValue: (key: string, value: string) => void;
  loadConfigValue: (key: string) => string | null;
}

/** Route handler type — returns true if handled, false if not matched */
export type RouteHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
  ctx: ApiContext,
) => Promise<boolean>;

// ─── Shared Utilities ────────────────────────────────────

export async function parseBody(req: http.IncomingMessage): Promise<unknown> {
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

export function json(res: http.ServerResponse, data: unknown, status = 200): void {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  // Only set CORS if not already set by middleware
  if (!res.getHeader('Access-Control-Allow-Origin')) {
    headers['Access-Control-Allow-Origin'] = '*';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

export function notFound(res: http.ServerResponse): void {
  json(res, { error: 'Not found' }, 404);
}

export function error(res: http.ServerResponse, message: string, status = 400): void {
  json(res, { error: message }, status);
}
