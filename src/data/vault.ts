/**
 * Vault — Encrypted Secure Storage
 *
 * Provides AES-256-GCM encrypted storage for sensitive data and documents.
 * Owner-only. Data stored in workspace/vault/ as encrypted JSON files.
 * Key auto-generated on first use and stored in workspace/vault/.vault-key.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VaultItem {
  id: string;
  label: string;
  category: string;
  type: 'text' | 'document';
  /** For text items: the plaintext value */
  value?: string;
  /** For document items: original filename */
  filename?: string;
  /** For document items: MIME type */
  mimeType?: string;
  /** Optional tags / metadata */
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

interface EncryptedPayload {
  iv: string;       // hex
  tag: string;      // hex
  data: string;     // hex (encrypted)
}

interface VaultIndex {
  items: Array<{
    id: string;
    label: string;
    category: string;
    type: 'text' | 'document';
    filename?: string;
    mimeType?: string;
    metadata?: Record<string, string>;
    createdAt: string;
    updatedAt: string;
  }>;
}

// ─── Vault Service ───────────────────────────────────────────────────────────

export class VaultService {
  private vaultDir: string;
  private keyPath: string;
  private indexPath: string;
  private encryptionKey: Buffer | null = null;

  constructor(workspacePath: string) {
    this.vaultDir = path.join(workspacePath, 'vault');
    this.keyPath = path.join(this.vaultDir, '.vault-key');
    this.indexPath = path.join(this.vaultDir, '.vault-index');
  }

  /** Ensure vault directory and key exist */
  private init(): void {
    if (!fs.existsSync(this.vaultDir)) {
      fs.mkdirSync(this.vaultDir, { recursive: true });
    }
    if (!this.encryptionKey) {
      this.encryptionKey = this.loadOrCreateKey();
    }
  }

  /** Load existing key or generate a new one */
  private loadOrCreateKey(): Buffer {
    if (fs.existsSync(this.keyPath)) {
      const hex = fs.readFileSync(this.keyPath, 'utf8').trim();
      return Buffer.from(hex, 'hex');
    }
    // Generate a random 256-bit key
    const key = crypto.randomBytes(32);
    fs.writeFileSync(this.keyPath, key.toString('hex'), { mode: 0o600 });
    return key;
  }

  /** Encrypt data with AES-256-GCM */
  private encrypt(plaintext: string): EncryptedPayload {
    this.init();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey!, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();
    return {
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      data: encrypted,
    };
  }

