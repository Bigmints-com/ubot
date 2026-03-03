/**
 * Apply Patch Tool Module
 *
 * Applies unified diff patches to files for incremental editing.
 * Unlike write_file (full rewrite), apply_patch only modifies specific sections.
 * Uses the same filesystem security as other file tools.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from './types.js';
import { loadUbotConfig } from '../data/config.js';

// ─── Diff Parser and Applier ──────────────────────────────

interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

function parseUnifiedDiff(patch: string): Hunk[] {
  const hunks: Hunk[] = [];
  const lines = patch.split('\n');
  let currentHunk: Hunk | null = null;

  for (const line of lines) {
    // Parse hunk header: @@ -oldStart,oldLines +newStart,newLines @@
    const hunkMatch = line.match(/^@@\s*-(\d+)(?:,(\d+))?\s*\+(\d+)(?:,(\d+))?\s*@@/);
    if (hunkMatch) {
      if (currentHunk) hunks.push(currentHunk);
      currentHunk = {
        oldStart: parseInt(hunkMatch[1]),
        oldLines: parseInt(hunkMatch[2] || '1'),
        newStart: parseInt(hunkMatch[3]),
        newLines: parseInt(hunkMatch[4] || '1'),
        lines: [],
      };
      continue;
    }

    // Skip diff headers
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff ')) continue;

    // Collect hunk lines
    if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ') || line === '')) {
      currentHunk.lines.push(line);
    }
  }

  if (currentHunk) hunks.push(currentHunk);
  return hunks;
}

function applyHunks(original: string, hunks: Hunk[]): { result: string; applied: number; rejected: number } {
  const originalLines = original.split('\n');
  let applied = 0;
  let rejected = 0;
  let offset = 0; // track line number shifts from previous hunks

  for (const hunk of hunks) {
    const startIdx = hunk.oldStart - 1 + offset;
    const newLines: string[] = [];
    let oldIdx = startIdx;
    let hunkValid = true;

    for (const line of hunk.lines) {
      if (line.startsWith('-')) {
        // Remove line — verify it matches
        const expected = line.slice(1);
        if (oldIdx < originalLines.length && originalLines[oldIdx].trimEnd() === expected.trimEnd()) {
          oldIdx++;
        } else {
          hunkValid = false;
          break;
        }
      } else if (line.startsWith('+')) {
        // Add line
        newLines.push(line.slice(1));
      } else {
        // Context line (starts with ' ' or is empty)
        const contextLine = line.startsWith(' ') ? line.slice(1) : line;
        if (oldIdx < originalLines.length && originalLines[oldIdx].trimEnd() === contextLine.trimEnd()) {
          newLines.push(originalLines[oldIdx]);
          oldIdx++;
        } else {
          hunkValid = false;
          break;
        }
      }
    }

    if (hunkValid) {
      // Replace old lines with new lines
      const oldCount = oldIdx - startIdx;
      originalLines.splice(startIdx, oldCount, ...newLines);
      offset += newLines.length - oldCount;
      applied++;
    } else {
      rejected++;
    }
  }

  return { result: originalLines.join('\n'), applied, rejected };
}

// ─── Security ─────────────────────────────────────────────

function getAllowedPaths(): string[] {
  const config = loadUbotConfig();
  const paths = config.capabilities?.filesystem?.allowed_paths || [];
  return paths.map((p: string) =>
    p.startsWith('~') ? path.join(process.env.HOME || '', p.slice(1)) : p
  );
}

// ─── Tool Definition ──────────────────────────────────────

const PATCH_TOOLS: ToolDefinition[] = [
  {
    name: 'apply_patch',
    description: 'Apply a unified diff patch to a file. Supports standard diff format with @@ -line,count +line,count @@ headers. Returns the number of hunks applied/rejected.',
    parameters: [
      { name: 'path', type: 'string', description: 'File path to patch (relative to workspace or absolute)', required: true },
      { name: 'patch', type: 'string', description: 'Unified diff patch content', required: true },
    ],
  },
];

// ─── Module ───────────────────────────────────────────────

const patchToolModule: ToolModule = {
  name: 'patch',
  tools: PATCH_TOOLS,
  register(registry: ToolRegistry, ctx: ToolContext) {
    registry.register('apply_patch', async (args) => {
      const filePath = String(args.path || '').trim();
      const patch = String(args.patch || '').trim();
      const start = Date.now();

      if (!filePath) return { toolName: 'apply_patch', success: false, error: 'Missing "path" parameter', duration: 0 };
      if (!patch) return { toolName: 'apply_patch', success: false, error: 'Missing "patch" parameter', duration: 0 };

      // Resolve path with security
      const workspace = ctx.getWorkspacePath() || process.cwd();
      let resolvedPath: string;
      if (path.isAbsolute(filePath)) {
        resolvedPath = path.resolve(filePath);
      } else {
        resolvedPath = path.resolve(workspace, filePath);
      }

      // Security check
      const allowed = [path.resolve(workspace), ...getAllowedPaths().map(p => path.resolve(p))];
      const inAllowed = allowed.some(dir => resolvedPath.startsWith(dir));
      if (!inAllowed) {
        return {
          toolName: 'apply_patch',
          success: false,
          error: `Security Error: Access denied. Path "${filePath}" is outside allowed directories.`,
          duration: 0,
        };
      }

      // Read original file
      if (!fs.existsSync(resolvedPath)) {
        return { toolName: 'apply_patch', success: false, error: `File not found: ${filePath}`, duration: 0 };
      }

      try {
        const original = fs.readFileSync(resolvedPath, 'utf-8');
        const hunks = parseUnifiedDiff(patch);

        if (hunks.length === 0) {
          return { toolName: 'apply_patch', success: false, error: 'No valid hunks found in patch', duration: 0 };
        }

        const { result, applied, rejected } = applyHunks(original, hunks);

        if (applied === 0) {
          return {
            toolName: 'apply_patch',
            success: false,
            error: `All ${rejected} hunk(s) rejected — file content does not match the patch context`,
            duration: Date.now() - start,
          };
        }

        fs.writeFileSync(resolvedPath, result, 'utf-8');

        const summary = rejected > 0
          ? `Applied ${applied} hunk(s), ${rejected} rejected`
          : `Applied ${applied} hunk(s) successfully`;

        console.log(`[apply_patch] ${filePath}: ${summary}`);
        return { toolName: 'apply_patch', success: true, result: summary, duration: Date.now() - start };
      } catch (err: any) {
        return { toolName: 'apply_patch', success: false, error: err.message, duration: Date.now() - start };
      }
    });
  },
};

export default patchToolModule;
