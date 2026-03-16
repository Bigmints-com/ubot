/**
 * Webchat Connection
 * Connects to a remote cloud relay to receive and respond to webchat messages.
 * 
 * Architecture: UBOT (local) polls relay (public cloud) — works through NAT.
 * The relay holds visitor messages until UBOT picks them up.
 * 
 * This mirrors how TelegramConnection works with Telegram's servers.
 */

export interface WebchatConfig {
  /** URL of the cloud relay (e.g. https://ubot-webchat-xxx.run.app) */
  relayUrl: string;
  /** Secret for authenticating with the relay */
  botSecret: string;
  /** Polling interval in ms (default: 2000) */
  pollingInterval?: number;
}

export type WebchatConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface WebchatMessage {
  /** Unique message ID (from relay) */
  id: string;
  /** Visitor session ID */
  session: string;
  /** Visitor display name */
  name: string;
  /** Message body */
  message: string;
  /** Owner key for owner identification (optional) */
  ownerKey?: string;
  /** Base64 data URL of voice audio (optional) */
  audio?: string;
  /** Base64 data URL of image attachment (optional) */
  image?: string;
}

export interface WebchatConnectionEvents {
  'connection.update': (status: WebchatConnectionStatus) => void;
  'message.received': (msg: WebchatMessage) => void;
  'error': (err: Error) => void;
}

export class WebchatConnection {
  private config: WebchatConfig;
  private _status: WebchatConnectionStatus = 'disconnected';
  private eventListeners = new Map<string, Set<Function>>();
  private pollAbortController: AbortController | null = null;
  private running = false;
  private _reconnectAttempts = 0;

  constructor(config: WebchatConfig) {
    this.config = config;
  }

  get status(): WebchatConnectionStatus {
    return this._status;
  }

  get relayUrl(): string {
    return this.config.relayUrl;
  }

  async connect(): Promise<void> {
    if (!this.config.relayUrl) {
      throw new Error('Webchat relay URL is required');
    }

    this.updateStatus('connecting');
    this.running = true;

    // Verify connectivity by checking relay health
    try {
      const healthRes = await fetch(`${this.config.relayUrl}/health`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!healthRes.ok) {
        throw new Error(`Relay health check failed: ${healthRes.status}`);
      }
      console.log(`[Webchat] ✅ Connected to relay: ${this.config.relayUrl}`);
      this.updateStatus('connected');
      this._reconnectAttempts = 0;
    } catch (err: any) {
      console.error(`[Webchat] ❌ Failed to connect to relay: ${err.message}`);
      this.updateStatus('error');
      throw err;
    }

    // Start polling loop
    this.pollLoop();
  }

  async disconnect(): Promise<void> {
    this.running = false;
    if (this.pollAbortController) {
      this.pollAbortController.abort();
      this.pollAbortController = null;
    }
    this.updateStatus('disconnected');
    console.log('[Webchat] Disconnected from relay');
  }

  /** Send a response for a pending message back to the relay */
  async respond(messageId: string, response: string): Promise<void> {
    const url = `${this.config.relayUrl}/api/bot/reply`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bot-Secret': this.config.botSecret || '',
        },
        body: JSON.stringify({ messageId, response }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`[Webchat] Reply failed (${res.status}): ${text}`);
      }
    } catch (err: any) {
      console.error(`[Webchat] Reply error: ${err.message}`);
    }
  }

  /** Push widget config to the relay */
  async pushConfig(config: { title?: string; color?: string; welcomeMessage?: string; avatarUrl?: string }): Promise<void> {
    const url = `${this.config.relayUrl}/api/bot/config`;
    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bot-Secret': this.config.botSecret || '',
        },
        body: JSON.stringify(config),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err: any) {
      console.error(`[Webchat] Config push error: ${err.message}`);
    }
  }

  // ── Polling Loop ───────────────────────────────────────

  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        this.pollAbortController = new AbortController();
        const secret = this.config.botSecret ? `?secret=${encodeURIComponent(this.config.botSecret)}` : '';
        const url = `${this.config.relayUrl}/api/bot/poll${secret}`;

        const res = await fetch(url, {
          headers: { 'X-Bot-Secret': this.config.botSecret || '' },
          signal: this.pollAbortController.signal,
        });

        if (!res.ok) {
          throw new Error(`Poll failed: ${res.status}`);
        }

        const data = await res.json() as { messages?: WebchatMessage[] };
        if (data.messages && data.messages.length > 0) {
          for (const msg of data.messages) {
            console.log(`[Webchat] 📩 session=${msg.session} name=${msg.name} body="${msg.message.slice(0, 60)}"`);
            this.emit('message.received', msg);
          }
        }

        // Reset reconnect counter on success
        if (this._status !== 'connected') {
          this.updateStatus('connected');
        }
        this._reconnectAttempts = 0;

      } catch (err: any) {
        if (err.name === 'AbortError') {
          // Normal abort during disconnect
          continue;
        }

        this._reconnectAttempts++;
        const delay = Math.min(2000 * this._reconnectAttempts, 30000);
        console.error(`[Webchat] Poll error: ${err.message} — retrying in ${delay / 1000}s`);
        
        if (this._reconnectAttempts >= 5) {
          this.updateStatus('error');
          this.emit('error', new Error(`Poll failed after ${this._reconnectAttempts} attempts: ${err.message}`));
        }

        // Wait before retry
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  // ── Event Emitter ──────────────────────────────────────

  private updateStatus(status: WebchatConnectionStatus): void {
    this._status = status;
    this.emit('connection.update', status);
  }

  on<K extends keyof WebchatConnectionEvents>(
    event: K,
    handler: WebchatConnectionEvents[K]
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
  }

  off<K extends keyof WebchatConnectionEvents>(
    event: K,
    handler: WebchatConnectionEvents[K]
  ): void {
    this.eventListeners.get(event)?.delete(handler);
  }

  removeAllListeners(): void {
    this.eventListeners.clear();
  }

  private emit<K extends keyof WebchatConnectionEvents>(
    event: K,
    ...args: Parameters<WebchatConnectionEvents[K]>
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          (listener as Function)(...args);
        } catch (err) {
          console.error(`[Webchat] Event handler error (${event}):`, err);
        }
      }
    }
  }
}
