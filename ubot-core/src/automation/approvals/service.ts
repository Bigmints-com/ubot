/**
 * Pending Approvals
 * Manages the approval queue for owner consent requests.
 * When the bot encounters a question it can't answer or needs owner input on,
 * it creates a pending approval. The owner responds, and the bot relays the answer.
 */

import type { DatabaseConnection } from '../../data/database/types.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ApprovalStatus = 'pending' | 'resolved';

export interface PendingApproval {
  id: string;
  /** The question being asked to the owner */
  question: string;
  /** Context: who is asking and why */
  context: string;
  /** WhatsApp JID of the person waiting for a response */
  requesterJid: string;
  /** The original conversation session ID */
  sessionId: string;
  /** Current status */
  status: ApprovalStatus;
  /** The owner's response (null until resolved) */
  ownerResponse: string | null;
  /** When the approval was created */
  createdAt: Date;
  /** When the owner responded */
  resolvedAt: Date | null;
}



function generateId(): string {
  return `apr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------ */
/*  Row mapping                                                        */
/* ------------------------------------------------------------------ */

interface ApprovalRow {
  id: string;
  question: string;
  context: string;
  requester_jid: string;
  session_id: string;
  status: string;
  owner_response: string | null;
  created_at: string;
  resolved_at: string | null;
}

function rowToApproval(row: ApprovalRow): PendingApproval {
  return {
    id: row.id,
    question: row.question,
    context: row.context,
    requesterJid: row.requester_jid,
    sessionId: row.session_id,
    status: row.status as ApprovalStatus,
    ownerResponse: row.owner_response,
    createdAt: new Date(row.created_at),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
  };
}

/* ------------------------------------------------------------------ */
/*  Repository                                                         */
/* ------------------------------------------------------------------ */

export interface ApprovalStore {
  /** Create a new pending approval */
  create(data: {
    question: string;
    context: string;
    requesterJid: string;
    sessionId: string;
  }): Promise<PendingApproval>;

  /** Get all pending approvals */
  getPending(): Promise<PendingApproval[]>;

  /** Get all approvals (any status) */
  getAll(): Promise<PendingApproval[]>;

  /** Get a specific approval by ID */
  getById(id: string): Promise<PendingApproval | null>;

  /** Check if an approval is still pending (not resolved) */
  isPending(id: string): Promise<boolean>;

  /** Resolve an approval with the owner's response */
  resolve(id: string, ownerResponse: string): Promise<PendingApproval | null>;

  /** Delete an approval by ID */
  delete(id: string): Promise<boolean>;
}

export function createApprovalStore(db: DatabaseConnection): ApprovalStore {
  return {
    async create(data) {
      const id = generateId();
      const now = new Date().toISOString();
      await db.get_client().from('ubot_pending_approvals').insert({
        id,
        question: data.question,
        context: data.context,
        requester_jid: data.requesterJid,
        session_id: data.sessionId,
        status: 'pending',
        created_at: now
      });
      return (await this.getById(id))!;
    },

    async getPending() {
      const { data, error } = await db.get_client()
        .from('ubot_pending_approvals')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
        
      if (error || !data) return [];
      return data.map(rowToApproval);
    },

    async getAll() {
      const { data, error } = await db.get_client()
        .from('ubot_pending_approvals')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error || !data) return [];
      return data.map(rowToApproval);
    },

    async getById(id: string) {
      const { data, error } = await db.get_client()
        .from('ubot_pending_approvals')
        .select('*')
        .eq('id', id)
        .single();
        
      if (error || !data) return null;
      return rowToApproval(data);
    },

    async isPending(id: string) {
      const approval = await this.getById(id);
      return approval !== null && approval.status === 'pending';
    },

    async resolve(id: string, ownerResponse: string) {
      const now = new Date().toISOString();
      await db.get_client()
        .from('ubot_pending_approvals')
        .update({
          status: 'resolved',
          owner_response: ownerResponse,
          resolved_at: now
        })
        .eq('id', id);
        
      return this.getById(id);
    },

    async delete(id: string) {
      const existing = await this.getById(id);
      if (!existing) return false;
      await db.get_client().from('ubot_pending_approvals').delete().eq('id', id);
      return true;
    },
  };
}
