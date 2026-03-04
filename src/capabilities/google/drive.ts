/**
 * Google Drive API Service
 * 
 * List files, search, upload, download/export, share, create folders.
 */

import { google } from 'googleapis';

function getDrive(auth: any) {
  return google.drive({ version: 'v3', auth });
}

/** Format file size */
function formatSize(bytes: string | null | undefined): string {
  if (!bytes) return '';
  const n = parseInt(bytes, 10);
  if (isNaN(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Format a single file for display */
function formatFile(file: any): string {
  const icon = file.mimeType === 'application/vnd.google-apps.folder' ? '📁' :
               file.mimeType?.includes('spreadsheet') ? '📊' :
               file.mimeType?.includes('document') ? '📄' :
               file.mimeType?.includes('presentation') ? '📽️' :
               file.mimeType?.includes('image') ? '🖼️' :
               file.mimeType?.includes('pdf') ? '📑' : '📎';
  const size = formatSize(file.size);
  const modified = file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : '';
  return `${icon} **${file.name}** ${size ? `(${size})` : ''} — ${modified}\n   ID: \`${file.id}\` | Type: ${file.mimeType}`;
}

/**
 * List files in Drive.
 */
export async function driveList(
  auth: any,
  options?: { query?: string; maxResults?: number; folderId?: string },
): Promise<string> {
  const drive = getDrive(auth);
  const pageSize = options?.maxResults ?? 20;

  let q = options?.query || '';
  if (options?.folderId) {
    q = q ? `${q} and '${options.folderId}' in parents` : `'${options.folderId}' in parents`;
  }
  // Exclude trashed files
  q = q ? `${q} and trashed = false` : 'trashed = false';

  const res = await drive.files.list({
    pageSize,
    q,
    fields: 'files(id, name, mimeType, size, modifiedTime, owners, webViewLink)',
    orderBy: 'modifiedTime desc',
  });

  const files = res.data.files || [];
  if (files.length === 0) {
    return options?.query ? `No files found matching "${options.query}".` : 'No files in Drive.';
  }

  const formatted = files.map(formatFile).join('\n\n');
  return `Found ${files.length} file(s):\n\n${formatted}`;
}

/**
 * Search files by name or content.
 */
export async function driveSearch(
  auth: any,
  query: string,
  maxResults?: number,
): Promise<string> {
  // Use Drive's fullText search
  const driveQuery = `fullText contains '${query.replace(/'/g, "\\'")}'`;
  return driveList(auth, { query: driveQuery, maxResults: maxResults ?? 20 });
}

/**
 * Download/export a file's content.
 */
export async function driveDownload(
  auth: any,
  fileId: string,
): Promise<string> {
  const drive = getDrive(auth);

  // First get file metadata
  const meta = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size',
  });

  const mimeType = meta.data.mimeType || '';
  const name = meta.data.name || fileId;

  // Google Workspace files need to be exported
  if (mimeType.startsWith('application/vnd.google-apps.')) {
    let exportMime = 'text/plain';
    if (mimeType.includes('spreadsheet')) exportMime = 'text/csv';
    else if (mimeType.includes('document')) exportMime = 'text/plain';
    else if (mimeType.includes('presentation')) exportMime = 'text/plain';

    const res = await drive.files.export({
      fileId,
      mimeType: exportMime,
    }, { responseType: 'text' });

    const content = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const truncated = content.length > 5000 ? content.slice(0, 5000) + '\n\n... (truncated)' : content;
    return `**${name}** (${mimeType})\n\n${truncated}`;
  }

  // Regular files — get content as text
  const size = parseInt(meta.data.size || '0', 10);
  if (size > 5 * 1024 * 1024) {
    return `**${name}** is ${formatSize(meta.data.size)} — too large to display. Use Drive web UI to download.`;
  }

  try {
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'text' },
    );
    const content = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const truncated = content.length > 5000 ? content.slice(0, 5000) + '\n\n... (truncated)' : content;
    return `**${name}**\n\n${truncated}`;
  } catch {
    return `**${name}** (${mimeType}) — ID: ${fileId}. File downloaded but content is binary/non-text.`;
  }
}

/**
 * Upload a text file to Drive.
 */
export async function driveUpload(
  auth: any,
  options: { name: string; content: string; folderId?: string; mimeType?: string },
): Promise<string> {
  const drive = getDrive(auth);
  const { Readable } = await import('stream');

  const fileMetadata: any = { name: options.name };
  if (options.folderId) {
    fileMetadata.parents = [options.folderId];
  }

  const media = {
    mimeType: options.mimeType || 'text/plain',
    body: Readable.from(options.content),
  };

  const res = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: 'id, name, webViewLink',
  });

  return `File "${res.data.name}" uploaded. ID: ${res.data.id}\nLink: ${res.data.webViewLink || 'N/A'}`;
}

/**
 * Share a file with someone.
 */
export async function driveShare(
  auth: any,
  options: { fileId: string; email: string; role?: string },
): Promise<string> {
  const drive = getDrive(auth);

  await drive.permissions.create({
    fileId: options.fileId,
    requestBody: {
      type: 'user',
      role: options.role || 'reader',
      emailAddress: options.email,
    },
  });

  return `File ${options.fileId} shared with ${options.email} as ${options.role || 'reader'}.`;
}

/**
 * Create a folder in Drive.
 */
export async function driveCreateFolder(
  auth: any,
  options: { name: string; parentId?: string },
): Promise<string> {
  const drive = getDrive(auth);

  const fileMetadata: any = {
    name: options.name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (options.parentId) {
    fileMetadata.parents = [options.parentId];
  }

  const res = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id, name, webViewLink',
  });

  return `Folder "${res.data.name}" created. ID: ${res.data.id}`;
}
