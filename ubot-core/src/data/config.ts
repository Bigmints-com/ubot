import fs from 'fs';
import path from 'path';
import type { IntegrationsConfig } from './integration-types.js';

export interface UbotConfig {
  server?: { port?: number };
  database?: { path?: string };
  llm?: { 
    base_url?: string; 
    model?: string; 
    api_key?: string; 
    google_api_key?: string;
    providers?: any[]; 
    default_provider_id?: string;
  };
  integrations?: IntegrationsConfig;
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
  cli?: {
    enabled?: boolean;
    provider?: 'gemini' | 'claude' | 'codex';
    workDir?: string;
    timeout?: number;
  };
  filesystem?: {
    allowed_paths?: string[];
  };
}

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
