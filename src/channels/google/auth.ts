/**
 * Google OAuth2 Authentication Module
 * 
 * Uses OAuth2 user consent flow (Desktop app credentials).
 * First run: opens browser for user to sign in and authorize.
 * Subsequent runs: loads saved tokens from disk.
 */

import { google } from 'googleapis';
import { authenticate } from '@google-cloud/local-auth';
import { readFile, writeFile } from 'fs/promises';
// Use 'any' for OAuth2Client type to avoid version conflicts between googleapis and google-auth-library
import { existsSync } from 'fs';
import { join } from 'path';
type GoogleAuthClient = any;

// Paths relative to project root
const CREDS_DIR = join(process.cwd(), 'creds');
const CREDENTIALS_PATH = join(CREDS_DIR, 'google-oauth-credentials.json');
const TOKEN_PATH = join(CREDS_DIR, 'google-token.json');

// Scopes for all Google services we need
const SCOPES = [
  // Gmail
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  // Drive
  'https://www.googleapis.com/auth/drive',
  // Sheets
  'https://www.googleapis.com/auth/spreadsheets',
  // Docs
  'https://www.googleapis.com/auth/documents',
  // Calendar
  'https://www.googleapis.com/auth/calendar',
  // People (Contacts)
  'https://www.googleapis.com/auth/contacts',
];

let cachedClient: GoogleAuthClient | null = null;

/**
 * Load previously saved token from disk.
 */
async function loadSavedToken(): Promise<GoogleAuthClient | null> {
  try {
    if (!existsSync(TOKEN_PATH)) return null;
    const content = await readFile(TOKEN_PATH, 'utf-8');
    const token = JSON.parse(content);

    // Load credentials to get client_id / client_secret
    const credsContent = await readFile(CREDENTIALS_PATH, 'utf-8');
    const creds = JSON.parse(credsContent);
    const key = creds.installed || creds.web;

    const client = new google.auth.OAuth2(
      key.client_id,
      key.client_secret,
      key.redirect_uris?.[0] || 'http://localhost',
    );
    client.setCredentials(token);
    console.log('[Google] ✅ Loaded saved OAuth2 token');
    return client;
  } catch (err: any) {
    console.error('[Google] Failed to load saved token:', err.message);
    return null;
  }
}

/**
 * Save OAuth2 token to disk for future runs.
 */
async function saveToken(client: GoogleAuthClient): Promise<void> {
  try {
    const token = client.credentials;
    await writeFile(TOKEN_PATH, JSON.stringify(token, null, 2));
    console.log('[Google] 💾 Token saved to', TOKEN_PATH);
  } catch (err: any) {
    console.error('[Google] Failed to save token:', err.message);
  }
}

/**
 * Get an authenticated OAuth2 client.
 * Returns cached client if available, otherwise loads from disk.
 * Returns null if no token is available (user needs to authorize first).
 */
export async function getGoogleAuthClient(): Promise<GoogleAuthClient | null> {
  if (cachedClient) return cachedClient;

  const saved = await loadSavedToken();
  if (saved) {
    cachedClient = saved;
    return saved;
  }

  return null;
}

/**
 * Start the OAuth2 authorization flow.
 * Opens a browser for the user to sign in and authorize.
 * Returns the authenticated client.
 */
export async function startGoogleAuth(): Promise<GoogleAuthClient> {
  if (!existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `OAuth2 credentials not found at ${CREDENTIALS_PATH}. ` +
      'Please download OAuth2 Desktop App credentials from Google Cloud Console ' +
      'and save them as creds/google-oauth-credentials.json'
    );
  }

  console.log('[Google] 🌐 Starting OAuth2 authorization flow...');
  console.log('[Google] A browser window will open for you to sign in.');

  const client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });

  await saveToken(client);
  cachedClient = client;
  console.log('[Google] ✅ Authorization complete');
  return client;
}

/**
 * Check if Google auth is configured and authorized.
 */
export function getGoogleAuthStatus(): {
  hasCredentials: boolean;
  hasToken: boolean;
  isAuthenticated: boolean;
  credentialsPath: string;
  tokenPath: string;
} {
  return {
    hasCredentials: existsSync(CREDENTIALS_PATH),
    hasToken: existsSync(TOKEN_PATH),
    isAuthenticated: cachedClient !== null,
    credentialsPath: CREDENTIALS_PATH,
    tokenPath: TOKEN_PATH,
  };
}

/**
 * Clear the cached client and saved token.
 */
export async function clearGoogleAuth(): Promise<void> {
  cachedClient = null;
  try {
    if (existsSync(TOKEN_PATH)) {
      const { unlink } = await import('fs/promises');
      await unlink(TOKEN_PATH);
      console.log('[Google] 🗑️ Token cleared');
    }
  } catch (err: any) {
    console.error('[Google] Failed to clear token:', err.message);
  }
}

// ── Service-level enable / disable config ───────────

export interface GoogleServicesConfig {
  gmail: boolean;
  drive: boolean;
  sheets: boolean;
  docs: boolean;
  contacts: boolean;
  calendar: boolean;
  places: boolean;
}

const SERVICES_CONFIG_PATH = join(CREDS_DIR, 'google-services.json');

const DEFAULT_SERVICES_CONFIG: GoogleServicesConfig = {
  gmail: true,
  drive: true,
  sheets: true,
  docs: true,
  contacts: true,
  calendar: true,
  places: true,
};

/**
 * Get service-level enable/disable config.
 */
export function getGoogleServicesConfig(): GoogleServicesConfig {
  try {
    if (existsSync(SERVICES_CONFIG_PATH)) {
      const content = require('fs').readFileSync(SERVICES_CONFIG_PATH, 'utf-8');
      return { ...DEFAULT_SERVICES_CONFIG, ...JSON.parse(content) };
    }
  } catch {}
  return { ...DEFAULT_SERVICES_CONFIG };
}

/**
 * Save service-level enable/disable config.
 */
export async function saveGoogleServicesConfig(config: Partial<GoogleServicesConfig>): Promise<GoogleServicesConfig> {
  const current = getGoogleServicesConfig();
  const merged = { ...current, ...config };
  await writeFile(SERVICES_CONFIG_PATH, JSON.stringify(merged, null, 2));
  console.log('[Google] 💾 Services config saved');
  return merged;
}

/**
 * Map tool names to their service key.
 */
export function getServiceForTool(toolName: string): keyof GoogleServicesConfig | null {
  if (toolName.startsWith('gmail_')) return 'gmail';
  if (toolName.startsWith('drive_')) return 'drive';
  if (toolName.startsWith('sheets_')) return 'sheets';
  if (toolName.startsWith('docs_')) return 'docs';
  if (toolName.startsWith('google_contacts_')) return 'contacts';
  if (toolName.startsWith('gcal_')) return 'calendar';
  if (toolName.startsWith('google_places_')) return 'places';
  return null;
}

