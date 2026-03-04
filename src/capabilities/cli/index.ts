/**
 * CLI Agents Capability
 * 
 * Run CLI coding assistants (Gemini/Claude/Codex) and manage custom tool modules.
 */
import type { ToolModule } from '../../tools/types.js';
import cliTools from './tools.js';
import execTools from './exec-tools.js';

export const toolModules: ToolModule[] = [cliTools, execTools];
