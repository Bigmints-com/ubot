/**
 * Universal Skill Engine
 * 
 * Pipeline: Event → Trigger Match → Processor (LLM) → Outcome
 * 
 * Two-phase matching:
 *   Phase 1: Fast filters (contacts, groups, pattern) — no LLM cost
 *   Phase 2: LLM intent check (if skill has a condition) — cheap yes/no classification
 */

import type { Skill, SkillEvent, SkillRunResult } from './skill-types.js';
import type { SkillRepository } from './skill-repository.js';

/** The LLM generation function — injected from the agent orchestrator */
export type LLMGenerateFn = (systemPrompt: string, userMessage: string) => Promise<string>;

/** The agent chat function — runs a message through the full agent loop with tools */
export type AgentChatFn = (message: string, sessionId: string, source?: string, contactName?: string) => Promise<{
  response: string;
  toolCalls: Array<{ tool: string; args: Record<string, unknown>; result?: string }>;
}>;

export interface SkillEngine {
  /** Process an event through the skill pipeline */
  processEvent(event: SkillEvent): Promise<SkillRunResult[]>;

  /** Run a specific skill with an event */
  runSkill(skillId: string, event: SkillEvent): Promise<SkillRunResult>;

  /** Get all skills */
  getSkills(): Skill[];

  /** Get a specific skill */
  getSkill(id: string): Skill | null;

  /** Save a new skill */
  saveSkill(skill: Omit<Skill, 'id' | 'createdAt' | 'updatedAt'>): Skill;

  /** Update a skill */
  updateSkill(id: string, updates: Partial<Skill>): Skill | null;

  /** Delete a skill */
  deleteSkill(id: string): boolean;

  /** Toggle skill enabled/disabled */
  toggleSkill(id: string, enabled: boolean): Skill | null;

  /** Phase 1: Fast filter match — no LLM cost */
  getMatchingSkills(event: SkillEvent): Skill[];

  /** Phase 2: LLM intent check for a single skill */
  checkCondition(skill: Skill, event: SkillEvent): Promise<boolean>;
}

