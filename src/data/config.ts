import fs from 'fs';
import path from 'path';

// ─── Standard Provider Pattern ───────────────────────────
// Every multi-provider capability uses:
//   { enabled, default: "key", providers: { key: { enabled, ...config } } }

export interface ProviderConfig {
  enabled?: boolean;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeout?: number;
  [key: string]: unknown;  // provider-specific extras
}

export interface ProvidersSection {
  enabled?: boolean;
  default?: string;
  providers?: Record<string, ProviderConfig>;
}

// ─── Capability-specific types ───────────────────────────

export interface GoogleServiceConfig {
  enabled?: boolean;
  credentials?: {
    client_id?: string;
    client_secret?: string;
    redirect_uris?: string[];
  };
}

export interface GoogleCapabilityConfig {
  enabled?: boolean;
  apiKey?: string;
  services?: Record<string, GoogleServiceConfig>;
}

export interface FilesystemCapabilityConfig {
  enabled?: boolean;
  allowed_paths?: string[];
}

export interface CliCapabilityConfig extends ProvidersSection {
  workDir?: string;
}

export interface McpServerConfig {
  enabled?: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  enabledTools?: string[];
}

export interface ExecCapabilityConfig {
  enabled?: boolean;
  security?: 'workspace' | 'allowed' | 'full';
  max_timeout?: number;
}

// ─── Capabilities Container ──────────────────────────────

export interface CapabilitiesConfig {
  models?: ProvidersSection;
  search?: ProvidersSection;
  cli?: CliCapabilityConfig;
  filesystem?: FilesystemCapabilityConfig;
  exec?: ExecCapabilityConfig;
  google?: GoogleCapabilityConfig;
  mcp?: { servers?: Record<string, McpServerConfig> };
  [key: string]: unknown;  // extensible for future capabilities
}

// ─── Config Interface ────────────────────────────────────

export interface UbotConfig {
  meta?: { version?: string };
  server?: { port?: number };
  database?: { path?: string };

  owner?: {
    phone?: string;
    telegram_id?: string;
    telegram_username?: string;
  };

  channels?: {
    whatsapp?: { enabled?: boolean; auto_reply?: boolean };
    telegram?: { enabled?: boolean; token?: string; auto_reply?: boolean };
    imessage?: { enabled?: boolean; server_url?: string; password?: string; auto_reply?: boolean };
  };

  agent?: {
    max_history_messages?: number;
    max_tool_iterations?: number;
    system_prompt?: string;
  };

  /** Purpose-based routing: which capability.provider to use for each purpose */
  defaults?: Record<string, string>;

  /** All integrations live here */
  capabilities?: CapabilitiesConfig;

  // ─── Legacy (kept for migration, will be removed) ──────
  /** @deprecated use capabilities.models */
  models?: ProvidersSection;
  /** @deprecated use capabilities.search */
  search?: ProvidersSection;
  /** @deprecated use capabilities.cli */
  cli?: any;
  /** @deprecated use capabilities.filesystem */
  filesystem?: any;
  /** @deprecated */
  llm?: any;
  /** @deprecated */
  integrations?: any;
  /** @deprecated */
  mcp?: any;
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
  const entries = Object.entries(section.providers);
  for (const [key, config] of entries) {
    if (config.enabled !== false) return { key, config };
  }
  return entries.length > 0 ? { key: entries[0][0], config: entries[0][1] } : null;
}
