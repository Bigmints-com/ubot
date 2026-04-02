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
  }

  async createExperiment(ex: Omit<PromptExperiment, 'createdAt'>): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.get_client().from('ubot_prompt_experiments').insert({
        id: ex.id,
        name: ex.name,
        description: ex.description,
        variants_json: JSON.stringify(ex.variants),
        traffic_split_json: JSON.stringify(ex.trafficSplit),
        active: ex.active ? 1 : 0,
        created_at: new Date().toISOString()
      });
    } catch (err: any) {
      log.error('ExperimentManager', `Failed to create experiment: ${err.message}`);
    }
  }

  async getActiveExperiment(): Promise<PromptExperiment | null> {
    if (!this.db) return null;
    try {
      const { data: row, error } = await this.db.get_client()
        .from('ubot_prompt_experiments')
        .select('*')
        .eq('active', 1)
        .limit(1)
        .single();
        
      if (error || !row) return null;

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

  async recordResult(res: Omit<ExperimentResult, 'timestamp'>): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.get_client().from('ubot_experiment_results').insert({
        experiment_id: res.experimentId,
        variant_id: res.variantId,
        session_id: res.sessionId,
        tool_calls: res.toolCalls,
        tool_successes: res.toolSuccesses,
        tool_failures: res.toolFailures,
        response_time_ms: res.responseTimeMs,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      log.error('ExperimentManager', `Failed to record result: ${err.message}`);
    }
  }

  async deactivateExperiment(id: string): Promise<void> {
    if (!this.db) return;
    await this.db.get_client().from('ubot_prompt_experiments').update({ active: 0 }).eq('id', id);
  }

  async getResults(experimentId: string): Promise<any[]> {
    if (!this.db) return [];
    
    // Supabase RPC or aggregate via PostgREST may be needed, but for now we mimic with RPC or manual
    const { data, error } = await this.db.get_client()
      .rpc('get_experiment_results_agg', { exp_id: experimentId });
      
    if (error) {
      log.error('ExperimentManager', `Failed to aggregate results: ${error.message}`);
      return [];
    }
    
    return data;
  }

  async getAllExperiments(): Promise<any[]> {
    if (!this.db) return [];
    const { data } = await this.db.get_client().from('ubot_prompt_experiments').select('*').order('created_at', { ascending: false });
    return data || [];
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
