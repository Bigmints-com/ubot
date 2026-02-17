/**
 * File Management Service
 * Provides comprehensive file operations integrated with the skills framework
 */

import * as fs from 'fs';
import * as path from 'path';
import type { LoggerInstance } from '../../logger/types.js';
import type { Skill } from '../types.js';
import {
  generateFileId,
  getFileExtension,
  getMimeTypeFromExtension,
  sanitizeFilename,
  sanitizePath,
  matchesFilter,
  sortFiles,
  paginateFiles,
  calculateChecksum,
  isExtensionAllowed,
  isWithinRoot,
  joinPaths,
  validateFileName,
  validateFilePath,
  metadataToFileItem,
} from './utils.js';
import type {
  FileMetadata,
  FileItem,
  FileFilter,
  FileSortOptions,
  FileListResult,
  FileOperationResult,
  FileReadOptions,
  FileWriteOptions,
  FileTransferOptions,
  FileSearchOptions,
  FileSearchResult,
  FileSearchMatch,
  DirectoryInfo,
  FileManagementConfig,
  StorageStats,
  BatchOperationItem,
  BatchOperationResult,
} from './types.js';
import { DEFAULT_FILE_MANAGEMENT_CONFIG } from './types.js';

/**
 * File Management Service
 */
export class FileManagementService {
  private config: FileManagementConfig;
  private logger: LoggerInstance | null;
  private files: Map<string, FileMetadata>;
  private directories: Map<string, DirectoryInfo>;
  private initialized: boolean;

