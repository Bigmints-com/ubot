import fs from 'fs';
import path from 'path';

// ─── Standard Provider Pattern ───────────────────────────
// Every integration uses the same shape:
//   { default: "key", providers: { key: { enabled, ...config } } }

export interface ProviderConfig {
  enabled?: boolean;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeout?: number;
  [key: string]: unknown;  // provider-specific extras
}

export interface ProvidersSection {
  default?: string;
  providers?: Record<string, ProviderConfig>;
}

// ─── MCP Server Config ───────────────────────────────────

export interface McpServerConfig {
  enabled?: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  enabledTools?: string[];
}

// ─── Config Interface ────────────────────────────────────

export interface UbotConfig {
  meta?: { version?: string };
  server?: { port?: number };
  database?: { path?: string };

  /** LLM model providers (chat) */
  models?: ProvidersSection;

  /** Web search providers */
  search?: ProvidersSection;

  /** CLI agent providers */
  cli?: ProvidersSection & { workDir?: string };

  /** MCP servers (keyed by name) */
  mcp?: { servers?: Record<string, McpServerConfig> };

  /** Owner identity */
  owner?: {
    phone?: string;
    telegram_id?: string;
    telegram_username?: string;
  };

  /** Messaging channels */
  channels?: {
    whatsapp?: { enabled?: boolean; auto_reply?: boolean };
    telegram?: { enabled?: boolean; token?: string; auto_reply?: boolean };
    imessage?: { enabled?: boolean; server_url?: string; password?: string; auto_reply?: boolean };
  };

  /** Agent behavior */
  agent?: {
    max_history_messages?: number;
    max_tool_iterations?: number;
    system_prompt?: string;
  };

  /** Filesystem access */
  filesystem?: {
    allowed_paths?: string[];
  };

  // ─── Legacy (kept for migration, will be removed) ──────
  /** @deprecated use models instead */
  llm?: {
    base_url?: string;
    model?: string;
    api_key?: string;
    google_api_key?: string;
    providers?: any[];
    default_provider_id?: string;
  };
  /** @deprecated migrated to models/search */
  integrations?: any;
}

// ─── Config File I/O ─────────────────────────────────────

const UBOT_HOME = process.env.UBOT_HOME || '';
export let activeConfigPath = '';

export function loadUbotConfig(): UbotConfig {
  const candidates = [
    UBOT_HOME ? path.join(UBOT_HOME, 'config.json') : '',
    path.join(process.cwd(), 'config.json'),
  ].filter(Boolean);

  for (const configPath of candidates) {
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf8');
        activeConfigPath = configPath;
        return JSON.parse(raw) as UbotConfig;
      }
    } catch { /* next */ }
  }

  activeConfigPath = path.join(process.cwd(), 'config.json');
  return {};
}

export function saveUbotConfig(config: UbotConfig): void {
  if (!activeConfigPath) {
    activeConfigPath = path.join(process.cwd(), 'config.json');
  }
  try {
    fs.writeFileSync(activeConfigPath, JSON.stringify(config, null, 4) + '\n');
  } catch (err: any) {
    console.error(`[Config] Failed to save config to ${activeConfigPath}:`, err.message);
  }
}

// ─── Helper: Get default provider ─────────────────────────

export function getDefaultProvider(section?: ProvidersSection): { key: string; config: ProviderConfig } | null {
  if (!section?.providers) return null;
  const defaultKey = section.default;
  if (defaultKey && section.providers[defaultKey]?.enabled !== false) {
    return { key: defaultKey, config: section.providers[defaultKey] };
  }
  // Fallback to first enabled
  const entries = Object.entries(section.providers);
  for (const [key, config] of entries) {
    if (config.enabled !== false) return { key, config };
  }
  return entries.length > 0 ? { key: entries[0][0], config: entries[0][1] } : null;
}
