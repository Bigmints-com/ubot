import { describe, it, expect, beforeEach } from 'vitest';
import { SkillsRepository, createSkillsRepository } from './repository.js';
import type { Skill } from './types.js';

interface MockStatement {
  run: (...params: unknown[]) => { changes: number; lastInsertRowid: number };
  get: (...params: unknown[]) => Record<string, unknown> | undefined;
  all: (..._params: unknown[]) => Record<string, unknown>[];
}

interface MockDatabase {
  execute: (sql: string) => void;
  prepare: (sql: string) => MockStatement;
  close: () => void;
  isOpen: () => boolean;
}

function createMockDb(): MockDatabase {
  const tables: Map<string, Map<string, Record<string, unknown>>> = new Map();
  let lastInsertRowId = 0;

  return {
    execute: (_sql: string) => {
      // Simulate table creation
    },
    prepare: (sql: string) => {
      return {
        run: (...params: unknown[]) => {
          const tableName = sql.includes('skill_assessments') ? 'skill_assessments' : 'skills';
          if (!tables.has(tableName)) {
            tables.set(tableName, new Map());
          }
          const table = tables.get(tableName)!;
          const id = params[0] as string;
          
          if (sql.includes('INSERT')) {
            const record: Record<string, unknown> = {};
            const columns = sql.match(/\(([^)]+)\)/)?.[1]?.split(',').map(s => s.trim()) || [];
            columns.forEach((col, i) => {
              record[col] = params[i];
            });
            table.set(id, record);
            lastInsertRowId++;
            return { changes: 1, lastInsertRowid: lastInsertRowId };
          }
          if (sql.includes('UPDATE')) {
            const existing = table.get(id);
            if (existing) {
              table.set(id, { ...existing, ...params });
              return { changes: 1, lastInsertRowid: lastInsertRowId };
            }
            return { changes: 0, lastInsertRowid: lastInsertRowId };
          }
          if (sql.includes('DELETE')) {
            const deleted = table.delete(id);
            return { changes: deleted ? 1 : 0, lastInsertRowid: lastInsertRowId };
          }
          return { changes: 0, lastInsertRowid: lastInsertRowId };
        },
        get: (...params: unknown[]) => {
          const tableName = sql.includes('skill_assessments') ? 'skill_assessments' : 'skills';
          const table = tables.get(tableName);
          if (!table) return undefined;
          const id = params[0] as string;
          return table.get(id);
        },
        all: (..._params: unknown[]) => {
          const tableName = sql.includes('skill_assessments') ? 'skill_assessments' : 'skills';
          const table = tables.get(tableName);
          if (!table) return [];
          return Array.from(table.values());
        }
      };
    },
    close: () => {},
    isOpen: () => true
  };
}

describe('SkillsRepository', () => {
  let repository: SkillsRepository;
  let mockDb: MockDatabase;

  beforeEach(() => {
    mockDb = createMockDb();
    repository = createSkillsRepository(mockDb as unknown as Parameters<typeof createSkillsRepository>[0]);
  });

  describe('createSkill', () => {
    it('should create a skill with all fields', async () => {
      const skill: Skill = {
        id: 'skill-1',
        name: 'TypeScript',
        description: 'TypeScript programming language',
        category: 'technical',
        level: 'advanced',
        tags: ['programming', 'typescript'],
        metadata: { estimatedHoursToMaster: 100 },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await repository.createSkill(skill);
      expect(result.id).toBe(skill.id);
      expect(result.name).toBe(skill.name);
    });
  });

  describe('getSkillById', () => {
    it('should return null for non-existent skill', async () => {
      const result = await repository.getSkillById('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('listSkills', () => {
    it('should return paginated results', async () => {
      const result = await repository.listSkills({}, 1, 20);
      expect(result.skills).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });
  });
});