  constructor(config?: Partial<FileManagementConfig>, logger?: LoggerInstance) {
    this.config = { ...DEFAULT_FILE_MANAGEMENT_CONFIG, ...config };
    this.logger = logger || null;
    this.files = new Map();
    this.directories = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the file management service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Ensure root directory exists
      await this.ensureDirectory(this.config.rootPath);
      
      // Ensure temp directory exists
      await this.ensureDirectory(this.config.tempDirectory);

      // Load existing files
      await this.loadExistingFiles();

      this.initialized = true;
      this.logger?.info('File management service initialized', {
        rootPath: this.config.rootPath,
      });
    } catch (error) {
      this.logger?.error('Failed to initialize file management service', { error });
      throw error;
    }
  }

  /**
   * Ensure a directory exists
   */
  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Load existing files from the root directory
   */
  private async loadExistingFiles(): Promise<void> {
    const loadDir = async (dirPath: string): Promise<void> => {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = joinPaths(dirPath, entry.name);

        if (entry.isDirectory()) {
          await loadDir(fullPath);
        } else if (entry.isFile()) {
          const stats = await fs.promises.stat(fullPath);
          const extension = getFileExtension(entry.name);
          const mimeType = getMimeTypeFromExtension(extension);

          const metadata: FileMetadata = {
            id: generateFileId(),
            name: entry.name,
            path: fullPath,
            size: stats.size,
            mimeType,
            extension,
            createdAt: stats.birthtime,
            updatedAt: stats.mtime,
            accessedAt: stats.atime,
            status: 'available',
            permissions: ['read', 'write'],
            tags: [],
          };

          this.files.set(fullPath, metadata);
        }
      }
    };

    try {
      await loadDir(this.config.rootPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Get the skill definition for file management
   */
  getSkillDefinition(): Omit<Skill, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      name: 'File Management',
      description: 'Comprehensive file operations including read, write, organize, search, and manage file metadata',
      category: 'technical',
      level: 'intermediate',
      tags: ['files', 'storage', 'organization', 'documents', 'media'],
      metadata: {
        version: '1.0.0',
        author: 'ubot-core',
        operations: ['read', 'write', 'delete', 'move', 'copy', 'rename', 'search', 'metadata'],
      },
    };
  }

  /**
   * Read a file
   */
  async readFile(
    filePath: string,
    options?: FileReadOptions
  ): Promise<FileOperationResult<string | Buffer>> {
    try {
      const sanitizedPath = sanitizePath(filePath);
      const fullPath = this.resolvePath(sanitizedPath);

      if (!isWithinRoot(fullPath, this.config.rootPath)) {
        return {
          success: false,
          error: 'Access denied: path outside root directory',
          timestamp: new Date(),
        };
      }

      const metadata = this.files.get(fullPath);
      if (metadata?.status === 'locked') {
        return {
          success: false,
          error: 'File is locked',
          timestamp: new Date(),
        };
      }

      const encoding = options?.encoding;
      let content: string | Buffer;

      if (options?.start !== undefined || options?.end !== undefined) {
        const buffer = Buffer.alloc((options?.end || 0) - (options?.start || 0));
        const fd = await fs.promises.open(fullPath, 'r');
        await fd.read(buffer, 0, buffer.length, options?.start || 0);
        await fd.close();
        content = encoding ? buffer.toString(encoding) : buffer;
      } else {
        content = await fs.promises.readFile(fullPath, encoding);
      }

      // Update accessed time
      if (metadata) {
        metadata.accessedAt = new Date();
      }

      this.logger?.debug('File read successfully', { path: fullPath });

      return {
        success: true,
        data: content,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger?.error('Failed to read file', { path: filePath, error: errorMessage });

      return {
        success: false,
        error: errorMessage,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Write a file
   */
  async writeFile(
    filePath: string,
    content: string | Buffer,
    options?: FileWriteOptions
  ): Promise<FileOperationResult<FileMetadata>> {
    try {
      const validation = validateFilePath(filePath);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          timestamp: new Date(),
        };
      }

      const sanitizedPath = sanitizePath(filePath);
      const fullPath = this.resolvePath(sanitizedPath);

      if (!isWithinRoot(fullPath, this.config.rootPath)) {
        return {
          success: false,
          error: 'Access denied: path outside root directory',
          timestamp: new Date(),
        };
      }

      const extension = getFileExtension(fullPath);
      if (!isExtensionAllowed(extension, this.config.allowedExtensions, this.config.blockedExtensions)) {
        return {
          success: false,
          error: `File extension "${extension}" is not allowed`,
          timestamp: new Date(),
        };
      }

      const contentBuffer = typeof content === 'string' ? Buffer.from(content) : content;
      if (contentBuffer.length > this.config.maxFileSize) {
        return {
          success: false,
          error: `File size exceeds maximum allowed (${this.config.maxFileSize} bytes)`,
          timestamp: new Date(),
        };
      }

      // Create directories if needed
      if (options?.createDirectories) {
        const dir = path.dirname(fullPath);
        await this.ensureDirectory(dir);
      }

      // Check if file exists
      const exists = this.files.has(fullPath);
      if (exists && !options?.overwrite) {
        return {
          success: false,
          error: 'File already exists',
          timestamp: new Date(),
        };
      }

      // Backup if requested
      if (exists && options?.backup) {
        const backupPath = `${fullPath}.backup.${Date.now()}`;
        await fs.promises.copyFile(fullPath, backupPath);
      }

      // Write file
      await fs.promises.writeFile(fullPath, content, { encoding: options?.encoding });

      const stats = await fs.promises.stat(fullPath);
      const mimeType = getMimeTypeFromExtension(extension);
      const checksum = calculateChecksum(contentBuffer);

      const metadata: FileMetadata = {
        id: this.files.get(fullPath)?.id || generateFileId(),
        name: path.basename(fullPath),
        path: fullPath,
        size: stats.size,
        mimeType,
        extension,
        createdAt: this.files.get(fullPath)?.createdAt || stats.birthtime,
        updatedAt: stats.mtime,
        accessedAt: stats.atime,
        status: 'available',
        permissions: ['read', 'write'],
        checksum,
        tags: this.files.get(fullPath)?.tags || [],
      };

      this.files.set(fullPath, metadata);

      this.logger?.debug('File written successfully', { path: fullPath, size: stats.size });

      return {
        success: true,
        data: metadata,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger?.error('Failed to write file', { path: filePath, error: errorMessage });

      return {
        success: false,
        error: errorMessage,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(filePath: string): Promise<FileOperationResult<void>> {
    try {
      const sanitizedPath = sanitizePath(filePath);
      const fullPath = this.resolvePath(sanitizedPath);

      if (!isWithinRoot(fullPath, this.config.rootPath)) {
        return {
          success: false,
          error: 'Access denied: path outside root directory',
          timestamp: new Date(),
        };
      }

      const metadata = this.files.get(fullPath);
      if (!metadata) {
        return {
          success: false,
          error: 'File not found',
          timestamp: new Date(),
        };
      }

      if (metadata.status === 'locked') {
        return {
          success: false,
          error: 'File is locked',
          timestamp: new Date(),
        };
      }

      await fs.promises.unlink(fullPath);
      this.files.delete(fullPath);

      this.logger?.debug('File deleted successfully', { path: fullPath });

      return {
        success: true,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger?.error('Failed to delete file', { path: filePath, error: errorMessage });

      return {
        success: false,
        error: errorMessage,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Move a file
   */
  async moveFile(
    sourcePath: string,
    targetPath: string,
    options?: FileTransferOptions
  ): Promise<FileOperationResult<FileMetadata>> {
    try {
      const sanitizedSource = sanitizePath(sourcePath);
      const sanitizedTarget = sanitizePath(targetPath);
      const fullSource = this.resolvePath(sanitizedSource);
      const fullTarget = this.resolvePath(sanitizedTarget);

      if (!isWithinRoot(fullSource, this.config.rootPath) || 
          !isWithinRoot(fullTarget, this.config.rootPath)) {
        return {
          success: false,
          error: 'Access denied: path outside root directory',
          timestamp: new Date(),
        };
      }

      const metadata = this.files.get(fullSource);
      if (!metadata) {
        return {
          success: false,
          error: 'Source file not found',
          timestamp: new Date(),
        };
      }

      if (metadata.status === 'locked') {
        return {
          success: false,
          error: 'File is locked',
          timestamp: new Date(),
        };
      }

      // Check if target exists
      if (this.files.has(fullTarget) && !options?.overwrite) {
        return {
          success: false,
          error: 'Target file already exists',
          timestamp: new Date(),
        };
      }

      // Create directories if needed
      if (options?.createDirectories) {
        const dir = path.dirname(fullTarget);
        await this.ensureDirectory(dir);
      }

      await fs.promises.rename(fullSource, fullTarget);

      // Update metadata
      const newMetadata: FileMetadata = {
        ...metadata,
        path: fullTarget,
        name: path.basename(fullTarget),
        extension: getFileExtension(fullTarget),
        mimeType: getMimeTypeFromExtension(getFileExtension(fullTarget)),
        updatedAt: new Date(),
      };

      this.files.delete(fullSource);
      this.files.set(fullTarget, newMetadata);

      this.logger?.debug('File moved successfully', { from: fullSource, to: fullTarget });

      return {
        success: true,
        data: newMetadata,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger?.error('Failed to move file', { sourcePath, targetPath, error: errorMessage });

      return {
        success: false,
        error: errorMessage,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Copy a file
   */
  async copyFile(
    sourcePath: string,
    targetPath: string,
    options?: FileTransferOptions
  ): Promise<FileOperationResult<FileMetadata>> {
    try {
      const sanitizedSource = sanitizePath(sourcePath);
      const sanitizedTarget = sanitizePath(targetPath);
      const fullSource = this.resolvePath(sanitizedSource);
      const fullTarget = this.resolvePath(sanitizedTarget);

      if (!isWithinRoot(fullSource, this.config.rootPath) || 
          !isWithinRoot(fullTarget, this.config.rootPath)) {
        return {
          success: false,
          error: 'Access denied: path outside root directory',
          timestamp: new Date(),
        };
      }

      const metadata = this.files.get(fullSource);
      if (!metadata) {
        return {
          success: false,
          error: 'Source file not found',
          timestamp: new Date(),
        };
      }

      // Check if target exists
      if (this.files.has(fullTarget) && !options?.overwrite) {
        return {
          success: false,
          error: 'Target file already exists',
          timestamp: new Date(),
        };
      }

      // Create directories if needed
      if (options?.createDirectories) {
        const dir = path.dirname(fullTarget);
        await this.ensureDirectory(dir);
      }

      await fs.promises.copyFile(fullSource, fullTarget);

      const stats = await fs.promises.stat(fullTarget);
      const newMetadata: FileMetadata = {
        ...metadata,
        id: generateFileId(),
        path: fullTarget,
        name: path.basename(fullTarget),
        extension: getFileExtension(fullTarget),
        mimeType: getMimeTypeFromExtension(getFileExtension(fullTarget)),
        createdAt: stats.birthtime,
        updatedAt: stats.mtime,
        accessedAt: stats.atime,
      };

      this.files.set(fullTarget, newMetadata);

      this.logger?.debug('File copied successfully', { from: fullSource, to: fullTarget });

      return {
        success: true,
        data: newMetadata,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger?.error('Failed to copy file', { sourcePath, targetPath, error: errorMessage });

      return {
        success: false,
        error: errorMessage,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Rename a file
   */
  async renameFile(
    filePath: string,
    newName: string
  ): Promise<FileOperationResult<FileMetadata>> {
    const validation = validateFileName(newName);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        timestamp: new Date(),
      };
    }

    const sanitized = sanitizeFilename(newName);
    const dir = path.dirname(filePath);
    const newPath = joinPaths(dir, sanitized);

    return this.moveFile(filePath, newPath, { overwrite: false });
  }

  /**
   * List files with filtering and pagination
   */
  async listFiles(
    filter?: FileFilter,
    sort?: FileSortOptions,
    page: number = 1,
    pageSize: number = 50
  ): Promise<FileListResult> {
    let files = Array.from(this.files.values()).map(metadataToFileItem);

    // Apply filter
    if (filter) {
      files = files.filter(file => matchesFilter(file, filter));
    }

    // Apply sort
    if (sort) {
      files = sortFiles(files, sort);
    }

    // Paginate
    return paginateFiles(files, page, pageSize);
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(filePath: string): Promise<FileOperationResult<FileMetadata>> {
    try {
      const sanitizedPath = sanitizePath(filePath);
      const fullPath = this.resolvePath(sanitizedPath);

      const metadata = this.files.get(fullPath);
      if (!metadata) {
        return {
          success: false,
          error: 'File not found',
          timestamp: new Date(),
        };
      }

      return {
        success: true,
        data: metadata,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Update file metadata
   */
  async updateFileMetadata(
    filePath: string,
    updates: Partial<Pick<FileMetadata, 'tags' | 'description' | 'status' | 'permissions'>>
  ): Promise<FileOperationResult<FileMetadata>> {
    try {
      const sanitizedPath = sanitizePath(filePath);
      const fullPath = this.resolvePath(sanitizedPath);

      const metadata = this.files.get(fullPath);
      if (!metadata) {
        return {
          success: false,
          error: 'File not found',
          timestamp: new Date(),
        };
      }

      const updated: FileMetadata = {
        ...metadata,
        ...updates,
        updatedAt: new Date(),
      };

      this.files.set(fullPath, updated);

      return {
        success: true,
        data: updated,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Search files
   */
  async searchFiles(options: FileSearchOptions): Promise<FileOperationResult<FileSearchResult[]>> {
    try {
      const results: FileSearchResult[] = [];
      const query = options.caseSensitive ? options.query : options.query.toLowerCase();

      for (const [filePath, metadata] of this.files) {
        const nameMatch = options.caseSensitive 
          ? metadata.name 
          : metadata.name.toLowerCase();

        if (nameMatch.includes(query)) {
          results.push({
            file: metadataToFileItem(metadata),
            matches: [{ match: metadata.name }],
          });
          continue;
        }

        // Search in content if requested
        if (options.searchInContent) {
          try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const contentToSearch = options.caseSensitive ? content : content.toLowerCase();
            const lines = contentToSearch.split('\n');

            const matches: FileSearchMatch[] = [];
            lines.forEach((line, index) => {
              if (line.includes(query)) {
                matches.push({
                  line: index + 1,
                  match: query,
                  context: lines[index].trim().substring(0, 100),
                });
              }
            });

            if (matches.length > 0) {
              results.push({
                file: metadataToFileItem(metadata),
                matches,
              });
            }
          } catch {
            // Skip files that can't be read as text
          }
        }

        if (options.maxResults && results.length >= options.maxResults) {
          break;
        }
      }

      return {
        success: true,
        data: results,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Create a directory
   */
  async createDirectory(dirPath: string): Promise<FileOperationResult<DirectoryInfo>> {
    try {
      const sanitizedPath = sanitizePath(dirPath);
      const fullPath = this.resolvePath(sanitizedPath);

      if (!isWithinRoot(fullPath, this.config.rootPath)) {
        return {
          success: false,
          error: 'Access denied: path outside root directory',
          timestamp: new Date(),
        };
      }

      await this.ensureDirectory(fullPath);

      const stats = await fs.promises.stat(fullPath);
      const dirInfo: DirectoryInfo = {
        path: fullPath,
        name: path.basename(fullPath),
        fileCount: 0,
        directoryCount: 0,
        totalSize: 0,
        createdAt: stats.birthtime,
        updatedAt: stats.mtime,
      };

      this.directories.set(fullPath, dirInfo);

      return {
        success: true,
        data: dirInfo,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Delete a directory
   */
  async deleteDirectory(dirPath: string, recursive: boolean = false): Promise<FileOperationResult<void>> {
    try {
      const sanitizedPath = sanitizePath(dirPath);
      const fullPath = this.resolvePath(sanitizedPath);

      if (!isWithinRoot(fullPath, this.config.rootPath)) {
        return {
          success: false,
          error: 'Access denied: path outside root directory',
          timestamp: new Date(),
        };
      }

      if (fullPath === this.config.rootPath) {
        return {
          success: false,
          error: 'Cannot delete root directory',
          timestamp: new Date(),
        };
      }

      if (recursive) {
        await fs.promises.rm(fullPath, { recursive: true });
      } else {
        await fs.promises.rmdir(fullPath);
      }

      // Remove files from tracking
      for (const [filePath] of this.files) {
        if (filePath.startsWith(fullPath)) {
          this.files.delete(filePath);
        }
      }

      this.directories.delete(fullPath);

      return {
        success: true,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    const files = Array.from(this.files.values());
    
    let totalSize = 0;
    let largestFile: FileItem | null = null;
    let newestFile: FileItem | null = null;
    let oldestFile: FileItem | null = null;
    const filesByExtension: Record<string, number> = {};
    const filesByMimeType: Record<string, number> = {};

    for (const metadata of files) {
      totalSize += metadata.size;
      const item = metadataToFileItem(metadata);

      if (!largestFile || metadata.size > largestFile.size) {
        largestFile = item;
      }

      if (!newestFile || metadata.createdAt > newestFile.createdAt) {
        newestFile = item;
      }

      if (!oldestFile || metadata.createdAt < oldestFile.createdAt) {
        oldestFile = item;
      }

      const ext = metadata.extension || 'none';
      filesByExtension[ext] = (filesByExtension[ext] || 0) + 1;

      const mime = metadata.mimeType.split('/')[0];
      filesByMimeType[mime] = (filesByMimeType[mime] || 0) + 1;
    }

    return {
      totalFiles: files.length,
      totalDirectories: this.directories.size,
      totalSize,
      availableSpace: this.config.maxStorageSize - totalSize,
      usedSpace: totalSize,
      largestFile,
      newestFile,
      oldestFile,
      filesByExtension,
      filesByMimeType,
    };
  }

  /**
   * Execute batch operations
   */
  async executeBatch(operations: BatchOperationItem[]): Promise<BatchOperationResult> {
    const results: FileOperationResult[] = [];
    const errors: Array<{ path: string; error: string }> = [];
    let successful = 0;
    let failed = 0;

    for (const op of operations) {
      let result: FileOperationResult;

      switch (op.operation) {
        case 'read':
          result = await this.readFile(op.sourcePath!, op.options as FileReadOptions);
          break;
        case 'write':
          result = await this.writeFile(op.sourcePath!, op.content!, op.options as FileWriteOptions);
          break;
        case 'delete':
          result = await this.deleteFile(op.sourcePath!);
          break;
        case 'move':
          result = await this.moveFile(op.sourcePath!, op.targetPath!, op.options as FileTransferOptions);
          break;
        case 'copy':
          result = await this.copyFile(op.sourcePath!, op.targetPath!, op.options as FileTransferOptions);
          break;
        default:
          result = {
            success: false,
            error: `Unknown operation: ${op.operation}`,
            timestamp: new Date(),
          };
      }

      results.push(result);

      if (result.success) {
        successful++;
      } else {
        failed++;
        errors.push({
          path: op.sourcePath || op.targetPath || 'unknown',
          error: result.error || 'Unknown error',
        });
      }
    }

    return {
      successful,
      failed,
      results,
      errors,
    };
  }

  /**
   * Resolve path relative to root
   */
  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(this.config.rootPath, filePath);
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get current configuration
   */
  getConfig(): FileManagementConfig {
    return { ...this.config };
  }
}

/**
 * Singleton instance
 */
let fileManagementService: FileManagementService | null = null;

/**
 * Create or get file management service
 */
export function createFileManagementService(
  config?: Partial<FileManagementConfig>,
  logger?: LoggerInstance
): FileManagementService {
  if (!fileManagementService) {
    fileManagementService = new FileManagementService(config, logger);
  }
  return fileManagementService;
}

/**
 * Get existing file management service
 */
export function getFileManagementService(): FileManagementService | null {
  return fileManagementService;
}

/**
 * Reset file management service
 */
export function resetFileManagementService(): void {
  fileManagementService = null;
}