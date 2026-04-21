/**
 * Follow-Up Store
 * SQLite-backed follow-up tracking for conversation continuity.
 * 
 * Ensures every conversation reaches closure by tracking pending actions,
 * scheduled check-ins, and unresolved items across all channels.
 */

import { v4 as uuidv4 } from 'uuid';
import type { DatabaseConnection } from '../data/database/types.js';

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
  /** Optional: ID of the approval this follow-up was created for (set by ask_owner) */
  approvalId?: string;
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
  /** Optional: ID of the approval this follow-up was created for (set by ask_owner) */
  approvalId?: string;
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



// ─── Store Interface ──────────────────────────────────────

export interface FollowUpStore {
  create(input: FollowUpCreate): Promise<FollowUp>;
  get(id: string): Promise<FollowUp | undefined>;
  list(filter?: FollowUpFilter): Promise<FollowUp[]>;
  getDue(): Promise<FollowUp[]>;
  getForSession(sessionId: string): Promise<FollowUp[]>;
  getForContact(contactId: string): Promise<FollowUp[]>;
  complete(id: string, result: string): Promise<boolean>;
  cancel(id: string, reason?: string): Promise<boolean>;
  expire(id: string, reason?: string): Promise<boolean>;
  recordAttempt(id: string, newFollowUpAt?: Date): Promise<boolean>;
  delete(id: string): Promise<boolean>;
  getStats(): Promise<{ pending: number; completed: number; cancelled: number; expired: number; overdue: number }>;
}

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
    approvalId: row.approval_id || undefined,
  };
}

export function createFollowUpStore(db: DatabaseConnection): FollowUpStore {
  const getClient = () => db.get_client();

  return {
    async create(input: FollowUpCreate): Promise<FollowUp> {
      const id = uuidv4();
      const now = new Date().toISOString();
      const priority = input.priority || 'normal';
      const maxAttempts = input.maxAttempts || 3;

      await getClient().from('ubot_follow_ups').insert({
        id,
        session_id: input.sessionId,
        contact_id: input.contactId,
        channel: input.channel,
        reason: input.reason,
        context: input.context || '',
        status: 'pending',
        priority,
        follow_up_at: input.followUpAt.toISOString(),
        created_at: now,
        attempts: 0,
        max_attempts: maxAttempts,
        approval_id: input.approvalId || null,
      });

      return {
        id,
        sessionId: input.sessionId,
        contactId: input.contactId,
        channel: input.channel,
        reason: input.reason,
        context: input.context || '',
        status: 'pending',
        priority,
        followUpAt: input.followUpAt,
        createdAt: new Date(now),
        completedAt: null,
        result: null,
        attempts: 0,
        maxAttempts,
        approvalId: input.approvalId,
      };
    },

    async get(id: string): Promise<FollowUp | undefined> {
      const { data, error } = await getClient().from('ubot_follow_ups').select('*').eq('id', id).single();
      if (error || !data) return undefined;
      return rowToFollowUp(data);
    },

    async list(filter?: FollowUpFilter): Promise<FollowUp[]> {
      let query = getClient().from('ubot_follow_ups').select('*');

      if (filter?.status) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        query = query.in('status', statuses);
      }
      if (filter?.sessionId) {
        query = query.eq('session_id', filter.sessionId);
      }
      if (filter?.contactId) {
        query = query.eq('contact_id', filter.contactId);
      }
      if (filter?.channel) {
        query = query.eq('channel', filter.channel);
      }
      if (filter?.priority) {
        query = query.eq('priority', filter.priority);
      }
      if (filter?.dueBefore) {
        query = query.lte('follow_up_at', filter.dueBefore.toISOString());
      }
      if (filter?.dueAfter) {
        query = query.gte('follow_up_at', filter.dueAfter.toISOString());
      }

      const { data, error } = await query.order('follow_up_at', { ascending: true });
      if (error || !data) return [];
      return data.map(rowToFollowUp);
    },

    async getDue(): Promise<FollowUp[]> {
      const now = new Date().toISOString();
      const { data, error } = await getClient()
        .from('ubot_follow_ups')
        .select('*')
        .eq('status', 'pending')
        .lte('follow_up_at', now)
        .order('priority', { ascending: false })
        .order('follow_up_at', { ascending: true });
      if (error || !data) return [];
      return data.map(rowToFollowUp);
    },

    async getForSession(sessionId: string): Promise<FollowUp[]> {
      const { data, error } = await getClient()
        .from('ubot_follow_ups')
        .select('*')
        .eq('session_id', sessionId)
        .eq('status', 'pending')
        .order('follow_up_at', { ascending: true });
      if (error || !data) return [];
      return data.map(rowToFollowUp);
    },

    async getForContact(contactId: string): Promise<FollowUp[]> {
      const { data, error } = await getClient()
        .from('ubot_follow_ups')
        .select('*')
        .eq('contact_id', contactId)
        .eq('status', 'pending')
        .order('follow_up_at', { ascending: true });
      if (error || !data) return [];
      return data.map(rowToFollowUp);
    },

    async complete(id: string, result: string): Promise<boolean> {
      const now = new Date().toISOString();
      const { error } = await getClient()
        .from('ubot_follow_ups')
        .update({ status: 'completed', completed_at: now, result })
        .eq('id', id)
        .eq('status', 'pending');
      return !error;
    },

    async cancel(id: string, reason?: string): Promise<boolean> {
      const now = new Date().toISOString();
      const { error } = await getClient()
        .from('ubot_follow_ups')
        .update({ status: 'cancelled', completed_at: now, result: reason || 'Cancelled' })
        .eq('id', id)
        .eq('status', 'pending');
      return !error;
    },

    async expire(id: string, reason?: string): Promise<boolean> {
      const now = new Date().toISOString();
      const { error } = await getClient()
        .from('ubot_follow_ups')
        .update({ status: 'expired', completed_at: now, result: reason || 'Max attempts reached' })
        .eq('id', id)
        .eq('status', 'pending');
      return !error;
    },

    async recordAttempt(id: string, newFollowUpAt?: Date): Promise<boolean> {
      const followUp = await this.get(id);
      if (!followUp || followUp.status !== 'pending') return false;

      const newAttempts = followUp.attempts + 1;
      if (newAttempts >= followUp.maxAttempts) {
        return await this.expire(id);
      }

      const updates: any = { attempts: newAttempts };
      if (newFollowUpAt) {
        updates.follow_up_at = newFollowUpAt.toISOString();
      }

      await getClient().from('ubot_follow_ups').update(updates).eq('id', id);
      return true;
    },

    async delete(id: string): Promise<boolean> {
      const { error } = await getClient().from('ubot_follow_ups').delete().eq('id', id);
      return !error;
    },

    async getStats(): Promise<{ pending: number; completed: number; cancelled: number; expired: number; overdue: number }> {
      const now = new Date().toISOString();
      
      const getCount = async (status?: string, overdue?: boolean) => {
        let q = getClient().from('ubot_follow_ups').select('*', { count: 'exact', head: true });
        if (status) q = q.eq('status', status);
        if (overdue) q = q.lte('follow_up_at', now);
        const { count } = await q;
        return count || 0;
      };

      const [pending, completed, cancelled, expired, overdue] = await Promise.all([
        getCount('pending'),
        getCount('completed'),
        getCount('cancelled'),
        getCount('expired'),
        getCount('pending', true)
      ]);

      return { pending, completed, cancelled, expired, overdue };
    },
  };
}
