/**
 * Filesystem Tool Module
 *
 * Provides sandboxed file operations (read, write, list, delete).
 * All operations are restricted to the UBOT_HOME/workspace directory
 * via the WorkspaceGuard in the SafetyService.
 */

import fs from 'fs/promises';
import path from 'path';
import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from './types.js';
import { getSafetyService } from '../safety/service.js';

const FILES_TOOLS: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file in the workspace.',
    parameters: [
      { name: 'path', type: 'string', description: 'Relative path to the file within the workspace', required: true },
    ],
  },
  {
    name: 'write_file',
    description: 'Write or overwrite a file in the workspace. Automatically creates parent directories.',
    parameters: [
      { name: 'path', type: 'string', description: 'Relative path to the file within the workspace', required: true },
      { name: 'content', type: 'string', description: 'The text content to write', required: true },
    ],
  },
  {
    name: 'list_files',
    description: 'List files and directories in a workspace folder.',
    parameters: [
      { name: 'path', type: 'string', description: 'Relative path to the directory (empty for workspace root)', required: false },
    ],
  },
  {
    name: 'delete_file',
    description: 'Delete a file or directory in the workspace.',
    parameters: [
      { name: 'path', type: 'string', description: 'Relative path to the file or directory', required: true },
    ],
  },
];

const filesToolModule: ToolModule = {
  name: 'files',
  tools: FILES_TOOLS,
  register(registry: ToolRegistry, ctx: ToolContext) {
    const safety = getSafetyService();
    const workspaceRoot = ctx.getWorkspacePath();

    if (!workspaceRoot) {
      console.warn('[FilesTool] Workspace root not defined. Filesystem tools will be disabled.');
      return;
    }

    // ─── read_file ───────────────────────────────────────────────────────────
    registry.register('read_file', async (args) => {
      const targetPath = String(args.path || '');
      try {
        const safePath = safety.validatePath(targetPath, workspaceRoot);
        const content = await fs.readFile(safePath, 'utf8');
        return {
          toolName: 'read_file',
          success: true,
          result: content,
          duration: 0,
        };
      } catch (err: any) {
        return {
          toolName: 'read_file',
          success: false,
          error: err.message,
          duration: 0,
        };
      }
    });

    // ─── write_file ──────────────────────────────────────────────────────────
    registry.register('write_file', async (args) => {
      const targetPath = String(args.path || '');
      const content = String(args.content || '');
      try {
        const safePath = safety.validatePath(targetPath, workspaceRoot);
        
        // Ensure parent directory exists
        await fs.mkdir(path.dirname(safePath), { recursive: true });
        
        await fs.writeFile(safePath, content, 'utf8');
        return {
          toolName: 'write_file',
          success: true,
          result: `Successfully wrote to ${targetPath}`,
          duration: 0,
        };
      } catch (err: any) {
        return {
          toolName: 'write_file',
          success: false,
          error: err.message,
          duration: 0,
        };
      }
    });

    // ─── list_files ──────────────────────────────────────────────────────────
    registry.register('list_files', async (args) => {
      const targetPath = String(args.path || '');
      try {
        const safePath = safety.validatePath(targetPath, workspaceRoot);
        const entries = await fs.readdir(safePath, { withFileTypes: true });
        
        const result = entries.map(e => `${e.isDirectory() ? '[DIR] ' : '[FILE]'} ${e.name}`).join('\n');
        return {
          toolName: 'list_files',
          success: true,
          result: result || '(empty directory)',
          duration: 0,
        };
      } catch (err: any) {
        return {
          toolName: 'list_files',
          success: false,
          error: err.message,
          duration: 0,
        };
      }
    });

    // ─── delete_file ─────────────────────────────────────────────────────────
    registry.register('delete_file', async (args) => {
      const targetPath = String(args.path || '');
      try {
        const safePath = safety.validatePath(targetPath, workspaceRoot);
        const stats = await fs.stat(safePath);
        
        if (stats.isDirectory()) {
          await fs.rm(safePath, { recursive: true, force: true });
        } else {
          await fs.unlink(safePath);
        }
        
        return {
          toolName: 'delete_file',
          success: true,
          result: `Successfully deleted ${targetPath}`,
          duration: 0,
        };
      } catch (err: any) {
        return {
          toolName: 'delete_file',
          success: false,
          error: err.message,
          duration: 0,
        };
      }
    });
  },
};

export default filesToolModule;
