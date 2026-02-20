import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SkillsService, createSkillsService } from './service.js';
import type { Skill, SkillAssessment } from './types.js';
import type { SkillsRepository, DatabaseConnection } from './repository.js';

function createMockRepository(): SkillsRepository {
  return {
    createSkill: vi.fn(),
    getSkillById: vi.fn(),
    listSkills: vi.fn(),
    updateSkill: vi.fn(),
    deleteSkill: vi.fn(),
    createAssessment: vi.fn(),
    getAssessmentById: vi.fn(),
    getAssessmentsBySkillId: vi.fn(),
    getAssessmentsByAgentId: vi.fn()
  };
}

describe('SkillsService', () => {
  let service: SkillsService;
  let mockRepository: SkillsRepository;

  beforeEach(() => {
    mockRepository = createMockRepository();
    const mockDb = {} as DatabaseConnection;
    service = createSkillsService(mockDb, mockRepository);
  });

  describe('createSkill', () => {
    it('should create a skill with validation', async () => {
      const skill: Skill = {
        id: 'skill-1',
        name: 'TypeScript',
        description: 'TypeScript programming language',
        category: 'technical',
        level: 'intermediate',
        tags: ['programming'],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      (mockRepository.createSkill as ReturnType<typeof vi.fn>).mockResolvedValue(skill);

      const result = await service.createSkill(skill);
      expect(result.name).toBe('TypeScript');
    });
  });

  describe('assessAgentSkill', () => {
    it('should create an assessment', async () => {
      const skill: Skill = {
        id: 'skill-1',
        name: 'TypeScript',
        description: 'TypeScript',
        category: 'technical',
        level: 'intermediate',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const assessment: SkillAssessment = {
        id: 'assessment-1',
        skillId: 'skill-1',
        agentId: 'agent-1',
        level: 'intermediate',
        score: 0.75,
        confidence: 0.9,
        evidence: ['Completed task X'],
        assessedAt: new Date()
      };

      (mockRepository.getSkillById as ReturnType<typeof vi.fn>).mockResolvedValue(skill);
      (mockRepository.createAssessment as ReturnType<typeof vi.fn>).mockResolvedValue(assessment);

      const result = await service.assessAgentSkill(assessment);
      expect(result.score).toBe(0.75);
    });
  });
});