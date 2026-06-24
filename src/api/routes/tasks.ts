import http from 'http';
import { json, error, type ApiContext } from '../context.js';
import { authenticate } from '../middleware/auth.js';

export async function handleTasksRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
  ctx: ApiContext,
): Promise<boolean> {
  if (!url.startsWith('/api/tasks')) return false;

  const authResult = authenticate(req);
  if (!authResult.authenticated) {
    error(res, 'Authentication required', 401);
    return true;
  }

  // GET /api/tasks
  if (url === '/api/tasks' && method === 'GET') {
    try {
      const db = ctx.coreDb;
      if (!db) {
        error(res, 'Database not configured', 500);
        return true;
      }
      
      const client = db.get_client();
      
      // Get all task plans, order by newest
      const { data: plans, error: planError } = await client
        .from('youbot_task_plans')
        .select('*')
        .order('created_at', { ascending: false });

      if (planError) {
        throw new Error(planError.message);
      }
      
      const { data: steps, error: stepError } = await client
        .from('youbot_task_steps')
        .select('*');
        
      if (stepError) {
        throw new Error(stepError.message);
      }
      
      const planMap = (plans || []).map((p: any) => ({
        id: p.id,
        sessionId: p.session_id,
        originalRequest: p.original_request,
        status: p.status,
        createdAt: new Date(p.created_at),
        updatedAt: new Date(p.updated_at),
        steps: (steps || []).filter((s: any) => s.plan_id === p.id).map((s: any) => ({
          id: s.id,
          description: s.description,
          status: s.status,
          result: s.result,
          error: s.error,
        }))
      }));

      // Also get spawned sessions (subagents)
      const { data: spawned, error: spawnedError } = await client
        .from('youbot_spawned_sessions')
        .select('*')
        .order('start_time', { ascending: false });
        
      if (spawnedError) {
        throw new Error(spawnedError.message);
      }
      
      const spawnedMap = (spawned || []).map((s: any) => {
        const sStatus = s.status === 'running' ? 'executing' : s.status;
        return {
          id: s.id,
          sessionId: s.agent_id ? `${s.agent_id} (subagent)` : 'subagent',
          originalRequest: s.task,
          status: sStatus,
          createdAt: new Date(s.start_time),
          updatedAt: new Date(s.end_time || s.start_time),
          steps: [{
            id: `step-${s.id}`,
            description: s.task,
            status: sStatus,
            result: s.result,
            error: s.error,
          }]
        };
      });

      // Set CORS intentionally since this is an internal API
      res.setHeader('Access-Control-Allow-Origin', '*'); 
      json(res, { plans: [...planMap, ...spawnedMap].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) });
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  return false;
}
