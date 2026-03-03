/**
 * File-Based Skill Repository
 *
 * Stores skills as markdown files with YAML frontmatter:
 *
 *   ~/.ubot/skills/
 *     daily-brief/
 *       SKILL.md
 *     linkedin-checker/
 *       SKILL.md
 *
 * Format:
 *   ---
 *   name: daily_brief
 *   description: Send a daily morning brief
 *   triggers: [web:message, scheduler:task]
 *   condition: when the owner asks for a morning brief
 *   outcome: reply
 *   tools: [web_search, web_fetch, send_message]
 *   enabled: true
 *   ---
 *   # Daily Brief
 *
 *   When triggered, search for top news...
 *
 * The markdown body IS the processor instructions.
 * No database needed — skills are simple files you can edit, git-track, and share.
 */

import fs from 'fs';
import path from 'path';
import type { Skill, SkillTrigger, SkillProcessor, SkillOutcome } from './skill-types.js';
import type { SkillRepository } from './skill-repository.js';

// ─── Frontmatter Parsing ─────────────────────────────────

interface SkillFrontmatter {
  name?: string;
  description?: string;
  triggers?: string[];
  condition?: string;
  outcome?: string;
  target?: string;
  channel?: string;
  tools?: string[];
  enabled?: boolean;
  filters?: {
    contacts?: string[];
    groups?: string[];
    groupsOnly?: boolean;
    source?: string;
    pattern?: string;
  };
}

