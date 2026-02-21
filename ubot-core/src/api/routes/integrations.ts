/**
 * Integration Routes
 * /api/google/*, /api/saveaday/*, /api/antigravity/*
 */

import http from 'http';
import { parseBody, json, error, type ApiContext } from '../context.js';

export async function handleIntegrationRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
  ctx: ApiContext,
): Promise<boolean> {

  // ── Google Auth API ──────────────────────────────────
  if (url === '/api/google/auth/status' && method === 'GET') {
    try {
      const { getGoogleAuthStatus } = await import('../../integrations/google/auth.js');
      const status = getGoogleAuthStatus();
      json(res, status);
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  if (url === '/api/google/auth/start' && method === 'POST') {
    try {
      const { startGoogleAuth } = await import('../../integrations/google/auth.js');
      await startGoogleAuth();
      json(res, { success: true, message: 'Google authorization complete. Tokens saved.' });
    } catch (err: any) {
      error(res, `Google auth failed: ${err.message}`, 500);
    }
    return true;
  }

  if (url === '/api/google/auth/clear' && method === 'POST') {
    try {
      const { clearGoogleAuth } = await import('../../integrations/google/auth.js');
      await clearGoogleAuth();
      json(res, { success: true, message: 'Google auth cleared.' });
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  if (url === '/api/google/services/config' && method === 'GET') {
    try {
      const { getGoogleServicesConfig } = await import('../../integrations/google/auth.js');
      const services = getGoogleServicesConfig();
      json(res, { services });
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  if (url === '/api/google/services/config' && method === 'PUT') {
    try {
      const body = await parseBody(req) as any;
      const { saveGoogleServicesConfig } = await import('../../integrations/google/auth.js');
      const updated = await saveGoogleServicesConfig(body.services || {});
      json(res, { services: updated });
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  // ── SaveADay Auth API ──────────────────────────────────
  if (url === '/api/saveaday/auth/status' && method === 'GET') {
    try {
      const { getSaveADayAuthStatus } = await import('../../integrations/saveaday/auth.js');
      const status = getSaveADayAuthStatus();
      json(res, status);
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  if (url === '/api/saveaday/auth/connect' && method === 'POST') {
    try {
      const body = await parseBody(req) as any;
      if (!body.apiToken) {
        error(res, 'apiToken is required');
        return true;
      }
      const { saveSaveADayToken } = await import('../../integrations/saveaday/auth.js');
      const tokenData = await saveSaveADayToken(body.apiToken, body.baseUrl, body.tenantId);
      json(res, { success: true, ...tokenData, message: 'SaveADay connected successfully.' });
    } catch (err: any) {
      error(res, `SaveADay connection failed: ${err.message}`, 500);
    }
    return true;
  }

  if (url === '/api/saveaday/auth/clear' && method === 'POST') {
    try {
      const { clearSaveADayToken } = await import('../../integrations/saveaday/auth.js');
      await clearSaveADayToken();
      json(res, { success: true, message: 'SaveADay disconnected.' });
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  if (url === '/api/saveaday/services/config' && method === 'GET') {
    try {
      const { getSaveADayServicesConfig } = await import('../../integrations/saveaday/auth.js');
      const services = getSaveADayServicesConfig();
      json(res, { services });
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  if (url === '/api/saveaday/services/config' && method === 'PUT') {
    try {
      const body = await parseBody(req) as any;
      const { saveSaveADayServicesConfig } = await import('../../integrations/saveaday/auth.js');
      const updated = await saveSaveADayServicesConfig(body.services || {});
      json(res, { services: updated });
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  // ── Antigravity ─────────────────────────────────────────
  if (url === '/api/antigravity/check' && method === 'POST') {
    const body = await parseBody(req) as any;
    const searchPath = String(body.path || '~').replace(/^~/, process.env.HOME || '');
    try {
      const { ShellSkill } = await import('../../capabilities/skills/shell-skill.js');
      const sh = new ShellSkill({ timeout: 10000 });

      const stat = await sh.execute(`test -f "${searchPath}" && echo "file" || echo "dir"`);
      if (stat.stdout.trim() === 'file') {
        const content = await sh.execute(`cat "${searchPath}"`);
        json(res, { success: true, result: content.stdout, files: [searchPath] });
      } else {
        const find = await sh.execute(`find "${searchPath}" -maxdepth 3 \\( -name "*.yaml" -o -name "*.yml" \\) 2>/dev/null | head -20`);
        const allFiles = find.stdout.trim().split('\n').filter(Boolean);
        const queueFiles: string[] = [];
        for (const f of allFiles) {
          const check = await sh.execute(`grep -l "^queue:" "${f}" 2>/dev/null`);
          if (check.exitCode === 0 && check.stdout.trim()) queueFiles.push(f.trim());
        }
        if (queueFiles.length === 0) {
          json(res, { success: true, result: 'No queue files found.', files: [] });
        } else {
          const contents: Record<string, string> = {};
          for (const qf of queueFiles.slice(0, 5)) {
            const c = await sh.execute(`cat "${qf}"`);
            contents[qf] = c.stdout;
          }
          json(res, { success: true, files: queueFiles, contents });
        }
      }
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  if (url === '/api/antigravity/create' && method === 'POST') {
    const body = await parseBody(req) as any;
    const filePath = String(body.path || '').replace(/^~/, process.env.HOME || '');
    const prompts = body.prompts;
    if (!filePath || !prompts) { error(res, 'path and prompts are required'); return true; }
    try {
      const items = typeof prompts === 'string' ? JSON.parse(prompts) : prompts;
      let yaml = '# antigravity-batch prompt queue\n\nqueue:\n';
      for (const p of items) {
        yaml += `  - name: "${p.name}"\n    prompt: "${String(p.prompt).replace(/"/g, '\\"')}"\n\n`;
      }
      const { ShellSkill } = await import('../../capabilities/skills/shell-skill.js');
      const sh = new ShellSkill({ timeout: 5000 });
      await sh.execute(`mkdir -p "$(dirname "${filePath}")"`);
      const { writeFileSync } = await import('fs');
      writeFileSync(filePath, yaml, 'utf-8');
      json(res, { success: true, path: filePath, count: items.length });
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  if (url === '/api/antigravity/run' && method === 'POST') {
    const body = await parseBody(req) as any;
    const queueFile = String(body.queue_file || '').replace(/^~/, process.env.HOME || '');
    const workdir = String(body.workdir || '.').replace(/^~/, process.env.HOME || '');
    const dryRun = Boolean(body.dry_run);
    const approvalMode = String(body.approval_mode || 'yolo');
    const continueOnError = Boolean(body.continue_on_error);
    if (!queueFile) { error(res, 'queue_file is required'); return true; }
    try {
      const { ShellSkill } = await import('../../capabilities/skills/shell-skill.js');
      const sh = new ShellSkill({ timeout: 300000 });
      const parts = ['antigravity-batch', '--queue', `"${queueFile}"`, '--workdir', `"${workdir}"`, '--approval-mode', approvalMode];
      if (dryRun) parts.push('--dry-run');
      if (continueOnError) parts.push('--continue-on-error');
      const result = await sh.execute(parts.join(' '), { cwd: workdir });
      json(res, { success: result.exitCode === 0, output: result.stdout + '\n' + result.stderr, exitCode: result.exitCode });
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  if (url === '/api/antigravity/runs' && method === 'GET') {
    try {
      const { ShellSkill } = await import('../../capabilities/skills/shell-skill.js');
      const sh = new ShellSkill({ timeout: 5000 });
      const logDir = './runs';
      const check = await sh.execute(`test -d "${logDir}" && ls -1t "${logDir}"/run-*.log 2>/dev/null | head -10`);
      if (!check.stdout.trim()) {
        json(res, { runs: [] });
      } else {
        const files = check.stdout.trim().split('\n');
        const latest = await sh.execute(`cat "${files[0].trim()}"`);
        json(res, { runs: files.map(f => f.trim()), latestContent: latest.stdout });
      }
    } catch (err: any) {
      error(res, err.message, 500);
    }
    return true;
  }

  return false;
}
