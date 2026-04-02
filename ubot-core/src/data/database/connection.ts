import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  DatabaseConfig,
  DatabaseConnection,
  DatabaseOptions,
  DatabaseEvent,
  DatabaseEventListener,
} from './types.js';

export class SupabaseConnection implements DatabaseConnection {
  private client: SupabaseClient | null = null;
  private config: DatabaseConfig;
  private listeners: Map<DatabaseEvent, DatabaseEventListener[]> = new Map();

  constructor(options: DatabaseOptions) {
    this.config = options.config;
    this.connect();
  }

  private connect(): void {
    try {
      const url = this.config.supabase_url || process.env.SUPABASE_URL;
      const key = this.config.supabase_service_key || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

      if (!url || !key) {
        throw new Error('Supabase configuration missing (url or key)');
      }

      this.client = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      });

      this.emit('open');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  is_connected(): boolean {
    return this.client !== null;
  }

  close(): void {
    if (this.client) {
      this.client = null;
      this.emit('close');
    }
  }

  get_client(): SupabaseClient {
    if (!this.client) {
      throw new Error('Database is not connected');
    }
    return this.client;
  }

  on(event: DatabaseEvent, listener: DatabaseEventListener): void {
    const existing = this.listeners.get(event) || [];
    existing.push(listener);
    this.listeners.set(event, existing);
  }

  off(event: DatabaseEvent, listener: DatabaseEventListener): void {
    const existing = this.listeners.get(event) || [];
    const filtered = existing.filter(l => l !== listener);
    this.listeners.set(event, filtered);
  }

  private emit(event: DatabaseEvent, data?: unknown): void {
    const listeners = this.listeners.get(event) || [];
    for (const listener of listeners) {
      listener(event, data);
    }
  }
}

export function createConnection(options: DatabaseOptions): DatabaseConnection {
  return new SupabaseConnection(options);
}

export function createDefaultConfig(): DatabaseConfig {
  return {
    provider: 'supabase',
  };
}