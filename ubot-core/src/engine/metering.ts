/**
 * LLM Usage Metering
 * 
 * Tracks token usage and estimated costs per model/purpose.
 * Stores data in SQLite for persistent per-tenant metering.
 */

import type { DatabaseConnection } from '../data/database/types.js';

// ── Cost rates per model ($ per 1M tokens) ──

interface ModelPricing {
  input: number;   // $ per 1M input tokens
  output: number;  // $ per 1M output tokens
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  // Gemini models
  'gemini-3-flash-preview':              { input: 0.50, output: 3.00 },
  'gemini-3.1-flash-lite-preview':       { input: 0.25, output: 1.50 },
  'gemini-3.1-pro-preview':              { input: 2.00, output: 12.00 },
  'gemini-2.5-flash':                    { input: 0.30, output: 2.50 },
  'gemini-2.5-flash-lite':               { input: 0.10, output: 0.40 },
  'gemini-2.5-pro':                      { input: 1.25, output: 10.00 },
  'gemini-2.0-flash':                    { input: 0.10, output: 0.40 },
  'gemini-2.0-flash-lite':               { input: 0.075, output: 0.30 },
  // Mistral models (via Vertex AI)
  'mistral-nemo':                        { input: 0.02, output: 0.04 },
  'mistral-small-3.2-24b':               { input: 0.06, output: 0.18 },
  'mistral-medium-3':                    { input: 0.40, output: 2.00 },
  'mistral-large-3':                     { input: 0.50, output: 1.50 },
  // Anthropic (via Vertex AI)
  'claude-haiku-4.5':                    { input: 1.00, output: 5.00 },
  'claude-sonnet-4.6':                   { input: 3.00, output: 15.00 },
  // Ollama / local (free)
  'llama3.2:3b':                         { input: 0, output: 0 },
  'llama3.1:8b':                         { input: 0, output: 0 },
};

// Fallback pricing for unknown models
const FALLBACK_PRICING: ModelPricing = { input: 0.50, output: 3.00 };

function getPricing(model: string): ModelPricing {
  // Exact match
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  // Prefix match (e.g. "gemini-3-flash-preview-20260301" → "gemini-3-flash-preview")
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.startsWith(key)) return pricing;
  }
  // Local models are free
  if (model.includes('llama') || model.includes('qwen') || model.includes('deepseek')) {
    return { input: 0, output: 0 };
  }
  return FALLBACK_PRICING;
}

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = getPricing(model);
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

// ── Usage record ──

export interface UsageRecord {
  timestamp: string;       // ISO 8601
  model: string;
  purpose: string;         // chat | router | extraction | generation
  providerId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;   // USD
}

export interface UsageSummary {
  period: string;          // e.g. "today", "7d", "30d", "all"
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  byModel: Record<string, { inputTokens: number; outputTokens: number; cost: number; calls: number }>;
  byPurpose: Record<string, { inputTokens: number; outputTokens: number; cost: number; calls: number }>;
  dailyCosts: Array<{ date: string; cost: number; tokens: number }>;
}

// ── Metering store (SQLite-backed via DatabaseConnection) ──

export class MeteringService {
  private db: DatabaseConnection;
  private initialized = false;

  constructor(db: DatabaseConnection) {
    this.db = db;
    this.ensureTable();
  }

  private ensureTable() {
    if (this.initialized) return;
    this.db.execute(`
      CREATE TABLE IF NOT EXISTS llm_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        model TEXT NOT NULL,
        purpose TEXT NOT NULL DEFAULT 'chat',
        provider_id TEXT NOT NULL DEFAULT 'default',
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        estimated_cost REAL NOT NULL DEFAULT 0
      )
    `);
    // Index for time-range queries
    this.db.execute(`CREATE INDEX IF NOT EXISTS idx_llm_usage_timestamp ON llm_usage(timestamp)`);
    this.db.execute(`CREATE INDEX IF NOT EXISTS idx_llm_usage_purpose ON llm_usage(purpose)`);
    this.initialized = true;
  }

  /** Record a single LLM call */
  record(model: string, purpose: string, providerId: string, inputTokens: number, outputTokens: number) {
    const totalTokens = inputTokens + outputTokens;
    const cost = calculateCost(model, inputTokens, outputTokens);
    this.db.execute(
      `INSERT INTO llm_usage (model, purpose, provider_id, input_tokens, output_tokens, total_tokens, estimated_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [model, purpose, providerId, inputTokens, outputTokens, totalTokens, cost]
    );
  }

  /** Get usage summary for a time period */
  getSummary(period: 'today' | '7d' | '30d' | 'all' = '30d'): UsageSummary {
    const since = this.getSinceDate(period);

    // Totals
    const totals = this.db.query<any>(
      `SELECT COALESCE(SUM(input_tokens), 0) as input_tokens,
              COALESCE(SUM(output_tokens), 0) as output_tokens,
              COALESCE(SUM(total_tokens), 0) as total_tokens,
              COALESCE(SUM(estimated_cost), 0) as total_cost
       FROM llm_usage WHERE timestamp >= ?`,
      [since]
    );
    const t = totals[0] || { input_tokens: 0, output_tokens: 0, total_tokens: 0, total_cost: 0 };

    // By model
    const byModelRows = this.db.query<any>(
      `SELECT model,
              SUM(input_tokens) as input_tokens,
              SUM(output_tokens) as output_tokens,
              SUM(estimated_cost) as cost,
              COUNT(*) as calls
       FROM llm_usage WHERE timestamp >= ?
       GROUP BY model ORDER BY cost DESC`,
      [since]
    );
    const byModel: UsageSummary['byModel'] = {};
    for (const row of byModelRows) {
      byModel[row.model] = {
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        cost: row.cost,
        calls: row.calls,
      };
    }

    // By purpose
    const byPurposeRows = this.db.query<any>(
      `SELECT purpose,
              SUM(input_tokens) as input_tokens,
              SUM(output_tokens) as output_tokens,
              SUM(estimated_cost) as cost,
              COUNT(*) as calls
       FROM llm_usage WHERE timestamp >= ?
       GROUP BY purpose ORDER BY cost DESC`,
      [since]
    );
    const byPurpose: UsageSummary['byPurpose'] = {};
    for (const row of byPurposeRows) {
      byPurpose[row.purpose] = {
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        cost: row.cost,
        calls: row.calls,
      };
    }

    // Daily costs (last 30 days max)
    const dailyRows = this.db.query<any>(
      `SELECT date(timestamp) as date,
              SUM(estimated_cost) as cost,
              SUM(total_tokens) as tokens
       FROM llm_usage WHERE timestamp >= ?
       GROUP BY date(timestamp) ORDER BY date`,
      [since]
    );
    const dailyCosts = dailyRows.map(row => ({
      date: row.date,
      cost: row.cost,
      tokens: row.tokens,
    }));

    return {
      period,
      totalInputTokens: t.input_tokens,
      totalOutputTokens: t.output_tokens,
      totalTokens: t.total_tokens,
      totalCost: t.total_cost,
      byModel,
      byPurpose,
      dailyCosts,
    };
  }

  private getSinceDate(period: string): string {
    const now = new Date();
    switch (period) {
      case 'today':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      case 'all':
      default:
        return '1970-01-01T00:00:00.000Z';
    }
  }
}

// ── Singleton ──

let meteringService: MeteringService | null = null;

export function initMetering(db: DatabaseConnection): MeteringService {
  meteringService = new MeteringService(db);
  return meteringService;
}

export function getMetering(): MeteringService | null {
  return meteringService;
}
