/**
 * CLI Tool Module
 *
 * Tools for running CLI coding assistants (Gemini CLI, Claude CLI, Codex CLI)
 * to build apps, run scripts, and perform development tasks.
 *
 * Gated behind config.cli.enabled — returns a clear message if disabled.
 */

import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from '../tools/types.js';
import { toolResult } from '../tools/types.js';
import { logCapability } from '../capabilities/cli/capability-log.js';
import { log } from '../logger/ring-buffer.js';

const CLI_TOOLS: ToolDefinition[] = [
  {
    name: 'cli_run',
    description: 'Start a CLI coding session to build or modify a project. Spawns an AI coding assistant (e.g. Gemini CLI) with the given prompt in a sandboxed workspace directory. Returns the session ID and initial status. Use cli_status to check progress.',
    parameters: [
      { name: 'prompt', type: 'string', description: 'The task prompt for the coding CLI (e.g. "Build a React landing page with a hero section and contact form")', required: true },
      { name: 'project_name', type: 'string', description: 'Optional project name — used as the working directory name. Defaults to auto-generated name.', required: false },
    ],
  },
  {
    name: 'cli_status',
    description: 'Check the status and output of a CLI coding session. Returns the latest output lines and whether the session is still running.',
    parameters: [
      { name: 'session_id', type: 'string', description: 'The session ID returned by cli_run', required: true },
      { name: 'from_line', type: 'number', description: 'Start reading output from this line number (0-based). Use to get incremental updates. Default: 0', required: false },
    ],
  },
  {
    name: 'cli_stop',
    description: 'Stop a running CLI coding session.',
    parameters: [
      { name: 'session_id', type: 'string', description: 'The session ID to stop', required: true },
    ],
  },
  {
    name: 'cli_list_sessions',
    description: 'List all CLI coding sessions with their status, provider, and project name.',
    parameters: [],
  },
  {
    name: 'cli_send_input',
    description: 'Send text input to a running CLI session (e.g. to answer prompts or provide feedback).',
    parameters: [
      { name: 'session_id', type: 'string', description: 'The session ID to send input to', required: true },
      { name: 'input', type: 'string', description: 'The text to send to the CLI session stdin', required: true },
    ],
  },
  {
    name: 'cli_test_module',
    description: 'Test a staged custom tool module before promoting it to live. Validates file existence, import, ToolModule interface conformance, and tool naming conventions. Use after cli_run generates a module in custom/staging/.',
    parameters: [
      { name: 'module_name', type: 'string', description: 'Name of the module directory in custom/staging/', required: true },
    ],
  },
  {
    name: 'cli_promote_module',
    description: 'Promote a tested custom module from staging to live. Copies from custom/staging/<name>/ to custom/modules/<name>/ and hot-reloads it into the running system. The module\'s tools become immediately available without restart.',
    parameters: [
      { name: 'module_name', type: 'string', description: 'Name of the module to promote', required: true },
    ],
  },
  {
    name: 'cli_list_modules',
    description: 'List all custom tool modules — both staged (in-progress) and live (active). Shows status and tool counts.',
    parameters: [],
  },
  {
    name: 'cli_triage',
    description: 'ALWAYS call this BEFORE cli_run. Evaluates whether a capability request is feasible, checks if existing tools already handle it, and routes to the right track (skill pipeline vs custom tool vs reject). Returns a verdict with reasoning.',
    parameters: [
      { name: 'request', type: 'string', description: 'The capability request to evaluate (e.g. "add weather checking", "auto-reply to emails")', required: true },
    ],
  },
  {
    name: 'cli_delete_module',
    description: 'Delete a custom module from staging, live, or both. Use for cleanup after failed builds or to remove unwanted capabilities.',
    parameters: [
      { name: 'module_name', type: 'string', description: 'Name of the module to delete', required: true },
      { name: 'target', type: 'string', description: 'Where to delete from: "staging", "live", or "both" (default: "both")', required: false },
    ],
  },
];