function parseFrontmatter(content: string): { meta: SkillFrontmatter; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const yamlBlock = match[1];
  const body = match[2].trim();

  // Simple YAML parser for flat keys + arrays
  const meta: Record<string, any> = {};
  for (const line of yamlBlock.split('\n')) {
    const kv = line.match(/^\s*(\w+)\s*:\s*(.+)$/);
    if (!kv) continue;
    const [, key, rawVal] = kv;
    let val: any = rawVal.trim();

    // Parse arrays: [item1, item2]
    const arrMatch = val.match(/^\[(.+)\]$/);
    if (arrMatch) {
      val = arrMatch[1].split(',').map((s: string) => s.trim().replace(/^['"]|['"]$/g, ''));
    }
    // Parse booleans
    else if (val === 'true') val = true;
    else if (val === 'false') val = false;
    // Strip quotes
    else {
      val = val.replace(/^['"]|['"]$/g, '');
    }

    meta[key] = val;
  }

  return { meta: meta as SkillFrontmatter, body };
}

function toFrontmatter(skill: Skill): string {
  const lines: string[] = ['---'];
  lines.push(`name: ${skill.name}`);
  lines.push(`description: ${skill.description}`);

  if (skill.trigger.events.length > 0) {
    lines.push(`triggers: [${skill.trigger.events.join(', ')}]`);
  }
  if (skill.trigger.condition) {
    lines.push(`condition: ${skill.trigger.condition}`);
  }
  if (skill.trigger.filters) {
    const f = skill.trigger.filters;
    if (f.contacts?.length) lines.push(`filter_contacts: [${f.contacts.join(', ')}]`);
    if (f.groups?.length) lines.push(`filter_groups: [${f.groups.join(', ')}]`);
    if (f.groupsOnly) lines.push(`filter_groups_only: true`);
    if (f.source) lines.push(`filter_source: ${f.source}`);
    if (f.pattern) lines.push(`filter_pattern: ${f.pattern}`);
  }

  lines.push(`outcome: ${skill.outcome.action}`);
  if (skill.outcome.target) lines.push(`target: ${skill.outcome.target}`);
  if (skill.outcome.channel) lines.push(`channel: ${skill.outcome.channel}`);

  if (skill.processor.tools?.length) {
    lines.push(`tools: [${skill.processor.tools.join(', ')}]`);
  }
  lines.push(`enabled: ${skill.enabled}`);
  lines.push('---');

  return lines.join('\n');
}

// ─── File ↔ Skill Conversion ─────────────────────────────

function fileToSkill(dirPath: string): Skill | null {
  const skillFile = path.join(dirPath, 'SKILL.md');
  if (!fs.existsSync(skillFile)) return null;

  const content = fs.readFileSync(skillFile, 'utf-8');
  const { meta, body } = parseFrontmatter(content);
  const dirName = path.basename(dirPath);
  const stat = fs.statSync(skillFile);

  const trigger: SkillTrigger = {
    events: meta.triggers || ['manual:run'],
    condition: meta.condition,
    filters: {},
  };
  if (meta.filters) trigger.filters = meta.filters;
  // Handle flat filter_ keys
  if ((meta as any).filter_contacts) trigger.filters!.contacts = (meta as any).filter_contacts;
  if ((meta as any).filter_groups) trigger.filters!.groups = (meta as any).filter_groups;
  if ((meta as any).filter_groups_only) trigger.filters!.groupsOnly = true;
  if ((meta as any).filter_source) trigger.filters!.source = (meta as any).filter_source;
  if ((meta as any).filter_pattern) trigger.filters!.pattern = (meta as any).filter_pattern;

  const processor: SkillProcessor = {
    instructions: body,
    tools: meta.tools,
  };

  const outcome: SkillOutcome = {
    action: (meta.outcome as any) || 'reply',
    target: meta.target,
    channel: meta.channel,
  };

  return {
    id: dirName, // directory name IS the ID
    name: meta.name || dirName,
    description: meta.description || '',
    trigger,
    processor,
    outcome,
    enabled: meta.enabled !== false,
    createdAt: stat.birthtime,
    updatedAt: stat.mtime,
  };
}

function skillToFile(skillsDir: string, skill: Skill): void {
  const slug = skill.id || slugify(skill.name);
  const dirPath = path.join(skillsDir, slug);
  fs.mkdirSync(dirPath, { recursive: true });

  const frontmatter = toFrontmatter(skill);
  const content = `${frontmatter}\n\n${skill.processor.instructions}\n`;
  fs.writeFileSync(path.join(dirPath, 'SKILL.md'), content, 'utf-8');
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ─── File-Based Repository ───────────────────────────────

export function createFileSkillRepository(skillsDir: string): SkillRepository {
  // Ensure skills directory exists
  fs.mkdirSync(skillsDir, { recursive: true });

  function loadAll(): Skill[] {
    if (!fs.existsSync(skillsDir)) return [];
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const skills: Skill[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skill = fileToSkill(path.join(skillsDir, entry.name));
      if (skill) skills.push(skill);
    }
    return skills;
  }

  return {
    create(data) {
      const id = slugify(data.name);
      const skill: Skill = {
        ...data,
        id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      skillToFile(skillsDir, skill);
      return skill;
    },

    getById(id) {
      const dirPath = path.join(skillsDir, id);
      if (!fs.existsSync(dirPath)) return null;
      return fileToSkill(dirPath);
    },

    getAll() {
      return loadAll().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    getEnabled() {
      return loadAll().filter(s => s.enabled).sort((a, b) => a.name.localeCompare(b.name));
    },

    getByEventType(eventKey: string) {
      return this.getEnabled().filter(skill =>
        skill.trigger.events.some(e =>
          e === eventKey || e === '*:*' || e === `${eventKey.split(':')[0]}:*`
        )
      );
    },

    update(id, updates) {
      const existing = this.getById(id);
      if (!existing) return null;

      const updated: Skill = {
        ...existing,
        ...updates,
        id, // keep original ID
        updatedAt: new Date(),
      };

      // If trigger/processor/outcome are partial, merge them
      if (updates.trigger) updated.trigger = { ...existing.trigger, ...updates.trigger };
      if (updates.processor) updated.processor = { ...existing.processor, ...updates.processor };
      if (updates.outcome) updated.outcome = { ...existing.outcome, ...updates.outcome };

      skillToFile(skillsDir, updated);
      return updated;
    },

    delete(id) {
      const dirPath = path.join(skillsDir, id);
      if (!fs.existsSync(dirPath)) return false;
      fs.rmSync(dirPath, { recursive: true, force: true });
      return true;
    },

    toggleEnabled(id, enabled) {
      return this.update(id, { enabled });
    },
  };
}
