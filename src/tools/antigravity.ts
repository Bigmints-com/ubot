/**
 * Antigravity Tool Module
 *
 * Tools for managing and executing Gemini CLI prompt queues.
 * Integrates the `antigravity-batch` CLI as a ubot tool module.
 */

import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from '../tools/types.js';
import { ShellSkill } from '../capabilities/skills/shell-skill.js';

const shell = new ShellSkill({ timeout: 300_000 }); // 5 min timeout for long runs

const ANTIGRAVITY_TOOLS: ToolDefinition[] = [
  {
    name: 'antigravity_check_queue',
    description: 'Find and display antigravity prompt queue YAML files. Shows the contents of queue files so you can see what prompts are scheduled.',
    parameters: [
      { name: 'path', type: 'string', description: 'Path to a specific queue YAML file, or a directory to search in. Defaults to the user home directory.', required: false },
    ],
  },
  {
    name: 'antigravity_create_queue',
    description: 'Create a new antigravity prompt queue YAML file. Each queue item has a name and a prompt that will be sent to Gemini CLI.',
    parameters: [
      { name: 'path', type: 'string', description: 'File path for the new queue YAML file', required: true },
      { name: 'prompts', type: 'string', description: 'JSON array of prompt objects, each with "name" and "prompt" fields. Example: [{"name":"Analyze code","prompt":"Explain the architecture"}]', required: true },
    ],
  },
  {
    name: 'antigravity_run_queue',
    description: 'Execute an antigravity prompt queue. Runs each prompt sequentially via Gemini CLI without manual intervention.',
    parameters: [
      { name: 'queue_file', type: 'string', description: 'Path to the queue YAML file to execute', required: true },
      { name: 'workdir', type: 'string', description: 'Working directory for Gemini CLI execution', required: false },
      { name: 'dry_run', type: 'boolean', description: 'If true, preview prompts without executing them', required: false },
      { name: 'approval_mode', type: 'string', description: 'Approval mode: "yolo" (fully automated), "auto_edit" (auto edits, manual shell), or "default"', required: false },
      { name: 'continue_on_error', type: 'boolean', description: 'If true, continue executing even if a prompt fails', required: false },
    ],
  },
  {
    name: 'antigravity_list_runs',
    description: 'List past antigravity batch run logs, showing timestamps and results of previous queue executions.',
    parameters: [
      { name: 'log_dir', type: 'string', description: 'Directory containing run logs. Defaults to ./runs/', required: false },
      { name: 'show_content', type: 'boolean', description: 'If true, show the content of the most recent run log', required: false },
    ],
  },
];

