import type { SupabaseClient } from '@supabase/supabase-js';

export interface DatabaseConfig {
  provider?: 'supabase';
  supabase_url?: string;
  supabase_service_key?: string;
}

export type QueryResult = {
  changes: number;
  lastInsertRowid: number | string;
};

export interface DatabaseConnection {
  is_connected(): boolean;
  close(): void;
  get_client(): SupabaseClient | any; // Any allows for future adapters
}

export interface DatabaseOptions {
  config: DatabaseConfig;
}

export type DatabaseEvent = 'open' | 'close' | 'error';
export type DatabaseEventListener = (event: DatabaseEvent, data?: unknown) => void;