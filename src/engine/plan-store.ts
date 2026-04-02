/**
 * Task Plan Store
 * 
 * Persistence for complex task plans and their step execution status.
 */

import { log } from '../logger/ring-buffer.js';
import type { DatabaseConnection } from '../data/database/types.js';
import type { TaskPlan, TaskStep } from './task-planner.js';

export async function saveTaskPlan(sessionId: string, plan: TaskPlan, db: DatabaseConnection): Promise<void> {
  try {
    const client = db.get_client();
    
    await client.from('ubot_task_plans').upsert({
      id: plan.id,
      session_id: sessionId,
      original_request: plan.originalRequest,
      status: plan.status,
      created_at: plan.createdAt.toISOString()
    });

    await client.from('ubot_task_steps').delete().eq('plan_id', plan.id);

    if (plan.steps.length > 0) {
      const stepRows = plan.steps.map(step => ({
        id: step.id,
        plan_id: plan.id,
        description: step.description,
        agent_type: step.agentType,
        depends_on: step.dependsOn.join(','),
        status: step.status,
        prompt: step.prompt || null,
        result: step.result || null,
        error: step.error || null
      }));
      await client.from('ubot_task_steps').insert(stepRows);
    }

    log.info('PlanStore', `Saved plan ${plan.id} with ${plan.steps.length} steps in Supabase`);
  } catch (err: any) {
    log.error('PlanStore', `Failed to save task plan: ${err.message}`);
    throw err;
  }
}

export async function getTaskPlan(planId: string, db: DatabaseConnection): Promise<TaskPlan | null> {
  try {
    const client = db.get_client();
    
    const { data: row, error: planError } = await client
      .from('ubot_task_plans')
      .select('*')
      .eq('id', planId)
      .single();
      
    if (planError || !row) return null;

    const { data: stepRows, error: stepsError } = await client
      .from('ubot_task_steps')
      .select('*')
      .eq('plan_id', planId);
      
    if (stepsError || !stepRows) return null;

    const steps: TaskStep[] = stepRows.map((s: any) => ({
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

export async function getActivePlan(sessionId: string, db: DatabaseConnection): Promise<TaskPlan | null> {
  try {
    const client = db.get_client();
    
    const { data: row, error } = await client
      .from('ubot_task_plans')
      .select('id')
      .eq('session_id', sessionId)
      .in('status', ['planning', 'executing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
      
    if (error || !row) return null;
    return await getTaskPlan(row.id, db);
  } catch (err: any) {
    log.error('PlanStore', `Failed to get active plan for session ${sessionId}: ${err.message}`);
    return null;
  }
}

export async function updateStepStatus(
  planId: string, 
  stepId: string, 
  status: TaskStep['status'], 
  result?: string, 
  error?: string, 
  db?: DatabaseConnection
): Promise<void> {
  if (!db) return;
  try {
    await db.get_client()
      .from('ubot_task_steps')
      .update({
        status,
        result: result || null,
        error: error || null
      })
      .eq('plan_id', planId)
      .eq('id', stepId);
  } catch (err: any) {
    log.error('PlanStore', `Failed to update step status: ${err.message}`);
  }
}

export async function updatePlanStatus(planId: string, status: TaskPlan['status'], db: DatabaseConnection): Promise<void> {
  try {
    await db.get_client()
      .from('ubot_task_plans')
      .update({ status })
      .eq('id', planId);
  } catch (err: any) {
    log.error('PlanStore', `Failed to update plan status: ${err.message}`);
  }
}
