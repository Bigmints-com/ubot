/**
 * Universal Skill Engine Types
 * 
 * Skills follow the pipeline: Event → Trigger → Processor → Outcome
 * Event sources are pluggable adapters (WhatsApp, email, calendar, cron, etc.)
 */

// ─── Event (Universal Input) ──────────────────────────────

/** A universal event emitted by any adapter */
export interface SkillEvent {
  /** Which adapter emitted this ('whatsapp', 'email', 'calendar', 'cron', 'webhook') */
  source: string;
  /** Event type within the source ('message', 'email.received', 'event.starting', 'tick') */
  type: string;
  /** Source-specific payload */
  data: Record<string, unknown>;
  /** Standardized fields (adapters normalize into these) */
  from?: string;
  to?: string;
  body?: string;
  timestamp: Date;
}

// ─── Trigger ──────────────────────────────────────────────

/** Fast pre-filters applied before any LLM call */
export interface TriggerFilters {
  /** Only from these contacts (phone numbers, emails, etc.) */
  contacts?: string[];
  /** Only from these groups (JIDs, channel IDs, etc.) */
  groups?: string[];
  /** Only from groups (ignore DMs) */
  groupsOnly?: boolean;
  /** Only from this source ('whatsapp', 'email', etc.) */
  source?: string;
  /** Regex pattern for fast pre-match on body */
  pattern?: string;
}

/** Defines when a skill fires */
export interface SkillTrigger {
  /** Which source:type pairs activate this skill. e.g. ['whatsapp:message', 'email:received'] */
  events: string[];
  /** Natural language condition — LLM decides if it matches.
   *  e.g. "when someone asks about my schedule" */
  condition?: string;
  /** Fast pre-filters (no LLM cost) */
  filters?: TriggerFilters;
}

// ─── Processor ────────────────────────────────────────────

/** Defines how the skill handles the event */
export interface SkillProcessor {
  /** Natural language instructions for the LLM.
   *  e.g. "Reply casually on my behalf. If you don't know, say I'll call back." */
  instructions: string;
  /** Optional: restrict which tools the LLM can use */
  tools?: string[];
}

// ─── Outcome ──────────────────────────────────────────────

/** Possible outcome actions */
export type OutcomeAction = 'reply' | 'send' | 'store' | 'silent' | 'custom';

/** Defines what happens with the processor's result */
export interface SkillOutcome {
  /** What to do with the result */
  action: OutcomeAction;
  /** For 'send': target recipient (phone, email, etc.) */
  target?: string;
  /** For 'send': which channel to use */
  channel?: string;
}

// ─── Skill (The Complete Pipeline) ─────────────────────────

/** A user-created skill — stored in DB, not in code */
export interface Skill {
  id: string;
  name: string;
  /** Natural language description of what this skill does */
  description: string;
  /** 1. TRIGGER — what activates this skill */
  trigger: SkillTrigger;
  /** 2. PROCESSOR — how to handle the event */
  processor: SkillProcessor;
  /** 3. OUTCOME — what to do with the result */
  outcome: SkillOutcome;
  /** Whether the skill is active */
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Execution Results ────────────────────────────────────

/** Result of running a skill */
export interface SkillRunResult {
  skillId: string;
  success: boolean;
  /** The LLM's response / actions taken */
  response: string;
  /** Tool calls made during execution */
  toolCalls: Array<{ tool: string; args: Record<string, unknown>; result?: string }>;
  /** How long execution took */
  duration: number;
  error?: string;
}

// ─── Legacy Compat (for migration) ────────────────────────

/** @deprecated Use Skill instead */
export type SkillTriggerType = 'manual' | 'on_message' | 'scheduled';

/** @deprecated Use Skill instead */
export interface SkillParam {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean';
  description?: string;
  default?: string | number | boolean;
  required?: boolean;
}

/** @deprecated Use Skill instead */
export type UserSkill = Skill;
