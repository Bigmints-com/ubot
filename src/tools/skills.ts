/**
 * Skills Tool Module
 *
 * Tools for managing Skills (automated pipelines: Trigger → Processor → Outcome).
 */

import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from '../tools/types.js';

const SKILLS_TOOLS: ToolDefinition[] = [
  {
    name: 'list_skills',
    description: 'List all skills (automated pipelines). Each skill has a Trigger → Processor → Outcome pipeline.',
    parameters: [],
  },
  {
    name: 'create_skill',
    description: 'Create a new skill (automated pipeline). Each skill has: TRIGGER (what event activates it), PROCESSOR (instructions for the LLM), OUTCOME (what to do with the result).',
    parameters: [
      { name: 'name', type: 'string', description: 'Skill name', required: true },
      { name: 'description', type: 'string', description: 'What the skill does', required: true },
      { name: 'instructions', type: 'string', description: 'Natural language instructions for the LLM processor.', required: true },
      { name: 'events', type: 'string', description: 'Comma-separated event types to trigger on. Default: "whatsapp:message"', required: false },
      { name: 'condition', type: 'string', description: 'Natural language condition checked by LLM.', required: false },
      { name: 'contacts', type: 'string', description: 'Comma-separated contact numbers to filter', required: false },
      { name: 'groups', type: 'string', description: 'Comma-separated group JIDs to filter', required: false },
      { name: 'groups_only', type: 'boolean', description: 'If true, only trigger in groups', required: false },
      { name: 'pattern', type: 'string', description: 'Regex pattern for fast pre-match on message body', required: false },
      { name: 'outcome', type: 'string', description: 'What to do with the result: "reply", "send", "store", "silent". Default: "reply"', required: false },
      { name: 'outcome_target', type: 'string', description: 'For outcome "send": target recipient phone/email', required: false },
      { name: 'enabled', type: 'boolean', description: 'Whether the skill is active (default: true)', required: false },
    ],
  },
  {
    name: 'update_skill',
    description: 'Update an existing skill. Can change trigger, processor instructions, outcome, or filters.',
    parameters: [
      { name: 'skill_id', type: 'string', description: 'ID of the skill to update', required: true },
      { name: 'name', type: 'string', description: 'New name', required: false },
      { name: 'description', type: 'string', description: 'New description', required: false },
      { name: 'instructions', type: 'string', description: 'New processor instructions', required: false },
      { name: 'events', type: 'string', description: 'New event types (comma-separated)', required: false },
      { name: 'condition', type: 'string', description: 'New trigger condition', required: false },
      { name: 'contacts', type: 'string', description: 'New contact filter', required: false },
      { name: 'groups', type: 'string', description: 'New group filter', required: false },
      { name: 'groups_only', type: 'boolean', description: 'Only trigger in groups', required: false },
      { name: 'pattern', type: 'string', description: 'New regex pattern', required: false },
      { name: 'outcome', type: 'string', description: 'New outcome: "reply", "send", "store", "silent"', required: false },
      { name: 'outcome_target', type: 'string', description: 'New target for "send" outcome', required: false },
      { name: 'enabled', type: 'boolean', description: 'Enable or disable', required: false },
    ],
  },
  {
    name: 'delete_skill',
    description: 'Delete a skill by its ID.',
    parameters: [
      { name: 'skill_id', type: 'string', description: 'ID of the skill to delete', required: true },
    ],
  },
];

