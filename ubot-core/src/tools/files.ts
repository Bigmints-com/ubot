/**
 * Filesystem Tool Module
 *
 * Provides file operations (read, write, list, delete).
 * Operations are allowed in:
 *   1. The UBOT_HOME/workspace directory (always)
 *   2. Any path listed in config.filesystem.allowed_paths
 *
 * Paths in allowed_paths support ~ expansion (e.g. ~/Documents).
 */

import fs from 'fs/promises';
import path from 'path';
import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from './types.js';
import { getSafetyService } from '../safety/service.js';
import { loadUbotConfig } from '../data/config.js';

/** Build the descriptions with actual allowed paths listed */
function getToolDescriptions(): ToolDefinition[] {
  const paths = loadUbotConfig().filesystem?.allowed_paths || [];
  const pathList = paths.length > 0 
    ? `Allowed directories: workspace (always), ${paths.join(', ')}` 
    : 'Only the workspace directory is accessible.';

  return [
    {
      name: 'read_file',
      description: `Read the contents of a file. Use absolute paths for non-workspace files. ${pathList}`,
      parameters: [
        { name: 'path', type: 'string', description: 'File path — relative (workspace) or absolute (allowed directories)', required: true },
      ],
    },
    {
      name: 'write_file',
      description: `Write or overwrite a file. Creates parent directories automatically. ${pathList}`,
      parameters: [
        { name: 'path', type: 'string', description: 'File path — relative (workspace) or absolute (allowed directories)', required: true },
        { name: 'content', type: 'string', description: 'The text content to write', required: true },
      ],
    },
    {
      name: 'list_files',
      description: `List files and directories with sizes. ${pathList}`,
      parameters: [
        { name: 'path', type: 'string', description: 'Directory path — absolute to browse allowed dirs (e.g. /Users/pretheesh/Desktop), or relative for workspace. Empty for workspace root.', required: false },
      ],
    },
    {
      name: 'delete_file',
      description: `Delete a file or directory. ${pathList}`,
      parameters: [
        { name: 'path', type: 'string', description: 'File/directory path — relative (workspace) or absolute (allowed directories)', required: true },
      ],
    },
    {
      name: 'search_files',
      description: `Search for files by name pattern (e.g. *.pdf, report*). ${pathList}`,
      parameters: [
        { name: 'pattern', type: 'string', description: 'Filename pattern to search for (e.g. "*.pdf", "report")', required: true },
        { name: 'path', type: 'string', description: 'Directory to search in (default: workspace root)', required: false },
        { name: 'max_depth', type: 'number', description: 'Max directory depth to search (default: 3)', required: false },
      ],
    },
  ];
}

/** Resolve allowed paths from config, expanding ~ */
function getAllowedPaths(): string[] {
  const config = loadUbotConfig();
  const paths = config.filesystem?.allowed_paths || [];
  return paths.map(p => 
    p.startsWith('~') ? path.join(process.env.HOME || '', p.slice(1)) : p
  );
}

/** Simple glob-style filename matching */
function matchesPattern(filename: string, pattern: string): boolean {
  const regex = new RegExp(
    '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
    'i'
  );
  return regex.test(filename);
}

/** Recursively search for files matching a pattern */
async function searchDir(dir: string, pattern: string, maxDepth: number, currentDepth: number = 0): Promise<string[]> {
  if (currentDepth > maxDepth) return [];
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.name.startsWith('.')) continue; // skip hidden
      if (matchesPattern(entry.name, pattern)) {
        results.push(fullPath);
      }
      if (entry.isDirectory() && currentDepth < maxDepth) {
        results.push(...await searchDir(fullPath, pattern, maxDepth, currentDepth + 1));
      }
    }
  } catch { /* skip inaccessible dirs */ }
  return results;
}

const filesToolModule: ToolModule = {
  name: 'files',
  get tools() { return getToolDescriptions(); },
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
        const safePath = safety.validatePathWithAllowedPaths(targetPath, workspaceRoot, getAllowedPaths());
        const content = await fs.readFile(safePath, 'utf8');
        return {
          toolName: 'read_file',
          success: true,
          result: content.length > 50000 ? content.slice(0, 50000) + '\n\n... (truncated, file is too large)' : content,
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
        const safePath = safety.validatePathWithAllowedPaths(targetPath, workspaceRoot, getAllowedPaths());
        
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
        const safePath = safety.validatePathWithAllowedPaths(targetPath || '.', workspaceRoot, getAllowedPaths());
        const entries = await fs.readdir(safePath, { withFileTypes: true });
        
        const items = await Promise.all(entries.map(async (e) => {
          try {
            const fullPath = path.join(safePath, e.name);
            const stats = await fs.stat(fullPath);
            const size = stats.isFile() ? ` (${formatSize(stats.size)})` : '';
            return `${e.isDirectory() ? '📁' : '📄'} ${e.name}${size}`;
          } catch {
            return `${e.isDirectory() ? '📁' : '📄'} ${e.name}`;
          }
        }));
        
        return {
          toolName: 'list_files',
          success: true,
          result: items.length > 0 
            ? `${safePath}\n\n${items.join('\n')}` 
            : `${safePath}\n\n(empty directory)`,
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
        const safePath = safety.validatePathWithAllowedPaths(targetPath, workspaceRoot, getAllowedPaths());
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

    // ─── search_files ────────────────────────────────────────────────────────
    registry.register('search_files', async (args) => {
      const pattern = String(args.pattern || '*');
      const searchPath = String(args.path || '');
      const maxDepth = args.max_depth ? Number(args.max_depth) : 3;
      try {
        const safePath = safety.validatePathWithAllowedPaths(searchPath || '.', workspaceRoot, getAllowedPaths());
        const results = await searchDir(safePath, pattern, maxDepth);

        if (results.length === 0) {
          return { toolName: 'search_files', success: true, result: `No files matching "${pattern}" found in ${safePath}`, duration: 0 };
        }

        const formatted = results.slice(0, 50).map(f => f).join('\n');
        return {
          toolName: 'search_files',
          success: true,
          result: `Found ${results.length} files matching "${pattern}":\n${formatted}${results.length > 50 ? '\n... (showing first 50)' : ''}`,
          duration: 0,
        };
      } catch (err: any) {
        return { toolName: 'search_files', success: false, error: err.message, duration: 0 };
      }
    });
  },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

export default filesToolModule;
