/**
 * API Authentication Middleware
 * 
 * Token-based API key authentication for all /api/* endpoints.
 * Keys are stored in ~/.ubot/config.json under `api.keys`.
 * 
 * Skips auth for:
 * - OPTIONS (CORS preflight)
 * - GET /api/health (health check)
 */

import http from 'http';
import { activeConfigPath, loadUbotConfig } from '../../data/config.js';

export interface ApiKey {
  /** The secret key value */
  key: string;
  /** Human-readable name for audit logging */
  name: string;
  /** Optional: restrict to specific scope sets (e.g. ['chat', 'tools']). Empty = all. */
  scopes?: string[];
}

export interface AuthResult {
  authenticated: boolean;
  clientName?: string;
  scopes?: string[];
  error?: string;
}

/** Paths that skip authentication */
const PUBLIC_PATHS = ['/api/health', '/api/app/theme', '/api/app/theme.css', '/api/auth/status', '/api/features', '/api/modules'];

/**
 * Load API keys from config.
 * Caches for 30 seconds to avoid re-reading config on every request.
 */
let cachedKeys: ApiKey[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000;

export function getApiKeys(): ApiKey[] {
  const now = Date.now();
  if (cachedKeys && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedKeys;
  }

  try {
    const config = loadUbotConfig();
    const keys: ApiKey[] = (config as any).api?.keys || [];
    console.log(`[Auth] Loaded ${keys.length} API keys from ${activeConfigPath || 'unknown'}`);
    cachedKeys = keys;
    cacheTimestamp = now;
    return keys;
  } catch {
    return cachedKeys || [];
  }
}

/** Invalidate the API key cache (e.g. after config update) */
export function invalidateApiKeyCache(): void {
  cachedKeys = null;
  cacheTimestamp = 0;
}

/**
 * Check if a request requires authentication.
 */
export function requiresAuth(method: string, url: string): boolean {
  if (method === 'OPTIONS') return false;
  if (PUBLIC_PATHS.some(p => url === p || url.startsWith(p + '?'))) return false;
  return true;
}

/**
 * Authenticate a request by checking:
 * 1. Authorization: Bearer <key> header (for API consumers)
 * 2. ubot_session cookie (for dashboard users)
 * 
 * Returns the auth result with client identity if valid.
 */
export function authenticate(req: http.IncomingMessage): AuthResult {
  const keys = getApiKeys();

  // If no keys are configured, allow all requests (dev mode / first-time setup)
  if (keys.length === 0) {
    return { authenticated: true, clientName: 'default (no keys configured)' };
  }

  // Method 1: Bearer token (API consumers)
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      return { authenticated: false, error: 'Invalid Authorization format. Expected: Bearer <key>' };
    }

    const token = parts[1];
    const matched = keys.find(k => k.key === token);
    if (!matched) {
      return { authenticated: false, error: 'Invalid API key' };
    }

    return {
      authenticated: true,
      clientName: matched.name,
      scopes: matched.scopes,
    };
  }

  // Method 2: Session cookie (dashboard users)
  // The session cookie is set by the login endpoint in index.ts
  const cookies = req.headers.cookie || '';
  const sessionMatch = cookies.split(';').map(c => c.trim()).find(c => c.startsWith('ubot_session='));
  if (sessionMatch) {
    const sessionToken = sessionMatch.split('=')[1];
    if (sessionToken && validateSessionToken) {
      const valid = validateSessionToken(sessionToken);
      if (valid) {
        return { authenticated: true, clientName: 'Dashboard Session' };
      }
    }
  }

  return { authenticated: false, error: 'Missing Authorization header. Add api.keys to config.json or send Bearer token.' };
}

/**
 * Session validation function — injected by index.ts at startup
 * to avoid circular dependency (session store lives in index.ts).
 */
let validateSessionToken: ((token: string) => boolean) | null = null;

export function setSessionValidator(fn: (token: string) => boolean): void {
  validateSessionToken = fn;
}

/**
 * Send a 401 Unauthorized response.
 */
export function sendUnauthorized(res: http.ServerResponse, message: string): void {
  res.writeHead(401, {
    'Content-Type': 'application/json',
    'WWW-Authenticate': 'Bearer',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify({ error: message }));
}
