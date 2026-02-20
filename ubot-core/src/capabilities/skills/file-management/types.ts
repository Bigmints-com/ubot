/**
 * File Management Skill Types
 * Defines types for file operations within the skills framework
 */

import type { Skill, SkillLevel, SkillCategory } from '../types.js';

/**
 * File operation types
 */
export type FileOperation = 
  | 'read'
  | 'write'
  | 'delete'
  | 'move'
  | 'copy'
  | 'rename'
  | 'search'
  | 'compress'
  | 'extract'
  | 'metadata';

/**
 * File permission levels
 */
export type FilePermission = 'read' | 'write' | 'execute' | 'admin';

/**
 * File status
 */
export type FileStatus = 
  | 'available'
  | 'locked'
  | 'processing'
  | 'deleted'
  | 'archived';

/**
 * File metadata
 */
export interface FileMetadata {
  id: string;
  name: string;
  path: string;
  size: number;
  mimeType: string;
  extension: string;
  createdAt: Date;
  updatedAt: Date;
  accessedAt: Date;
  status: FileStatus;
  permissions: FilePermission[];
  checksum?: string;
  tags: string[];
  description?: string;
  ownerId?: string;
}

/**
 * File item for listing
 */
export interface FileItem {
  id: string;
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  mimeType: string;
  extension: string;
  createdAt: Date;
  updatedAt: Date;
  permissions: FilePermission[];
}

/**
 * File filter options
 */
export interface FileFilter {
  path?: string;
  name?: string;
  extension?: string;
  mimeType?: string;
  status?: FileStatus;
  tags?: string[];
  minSize?: number;
  maxSize?: number;
  createdAfter?: Date;
  createdBefore?: Date;
  updatedAfter?: Date;
  updatedBefore?: Date;
  ownerId?: string;
}

/**
 * File sort options
 */
export interface FileSortOptions {
  field: 'name' | 'size' | 'createdAt' | 'updatedAt' | 'accessedAt';
  direction: 'asc' | 'desc';
}

/**
 * Paginated file list result
 */
export interface FileListResult {
  files: FileItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * File operation result
 */
export interface FileOperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

/**
 * File read options
 */
export interface FileReadOptions {
  encoding?: BufferEncoding;
  start?: number;
  end?: number;
}

/**
 * File write options
 */
export interface FileWriteOptions {
  encoding?: BufferEncoding;
  overwrite?: boolean;
  createDirectories?: boolean;
  backup?: boolean;
}

/**
 * File move/copy options
 */
export interface FileTransferOptions {
  overwrite?: boolean;
  createDirectories?: boolean;
  preserveTimestamps?: boolean;
}

/**
 * File search options
 */
export interface FileSearchOptions {
  query: string;
  searchInContent?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  maxResults?: number;
}

/**
 * File search result
 */
export interface FileSearchResult {
  file: FileItem;
  matches: FileSearchMatch[];
}

/**
 * File search match
 */
export interface FileSearchMatch {
  line?: number;
  column?: number;
  context?: string;
  match: string;
}

/**
 * Directory info
 */
export interface DirectoryInfo {
  path: string;
  name: string;
  fileCount: number;
  directoryCount: number;
  totalSize: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * File management configuration
 */
export interface FileManagementConfig {
  rootPath: string;
  maxFileSize: number;
  allowedExtensions: string[];
  blockedExtensions: string[];
  maxStorageSize: number;
  enableVersioning: boolean;
  enableCompression: boolean;
  tempDirectory: string;
}

/**
 * Default file management configuration
 */
export const DEFAULT_FILE_MANAGEMENT_CONFIG: FileManagementConfig = {
  rootPath: './files',
  maxFileSize: 100 * 1024 * 1024, // 100MB
  allowedExtensions: [],
  blockedExtensions: ['.exe', '.bat', '.cmd', '.sh'],
  maxStorageSize: 10 * 1024 * 1024 * 1024, // 10GB
  enableVersioning: true,
  enableCompression: false,
  tempDirectory: './temp',
};

/**
 * File management skill definition
 */
export const FILE_MANAGEMENT_SKILL: Omit<Skill, 'id' | 'createdAt' | 'updatedAt'> = {
  name: 'File Management',
  description: 'Comprehensive file operations including read, write, organize, search, and manage file metadata',
  category: 'technical' as SkillCategory,
  level: 'intermediate' as SkillLevel,
  tags: ['files', 'storage', 'organization', 'documents', 'media'],
  metadata: {
    version: '1.0.0',
    author: 'ubot-core',
    operations: [
      'read', 'write', 'delete', 'move', 'copy', 
      'rename', 'search', 'compress', 'extract', 'metadata'
    ] as FileOperation[],
    capabilities: [
      'File CRUD operations',
      'Directory management',
      'File search and filtering',
      'Metadata management',
      'Batch operations',
    ],
  },
};

/**
 * Storage statistics
 */
export interface StorageStats {
  totalFiles: number;
  totalDirectories: number;
  totalSize: number;
  availableSpace: number;
  usedSpace: number;
  largestFile: FileItem | null;
  newestFile: FileItem | null;
  oldestFile: FileItem | null;
  filesByExtension: Record<string, number>;
  filesByMimeType: Record<string, number>;
}

/**
 * Batch operation item
 */
export interface BatchOperationItem {
  operation: FileOperation;
  sourcePath?: string;
  targetPath?: string;
  content?: string | Buffer;
  options?: FileWriteOptions | FileReadOptions | FileTransferOptions;
}

/**
 * Batch operation result
 */
export interface BatchOperationResult {
  successful: number;
  failed: number;
  results: FileOperationResult[];
  errors: Array<{ path: string; error: string }>;
}