const antigravityToolModule: ToolModule = {
  name: 'antigravity',
  tools: ANTIGRAVITY_TOOLS,
  register(registry: ToolRegistry, _ctx: ToolContext) {

    // ─── Check Queue ──────────────────────────────────────────────────────────
    registry.register('antigravity_check_queue', async (args) => {
      const searchPath = String(args.path || '~');
      const expanded = searchPath.replace(/^~/, process.env.HOME || '');

      try {
        // Check if it's a specific file
        const statResult = await shell.execute(`test -f "${expanded}" && echo "file" || echo "dir"`);
        const isFile = statResult.stdout.trim() === 'file';

        if (isFile) {
          const content = await shell.execute(`cat "${expanded}"`);
          return {
            toolName: 'antigravity_check_queue',
            success: true,
            result: `**Queue file: ${expanded}**\n\n\`\`\`yaml\n${content.stdout}\`\`\``,
            duration: 0,
          };
        }

        // Search for queue YAML files
        const findResult = await shell.execute(
          `find "${expanded}" -maxdepth 3 -name "*.yaml" -o -name "*.yml" 2>/dev/null | head -20`
        );

        if (!findResult.stdout.trim()) {
          return {
            toolName: 'antigravity_check_queue',
            success: true,
            result: `No queue YAML files found in ${searchPath}. You can create one with the \`antigravity_create_queue\` tool.`,
            duration: 0,
          };
        }

        // Filter for files that look like queue files (contain "queue:")
        const files = findResult.stdout.trim().split('\n');
        const queueFiles: string[] = [];

        for (const file of files) {
          const check = await shell.execute(`grep -l "^queue:" "${file}" 2>/dev/null`);
          if (check.exitCode === 0 && check.stdout.trim()) {
            queueFiles.push(file.trim());
          }
        }

        if (queueFiles.length === 0) {
          return {
            toolName: 'antigravity_check_queue',
            success: true,
            result: `Found ${files.length} YAML files in ${searchPath}, but none are antigravity queue files (missing \`queue:\` key). Create one with \`antigravity_create_queue\`.`,
            duration: 0,
          };
        }

        // Show contents of found queue files
        const results: string[] = [];
        for (const qf of queueFiles.slice(0, 5)) {
          const content = await shell.execute(`cat "${qf}"`);
          results.push(`**${qf}**\n\`\`\`yaml\n${content.stdout}\`\`\``);
        }

        return {
          toolName: 'antigravity_check_queue',
          success: true,
          result: `Found ${queueFiles.length} queue file(s):\n\n${results.join('\n\n')}`,
          duration: 0,
        };
      } catch (err: any) {
        return { toolName: 'antigravity_check_queue', success: false, error: err.message, duration: 0 };
      }
    });

    // ─── Create Queue ─────────────────────────────────────────────────────────
    registry.register('antigravity_create_queue', async (args) => {
      const filePath = String(args.path || '');
      const promptsStr = String(args.prompts || '[]');

      if (!filePath) {
        return { toolName: 'antigravity_create_queue', success: false, error: 'Missing required parameter: path', duration: 0 };
      }

      try {
        const prompts = JSON.parse(promptsStr);
        if (!Array.isArray(prompts) || prompts.length === 0) {
          return { toolName: 'antigravity_create_queue', success: false, error: 'prompts must be a non-empty JSON array of {name, prompt} objects', duration: 0 };
        }

        // Build YAML content
        let yaml = '# antigravity-batch prompt queue\n\nqueue:\n';
        for (const p of prompts) {
          const name = String(p.name || 'Untitled');
          const prompt = String(p.prompt || '');
          yaml += `  - name: "${name}"\n`;
          yaml += `    prompt: "${prompt.replace(/"/g, '\\"')}"\n\n`;
        }

        // Write the file
        const expanded = filePath.replace(/^~/, process.env.HOME || '');
        await shell.execute(`mkdir -p "$(dirname "${expanded}")"`);
        await shell.execute(`cat > "${expanded}" << 'QUEUE_EOF'\n${yaml}QUEUE_EOF`);

        return {
          toolName: 'antigravity_create_queue',
          success: true,
          result: `Created queue file at **${expanded}** with ${prompts.length} prompt(s):\n\n${prompts.map((p: any, i: number) => `${i + 1}. **${p.name}** — ${p.prompt.slice(0, 80)}${p.prompt.length > 80 ? '...' : ''}`).join('\n')}\n\nRun it with: \`antigravity_run_queue\``,
          duration: 0,
        };
      } catch (err: any) {
        return { toolName: 'antigravity_create_queue', success: false, error: `Failed to create queue: ${err.message}`, duration: 0 };
      }
    });

    // ─── Run Queue ────────────────────────────────────────────────────────────
    registry.register('antigravity_run_queue', async (args) => {
      const queueFile = String(args.queue_file || '');
      const workdir = String(args.workdir || '.');
      const dryRun = Boolean(args.dry_run);
      const approvalMode = String(args.approval_mode || 'yolo');
      const continueOnError = Boolean(args.continue_on_error);

      if (!queueFile) {
        return { toolName: 'antigravity_run_queue', success: false, error: 'Missing required parameter: queue_file', duration: 0 };
      }

      // Check if antigravity-batch CLI is available
      const whichResult = await shell.execute('which antigravity-batch 2>/dev/null');
      if (whichResult.exitCode !== 0) {
        return {
          toolName: 'antigravity_run_queue',
          success: false,
          error: 'antigravity-batch CLI not found. Install it from .agents/skills/antigravity/scripts/antigravity-batch to ~/.local/bin/',
          duration: 0,
        };
      }

      // Build command
      const parts = ['antigravity-batch'];
      parts.push('--queue', `"${queueFile}"`);
      parts.push('--workdir', `"${workdir}"`);
      parts.push('--approval-mode', approvalMode);
      if (dryRun) parts.push('--dry-run');
      if (continueOnError) parts.push('--continue-on-error');

      const cmd = parts.join(' ');

      try {
        const result = await shell.execute(cmd, { cwd: workdir });
        const output = (result.stdout + '\n' + result.stderr).trim();

        return {
          toolName: 'antigravity_run_queue',
          success: result.exitCode === 0,
          result: result.exitCode === 0
            ? `Queue execution ${dryRun ? 'preview' : 'completed'}:\n\n${output}`
            : `Queue execution failed (exit ${result.exitCode}):\n\n${output}`,
          duration: 0,
        };
      } catch (err: any) {
        return { toolName: 'antigravity_run_queue', success: false, error: err.message, duration: 0 };
      }
    });

    // ─── List Runs ────────────────────────────────────────────────────────────
    registry.register('antigravity_list_runs', async (args) => {
      const logDir = String(args.log_dir || './runs');
      const showContent = Boolean(args.show_content);
      const expanded = logDir.replace(/^~/, process.env.HOME || '');

      try {
        const dirCheck = await shell.execute(`test -d "${expanded}" && echo "exists" || echo "missing"`);
        if (dirCheck.stdout.trim() === 'missing') {
          return {
            toolName: 'antigravity_list_runs',
            success: true,
            result: `No runs directory found at ${logDir}. Run a queue first to generate logs.`,
            duration: 0,
          };
        }

        const listResult = await shell.execute(`ls -1t "${expanded}"/run-*.log 2>/dev/null | head -10`);
        if (!listResult.stdout.trim()) {
          return {
            toolName: 'antigravity_list_runs',
            success: true,
            result: `No run logs found in ${logDir}.`,
            duration: 0,
          };
        }

        const files = listResult.stdout.trim().split('\n');
        let result = `Found ${files.length} run log(s) (most recent first):\n\n`;
        result += files.map((f: string, i: number) => `${i + 1}. \`${f.trim()}\``).join('\n');

        if (showContent && files.length > 0) {
          const latest = files[0].trim();
          const content = await shell.execute(`cat "${latest}"`);
          result += `\n\n---\n**Latest run log (${latest}):**\n\n\`\`\`\n${content.stdout}\`\`\``;
        }

        return { toolName: 'antigravity_list_runs', success: true, result, duration: 0 };
      } catch (err: any) {
        return { toolName: 'antigravity_list_runs', success: false, error: err.message, duration: 0 };
      }
    });
  },
};

export default antigravityToolModule;