  /** Decrypt data with AES-256-GCM */
  private decrypt(payload: EncryptedPayload): string {
    this.init();
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey!,
      Buffer.from(payload.iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));
    let decrypted = decipher.update(payload.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /** Load the vault index */
  private loadIndex(): VaultIndex {
    this.init();
    if (!fs.existsSync(this.indexPath)) {
      return { items: [] };
    }
    try {
      const encrypted = JSON.parse(fs.readFileSync(this.indexPath, 'utf8')) as EncryptedPayload;
      const json = this.decrypt(encrypted);
      return JSON.parse(json) as VaultIndex;
    } catch {
      return { items: [] };
    }
  }

  /** Save the vault index */
  private saveIndex(index: VaultIndex): void {
    const encrypted = this.encrypt(JSON.stringify(index));
    fs.writeFileSync(this.indexPath, JSON.stringify(encrypted), { mode: 0o600 });
  }

  /** Store a text item in the vault */
  store(label: string, value: string, category: string = 'general', metadata?: Record<string, string>): VaultItem {
    this.init();
    const index = this.loadIndex();
    const now = new Date().toISOString();

    // Check if label already exists — update if so
    const existing = index.items.find(i => i.label.toLowerCase() === label.toLowerCase());
    const id = existing?.id || crypto.randomUUID();

    const item: VaultItem = {
      id,
      label,
      category,
      type: 'text',
      value,
      metadata,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    // Encrypt and save the value
    const encrypted = this.encrypt(JSON.stringify({ value, metadata }));
    fs.writeFileSync(path.join(this.vaultDir, `${id}.enc`), JSON.stringify(encrypted), { mode: 0o600 });

    // Update index
    if (existing) {
      Object.assign(existing, { label, category, type: 'text', metadata, updatedAt: now });
    } else {
      index.items.push({ id, label, category, type: 'text', metadata, createdAt: now, updatedAt: now });
    }
    this.saveIndex(index);

    return item;
  }

  /** Store a document (file) in the vault */
  storeDocument(
    label: string,
    filePath: string,
    category: string = 'documents',
    metadata?: Record<string, string>,
  ): VaultItem {
    this.init();
    const index = this.loadIndex();
    const now = new Date().toISOString();

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const filename = path.basename(filePath);
    const ext = path.extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.webp': 'image/webp',
      '.txt': 'text/plain', '.md': 'text/markdown',
      '.csv': 'text/csv', '.json': 'application/json',
    };
    const mimeType = mimeMap[ext] || 'application/octet-stream';

    const existing = index.items.find(i => i.label.toLowerCase() === label.toLowerCase());
    const id = existing?.id || crypto.randomUUID();

    // Read file and encrypt
    const fileData = fs.readFileSync(filePath);
    const base64 = fileData.toString('base64');
    const encrypted = this.encrypt(JSON.stringify({ base64, filename, mimeType, metadata }));
    fs.writeFileSync(path.join(this.vaultDir, `${id}.enc`), JSON.stringify(encrypted), { mode: 0o600 });

    const item: VaultItem = {
      id, label, category, type: 'document',
      filename, mimeType, metadata,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    if (existing) {
      Object.assign(existing, { label, category, type: 'document', filename, mimeType, metadata, updatedAt: now });
    } else {
      index.items.push({ id, label, category, type: 'document', filename, mimeType, metadata, createdAt: now, updatedAt: now });
    }
    this.saveIndex(index);

    return item;
  }

  /** Retrieve a vault item by label or ID */
  retrieve(labelOrId: string): VaultItem | null {
    this.init();
    const index = this.loadIndex();
    const entry = index.items.find(
      i => i.id === labelOrId || i.label.toLowerCase() === labelOrId.toLowerCase(),
    );
    if (!entry) return null;

    const encPath = path.join(this.vaultDir, `${entry.id}.enc`);
    if (!fs.existsSync(encPath)) return null;

    try {
      const encrypted = JSON.parse(fs.readFileSync(encPath, 'utf8')) as EncryptedPayload;
      const decrypted = JSON.parse(this.decrypt(encrypted));

      const item: VaultItem = {
        ...entry,
        value: decrypted.value,
        metadata: decrypted.metadata || entry.metadata,
      };

      // For documents, include filename info but not the full base64 blob
      if (entry.type === 'document') {
        item.filename = decrypted.filename || entry.filename;
        item.mimeType = decrypted.mimeType || entry.mimeType;
        item.value = undefined; // Don't leak binary
      }

      return item;
    } catch {
      return null;
    }
  }

  /** Retrieve raw document data (for saving/exporting) */
  retrieveDocumentData(labelOrId: string): { buffer: Buffer; filename: string; mimeType: string } | null {
    this.init();
    const index = this.loadIndex();
    const entry = index.items.find(
      i => (i.id === labelOrId || i.label.toLowerCase() === labelOrId.toLowerCase()) && i.type === 'document',
    );
    if (!entry) return null;

    const encPath = path.join(this.vaultDir, `${entry.id}.enc`);
    if (!fs.existsSync(encPath)) return null;

    try {
      const encrypted = JSON.parse(fs.readFileSync(encPath, 'utf8')) as EncryptedPayload;
      const decrypted = JSON.parse(this.decrypt(encrypted));
      return {
        buffer: Buffer.from(decrypted.base64, 'base64'),
        filename: decrypted.filename || 'file',
        mimeType: decrypted.mimeType || 'application/octet-stream',
      };
    } catch {
      return null;
    }
  }

  /** List vault items, optionally filtered by category */
  list(category?: string): VaultItem[] {
    this.init();
    const index = this.loadIndex();
    let items = index.items;
    if (category) {
      items = items.filter(i => i.category.toLowerCase() === category.toLowerCase());
    }
    // Return index entries without decrypting values (summary only)
    return items.map(i => ({
      ...i,
      value: undefined,
    }));
  }

  /** Search vault items by label keyword */
  search(query: string): VaultItem[] {
    const items = this.list();
    const q = query.toLowerCase();
    return items.filter(
      i => i.label.toLowerCase().includes(q) ||
           i.category.toLowerCase().includes(q) ||
           (i.filename && i.filename.toLowerCase().includes(q)),
    );
  }

  /** Delete a vault item by label or ID */
  delete(labelOrId: string): boolean {
    this.init();
    const index = this.loadIndex();
    const idx = index.items.findIndex(
      i => i.id === labelOrId || i.label.toLowerCase() === labelOrId.toLowerCase(),
    );
    if (idx === -1) return false;

    const entry = index.items[idx];
    const encPath = path.join(this.vaultDir, `${entry.id}.enc`);
    if (fs.existsSync(encPath)) {
      fs.unlinkSync(encPath);
    }

    index.items.splice(idx, 1);
    this.saveIndex(index);
    return true;
  }

  /** Get vault statistics */
  stats(): { total: number; categories: Record<string, number>; textItems: number; documentItems: number } {
    const items = this.list();
    const categories: Record<string, number> = {};
    let textItems = 0;
    let documentItems = 0;

    for (const item of items) {
      categories[item.category] = (categories[item.category] || 0) + 1;
      if (item.type === 'text') textItems++;
      else documentItems++;
    }

    return { total: items.length, categories, textItems, documentItems };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let vaultInstance: VaultService | null = null;

export function getVaultService(workspacePath?: string): VaultService {
  if (!vaultInstance && workspacePath) {
    vaultInstance = new VaultService(workspacePath);
  }
  if (!vaultInstance) {
    throw new Error('Vault not initialized — workspace path required');
  }
  return vaultInstance;
}

export function resetVaultService(): void {
  vaultInstance = null;
}
