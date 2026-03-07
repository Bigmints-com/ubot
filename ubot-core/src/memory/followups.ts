/**
 * Follow-Up Store
 * SQLite-backed follow-up tracking for conversation continuity.
 * 
 * Ensures every conversation reaches closure by tracking pending actions,
 * scheduled check-ins, and unresolved items across all channels.
 */

import { v4 as uuidv4 } from 'uuid';
import type { DatabaseConnection } from '../data/database/types.js';
import type { Migration } from '../data/database/types.js';

// ─── Types ────────────────────────────────────────────────

export type FollowUpStatus = 'pending' | 'completed' | 'cancelled' | 'expired';
export type FollowUpPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface FollowUp {
  id: string;
  sessionId: string;
  contactId: string;
  channel: string;
  reason: string;
  context: string;
  status: FollowUpStatus;
  priority: FollowUpPriority;
  followUpAt: Date;
  createdAt: Date;
  completedAt: Date | null;
  result: string | null;
  /** Number of times this follow-up has been attempted */
  attempts: number;
  /** Max attempts before auto-expiring */
  maxAttempts: number;
}

export interface FollowUpCreate {
  sessionId: string;
  contactId: string;
  channel: string;
  reason: string;
  context: string;
  priority?: FollowUpPriority;
  followUpAt: Date;
  maxAttempts?: number;
}

export interface FollowUpFilter {
  status?: FollowUpStatus | FollowUpStatus[];
  sessionId?: string;
  contactId?: string;
  channel?: string;
  priority?: FollowUpPriority;
  dueBefore?: Date;
  dueAfter?: Date;
}

// ─── Migration ────────────────────────────────────────────

export const followUpMigrations: Migration[] = [
  {
    id: '010',
    name: 'create_followups',
    up: `
      CREATE TABLE IF NOT EXISTS follow_ups (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        contact_id TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'whatsapp',
        reason TEXT NOT NULL,
        context TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        priority TEXT NOT NULL DEFAULT 'normal',
        follow_up_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        result TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3
      );

      CREATE INDEX IF NOT EXISTS idx_followups_status ON follow_ups(status);
      CREATE INDEX IF NOT EXISTS idx_followups_due ON follow_ups(follow_up_at);
      CREATE INDEX IF NOT EXISTS idx_followups_session ON follow_ups(session_id);
      CREATE INDEX IF NOT EXISTS idx_followups_contact ON follow_ups(contact_id);
    `,
    down: `
      DROP TABLE IF EXISTS follow_ups;
    `,
  },
];

// ─── Store Interface ──────────────────────────────────────

export interface FollowUpStore {
  /** Create a new follow-up */
  create(input: FollowUpCreate): FollowUp;
  /** Get a follow-up by ID */
  get(id: string): FollowUp | undefined;
  /** List follow-ups with optional filtering */
  list(filter?: FollowUpFilter): FollowUp[];
  /** Get all follow-ups that are due (follow_up_at <= now and status = pending) */
  getDue(): FollowUp[];
  /** Get pending follow-ups for a specific session */
  getForSession(sessionId: string): FollowUp[];
  /** Get pending follow-ups for a specific contact */
  getForContact(contactId: string): FollowUp[];
  /** Mark a follow-up as completed */
  complete(id: string, result: string): boolean;
  /** Cancel a follow-up */
  cancel(id: string, reason?: string): boolean;
  /** Mark a follow-up as expired */
  expire(id: string): boolean;
  /** Increment attempts and optionally reschedule */
  recordAttempt(id: string, newFollowUpAt?: Date): boolean;
  /** Delete a follow-up */
  delete(id: string): boolean;
  /** Get summary stats */
  getStats(): { pending: number; completed: number; cancelled: number; expired: number; overdue: number };
}

// ─── Implementation ───────────────────────────────────────

