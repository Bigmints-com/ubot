/**
 * UBOT Extension Hooks
 *
 * Provides extension points so forks can add functionality
 * without modifying core files. Register hooks at startup
 * via registerHooks().
 *
 * Each hook is optional — if not registered, UBOT behaves
 * with its default local-mode behavior.
 */

import http from 'http';

// ── Auth Hook ──────────────────────────────────────────

export interface AuthResult {
  authenticated: boolean;
  clientName?: string;
  error?: string;
  scopes?: string[];
}

export interface AuthHook {
  /**
   * Called before every API request.
   * Return AuthResult to handle auth, or null to fall through to default API key auth.
   */
  authenticate(req: http.IncomingMessage): Promise<AuthResult | null>;
}

// ── Middleware Hook ────────────────────────────────────

export interface MiddlewareHook {
  /**
   * Called for every incoming HTTP request before routing.
   * Return true if the request has been fully handled (response sent).
   * Return false to continue normal request processing.
   */
  onRequest?(req: http.IncomingMessage, res: http.ServerResponse, url: string, method: string): Promise<boolean>;

  /**
   * Called once when the HTTP server starts listening.
   * Use this for WebSocket upgrade handling, etc.
   */
  onServerStart?(server: http.Server): void;
}

// ── Route Hook ─────────────────────────────────────────

export interface RouteHook {
  /**
   * Called for /api/* routes not handled by core.
   * Return true if the request was handled.
   */
  handleRoute?(req: http.IncomingMessage, res: http.ServerResponse, url: string, method: string): Promise<boolean>;
}

// ── Startup Hook ───────────────────────────────────────

export interface StartupHook {
  /**
   * Called during initializeApi(), after core initialization.
   * Use this to set up additional services, register tools, etc.
   */
  onInitialize?(context: {
    db: any;
    agent: any;
    workspacePath: string | null;
  }): Promise<void>;

  /**
   * Called to modify channel auto-connect behavior.
   * Return true to skip the default auto-connect for a channel.
   */
  shouldSkipChannel?(channel: 'whatsapp' | 'telegram' | 'webchat'): boolean;
}

// ── Tool Registry Hook ─────────────────────────────────

export interface ToolRegistryHook {
  /**
   * Return module directory names that should be disabled/skipped.
   */
  getDisabledModules?(): string[];

  /**
   * Return additional directory paths to scan for tool modules.
   */
  getAdditionalScanDirs?(): string[];
}

// ── Database Hook ──────────────────────────────────────

export interface DatabaseHook {
  /**
   * Provide a custom database connection instead of the default SQLite.
   * Return a DatabaseConnection-compatible object, or null to use default SQLite.
   * Receives the default config (dbPath, migrations) for reference.
   */
  createConnection(context: {
    dbPath: string;
    migrations: any[];
    ubotHome: string;
  }): any | null;
}

// ── Registered Hooks ───────────────────────────────────

interface RegisteredHooks {
  auth?: AuthHook;
  middleware?: MiddlewareHook;
  routes?: RouteHook;
  startup?: StartupHook;
  toolRegistry?: ToolRegistryHook;
  database?: DatabaseHook;
}

let _hooks: RegisteredHooks = {};

/**
 * Register extension hooks. Call this before server starts.
 * Typically called from a ubot.extensions.ts file in the fork.
 */
export function registerHooks(hooks: Partial<RegisteredHooks>): void {
  _hooks = { ..._hooks, ...hooks };
  console.log(`[Hooks] Registered: ${Object.keys(hooks).join(', ')}`);
}

/**
 * Get registered hooks (used internally by core).
 */
export function getHooks(): Readonly<RegisteredHooks> {
  return _hooks;
}

/**
 * Reset hooks (for testing).
 */
export function resetHooks(): void {
  _hooks = {};
}
