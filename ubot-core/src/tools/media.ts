/**
 * Media Processing Tool Module
 *
 * Provides tools for analyzing images and extracting text from documents.
 * Works with the same allowed-path security as the files module.
 */

import fs from 'fs/promises';
import path from 'path';
import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from './types.js';
import { getSafetyService } from '../safety/service.js';
import { loadUbotConfig } from '../data/config.js';

/** Resolve allowed paths from config, expanding ~ */
function getAllowedPaths(): string[] {
  const config = loadUbotConfig();
  const paths = config.filesystem?.allowed_paths || [];
  return paths.map(p =>
    p.startsWith('~') ? path.join(process.env.HOME || '', p.slice(1)) : p
  );
}

/** Check if a MIME type is an image */
function isImageMime(mime: string): boolean {
  return /^image\/(png|jpe?g|gif|webp|bmp|svg\+xml)$/i.test(mime);
}

/** Detect MIME type from file extension */
function mimeFromExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.xml': 'text/xml',
    '.log': 'text/plain',
  };
  return map[ext] || 'application/octet-stream';
}

/** Build tool descriptions with allowed paths */
function getToolDescriptions(): ToolDefinition[] {
  const paths = loadUbotConfig().filesystem?.allowed_paths || [];
  const pathList = paths.length > 0
    ? `Allowed directories: workspace (always), ${paths.join(', ')}`
    : 'Only the workspace directory is accessible.';

  return [
    {
      name: 'extract_pdf_text',
      description: `Extract text content from a PDF file. Returns the full text for analysis. ${pathList}`,
      parameters: [
        { name: 'path', type: 'string', description: 'Path to the PDF file — relative (workspace) or absolute (allowed directories)', required: true },
        { name: 'max_pages', type: 'number', description: 'Maximum pages to extract (default: all)', required: false },
      ],
    },
    {
      name: 'extract_document_text',
      description: `Read and extract text from common document formats (txt, md, csv, json, html, xml, log). ${pathList}`,
      parameters: [
        { name: 'path', type: 'string', description: 'Path to the document file', required: true },
      ],
    },
    {
      name: 'describe_image',
      description: `Read an image file and encode it for visual analysis. The image will be included in the next LLM call for the model to describe. Returns a base64 summary for reference. ${pathList}`,
      parameters: [
        { name: 'path', type: 'string', description: 'Path to the image file (png, jpg, gif, webp)', required: true },
      ],
    },
  ];
}

const mediaToolModule: ToolModule = {
  name: 'media',
  get tools() { return getToolDescriptions(); },
  register(registry: ToolRegistry, ctx: ToolContext) {
    const safety = getSafetyService();
    const workspaceRoot = ctx.getWorkspacePath();

    if (!workspaceRoot) {
      console.warn('[MediaTool] Workspace root not defined. Media tools will be disabled.');
      return;
    }

    // ─── extract_pdf_text ──────────────────────────────────────────────
    registry.register('extract_pdf_text', async (args) => {
      const targetPath = String(args.path || '');
      try {
        const safePath = safety.validatePathWithAllowedPaths(targetPath, workspaceRoot, getAllowedPaths());

        // Check file exists and is a PDF
        const stat = await fs.stat(safePath);
        if (stat.size > 50 * 1024 * 1024) {
          return { toolName: 'extract_pdf_text', success: false, error: 'PDF exceeds 50MB limit', duration: 0 };
        }

        const buffer = await fs.readFile(safePath);

        // Dynamic import pdf-parse to avoid issues if not installed
        let pdfParser: any;
        try {
          const { PDFParse } = await import('pdf-parse');
          pdfParser = new PDFParse({ data: new Uint8Array(buffer) });
        } catch {
          return { toolName: 'extract_pdf_text', success: false, error: 'pdf-parse not installed. Run: npm install pdf-parse', duration: 0 };
        }

        let text = String(await pdfParser.getText() || '');

        // Apply max_pages limit (rough approximation: split by form feeds)
        const maxPages = args.max_pages ? Number(args.max_pages) : 0;
        if (maxPages > 0) {
          const pages = text.split('\f');
          text = pages.slice(0, maxPages).join('\n\n--- Page Break ---\n\n');
        }

        // Truncate if very large
        if (text.length > 100000) {
          text = text.slice(0, 100000) + '\n\n... (truncated — PDF text exceeds 100K characters)';
        }

        const info = `PDF: ${text.length} chars extracted`;
        return {
          toolName: 'extract_pdf_text',
          success: true,
          result: `${info}\n\n${text}`,
          duration: 0,
        };
      } catch (err: any) {
        return { toolName: 'extract_pdf_text', success: false, error: err.message, duration: 0 };
      }
    });

    // ─── extract_document_text ──────────────────────────────────────────
    registry.register('extract_document_text', async (args) => {
      const targetPath = String(args.path || '');
      try {
        const safePath = safety.validatePathWithAllowedPaths(targetPath, workspaceRoot, getAllowedPaths());
        const mime = mimeFromExt(safePath);

        // Only allow text-based documents
        if (!mime.startsWith('text/') && !['application/json', 'application/xml'].includes(mime)) {
          return { toolName: 'extract_document_text', success: false, error: `Unsupported format: ${mime}. Use extract_pdf_text for PDFs or describe_image for images.`, duration: 0 };
        }

        const stat = await fs.stat(safePath);
        if (stat.size > 10 * 1024 * 1024) {
          return { toolName: 'extract_document_text', success: false, error: 'Document exceeds 10MB limit', duration: 0 };
        }

        let content = await fs.readFile(safePath, 'utf8');
        if (content.length > 100000) {
          content = content.slice(0, 100000) + '\n\n... (truncated)';
        }

        return {
          toolName: 'extract_document_text',
          success: true,
          result: `[${path.basename(safePath)}] (${mime}, ${formatSize(stat.size)}):\n\n${content}`,
          duration: 0,
        };
      } catch (err: any) {
        return { toolName: 'extract_document_text', success: false, error: err.message, duration: 0 };
      }
    });

    // ─── describe_image ────────────────────────────────────────────────
    registry.register('describe_image', async (args) => {
      const targetPath = String(args.path || '');
      try {
        const safePath = safety.validatePathWithAllowedPaths(targetPath, workspaceRoot, getAllowedPaths());
        const mime = mimeFromExt(safePath);

        if (!isImageMime(mime)) {
          return { toolName: 'describe_image', success: false, error: `Not an image file: ${mime}`, duration: 0 };
        }

        const stat = await fs.stat(safePath);
        if (stat.size > 20 * 1024 * 1024) {
          return { toolName: 'describe_image', success: false, error: 'Image exceeds 20MB limit', duration: 0 };
        }

        const buffer = await fs.readFile(safePath);
        const base64 = buffer.toString('base64');
        const dataUrl = `data:${mime};base64,${base64}`;

        // We return a marker that the orchestrator can recognize for vision
        // The tool result includes the base64 which is large but the LLM needs it
        return {
          toolName: 'describe_image',
          success: true,
          result: `[IMAGE_LOADED] ${path.basename(safePath)} (${mime}, ${formatSize(stat.size)}). The image has been loaded and encoded. To analyze it, I'll include it in the next response. Image data URL length: ${dataUrl.length} chars.

[IMAGE_DATA:${dataUrl}]`,
          duration: 0,
        };
      } catch (err: any) {
        return { toolName: 'describe_image', success: false, error: err.message, duration: 0 };
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

export default mediaToolModule;