function rowToFollowUp(row: any): FollowUp {
  return {
    id: row.id,
    sessionId: row.session_id,
    contactId: row.contact_id,
    channel: row.channel,
    reason: row.reason,
    context: row.context,
    status: row.status as FollowUpStatus,
    priority: row.priority as FollowUpPriority,
    followUpAt: new Date(row.follow_up_at),
    createdAt: new Date(row.created_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    result: row.result,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
  };
}

export function createFollowUpStore(db: DatabaseConnection): FollowUpStore {
  return {
    create(input: FollowUpCreate): FollowUp {
      const id = uuidv4();
      const now = new Date().toISOString();
      const priority = input.priority || 'normal';
      const maxAttempts = input.maxAttempts || 3;

      db.execute(
        `INSERT INTO follow_ups (id, session_id, contact_id, channel, reason, context, status, priority, follow_up_at, created_at, attempts, max_attempts)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, 0, ?)`,
        [id, input.sessionId, input.contactId, input.channel, input.reason, input.context, priority, input.followUpAt.toISOString(), now, maxAttempts]
      );

      return {
        id,
        sessionId: input.sessionId,
        contactId: input.contactId,
        channel: input.channel,
        reason: input.reason,
        context: input.context,
        status: 'pending',
        priority,
        followUpAt: input.followUpAt,
        createdAt: new Date(now),
        completedAt: null,
        result: null,
        attempts: 0,
        maxAttempts,
      };
    },

    get(id: string): FollowUp | undefined {
      const row = db.queryOne<any>('SELECT * FROM follow_ups WHERE id = ?', [id]);
      return row ? rowToFollowUp(row) : undefined;
    },

    list(filter?: FollowUpFilter): FollowUp[] {
      let sql = 'SELECT * FROM follow_ups WHERE 1=1';
      const params: any[] = [];

      if (filter?.status) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        sql += ` AND status IN (${statuses.map(() => '?').join(',')})`;
        params.push(...statuses);
      }
      if (filter?.sessionId) {
        sql += ' AND session_id = ?';
        params.push(filter.sessionId);
      }
      if (filter?.contactId) {
        sql += ' AND contact_id = ?';
        params.push(filter.contactId);
      }
      if (filter?.channel) {
        sql += ' AND channel = ?';
        params.push(filter.channel);
      }
      if (filter?.priority) {
        sql += ' AND priority = ?';
        params.push(filter.priority);
      }
      if (filter?.dueBefore) {
        sql += ' AND follow_up_at <= ?';
        params.push(filter.dueBefore.toISOString());
      }
      if (filter?.dueAfter) {
        sql += ' AND follow_up_at >= ?';
        params.push(filter.dueAfter.toISOString());
      }

      sql += ' ORDER BY follow_up_at ASC';
      const rows = db.query<any>(sql, params);
      return rows.map(rowToFollowUp);
    },

    getDue(): FollowUp[] {
      const now = new Date().toISOString();
      const rows = db.query<any>(
        'SELECT * FROM follow_ups WHERE status = ? AND follow_up_at <= ? ORDER BY priority DESC, follow_up_at ASC',
        ['pending', now]
      );
      return rows.map(rowToFollowUp);
    },

    getForSession(sessionId: string): FollowUp[] {
      const rows = db.query<any>(
        'SELECT * FROM follow_ups WHERE session_id = ? AND status = ? ORDER BY follow_up_at ASC',
        [sessionId, 'pending']
      );
      return rows.map(rowToFollowUp);
    },

    getForContact(contactId: string): FollowUp[] {
      const rows = db.query<any>(
        'SELECT * FROM follow_ups WHERE contact_id = ? AND status = ? ORDER BY follow_up_at ASC',
        [contactId, 'pending']
      );
      return rows.map(rowToFollowUp);
    },

    complete(id: string, result: string): boolean {
      const now = new Date().toISOString();
      db.execute(
        'UPDATE follow_ups SET status = ?, completed_at = ?, result = ? WHERE id = ? AND status = ?',
        ['completed', now, result, id, 'pending']
      );
      // Check if row was affected
      const row = db.queryOne<any>('SELECT id FROM follow_ups WHERE id = ? AND status = ?', [id, 'completed']);
      return !!row;
    },

    cancel(id: string, reason?: string): boolean {
      const now = new Date().toISOString();
      db.execute(
        'UPDATE follow_ups SET status = ?, completed_at = ?, result = ? WHERE id = ? AND status = ?',
        ['cancelled', now, reason || 'Cancelled', id, 'pending']
      );
      const row = db.queryOne<any>('SELECT id FROM follow_ups WHERE id = ? AND status = ?', [id, 'cancelled']);
      return !!row;
    },

    expire(id: string): boolean {
      const now = new Date().toISOString();
      db.execute(
        'UPDATE follow_ups SET status = ?, completed_at = ?, result = ? WHERE id = ? AND status = ?',
        ['expired', now, 'Max attempts reached', id, 'pending']
      );
      const row = db.queryOne<any>('SELECT id FROM follow_ups WHERE id = ? AND status = ?', [id, 'expired']);
      return !!row;
    },

    recordAttempt(id: string, newFollowUpAt?: Date): boolean {
      const followUp = this.get(id);
      if (!followUp || followUp.status !== 'pending') return false;

      const newAttempts = followUp.attempts + 1;
      if (newAttempts >= followUp.maxAttempts) {
        return this.expire(id);
      }

      if (newFollowUpAt) {
        db.execute(
          'UPDATE follow_ups SET attempts = ?, follow_up_at = ? WHERE id = ?',
          [newAttempts, newFollowUpAt.toISOString(), id]
        );
      } else {
        db.execute(
          'UPDATE follow_ups SET attempts = ? WHERE id = ?',
          [newAttempts, id]
        );
      }
      return true;
    },

    delete(id: string): boolean {
      db.execute('DELETE FROM follow_ups WHERE id = ?', [id]);
      return true;
    },

    getStats(): { pending: number; completed: number; cancelled: number; expired: number; overdue: number } {
      const now = new Date().toISOString();
      const pending = db.queryOne<any>('SELECT COUNT(*) as count FROM follow_ups WHERE status = ?', ['pending'])?.count || 0;
      const completed = db.queryOne<any>('SELECT COUNT(*) as count FROM follow_ups WHERE status = ?', ['completed'])?.count || 0;
      const cancelled = db.queryOne<any>('SELECT COUNT(*) as count FROM follow_ups WHERE status = ?', ['cancelled'])?.count || 0;
      const expired = db.queryOne<any>('SELECT COUNT(*) as count FROM follow_ups WHERE status = ?', ['expired'])?.count || 0;
      const overdue = db.queryOne<any>('SELECT COUNT(*) as count FROM follow_ups WHERE status = ? AND follow_up_at <= ?', ['pending', now])?.count || 0;

      return { pending, completed, cancelled, expired, overdue };
    },
  };
}