export function createSkillEngine(
  repo: SkillRepository,
  llmGenerate: LLMGenerateFn,
  agentChat: AgentChatFn,
): SkillEngine {
  
  // ── Phase 1: Fast filter matching ────────────────────────

  function passesFilters(skill: Skill, event: SkillEvent): boolean {
    const filters = skill.trigger.filters;
    if (!filters) return true; // No filters = match everything

    // Source filter
    if (filters.source && event.source !== filters.source) {
      return false;
    }

    // Groups only
    const isGroup = (event.from || '').endsWith('@g.us');
    if (filters.groupsOnly && !isGroup) {
      return false;
    }

    // Group filter
    if (filters.groups && filters.groups.length > 0) {
      if (!isGroup) return false;
      const from = event.from || '';
      const matched = filters.groups.some(g => {
        const normalized = g.replace(/\D/g, '');
        return from.includes(normalized) || from === g;
      });
      if (!matched) return false;
    }

    // Contact filter
    if (filters.contacts && filters.contacts.length > 0) {
      const from = event.from || '';
      const matched = filters.contacts.some(c => {
        const normalized = c.replace(/\D/g, '');
        return from.includes(normalized);
      });
      if (!matched) return false;
    }

    // Pattern filter
    if (filters.pattern) {
      try {
        const regex = new RegExp(filters.pattern, 'i');
        if (!regex.test(event.body || '')) return false;
      } catch {
        // Invalid regex — skip
      }
    }

    return true;
  }

  // ── Phase 2: LLM intent check ───────────────────────────

  async function checkCondition(skill: Skill, event: SkillEvent): Promise<boolean> {
    if (!skill.trigger.condition) return true; // No condition = always matches

    const prompt = `You are a message classifier. Decide if this event matches the condition.

Condition: "${skill.trigger.condition}"

Event:
- Source: ${event.source}
- Type: ${event.type}
- From: ${event.from || 'unknown'}
- Body: "${(event.body || '').slice(0, 500)}"

Does this event match the condition? Respond with ONLY "yes" or "no".`;

    try {
      const result = await llmGenerate(prompt, '');
      return result.trim().toLowerCase().startsWith('yes');
    } catch (err: any) {
      console.error(`[SkillEngine] Condition check failed for "${skill.name}":`, err.message);
      return false; // Fail closed
    }
  }

  // ── Execution ───────────────────────────────────────────

  async function executeSkill(skill: Skill, event: SkillEvent): Promise<SkillRunResult> {
    const start = Date.now();

    if (!skill.enabled) {
      return {
        skillId: skill.id,
        success: false,
        response: '',
        toolCalls: [],
        duration: Date.now() - start,
        error: `Skill "${skill.name}" is disabled`,
      };
    }

    try {
      // Use the event's from field as session ID for proper conversation context
      // For Telegram, this is the chatId; for WhatsApp, this is the JID
      const sessionId = event.source === 'telegram' 
        ? `telegram:${event.from}` 
        : (event.from || `skill-${skill.id}-${Date.now()}`);
      
      // Extract contact name from event data
      const contactName = (event.data?.senderName as string) || event.from || undefined;

      // Build context from the event
      const context = [
        `[AUTOMATED SKILL EXECUTION — NO CONFIRMATION NEEDED]`,
        `Execute this skill NOW. Do NOT ask for confirmation.`,
        ``,
        `Skill: ${skill.name}`,
        `Description: ${skill.description}`,
        ``,
        `Event context:`,
        `- Source: ${event.source}`,
        `- From: ${contactName || event.from || 'unknown'}`,
        `- Body: ${event.body || '(no body)'}`,
        event.data ? `- Data: ${JSON.stringify(event.data)}` : '',
        ``,
        `Instructions:`,
        skill.processor.instructions,
        ``,
        `IMPORTANT: The reply will be sent automatically — do NOT use send_message or reply_to_message.`,
        `Follow the Visitor Security Policy in the system prompt for what to share vs. escalate via ask_owner.`,
      ].filter(Boolean).join('\n');

      // Use the real session ID so the LLM has full conversation history.
      // The [AUTOMATED SKILL EXECUTION] preamble is just an instruction prefix.
      const result = await agentChat(context, sessionId, event.source, contactName);

      return {
        skillId: skill.id,
        success: true,
        response: result.response,
        toolCalls: result.toolCalls,
        duration: Date.now() - start,
      };
    } catch (err: any) {
      return {
        skillId: skill.id,
        success: false,
        response: '',
        toolCalls: [],
        duration: Date.now() - start,
        error: err.message || 'Skill execution failed',
      };
    }
  }

  return {
    async processEvent(event: SkillEvent): Promise<SkillRunResult[]> {
      const eventKey = `${event.source}:${event.type}`;
      console.log(`[SkillEngine] Processing event: ${eventKey}`);

      // Phase 1: Fast filter
      const candidates = this.getMatchingSkills(event);
      console.log(`[SkillEngine] Phase 1: ${candidates.length} candidates after fast filter`);

      if (candidates.length === 0) return [];

      // Phase 2: LLM intent check (only for skills with conditions)
      const matched: Skill[] = [];
      for (const skill of candidates) {
        if (skill.trigger.condition) {
          const passes = await checkCondition(skill, event);
          if (passes) {
            console.log(`[SkillEngine] Phase 2: "${skill.name}" condition matched`);
            matched.push(skill);
          } else {
            console.log(`[SkillEngine] Phase 2: "${skill.name}" condition NOT matched`);
          }
        } else {
          matched.push(skill); // No condition = always matches if filters passed
        }
      }

      console.log(`[SkillEngine] ${matched.length} skills matched, executing...`);

      // Execute all matched skills
      const results: SkillRunResult[] = [];
      for (const skill of matched) {
        console.log(`[SkillEngine] Executing "${skill.name}"...`);
        const result = await executeSkill(skill, event);
        console.log(`[SkillEngine] "${skill.name}" ${result.success ? 'succeeded' : 'failed'}: ${result.error || result.response.slice(0, 100)}`);
        results.push(result);
      }

      return results;
    },

    async runSkill(skillId: string, event: SkillEvent): Promise<SkillRunResult> {
      const skill = repo.getById(skillId);
      if (!skill) {
        return {
          skillId,
          success: false,
          response: '',
          toolCalls: [],
          duration: 0,
          error: `Skill not found: ${skillId}`,
        };
      }
      return executeSkill(skill, event);
    },

    getSkills() {
      return repo.getAll();
    },

    getSkill(id: string) {
      return repo.getById(id);
    },

    saveSkill(skill) {
      return repo.create(skill);
    },

    updateSkill(id, updates) {
      return repo.update(id, updates);
    },

    deleteSkill(id) {
      return repo.delete(id);
    },

    toggleSkill(id, enabled) {
      return repo.toggleEnabled(id, enabled);
    },

    getMatchingSkills(event: SkillEvent): Skill[] {
      const eventKey = `${event.source}:${event.type}`;
      const candidates = repo.getByEventType(eventKey);
      return candidates.filter(skill => passesFilters(skill, event));
    },

    checkCondition,
  };
}
