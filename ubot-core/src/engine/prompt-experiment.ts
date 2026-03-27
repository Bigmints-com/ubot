/**
 * Prompt A/B Testing Framework
 * 
 * Compares system prompt variants by tracking tool routing accuracy.
 */

import { log } from '../logger/ring-buffer.js';
import type { DatabaseConnection } from '../data/database/types.js';

export interface PromptVariant {
  id: string;
  name: string;
  promptOverride: string;
  /** If true, appends to base prompt; if false, replaces it */
  isPartial: boolean;
}

export interface PromptExperiment {
  id: string;
  name: string;
  description: string;
  variants: PromptVariant[];
  /** Percentages, e.g. [50, 50] */
  trafficSplit: number[];
  active: boolean;
  createdAt: Date;
}

export interface ExperimentResult {
  experimentId: string;
  variantId: string;
  sessionId: string;
  toolCalls: number;
  toolSuccesses: number;
  toolFailures: number;
  responseTimeMs: number;
  timestamp: Date;
}

export class PromptExperimentManager {
  private db?: DatabaseConnection;

  constructor(db?: DatabaseConnection) {
    this.db = db;
    if (db) {
      this.initTables();
    }
  }

  private initTables() {
    if (!this.db) return;
    try {
      this.db.execute(`
        CREATE TABLE IF NOT EXISTS prompt_experiments (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          variants_json TEXT NOT NULL,
          traffic_split_json TEXT NOT NULL,
          active INTEGER DEFAULT 1,
          created_at TEXT NOT NULL
        )
      `);

      this.db.execute(`
        CREATE TABLE IF NOT EXISTS experiment_results (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          experiment_id TEXT NOT NULL,
          variant_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          tool_calls INTEGER DEFAULT 0,
          tool_successes INTEGER DEFAULT 0,
          tool_failures INTEGER DEFAULT 0,
          response_time_ms INTEGER DEFAULT 0,
          timestamp TEXT NOT NULL,
          FOREIGN KEY (experiment_id) REFERENCES prompt_experiments(id)
        )
      `);
    } catch (err: any) {
      log.error('ExperimentManager', `Failed to init tables: ${err.message}`);
    }
  }

  createExperiment(ex: Omit<PromptExperiment, 'createdAt'>): void {
    if (!this.db) return;
    try {
      this.db.execute(
        'INSERT INTO prompt_experiments (id, name, description, variants_json, traffic_split_json, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          ex.id,
          ex.name,
          ex.description,
          JSON.stringify(ex.variants),
          JSON.stringify(ex.trafficSplit),
          ex.active ? 1 : 0,
          new Date().toISOString()
        ]
      );
    } catch (err: any) {
      log.error('ExperimentManager', `Failed to create experiment: ${err.message}`);
    }
  }

  getActiveExperiment(): PromptExperiment | null {
    if (!this.db) return null;
    try {
      const row = this.db.queryOne<any>('SELECT * FROM prompt_experiments WHERE active = 1 LIMIT 1');
      if (!row) return null;

      return {
        id: row.id,
        name: row.name,
        description: row.description,
        variants: JSON.parse(row.variants_json),
        trafficSplit: JSON.parse(row.traffic_split_json),
        active: row.active === 1,
        createdAt: new Date(row.created_at)
      };
    } catch {
      return null;
    }
  }

  assignVariant(sessionId: string, experiment: PromptExperiment): PromptVariant {
    // Hash-based stable assignment
    let hash = 0;
    for (let i = 0; i < sessionId.length; i++) {
      hash = (hash * 31 + sessionId.charCodeAt(i)) % 100;
    }

    let cumulative = 0;
    for (let i = 0; i < experiment.trafficSplit.length; i++) {
      cumulative += experiment.trafficSplit[i];
      if (hash < cumulative) {
        return experiment.variants[i];
      }
    }
    return experiment.variants[0];
  }

  recordResult(res: Omit<ExperimentResult, 'timestamp'>): void {
    if (!this.db) return;
    try {
      this.db.execute(
        'INSERT INTO experiment_results (experiment_id, variant_id, session_id, tool_calls, tool_successes, tool_failures, response_time_ms, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          res.experimentId,
          res.variantId,
          res.sessionId,
          res.toolCalls,
          res.toolSuccesses,
          res.toolFailures,
          res.responseTimeMs,
          new Date().toISOString()
        ]
      );
    } catch (err: any) {
      log.error('ExperimentManager', `Failed to record result: ${err.message}`);
    }
  }

  deactivateExperiment(id: string): void {
    if (!this.db) return;
    this.db.execute('UPDATE prompt_experiments SET active = 0 WHERE id = ?', [id]);
  }

  getResults(experimentId: string): any[] {
    if (!this.db) return [];
    return this.db.query(`
      SELECT 
        variant_id, 
        COUNT(*) as total_turns,
        SUM(tool_calls) as total_tool_calls,
        SUM(tool_successes) as total_successes,
        SUM(tool_failures) as total_failures,
        AVG(response_time_ms) as avg_response_time
      FROM experiment_results 
      WHERE experiment_id = ?
      GROUP BY variant_id
    `, [experimentId]);
  }

  getAllExperiments(): any[] {
    if (!this.db) return [];
    return this.db.query('SELECT * FROM prompt_experiments ORDER BY created_at DESC');
  }
}

let manager: PromptExperimentManager | null = null;

export function initPromptExperiments(db: DatabaseConnection): PromptExperimentManager {
  manager = new PromptExperimentManager(db);
  return manager;
}

export function getPromptExperiments(): PromptExperimentManager | null {
  return manager;
}
