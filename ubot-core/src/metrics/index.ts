/**
 * Metrics Collector
 *
 * Lightweight, in-memory metrics for tracking channel activity and tool usage.
 * Resets on process restart (operational metrics, not audit logs).
 */

import type { DatabaseConnection } from '../data/database/types.js';

// ── Types ───────────────────────────────────────────────

export interface ChannelMetrics {
  messagesIn: number;
  messagesOut: number;
  lastActivity: string | null;
}

export interface ToolMetrics {
  calls: number;
  errors: number;
  lastUsed: string | null;
  avgDuration?: number;
}

export interface MetricsSummary {
  uptime: number;
  startedAt: string;
  channels: Record<string, ChannelMetrics>;
  tools: Record<string, ToolMetrics>;
  totals: {
    messagesIn: number;
    messagesOut: number;
    toolCalls: number;
    toolErrors: number;
  };
}

// ── Collector ───────────────────────────────────────────

class MetricsCollector {
  private startedAt = new Date();
  private channels = new Map<string, ChannelMetrics>();
  private tools = new Map<string, ToolMetrics>();
  private db: DatabaseConnection | null = null;

  /**
   * Set database connection and initialize table.
   */
  setDatabase(db: DatabaseConnection): void {
    this.db = db;
    try {
      this.db.execute(`
        CREATE TABLE IF NOT EXISTS tool_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tool_name TEXT NOT NULL,
          success INTEGER NOT NULL,
          duration_ms INTEGER,
          timestamp TEXT DEFAULT (datetime('now')),
          session_id TEXT
        )
      `);
      this.db.execute('CREATE INDEX IF NOT EXISTS idx_tool_metrics_name ON tool_metrics(tool_name)');
      this.db.execute('CREATE INDEX IF NOT EXISTS idx_tool_metrics_ts ON tool_metrics(timestamp)');
      console.log('[Metrics] Persistent tool metrics initialized in SQLite');
    } catch (err: any) {
      console.error(`[Metrics] Failed to initialize SQLite metrics: ${err.message}`);
    }
  }

  /**
   * Record a channel message (in or out).
   */
  recordMessage(channel: string, direction: 'in' | 'out'): void {
    const key = channel.toLowerCase();
    let m = this.channels.get(key);
    if (!m) {
      m = { messagesIn: 0, messagesOut: 0, lastActivity: null };
      this.channels.set(key, m);
    }
    if (direction === 'in') m.messagesIn++;
    else m.messagesOut++;
    m.lastActivity = new Date().toISOString();
  }

  /**
   * Record a tool execution.
   */
  recordTool(toolName: string, success: boolean, durationMs?: number, sessionId?: string): void {
    // In-memory update
    let t = this.tools.get(toolName);
    if (!t) {
      t = { calls: 0, errors: 0, lastUsed: null };
      this.tools.set(toolName, t);
    }
    t.calls++;
    if (!success) t.errors++;
    t.lastUsed = new Date().toISOString();

    // SQLite update (fire-and-forget)
    if (this.db) {
      try {
        this.db.execute(
          'INSERT INTO tool_metrics (tool_name, success, duration_ms, session_id) VALUES (?, ?, ?, ?)',
          [toolName, success ? 1 : 0, durationMs || null, sessionId || null]
        );
      } catch (err: any) {
        // Log locally but don't crash
        console.error(`[Metrics] SQLite recordTool failed: ${err.message}`);
      }
    }
  }

  /**
   * Get historical metrics from SQLite.
   */
  async getHistoricalMetrics(hours: number = 24): Promise<Array<{ toolName: string, calls: number, errors: number, avgDuration: number }>> {
    if (!this.db) return [];
    
    try {
      const rows = this.db.query<any>(`
        SELECT 
          tool_name,
          COUNT(*) as calls,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as errors,
          AVG(duration_ms) as avgDuration
        FROM tool_metrics
        WHERE timestamp > datetime('now', ?)
        GROUP BY tool_name
        ORDER BY calls DESC
      `, [`-${hours} hours`]);

      return rows.map(r => ({
        toolName: r.tool_name,
        calls: r.calls,
        errors: r.errors,
        avgDuration: Math.round(r.avgDuration || 0)
      }));
    } catch (err: any) {
      console.error(`[Metrics] getHistoricalMetrics failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Get per-channel metrics.
   */
  getChannelMetrics(): Record<string, ChannelMetrics> {
    return Object.fromEntries(this.channels);
  }

  /**
   * Get per-tool metrics, optionally sorted by call count.
   */
  getToolMetrics(limit?: number): Record<string, ToolMetrics> {
    const sorted = [...this.tools.entries()].sort((a, b) => b[1].calls - a[1].calls);
    const entries = limit ? sorted.slice(0, limit) : sorted;
    return Object.fromEntries(entries);
  }

  /**
   * Get full summary with totals.
   */
  getSummary(): MetricsSummary {
    let messagesIn = 0, messagesOut = 0, toolCalls = 0, toolErrors = 0;
    for (const m of this.channels.values()) {
      messagesIn += m.messagesIn;
      messagesOut += m.messagesOut;
    }
    for (const t of this.tools.values()) {
      toolCalls += t.calls;
      toolErrors += t.errors;
    }
    return {
      uptime: Date.now() - this.startedAt.getTime(),
      startedAt: this.startedAt.toISOString(),
      channels: this.getChannelMetrics(),
      tools: this.getToolMetrics(),
      totals: { messagesIn, messagesOut, toolCalls, toolErrors },
    };
  }

  /**
   * Reset all metrics.
   */
  reset(): void {
    this.channels.clear();
    this.tools.clear();
    this.startedAt = new Date();
  }
}

// ── Singleton ───────────────────────────────────────────

export const metricsCollector = new MetricsCollector();
