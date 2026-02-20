import type { Skill, SkillAssessment, SkillLevel, SkillCategory } from './types.js';

export interface DatabaseStatement {
  run: (...params: unknown[]) => { changes: number; lastInsertRowid: number | bigint };
  get: (...params: unknown[]) => Record<string, unknown> | undefined;
  all: (...params: unknown[]) => Record<string, unknown>[];
}

export interface DatabaseConnection {
  execute: (sql: string) => void;
  prepare: (sql: string) => DatabaseStatement;
  close: () => void;
  isOpen: () => boolean;
}

export interface SkillsRepository {
  createSkill(skill: Skill): Promise<Skill>;
  getSkillById(id: string): Promise<Skill | null>;
  listSkills(filter: SkillFilter, page: number, pageSize: number): Promise<PaginatedSkills>;
  updateSkill(id: string, updates: Partial<Skill>): Promise<Skill | null>;
  deleteSkill(id: string): Promise<boolean>;
  createAssessment(assessment: SkillAssessment): Promise<SkillAssessment>;
  getAssessmentById(id: string): Promise<SkillAssessment | null>;
  getAssessmentsBySkillId(skillId: string): Promise<SkillAssessment[]>;
  getAssessmentsByAgentId(agentId: string): Promise<SkillAssessment[]>;
}

export interface SkillFilter {
  category?: SkillCategory;
  level?: SkillLevel;
  tags?: string[];
  search?: string;
}

export interface PaginatedSkills {
  skills: Skill[];
  total: number;
  page: number;
  pageSize: number;
}

export function createSkillsRepository(db: DatabaseConnection): SkillsRepository {
  return {
    async createSkill(skill: Skill): Promise<Skill> {
      const sql = `
        INSERT INTO skills (id, name, description, category, level, tags, metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      db.prepare(sql).run(
        skill.id,
        skill.name,
        skill.description,
        skill.category,
        skill.level,
        JSON.stringify(skill.tags),
        JSON.stringify(skill.metadata || {}),
        skill.createdAt.toISOString(),
        skill.updatedAt.toISOString()
      );
      return skill;
    },

    async getSkillById(id: string): Promise<Skill | null> {
      const sql = 'SELECT * FROM skills WHERE id = ?';
      const row = db.prepare(sql).get(id);
      if (!row) return null;
      return mapRowToSkill(row);
    },

    async listSkills(filter: SkillFilter, page: number, pageSize: number): Promise<PaginatedSkills> {
      let sql = 'SELECT * FROM skills WHERE 1=1';
      const params: unknown[] = [];

      if (filter.category) {
        sql += ' AND category = ?';
        params.push(filter.category);
      }
      if (filter.level) {
        sql += ' AND level = ?';
        params.push(filter.level);
      }
      if (filter.search) {
        sql += ' AND (name LIKE ? OR description LIKE ?)';
        params.push(`%${filter.search}%`, `%${filter.search}%`);
      }

      const rows = db.prepare(sql).all(...params);
      const skills = rows.map(mapRowToSkill);
      const total = skills.length;
      const offset = (page - 1) * pageSize;
      const paginatedSkills = skills.slice(offset, offset + pageSize);

      return {
        skills: paginatedSkills,
        total,
        page,
        pageSize
      };
    },

    async updateSkill(id: string, updates: Partial<Skill>): Promise<Skill | null> {
      const existing = await this.getSkillById(id);
      if (!existing) return null;

      const updated = { ...existing, ...updates, updatedAt: new Date() };
      const sql = `
        UPDATE skills SET name = ?, description = ?, category = ?, level = ?, tags = ?, metadata = ?, updated_at = ?
        WHERE id = ?
      `;
      db.prepare(sql).run(
        updated.name,
        updated.description,
        updated.category,
        updated.level,
        JSON.stringify(updated.tags),
        JSON.stringify(updated.metadata || {}),
        updated.updatedAt.toISOString(),
        id
      );
      return updated;
    },

    async deleteSkill(id: string): Promise<boolean> {
      const sql = 'DELETE FROM skills WHERE id = ?';
      const result = db.prepare(sql).run(id);
      return result.changes > 0;
    },

    async createAssessment(assessment: SkillAssessment): Promise<SkillAssessment> {
      const sql = `
        INSERT INTO skill_assessments (id, skill_id, agent_id, level, score, evidence, assessed_at, valid_until)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      db.prepare(sql).run(
        assessment.id,
        assessment.skillId,
        assessment.agentId,
        assessment.level,
        assessment.score,
        JSON.stringify(assessment.evidence || []),
        assessment.assessedAt.toISOString(),
        assessment.validUntil?.toISOString() || null
      );
      return assessment;
    },

    async getAssessmentById(id: string): Promise<SkillAssessment | null> {
      const sql = 'SELECT * FROM skill_assessments WHERE id = ?';
      const row = db.prepare(sql).get(id);
      if (!row) return null;
      return mapRowToAssessment(row);
    },

    async getAssessmentsBySkillId(skillId: string): Promise<SkillAssessment[]> {
      const sql = 'SELECT * FROM skill_assessments WHERE skill_id = ?';
      const rows = db.prepare(sql).all(skillId);
      return rows.map(mapRowToAssessment);
    },

    async getAssessmentsByAgentId(agentId: string): Promise<SkillAssessment[]> {
      const sql = 'SELECT * FROM skill_assessments WHERE agent_id = ?';
      const rows = db.prepare(sql).all(agentId);
      return rows.map(mapRowToAssessment);
    }
  };
}

function mapRowToSkill(row: Record<string, unknown>): Skill {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    category: row.category as SkillCategory,
    level: row.level as SkillLevel,
    tags: JSON.parse(row.tags as string) as string[],
    metadata: JSON.parse(row.metadata as string || '{}'),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string)
  };
}

function mapRowToAssessment(row: Record<string, unknown>): SkillAssessment {
  return {
    id: row.id as string,
    skillId: row.skill_id as string,
    agentId: row.agent_id as string,
    level: row.level as SkillLevel,
    score: row.score as number,
    confidence: (row.confidence as number) ?? (row.score as number),
    evidence: JSON.parse(row.evidence as string || '[]'),
    assessedAt: new Date(row.assessed_at as string),
    validUntil: row.valid_until ? new Date(row.valid_until as string) : undefined
  };
}