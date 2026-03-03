/**
 * Unified Integration Provider Types
 * 
 * Standard shape used across all integration categories:
 * LLMs (chat, image, transcript), Search, etc.
 */

export interface IntegrationProvider {
  /** Unique identifier */
  id: string;
  /** Display name, e.g. "Gemini Flash" */
  name: string;
  /** Provider type: 'gemini' | 'openai' | 'ollama' | 'serper' | 'duckduckgo' | ... */
  type: string;
  /** API base URL (optional for some providers) */
  baseUrl?: string;
  /** API key (optional, e.g. Ollama doesn't need one) */
  apiKey?: string;
  /** Model identifier (e.g. 'gemini-2.0-flash', not used for search) */
  model?: string;
  /** Whether this provider is active */
  enabled: boolean;
  /** Whether this is the default provider in its category */
  isDefault: boolean;
  /** Provider-specific configuration */
  config?: Record<string, unknown>;
}

/** Categories for integration providers */
export type IntegrationCategory =
  | 'llm-chat'
  | 'llm-image'
  | 'llm-transcript'
  | 'search';

/** Provider type presets with label and default base URL */
export interface ProviderTypePreset {
  type: string;
  label: string;
  baseUrl: string;
  requiresApiKey: boolean;
  supportsModelDiscovery: boolean;
}

/** Pre-defined provider type presets for LLMs */
export const LLM_PROVIDER_PRESETS: ProviderTypePreset[] = [
  { type: 'gemini', label: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', requiresApiKey: true, supportsModelDiscovery: true },
  { type: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1/', requiresApiKey: true, supportsModelDiscovery: true },
  { type: 'ollama', label: 'Ollama', baseUrl: 'http://localhost:11434/v1', requiresApiKey: false, supportsModelDiscovery: true },
  { type: 'custom', label: 'Custom', baseUrl: '', requiresApiKey: true, supportsModelDiscovery: true },
];

/** Pre-defined provider type presets for Web Search */
export const SEARCH_PROVIDER_PRESETS: ProviderTypePreset[] = [
  { type: 'serper', label: 'Serper.dev (Google)', baseUrl: 'https://google.serper.dev/search', requiresApiKey: true, supportsModelDiscovery: false },
  { type: 'duckduckgo', label: 'DuckDuckGo', baseUrl: '', requiresApiKey: false, supportsModelDiscovery: false },
];

/** Config shape for integrations section in config.json */
export interface IntegrationsConfig {
  llm?: {
    chat?: IntegrationProvider[];
    image?: IntegrationProvider[];
    transcript?: IntegrationProvider[];
  };
  search?: {
    providers?: IntegrationProvider[];
  };
  /** @deprecated — kept for backward compat, migrated to search.providers */
  serper_api_key?: string;
}
