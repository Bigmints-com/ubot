/**
 * WhatsApp Rate Limiter & Human-Like Delay Simulator
 *
 * Wraps outgoing WhatsApp sends to:
 * 1. Add random reply delays (2–6s) so messages don't arrive instantly
 * 2. Send typing indicators ("composing" presence) before each message
 * 3. Enforce per-contact minimum gaps (cooldown)
 * 4. Cap global messages-per-minute via sliding window
 */

import type { WASocket, AnyMessageContent, WAMessage } from '@whiskeysockets/baileys';

// ── Configuration ──────────────────────────────────────────────

export interface RateLimiterConfig {
  /** Minimum random delay in ms before sending (default 2000) */
  minDelayMs: number;
  /** Maximum random delay in ms before sending (default 6000) */
  maxDelayMs: number;
  /** Whether to send typing indicators before messages (default true) */
  simulateTyping: boolean;
  /** Minimum gap between messages to the same contact in ms (default 3000) */
  perContactCooldownMs: number;
  /** Max messages per sliding window (default 8) */
  maxMessagesPerWindow: number;
  /** Sliding window duration in ms (default 60000 = 1 minute) */
  windowDurationMs: number;
  /** Whether rate limiting is enabled at all (default true) */
  enabled: boolean;
}

export const DEFAULT_RATE_LIMITER_CONFIG: RateLimiterConfig = {
  minDelayMs: 2000,
  maxDelayMs: 6000,
  simulateTyping: true,
  perContactCooldownMs: 3000,
  maxMessagesPerWindow: 8,
  windowDurationMs: 60_000,
  enabled: true,
};

// ── Rate Limiter ───────────────────────────────────────────────

export class WhatsAppRateLimiter {
  private config: RateLimiterConfig;
  /** Timestamps of recent sends (sliding window) */
  private globalSendLog: number[] = [];
  /** Last send time per contact JID */
  private contactLastSend: Map<string, number> = new Map();
  /** Mutex per contact to serialize sends to the same recipient */
  private contactLocks: Map<string, Promise<void>> = new Map();

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMITER_CONFIG, ...config };
  }

  /**
   * Send a message through the rate limiter.
   * Adds human-like delays, typing indicators, and rate limiting.
   */
  async sendMessage(
    socket: WASocket,
    jid: string,
    content: AnyMessageContent,
  ): Promise<WAMessage | undefined> {
    if (!this.config.enabled) {
      return socket.sendMessage(jid, content);
    }

    // Serialize sends to the same contact (no parallel bursts)
    const lock = this.contactLocks.get(jid) ?? Promise.resolve();
    const sendPromise = lock.then(() => this._throttledSend(socket, jid, content));

    // Store the new lock (without leaking the return value)
    this.contactLocks.set(jid, sendPromise.then(() => {}).catch(() => {}));

    return sendPromise;
  }

  // ── Internals ──────────────────────────────────────────────

  private async _throttledSend(
    socket: WASocket,
    jid: string,
    content: AnyMessageContent,
  ): Promise<WAMessage | undefined> {
    // 1. Wait for global rate limit window
    await this._waitForGlobalSlot();

    // 2. Wait for per-contact cooldown
    await this._waitForContactCooldown(jid);

    // 3. Random human-like delay
    const delay = this._randomDelay();
    console.log(`[RateLimiter] ⏳ Delaying ${delay}ms before sending to ${jid.slice(0, 15)}…`);
    await sleep(delay);

    // 4. Simulate typing
    if (this.config.simulateTyping) {
      try {
        await socket.sendPresenceUpdate('composing', jid);
        // Typing duration proportional to message length (300–1500ms)
        const textLength = ('text' in content && typeof content.text === 'string')
          ? content.text.length
          : 50; // fallback
        const typingDuration = Math.min(300 + textLength * 15, 1500);
        await sleep(typingDuration);
        await socket.sendPresenceUpdate('paused', jid);
      } catch (err) {
        // Presence updates are best-effort — don't block sends
        console.warn('[RateLimiter] Typing simulation failed (non-fatal):', (err as Error).message);
      }
    }

    // 5. Actually send
    const result = await socket.sendMessage(jid, content);

    // 6. Record the send
    const now = Date.now();
    this.globalSendLog.push(now);
    this.contactLastSend.set(jid, now);

    console.log(`[RateLimiter] ✅ Sent to ${jid.slice(0, 15)} (window: ${this._windowCount()}/${this.config.maxMessagesPerWindow})`);
    return result;
  }

  /** Block until the global sliding window has a free slot */
  private async _waitForGlobalSlot(): Promise<void> {
    const { maxMessagesPerWindow, windowDurationMs } = this.config;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      this._pruneWindow();
      if (this.globalSendLog.length < maxMessagesPerWindow) return;

      // Wait until the oldest entry in the window expires
      const oldestInWindow = this.globalSendLog[0];
      const waitMs = oldestInWindow + windowDurationMs - Date.now() + 50; // +50ms buffer
      if (waitMs <= 0) {
        this._pruneWindow();
        return;
      }
      console.log(`[RateLimiter] 🚦 Global limit hit (${this.globalSendLog.length}/${maxMessagesPerWindow}), waiting ${waitMs}ms`);
      await sleep(waitMs);
    }
  }

  /** Block until per-contact cooldown has elapsed */
  private async _waitForContactCooldown(jid: string): Promise<void> {
    const lastSend = this.contactLastSend.get(jid);
    if (!lastSend) return;

    const elapsed = Date.now() - lastSend;
    const remaining = this.config.perContactCooldownMs - elapsed;
    if (remaining > 0) {
      console.log(`[RateLimiter] 🕐 Per-contact cooldown for ${jid.slice(0, 15)}: waiting ${remaining}ms`);
      await sleep(remaining);
    }
  }

  /** Remove entries outside the sliding window */
  private _pruneWindow(): void {
    const cutoff = Date.now() - this.config.windowDurationMs;
    while (this.globalSendLog.length > 0 && this.globalSendLog[0] < cutoff) {
      this.globalSendLog.shift();
    }
  }

  /** Generate a random delay between min and max */
  private _randomDelay(): number {
    const { minDelayMs, maxDelayMs } = this.config;
    return Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
  }

  /** How many sends are in the current window */
  private _windowCount(): number {
    this._pruneWindow();
    return this.globalSendLog.length;
  }

  /** Get current stats (useful for debugging / UI) */
  getStats(): { windowCount: number; maxPerWindow: number; contactCooldowns: number } {
    return {
      windowCount: this._windowCount(),
      maxPerWindow: this.config.maxMessagesPerWindow,
      contactCooldowns: this.contactLastSend.size,
    };
  }

  /** Update configuration at runtime */
  updateConfig(partial: Partial<RateLimiterConfig>): void {
    this.config = { ...this.config, ...partial };
  }
}

// ── Helpers ────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Factory ────────────────────────────────────────────────────

export function createRateLimiter(config?: Partial<RateLimiterConfig>): WhatsAppRateLimiter {
  return new WhatsAppRateLimiter(config);
}
