/**
 * Task Plan Store
 * 
 * Persistence for complex task plans and their step execution status.
 */

import { log } from '../logger/ring-buffer.js';
import type { DatabaseConnection, Migration } from '../data/database/types.js';
import type { TaskPlan, TaskStep } from './task-planner.js';

/** Migration for task plans and steps */
export const planMigrations: Migration[] = [
  {
    id: '012',
    name: 'create_plans_and_steps',
    up: `
      CREATE TABLE IF NOT EXISTS task_plans (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        original_request TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS task_steps (
        id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        description TEXT NOT NULL,
        agent_type TEXT NOT NULL,
        depends_on TEXT, -- Comma-separated step IDs
        status TEXT NOT NULL,
        prompt TEXT,
        result TEXT,
        error TEXT,
        PRIMARY KEY (id, plan_id),
        FOREIGN KEY (plan_id) REFERENCES task_plans(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_plans_session ON task_plans(session_id);
    `,
    down: `
      DROP TABLE IF EXISTS task_steps;
      DROP TABLE IF EXISTS task_plans;
    `,
  },
];

export function saveTaskPlan(sessionId: string, plan: TaskPlan, db: DatabaseConnection): void {
  try {
    db.transaction(() => {
      db.execute(
        'INSERT OR REPLACE INTO task_plans (id, session_id, original_request, status, created_at) VALUES (?, ?, ?, ?, ?)',
        [plan.id, sessionId, plan.originalRequest, plan.status, plan.createdAt.toISOString()]
      );

      // Delete existing steps for this plan before re-inserting
      db.execute('DELETE FROM task_steps WHERE plan_id = ?', [plan.id]);

      for (const step of plan.steps) {
        db.execute(
          'INSERT INTO task_steps (id, plan_id, description, agent_type, depends_on, status, prompt, result, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            step.id,
            plan.id,
            step.description,
            step.agentType,
            step.dependsOn.join(','),
            step.status,
            step.prompt || null,
            step.result || null,
            step.error || null
          ]
        );
      }
    });
    log.info('PlanStore', `Saved plan ${plan.id} with ${plan.steps.length} steps`);
  } catch (err: any) {
    log.error('PlanStore', `Failed to save task plan: ${err.message}`);
    throw err;
  }
}

export function getTaskPlan(planId: string, db: DatabaseConnection): TaskPlan | null {
  try {
    const row = db.queryOne<any>('SELECT * FROM task_plans WHERE id = ?', [planId]);
    if (!row) return null;

    const stepRows = db.query<any>('SELECT * FROM task_steps WHERE plan_id = ?', [planId]);
    const steps: TaskStep[] = stepRows.map(s => ({
      id: s.id,
      description: s.description,
      agentType: s.agent_type,
      dependsOn: s.depends_on ? s.depends_on.split(',') : [],
      status: s.status as TaskStep['status'],
      prompt: s.prompt || undefined,
      result: s.result || undefined,
      error: s.error || undefined
    }));

    return {
      id: row.id,
      sessionId: row.session_id,
      originalRequest: row.original_request,
      steps,
      createdAt: new Date(row.created_at),
      status: row.status as TaskPlan['status']
    };
  } catch (err: any) {
    log.error('PlanStore', `Failed to get task plan: ${err.message}`);
    return null;
  }
}

export function getActivePlan(sessionId: string, db: DatabaseConnection): TaskPlan | null {
  try {
    const row = db.queryOne<any>(
      'SELECT id FROM task_plans WHERE session_id = ? AND status IN (?, ?) ORDER BY created_at DESC LIMIT 1',
      [sessionId, 'planning', 'executing']
    );
    if (!row) return null;
    return getTaskPlan(row.id, db);
  } catch (err: any) {
    log.error('PlanStore', `Failed to get active plan for session ${sessionId}: ${err.message}`);
    return null;
  }
}

export function updateStepStatus(
  planId: string, 
  stepId: string, 
  status: TaskStep['status'], 
  result?: string, 
  error?: string, 
  db?: DatabaseConnection
): void {
  if (!db) return;
  try {
    db.execute(
      'UPDATE task_steps SET status = ?, result = ?, error = ? WHERE plan_id = ? AND id = ?',
      [status, result || null, error || null, planId, stepId]
    );
  } catch (err: any) {
    log.error('PlanStore', `Failed to update step status: ${err.message}`);
  }
}

export function updatePlanStatus(planId: string, status: TaskPlan['status'], db: DatabaseConnection): void {
  try {
    db.execute('UPDATE task_plans SET status = ? WHERE id = ?', [status, planId]);
  } catch (err: any) {
    log.error('PlanStore', `Failed to update plan status: ${err.message}`);
  }
}
