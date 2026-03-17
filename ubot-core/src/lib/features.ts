/**
 * UBOT Feature Flags
 *
 * Controls which features are available based on deployment mode.
 * Set via UBOT_MODE environment variable:
 *   - 'local'        → Full power, self-hosted (default)
 *   - 'cloud'        → Single-tenant dedicated cloud
 *   - 'cloud-shared' → Multi-tenant shared SaaS
 */

export type UbotMode = 'local' | 'cloud' | 'cloud-shared';

export const MODE: UbotMode = (process.env.UBOT_MODE || 'local') as UbotMode;

export const isLocal = MODE === 'local';
export const isCloud = MODE === 'cloud' || MODE === 'cloud-shared';
export const isDedicated = MODE === 'cloud';
export const isShared = MODE === 'cloud-shared';

export const FEATURES = {
  // ── All tiers (Core) ────────────────────────────────
  google: true,
  webchat: true,
  memory: true,
  skills: true,
  scheduler: true,
  approvals: true,
  followups: true,
  safety: true,
  vault: true,
  mcp: true,
  webSearch: true,
  gemini: true,
  openai: true,
  sessions: true,

  // ── Cloud dedicated + Local ─────────────────────────
  telegram:          !isShared,
  customMcp:         !isShared,
  customSkills:      !isShared,
  unlimitedSessions: !isShared,

  // ── Local only ──────────────────────────────────────
  whatsapp:       isLocal,
  imessage:       isLocal,
  ollama:         isLocal,
  localWhisper:   isLocal,
  localTts:       isLocal,
  filesystem:     isLocal,
  cli:            isLocal,
  appleServices:  isLocal,
  browserMcp:     isLocal,
} as const;

export type FeatureName = keyof typeof FEATURES;

/**
 * Check if a feature is enabled in the current mode.
 */
export function isFeatureEnabled(feature: FeatureName): boolean {
  return FEATURES[feature] ?? false;
}

/**
 * Returns a user-friendly message for disabled features.
 */
export function getDisabledMessage(feature: FeatureName): string {
  if (FEATURES[feature]) return '';

  if (isShared) {
    return `This feature requires a dedicated or self-hosted instance.`;
  }
  if (isCloud) {
    return `This feature is only available in the self-hosted (local) version.`;
  }
  return `Feature "${feature}" is not available in this configuration.`;
}