const skillsToolModule: ToolModule = {
  name: 'skills',
  tools: SKILLS_TOOLS,
  register(registry: ToolRegistry, ctx: ToolContext) {
    const getEngine = () => {
      const engine = ctx.getSkillEngine();
      if (!engine) throw new Error('Skill engine not initialized');
      return engine;
    };

    registry.register('list_skills', async () => {
      const engine = getEngine();
      const skills = engine.getSkills();
      if (skills.length === 0) return { toolName: 'list_skills', success: true, result: 'No skills configured yet.', duration: 0 };
      const summary = skills.map((s: any) => {
        const status = s.enabled ? '✅ Active' : '❌ Disabled';
        const events = s.trigger.events.join(', ');
        const cond = s.trigger.condition ? ` | condition: "${s.trigger.condition}"` : '';
        const filters = s.trigger.filters || {};
        const filterParts: string[] = [];
        if (filters.contacts?.length) filterParts.push(`contacts: ${filters.contacts.join(', ')}`);
        if (filters.groups?.length) filterParts.push(`groups: ${filters.groups.join(', ')}`);
        if (filters.groupsOnly) filterParts.push('groups only');
        if (filters.pattern) filterParts.push(`pattern: /${filters.pattern}/`);
        const filterStr = filterParts.length ? ` | ${filterParts.join(', ')}` : '';
        return `• [${s.id}] "${s.name}" — ${status}\n  Events: ${events}${cond}${filterStr}\n  Instructions: ${s.processor.instructions.slice(0, 100)}${s.processor.instructions.length > 100 ? '...' : ''}\n  Outcome: ${s.outcome.action}${s.outcome.target ? ' → ' + s.outcome.target : ''}`;
      }).join('\n');
      return { toolName: 'list_skills', success: true, result: `${skills.length} skill(s):\n${summary}`, duration: 0 };
    });

    registry.register('create_skill', async (args) => {
      const engine = getEngine();
      const events: string[] = [];
      if (args.events) {
        events.push(...String(args.events).split(',').map(e => e.trim()).filter(Boolean));
      } else {
        events.push('whatsapp:message');
      }
      const filters: Record<string, unknown> = {};
      if (args.contacts) filters.contacts = String(args.contacts).split(',').map(c => c.trim()).filter(Boolean);
      if (args.groups) filters.groups = String(args.groups).split(',').map(g => g.trim()).filter(Boolean);
      if (args.groups_only) filters.groupsOnly = true;
      if (args.pattern) filters.pattern = String(args.pattern);
      if (args.source) filters.source = String(args.source);

      const saved = engine.saveSkill({
        name: String(args.name || ''),
        description: String(args.description || ''),
        trigger: { events, condition: args.condition ? String(args.condition) : undefined, filters: Object.keys(filters).length > 0 ? filters as any : undefined },
        processor: { instructions: String(args.instructions || args.prompt || '') },
        outcome: { action: (args.outcome || 'reply') as any, target: args.outcome_target ? String(args.outcome_target) : undefined, channel: args.outcome_channel ? String(args.outcome_channel) : undefined },
        enabled: args.enabled !== false,
      });
      return { toolName: 'create_skill', success: true, result: `Created skill "${saved.name}" (ID: ${saved.id}), events: ${saved.trigger.events.join(', ')}, outcome: ${saved.outcome.action}, enabled: ${saved.enabled}`, duration: 0 };
    });

    registry.register('update_skill', async (args) => {
      const engine = getEngine();
      const id = String(args.skill_id || '');
      if (!id) return { toolName: 'update_skill', success: false, result: 'skill_id is required', duration: 0 };
      const existing = engine.getSkill(id);
      if (!existing) return { toolName: 'update_skill', success: false, result: `Skill not found: ${id}`, duration: 0 };

      const updates: Record<string, unknown> = {};
      if (args.name !== undefined) updates.name = String(args.name);
      if (args.description !== undefined) updates.description = String(args.description);
      if (args.enabled !== undefined) updates.enabled = Boolean(args.enabled);

      if (args.events !== undefined || args.condition !== undefined || args.contacts !== undefined || args.groups !== undefined || args.groups_only !== undefined || args.pattern !== undefined) {
        const trigger = { ...existing.trigger };
        if (args.events !== undefined) trigger.events = String(args.events).split(',').map((e: string) => e.trim()).filter(Boolean);
        if (args.condition !== undefined) trigger.condition = String(args.condition) || undefined;
        const filters = { ...(trigger.filters || {}) };
        if (args.contacts !== undefined) (filters as any).contacts = String(args.contacts).split(',').map((c: string) => c.trim()).filter(Boolean);
        if (args.groups !== undefined) (filters as any).groups = String(args.groups).split(',').map((g: string) => g.trim()).filter(Boolean);
        if (args.groups_only !== undefined) (filters as any).groupsOnly = Boolean(args.groups_only);
        if (args.pattern !== undefined) (filters as any).pattern = String(args.pattern) || undefined;
        trigger.filters = Object.keys(filters).length > 0 ? filters as any : undefined;
        updates.trigger = trigger;
      }

      if (args.instructions !== undefined || args.prompt !== undefined) {
        updates.processor = { ...existing.processor, instructions: String(args.instructions || args.prompt) };
      }
      if (args.outcome !== undefined || args.outcome_target !== undefined) {
        updates.outcome = { ...existing.outcome, ...(args.outcome ? { action: String(args.outcome) } : {}), ...(args.outcome_target !== undefined ? { target: String(args.outcome_target) } : {}) };
      }

      const updated = engine.updateSkill(id, updates as any);
      if (!updated) return { toolName: 'update_skill', success: false, result: `Failed to update skill: ${id}`, duration: 0 };
      return { toolName: 'update_skill', success: true, result: `Updated skill "${updated.name}" (ID: ${id}). Changes: ${Object.keys(updates).join(', ')}`, duration: 0 };
    });

    registry.register('delete_skill', async (args) => {
      const engine = getEngine();
      const id = String(args.skill_id || '');
      if (!id) return { toolName: 'delete_skill', success: false, result: 'skill_id is required', duration: 0 };
      const deleted = engine.deleteSkill(id);
      if (!deleted) return { toolName: 'delete_skill', success: false, result: `Skill not found: ${id}`, duration: 0 };
      return { toolName: 'delete_skill', success: true, result: `Deleted skill "${id}" successfully.`, duration: 0 };
    });
  },
};

export default skillsToolModule;
