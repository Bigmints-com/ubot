import { describe, it, expect } from 'vitest';
import {
  getLevelIndex,
  compareLevels,
  isLevelAtLeast,
  getLevelDifference,
  calculateSkillScore,
  calculateOverallSkillScore,
  findSkillGaps,
  calculateGapPriority,
  matchSkillsToRequirements,
  calculateMatchScore,
  aggregateSkillsByCategory,
  validateSkillName,
  validateSkillDescription,
  normalizeTag,
  skillToSummary,
  assessmentToSummary
} from './utils.js';
import type { Skill, SkillAssessment, SkillRequirement, SkillLevel, SkillCategory } from './types.js';

describe('Skills Utils', () => {
  describe('getLevelIndex', () => {
    it('should return correct index for each level', () => {
      expect(getLevelIndex('beginner')).toBe(0);
      expect(getLevelIndex('intermediate')).toBe(1);
      expect(getLevelIndex('advanced')).toBe(2);
      expect(getLevelIndex('expert')).toBe(3);
      expect(getLevelIndex('master')).toBe(4);
    });
  });

  describe('compareLevels', () => {
    it('should return positive when first level is higher', () => {
      expect(compareLevels('expert', 'beginner')).toBe(3);
    });

    it('should return negative when first level is lower', () => {
      expect(compareLevels('beginner', 'expert')).toBe(-3);
    });

    it('should return zero for equal levels', () => {
      expect(compareLevels('intermediate', 'intermediate')).toBe(0);
    });
  });

  describe('isLevelAtLeast', () => {
    it('should return true when current meets required', () => {
      expect(isLevelAtLeast('expert', 'intermediate')).toBe(true);
    });

    it('should return false when current is below required', () => {
      expect(isLevelAtLeast('beginner', 'expert')).toBe(false);
    });

    it('should return true for equal levels', () => {
      expect(isLevelAtLeast('advanced', 'advanced')).toBe(true);
    });
  });

  describe('getLevelDifference', () => {
    it('should calculate positive difference', () => {
      expect(getLevelDifference('beginner', 'expert')).toBe(3);
    });

    it('should calculate negative difference', () => {
      expect(getLevelDifference('expert', 'beginner')).toBe(-3);
    });

    it('should return zero for same levels', () => {
      expect(getLevelDifference('advanced', 'advanced')).toBe(0);
    });
  });

  describe('calculateSkillScore', () => {
    it('should calculate score based on level and category', () => {
      const score = calculateSkillScore('expert', 'technical');
      expect(score).toBe(0.8); // expert weight 0.8 * technical weight 1.0
    });

    it('should apply category weight', () => {
      const technicalScore = calculateSkillScore('master', 'technical');
      const creativityScore = calculateSkillScore('master', 'creativity');
      expect(technicalScore).toBeGreaterThan(creativityScore);
    });
  });

  describe('calculateOverallSkillScore', () => {
    it('should return 0 for empty assessments', () => {
      const score = calculateOverallSkillScore([], []);
      expect(score).toBe(0);
    });

    it('should calculate weighted average score', () => {
      const skills: Skill[] = [{
        id: 'skill-1',
        name: 'Test Skill',
        description: 'Test',
        category: 'technical',
        level: 'advanced',
        tags: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      }];

      const assessments: SkillAssessment[] = [{
        id: 'assessment-1',
        skillId: 'skill-1',
        agentId: 'agent-1',
        level: 'advanced',
        score: 80,
        confidence: 1.0,
        evidence: [],
        
        assessedAt: new Date()
      }];

      const score = calculateOverallSkillScore(assessments, skills);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('findSkillGaps', () => {
    it('should identify skill gaps', () => {
      const requirements: SkillRequirement[] = [{
        skillId: 'skill-1',
        minimumLevel: 'expert',
        weight: 1.0,
        required: true
      }];

      const assessments: SkillAssessment[] = [{
        id: 'assessment-1',
        skillId: 'skill-1',
        agentId: 'agent-1',
        level: 'intermediate',
        score: 60,
        confidence: 0.8,
        evidence: [],
        
        assessedAt: new Date()
      }];

      const gaps = findSkillGaps(assessments, requirements);
      expect(gaps).toHaveLength(1);
      expect(gaps[0].gap).toBe(2);
      expect(gaps[0].currentLevel).toBe('intermediate');
      expect(gaps[0].requiredLevel).toBe('expert');
    });

    it('should not create gap when requirement is met', () => {
      const requirements: SkillRequirement[] = [{
        skillId: 'skill-1',
        minimumLevel: 'intermediate',
        weight: 0.5,
        required: false
      }];

      const assessments: SkillAssessment[] = [{
        id: 'assessment-1',
        skillId: 'skill-1',
        agentId: 'agent-1',
        level: 'expert',
        score: 90,
        confidence: 1.0,
        evidence: [],
        
        assessedAt: new Date()
      }];

      const gaps = findSkillGaps(assessments, requirements);
      expect(gaps).toHaveLength(0);
    });
  });

  describe('calculateGapPriority', () => {
    it('should return critical for required skill with large gap', () => {
      expect(calculateGapPriority(3, true, 1.0)).toBe('critical');
    });

    it('should return high for required skill with medium gap', () => {
      expect(calculateGapPriority(2, true, 0.5)).toBe('high');
    });

    it('should return medium for moderate gap', () => {
      expect(calculateGapPriority(1, false, 0.5)).toBe('medium');
    });

    it('should return low for small gap', () => {
      expect(calculateGapPriority(0, false, 0.3)).toBe('low');
    });
  });

  describe('matchSkillsToRequirements', () => {
    it('should match skills correctly', () => {
      const requirements: SkillRequirement[] = [{
        skillId: 'skill-1',
        minimumLevel: 'intermediate',
        weight: 1.0,
        required: true
      }];

      const assessments: SkillAssessment[] = [{
        id: 'assessment-1',
        skillId: 'skill-1',
        agentId: 'agent-1',
        level: 'advanced',
        score: 85,
        confidence: 0.9,
        evidence: [],
        
        assessedAt: new Date()
      }];

      const matches = matchSkillsToRequirements(assessments, requirements, 0.5);
      expect(matches).toHaveLength(1);
      expect(matches[0].isMatch).toBe(true);
      expect(matches[0].matchedLevel).toBe('advanced');
    });
  });

  describe('calculateMatchScore', () => {
    it('should return 1.0 for meeting preferred level', () => {
      const score = calculateMatchScore('expert', 'intermediate', 'expert', 1.0);
      expect(score).toBe(1.0);
    });

    it('should return partial score for below minimum', () => {
      const score = calculateMatchScore('beginner', 'intermediate', undefined, 1.0);
      expect(score).toBeLessThan(0.5);
    });

    it('should factor in confidence', () => {
      const scoreHighConfidence = calculateMatchScore('advanced', 'intermediate', undefined, 1.0);
      const scoreLowConfidence = calculateMatchScore('advanced', 'intermediate', undefined, 0.5);
      expect(scoreHighConfidence).toBeGreaterThan(scoreLowConfidence);
    });
  });

  describe('aggregateSkillsByCategory', () => {
    it('should group skills by category', () => {
      const skills: Skill[] = [
        {
          id: 'skill-1',
          name: 'TypeScript',
          description: 'TypeScript',
          category: 'technical',
          level: 'advanced',
          tags: [],
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'skill-2',
          name: 'Public Speaking',
          description: 'Public Speaking',
          category: 'communication',
          level: 'intermediate',
          tags: [],
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const grouped = aggregateSkillsByCategory(skills);
      expect(grouped.technical).toHaveLength(1);
      expect(grouped.communication).toHaveLength(1);
      expect(grouped.technical[0].name).toBe('TypeScript');
    });
  });

  describe('validateSkillName', () => {
    it('should accept valid names', () => {
      expect(validateSkillName('TypeScript')).toBe(true);
      expect(validateSkillName('Node-js')).toBe(true);
      expect(validateSkillName('Problem Solving')).toBe(true);
    });

    it('should reject invalid names', () => {
      expect(validateSkillName('a')).toBe(false);
      expect(validateSkillName('')).toBe(false);
      expect(validateSkillName('a'.repeat(101))).toBe(false);
      expect(validateSkillName('Test@Skill')).toBe(false);
    });
  });

  describe('validateSkillDescription', () => {
    it('should accept valid descriptions', () => {
      expect(validateSkillDescription('A valid description')).toBe(true);
    });

    it('should reject too long descriptions', () => {
      expect(validateSkillDescription('a'.repeat(1001))).toBe(false);
    });
  });

  describe('normalizeTag', () => {
    it('should normalize tags correctly', () => {
      expect(normalizeTag('TypeScript')).toBe('typescript');
      expect(normalizeTag('Node JS')).toBe('node-js');
      expect(normalizeTag('  Test  ')).toBe('test');
    });
  });

  describe('skillToSummary', () => {
    it('should generate skill summary', () => {
      const skill: Skill = {
        id: 'skill-1',
        name: 'TypeScript',
        description: 'TypeScript programming',
        category: 'technical',
        level: 'advanced',
        tags: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      expect(skillToSummary(skill)).toBe('TypeScript (technical, advanced)');
    });
  });

  describe('assessmentToSummary', () => {
    it('should generate assessment summary', () => {
      const assessment: SkillAssessment = {
        id: 'assessment-1',
        skillId: 'skill-1',
        agentId: 'agent-1',
        level: 'expert',
        score: 95,
        confidence: 0.9,
        evidence: [],
        
        assessedAt: new Date()
      };

      const summary = assessmentToSummary(assessment);
      expect(summary).toContain('skill-1');
      expect(summary).toContain('expert');
      expect(summary).toContain('90%');
    });
  });
});