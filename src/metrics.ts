/**
 * Metrics Collector
 *
 * Lightweight, in-memory metrics for tracking channel activity and tool usage.
 * Resets on process restart (operational metrics, not audit logs).
 */

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
  recordTool(toolName: string, success: boolean): void {
    let t = this.tools.get(toolName);
    if (!t) {
      t = { calls: 0, errors: 0, lastUsed: null };
      this.tools.set(toolName, t);
    }
    t.calls++;
    if (!success) t.errors++;
    t.lastUsed = new Date().toISOString();
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
