/**
 * File Management Utility Functions
 */

import * as crypto from 'crypto';
import * as path from 'path';
import type {
  FileItem,
  FileMetadata,
  FileFilter,
  FileSortOptions,
  FileListResult,
  FilePermission,
} from './types.js';

/**
 * Generate a unique file ID
 */
export function generateFileId(): string {
  return `file_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return ext;
}

/**
 * Get MIME type from extension
 */
export function getMimeTypeFromExtension(extension: string): string {
  const mimeTypes: Record<string, string> = {
    '.txt': 'text/plain',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.zip': 'application/zip',
    '.rar': 'application/vnd.rar',
    '.7z': 'application/x-7z-compressed',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.ts': 'application/typescript',
    '.md': 'text/markdown',
    '.csv': 'text/csv',
  };

  return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
}

/**
 * Format file size to human readable string
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

/**
 * Parse file size string to bytes
 */
export function parseFileSize(sizeStr: string): number {
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)?$/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();

  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  };

  return value * (multipliers[unit] || 1);
}

/**
 * Sanitize filename by removing invalid characters
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .substring(0, 255);
}

/**
 * Sanitize path by removing directory traversal attempts
 */
export function sanitizePath(filePath: string): string {
  const normalized = path.normalize(filePath);
  if (normalized.includes('..')) {
    throw new Error('Invalid path: directory traversal detected');
  }
  return normalized;
}

/**
 * Check if a file matches the given filter
 */
export function matchesFilter(file: FileItem, filter: FileFilter): boolean {
  if (filter.path && !file.path.startsWith(filter.path)) {
    return false;
  }

  if (filter.name && !file.name.toLowerCase().includes(filter.name.toLowerCase())) {
    return false;
  }

  if (filter.extension && file.extension !== filter.extension.toLowerCase()) {
    return false;
  }

  if (filter.mimeType && !file.mimeType.startsWith(filter.mimeType)) {
    return false;
  }

  if (filter.minSize !== undefined && file.size < filter.minSize) {
    return false;
  }

  if (filter.maxSize !== undefined && file.size > filter.maxSize) {
    return false;
  }

  if (filter.createdAfter && file.createdAt < filter.createdAfter) {
    return false;
  }

  if (filter.createdBefore && file.createdAt > filter.createdBefore) {
    return false;
  }

  if (filter.updatedAfter && file.updatedAt < filter.updatedAfter) {
    return false;
  }

  if (filter.updatedBefore && file.updatedAt > filter.updatedBefore) {
    return false;
  }

  return true;
}

/**
 * Sort files by the given options
 */
export function sortFiles(files: FileItem[], options: FileSortOptions): FileItem[] {
  const sorted = [...files];

  sorted.sort((a, b) => {
    let comparison = 0;

    switch (options.field) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'size':
        comparison = a.size - b.size;
        break;
      case 'createdAt':
        comparison = a.createdAt.getTime() - b.createdAt.getTime();
        break;
      case 'updatedAt':
        comparison = a.updatedAt.getTime() - b.updatedAt.getTime();
        break;
      case 'accessedAt':
        comparison = (a.updatedAt?.getTime() || 0) - (b.updatedAt?.getTime() || 0);
        break;
    }

    return options.direction === 'desc' ? -comparison : comparison;
  });

  return sorted;
}

/**
 * Paginate file list
 */
export function paginateFiles(
  files: FileItem[],
  page: number,
  pageSize: number
): FileListResult {
  const total = files.length;
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedFiles = files.slice(startIndex, endIndex);

  return {
    files: paginatedFiles,
    total,
    page,
    pageSize,
    hasMore: endIndex < total,
  };
}

/**
 * Calculate checksum for file content
 */
export function calculateChecksum(content: Buffer | string, algorithm: string = 'sha256'): string {
  const buffer = typeof content === 'string' ? Buffer.from(content) : content;
  return crypto.createHash(algorithm).update(buffer).digest('hex');
}

/**
 * Check if extension is allowed
 */
export function isExtensionAllowed(
  extension: string,
  allowed: string[],
  blocked: string[]
): boolean {
  const ext = extension.toLowerCase();

  if (blocked.length > 0 && blocked.includes(ext)) {
    return false;
  }

  if (allowed.length > 0 && !allowed.includes(ext)) {
    return false;
  }

  return true;
}

/**
 * Parse permissions from string
 */
export function parsePermissions(permStr: string): FilePermission[] {
  const permissions: FilePermission[] = [];

  if (permStr.includes('r')) permissions.push('read');
  if (permStr.includes('w')) permissions.push('write');
  if (permStr.includes('x')) permissions.push('execute');
  if (permStr.includes('a')) permissions.push('admin');

  return permissions;
}

/**
 * Convert permissions to string
 */
export function permissionsToString(permissions: FilePermission[]): string {
  let str = '';
  if (permissions.includes('read')) str += 'r';
  if (permissions.includes('write')) str += 'w';
  if (permissions.includes('execute')) str += 'x';
  if (permissions.includes('admin')) str += 'a';
  return str || '-';
}

/**
 * Create file item from metadata
 */
export function metadataToFileItem(metadata: FileMetadata): FileItem {
  return {
    id: metadata.id,
    name: metadata.name,
    path: metadata.path,
    isDirectory: false,
    size: metadata.size,
    mimeType: metadata.mimeType,
    extension: metadata.extension,
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    permissions: metadata.permissions,
  };
}

/**
 * Get parent directory path
 */
export function getParentDirectory(filePath: string): string {
  return path.dirname(filePath);
}

/**
 * Join path segments safely
 */
export function joinPaths(...segments: string[]): string {
  return path.join(...segments);
}

/**
 * Check if path is within root directory
 */
export function isWithinRoot(filePath: string, rootPath: string): boolean {
  const resolved = path.resolve(filePath);
  const root = path.resolve(rootPath);
  return resolved.startsWith(root);
}

/**
 * Get relative path from root
 */
export function getRelativePath(filePath: string, rootPath: string): string {
  return path.relative(rootPath, filePath);
}

/**
 * Validate file name
 */
export function validateFileName(name: string): { valid: boolean; error?: string } {
  if (!name || name.length === 0) {
    return { valid: false, error: 'File name cannot be empty' };
  }

  if (name.length > 255) {
    return { valid: false, error: 'File name cannot exceed 255 characters' };
  }

  const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
  if (invalidChars.test(name)) {
    return { valid: false, error: 'File name contains invalid characters' };
  }

  const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (reservedNames.test(name)) {
    return { valid: false, error: 'File name is a reserved system name' };
  }

  return { valid: true };
}

/**
 * Validate file path
 */
export function validateFilePath(filePath: string): { valid: boolean; error?: string } {
  if (!filePath || filePath.length === 0) {
    return { valid: false, error: 'File path cannot be empty' };
  }

  try {
    sanitizePath(filePath);
  } catch {
    return { valid: false, error: 'File path contains invalid traversal patterns' };
  }

  return { valid: true };
}