const cliToolModule: ToolModule = {
  name: 'cli',
  tools: CLI_TOOLS,
  register(registry: ToolRegistry, _ctx: ToolContext) {
    const lazyCliService = async () => {
      const { loadUbotConfig } = await import('../data/config.js');
      const config = loadUbotConfig();

      if (!config.cli?.enabled) {
        throw new Error('CLI capability is disabled. Enable it from Settings → CLI in the dashboard.');
      }

      const { getCliService } = await import('../capabilities/cli/service.js');
      return getCliService({
        provider: config.cli?.provider || 'gemini',
        workDir: config.cli?.workDir || 'custom/staging',
        timeout: config.cli?.timeout || 300000,
      });
    };

    // cli_run
    registry.register('cli_run', async (args) => {
      try {
        const service = await lazyCliService();
        const rawPrompt = String(args.prompt || '');
        if (!rawPrompt) return toolResult('cli_run', false, 'Missing "prompt" parameter');

        // Inject UBOT ToolModule context into the CLI agent's prompt
        const toolModuleContext = `
IMPORTANT: You are building a UBOT custom tool module, NOT a standalone application.

Your output MUST be a single TypeScript file at: index.ts (in the current directory)
The file must export a default object matching this interface:

  interface ToolModule {
    name: string;                    // Module name (e.g. "weather")
    tools: ToolDefinition[];         // Tool definitions for the LLM
    register(registry, ctx): void;   // Register tool executors
  }

  interface ToolDefinition {
    name: string;           // MUST start with "custom_" prefix
    description: string;    // Clear description for the LLM
    parameters: Array<{ name: string; type: 'string'|'number'|'boolean'; description: string; required: boolean }>;
  }

Each registered executor must return: { toolName: string, success: boolean, result: string, duration: number }

Import types: import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from '../../../src/tools/types.js';

If you need npm packages, use dynamic import() or child_process — do NOT create a package.json.
If you need API keys, read them from process.env.

Now build this capability:
`;
        const prompt = toolModuleContext + rawPrompt;

        const projectName = args.project_name ? String(args.project_name) : undefined;
        const session = await service.startSession(prompt, projectName);

        // Wire completion notification — inject a chat message when the session ends
        service.onComplete((completedSession) => {
          if (completedSession.id !== session.id) return;
          try {
            const agent = _ctx.getAgent();
            if (!agent) return;
            const store = agent.getConversationStore();
            const emoji = completedSession.status === 'completed' ? '✅' : '❌';
            const lastLines = completedSession.outputLines.slice(-5).join('\n');
            const duration = completedSession.endedAt && completedSession.startedAt
              ? Math.round((completedSession.endedAt.getTime() - completedSession.startedAt.getTime()) / 1000)
              : 0;
            const msg = `${emoji} **CLI session "${completedSession.projectName}" ${completedSession.status}** (${duration}s)\n\n` +
              `Provider: ${completedSession.provider} | Exit code: ${completedSession.exitCode}\n` +
              (lastLines ? `\`\`\`\n${lastLines}\n\`\`\`\n` : '') +
              (completedSession.status === 'completed' 
                ? `\n💡 You can now test it: ask me to run \`cli_test_module\` for "${completedSession.projectName}"`
                : `\n⚠️ The session failed. Check the output or retry.`);
            store.addMessage('web-console', 'assistant', msg, { source: 'cli-notification' });
            log.info('CLI', `Sent completion notification for "${completedSession.projectName}"`);
          } catch (err: any) {
            log.error('CLI', `Failed to send completion notification: ${err.message}`);
          }
        });

        return toolResult('cli_run', true, JSON.stringify({
          session_id: session.id,
          status: session.status,
          provider: session.provider,
          project_name: session.projectName,
          work_dir: session.workDir,
          message: `CLI session started with ${session.provider}. Use cli_status with session_id "${session.id}" to check progress.`,
        }));
      } catch (err: any) {
        return toolResult('cli_run', false, err.message);
      }
    });

    // cli_status
    registry.register('cli_status', async (args) => {
      try {
        const service = await lazyCliService();
        const sessionId = String(args.session_id || '');
        if (!sessionId) return toolResult('cli_status', false, 'Missing "session_id" parameter');

        const session = service.getSession(sessionId);
        if (!session) return toolResult('cli_status', false, `Session "${sessionId}" not found`);

        const fromLine = args.from_line ? Number(args.from_line) : 0;
        const output = service.getOutput(sessionId, fromLine);

        // Post-build validation: when session is done, check if index.ts was created
        let postBuildWarning = '';
        if (session.status === 'stopped' || session.exitCode !== undefined) {
          const { existsSync } = await import('fs');
          const indexPath = await import('path').then(p => p.join(session.workDir, 'index.ts'));
          if (!existsSync(indexPath)) {
            postBuildWarning = '\n⚠️ WARNING: No index.ts found in work directory. The CLI agent may have built a standalone app instead of a UBOT ToolModule. Check the output and consider retrying with clearer instructions.';
          }
        }

        return toolResult('cli_status', true, JSON.stringify({
          session_id: session.id,
          status: session.status,
          provider: session.provider,
          project_name: session.projectName,
          exit_code: session.exitCode,
          total_lines: session.outputLines.length,
          output_from_line: fromLine,
          output: output.join('\n'),
        }) + postBuildWarning);
      } catch (err: any) {
        return toolResult('cli_status', false, err.message);
      }
    });

    // cli_stop
    registry.register('cli_stop', async (args) => {
      try {
        const service = await lazyCliService();
        const sessionId = String(args.session_id || '');
        if (!sessionId) return toolResult('cli_stop', false, 'Missing "session_id" parameter');

        const stopped = service.stopSession(sessionId);
        if (!stopped) return toolResult('cli_stop', false, `Session "${sessionId}" not found`);

        return toolResult('cli_stop', true, `Session "${sessionId}" stopped.`);
      } catch (err: any) {
        return toolResult('cli_stop', false, err.message);
      }
    });

    // cli_list_sessions
    registry.register('cli_list_sessions', async () => {
      try {
        const service = await lazyCliService();
        const sessions = service.listSessions();

        return toolResult('cli_list_sessions', true, JSON.stringify(
          sessions.map(s => ({
            session_id: s.id,
            status: s.status,
            provider: s.provider,
            project_name: s.projectName,
            prompt: s.prompt.substring(0, 100),
            started_at: s.startedAt.toISOString(),
            ended_at: s.endedAt?.toISOString(),
          }))
        ));
      } catch (err: any) {
        return toolResult('cli_list_sessions', false, err.message);
      }
    });

    // cli_send_input
    registry.register('cli_send_input', async (args) => {
      try {
        const service = await lazyCliService();
        const sessionId = String(args.session_id || '');
        const input = String(args.input || '');
        if (!sessionId) return toolResult('cli_send_input', false, 'Missing "session_id" parameter');
        if (!input) return toolResult('cli_send_input', false, 'Missing "input" parameter');

        const sent = service.sendInput(sessionId, input + '\n');
        if (!sent) return toolResult('cli_send_input', false, `Session "${sessionId}" not found or not running`);

        return toolResult('cli_send_input', true, `Input sent to session "${sessionId}".`);
      } catch (err: any) {
        return toolResult('cli_send_input', false, err.message);
      }
    });

    // cli_test_module
    registry.register('cli_test_module', async (args) => {
      try {
        const moduleName = String(args.module_name || '');
        if (!moduleName) return toolResult('cli_test_module', false, 'Missing "module_name" parameter');

        const { testStagedModule } = await import('../capabilities/cli/test-pipeline.js');
        const result = await testStagedModule(moduleName);

        const summary = result.checks.map(c => 
          `${c.passed ? '✅' : '❌'} ${c.name}: ${c.message}`
        ).join('\n');

        logCapability({
          action: 'test',
          moduleName,
          testPassed: result.passed,
          testDetails: summary,
        });

        return toolResult('cli_test_module', result.passed,
          `Module "${moduleName}": ${result.passed ? 'ALL PASSED' : 'FAILED'}\n${summary}`
        );
      } catch (err: any) {
        return toolResult('cli_test_module', false, err.message);
      }
    });

    // cli_promote_module
    registry.register('cli_promote_module', async (args) => {
      try {
        const moduleName = String(args.module_name || '');
        if (!moduleName) return toolResult('cli_promote_module', false, 'Missing "module_name" parameter');

        // We need the registry and context for hot-reload
        const { promoteModule } = await import('../capabilities/cli/test-pipeline.js');
        const { createToolRegistry } = await import('../engine/tools.js');
        
        const result = await promoteModule(moduleName, registry as any, _ctx);
        logCapability({
          action: 'promote',
          moduleName,
          testPassed: result.success,
          testDetails: result.message,
        });
        return toolResult('cli_promote_module', result.success, result.message);
      } catch (err: any) {
        return toolResult('cli_promote_module', false, err.message);
      }
    });

    // cli_list_modules
    registry.register('cli_list_modules', async () => {
      try {
        const { listCustomModules } = await import('../capabilities/cli/test-pipeline.js');
        const { getLoadedModules } = await import('../capabilities/cli/custom-loader.js');
        const modules = listCustomModules();
        const loaded = getLoadedModules();
        const loadedMap = new Map(loaded.map(m => [m.name, m]));

        if (modules.length === 0) {
          return toolResult('cli_list_modules', true, 'No custom modules found. Use cli_run to generate one in custom/staging/.');
        }

        const summary = modules.map(m => {
          const info = loadedMap.get(m.name);
          const tools = info ? ` (${info.toolCount} tools: ${info.toolNames.join(', ')})` : '';
          return `• ${m.name} — ${m.status}${tools}`;
        }).join('\n');

        return toolResult('cli_list_modules', true, `${modules.length} custom module(s):\n${summary}`);
      } catch (err: any) {
        return toolResult('cli_list_modules', false, err.message);
      }
    });

    // cli_triage
    registry.register('cli_triage', async (args) => {
      try {
        const request = String(args.request || '');
        if (!request) return toolResult('cli_triage', false, 'Missing "request" parameter');

        const { getAllToolsWithModules } = await import('../tools/registry.js');
        const { getLoadedModules } = await import('../capabilities/cli/custom-loader.js');

        // Build context: all existing tools
        const allTools = getAllToolsWithModules();
        const customModules = getLoadedModules();
        const toolSummary = allTools.map(t => `${t.tool.name} (${t.module}): ${t.tool.description}`).join('\n');
        const customSummary = customModules.length > 0
          ? customModules.map(m => `${m.name}: ${m.toolNames.join(', ')}`).join('\n')
          : '(none)';

        // Use the agent's LLM to triage
        const agent = _ctx.getAgent();
        if (!agent) return toolResult('cli_triage', false, 'Agent not initialized');

        const triagePrompt = `You are a capability triage system for UBOT, a personal AI assistant. Evaluate this request and respond in EXACTLY this JSON format (no markdown, no code fences):

{"verdict": "exists|skill|tool|reject", "reason": "...", "existing_tools": ["tool_name"], "dependencies": ["npm_package_or_api_key"], "suggestion": "..."}

Verdict meanings:
- "exists": The system ALREADY has tools that can handle this request directly. No new code or skills needed. List the relevant tools in "existing_tools". The agent should just USE them.
- "skill": Can be done by composing EXISTING tools into an automated workflow pipeline (use create_skill with stages). No new code needed, but a new skill orchestrates the existing tools.
- "tool": Requires a genuinely NEW capability that no existing tool provides. Needs CLI code generation.
- "reject": Impossible, out of scope, or doesn't fit UBOT's ecosystem (UBOT is a personal assistant, not an app builder).

UBOT's architecture:
- Channels: WhatsApp, Telegram, Web chat
- Integrations: Google Workspace (Gmail, Drive, Calendar, Contacts, Sheets, Docs)
- Capabilities: Browser (Puppeteer), Scheduler, Skills Engine, Memory, File operations, Web search, CLI
- Custom modules can add new LLM-callable tools

Existing tools:
${toolSummary}

Existing custom modules:
${customSummary}

Request: "${request}"

Rules:
1. If existing tools ALREADY handle this directly → verdict: "exists", list the tools. Examples: "read a file" → file_read exists, "send email" → gmail_send exists, "search the web" → web_search exists.
2. If it needs COMBINING multiple existing tools in a repeatable automated workflow → verdict: "skill"
3. If it needs a genuinely NEW API/service/capability that no existing tool covers → verdict: "tool", list required dependencies
4. If it's building an app, website, or anything outside UBOT → verdict: "reject"
5. If physically impossible → verdict: "reject"
6. Be specific in suggestion about WHICH tools to use or HOW to implement it`;

        const result = await agent.generate(triagePrompt, '');
        
        // Try to parse the JSON response
        try {
          const jsonMatch = result.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const emojiMap: Record<string, string> = { exists: '✅', skill: '🔄', tool: '🔧', reject: '❌' };
            const emoji = emojiMap[parsed.verdict] || '❓';
            const tools = parsed.existing_tools?.length > 0 
              ? `\nExisting tools: ${parsed.existing_tools.join(', ')}` : '';
            const deps = parsed.dependencies?.length > 0
              ? `\nDependencies needed: ${parsed.dependencies.join(', ')}` : '';
            
            logCapability({
              action: 'triage',
              request,
              triageVerdict: parsed.verdict,
              triageReason: parsed.reason,
            });
            return toolResult('cli_triage', true, 
              `${emoji} Verdict: ${parsed.verdict.toUpperCase()}\n` +
              `Reason: ${parsed.reason}${tools}${deps}\n` +
              `Suggestion: ${parsed.suggestion}`
            );
          }
        } catch {}
        
        // Fallback: return raw response
        return toolResult('cli_triage', true, result);
      } catch (err: any) {
        return toolResult('cli_triage', false, err.message);
      }
    });

    // cli_delete_module
    registry.register('cli_delete_module', async (args) => {
      try {
        const moduleName = String(args.module_name || '');
        if (!moduleName) return toolResult('cli_delete_module', false, 'Missing "module_name" parameter');

        const target = String(args.target || 'both');
        const { deleteModule } = await import('../capabilities/cli/test-pipeline.js');
        const result = await deleteModule(moduleName, target as 'staging' | 'live' | 'both', registry as any);
        logCapability({
          action: 'delete',
          moduleName,
          testPassed: result.success,
          testDetails: result.message,
        });
        return toolResult('cli_delete_module', result.success, result.message);
      } catch (err: any) {
        return toolResult('cli_delete_module', false, err.message);
      }
    });
  },
};

export default cliToolModule;
