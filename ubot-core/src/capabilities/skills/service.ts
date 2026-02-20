import winston from 'winston';
import type { Skill, SkillAssessment, SkillLevel, SkillCategory } from './types.js';
import { createSkillsRepository, type SkillsRepository, type DatabaseConnection, type SkillFilter, type PaginatedSkills } from './repository.js';

export interface SkillsService {
  createSkill(skill: Skill): Promise<Skill>;
  getSkillById(id: string): Promise<Skill | null>;
  listSkills(filter: SkillFilter, page?: number, pageSize?: number): Promise<PaginatedSkills>;
  updateSkill(id: string, updates: Partial<Skill>): Promise<Skill | null>;
  deleteSkill(id: string): Promise<boolean>;
  assessAgentSkill(assessment: SkillAssessment): Promise<SkillAssessment>;
  getAgentSkillProfile(agentId: string): Promise<AgentSkillProfile>;
  recommendSkillsForAgent(agentId: string): Promise<Skill[]>;
  findAgentsWithSkill(skillId: string, minLevel?: SkillLevel): Promise<AgentSkillMatch[]>;
}

export interface AgentSkillProfile {
  agentId: string;
  assessments: SkillAssessment[];
  skillCount: number;
  averageScore: number;
  strengths: string[];
  gaps: string[];
}

export interface AgentSkillMatch {
  agentId: string;
  skillId: string;
  level: SkillLevel;
  score: number;
}

function createLogger(): winston.Logger {
  return winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: [
      new winston.transports.Console()
    ]
  });
}

export function createSkillsService(db: DatabaseConnection, repository?: SkillsRepository): SkillsService {
  const repo = repository || createSkillsRepository(db);
  const logger = createLogger();

  const levelOrder: SkillLevel[] = ['beginner', 'intermediate', 'advanced', 'expert'];

  function getLevelIndex(level: SkillLevel): number {
    return levelOrder.indexOf(level);
  }

  return {
    async createSkill(skill: Skill): Promise<Skill> {
      logger.info('Creating skill', { skillId: skill.id, name: skill.name });
      
      // Validate skill
      if (!skill.name || skill.name.trim().length === 0) {
        throw new Error('Skill name is required');
      }
      if (!skill.category) {
        throw new Error('Skill category is required');
      }

      const normalizedSkill: Skill = {
        ...skill,
        name: skill.name.trim(),
        description: skill.description?.trim() || '',
        tags: skill.tags || [],
        metadata: skill.metadata || {},
        createdAt: skill.createdAt || new Date(),
        updatedAt: skill.updatedAt || new Date()
      };

      return repo.createSkill(normalizedSkill);
    },

    async getSkillById(id: string): Promise<Skill | null> {
      return repo.getSkillById(id);
    },

    async listSkills(filter: SkillFilter, page = 1, pageSize = 20): Promise<PaginatedSkills> {
      return repo.listSkills(filter, page, pageSize);
    },

    async updateSkill(id: string, updates: Partial<Skill>): Promise<Skill | null> {
      logger.info('Updating skill', { skillId: id });
      
      const existing = await repo.getSkillById(id);
      if (!existing) {
        return null;
      }

      const updatedData = {
        ...updates,
        updatedAt: new Date()
      };

      return repo.updateSkill(id, updatedData);
    },

    async deleteSkill(id: string): Promise<boolean> {
      logger.info('Deleting skill', { skillId: id });
      return repo.deleteSkill(id);
    },

    async assessAgentSkill(assessment: SkillAssessment): Promise<SkillAssessment> {
      logger.info('Creating skill assessment', { 
        assessmentId: assessment.id, 
        skillId: assessment.skillId, 
        agentId: assessment.agentId 
      });

      // Validate score range
      if (assessment.score < 0 || assessment.score > 1) {
        throw new Error('Score must be between 0 and 1');
      }

      // Verify skill exists
      const skill = await repo.getSkillById(assessment.skillId);
      if (!skill) {
        throw new Error(`Skill not found: ${assessment.skillId}`);
      }

      const normalizedAssessment: SkillAssessment = {
        ...assessment,
        assessedAt: assessment.assessedAt || new Date()
      };

      return repo.createAssessment(normalizedAssessment);
    },

    async getAgentSkillProfile(agentId: string): Promise<AgentSkillProfile> {
      const assessments = await repo.getAssessmentsByAgentId(agentId);
      
      const skillCount = assessments.length;
      const averageScore = skillCount > 0 
        ? assessments.reduce((sum, a) => sum + a.score, 0) / skillCount 
        : 0;

      // Identify strengths (skills with score >= 0.8)
      const strengths: string[] = [];
      const gaps: string[] = [];

      for (const assessment of assessments) {
        if (assessment.score >= 0.8) {
          strengths.push(assessment.skillId);
        } else if (assessment.score < 0.5) {
          gaps.push(assessment.skillId);
        }
      }

      return {
        agentId,
        assessments,
        skillCount,
        averageScore,
        strengths,
        gaps
      };
    },

    async recommendSkillsForAgent(agentId: string): Promise<Skill[]> {
      const profile = await this.getAgentSkillProfile(agentId);
      
      // Get all skills
      const allSkillsResult = await repo.listSkills({}, 1, 1000);
      const allSkills = allSkillsResult.skills;

      // Get skills the agent already has
      const existingSkillIds = new Set(profile.assessments.map(a => a.skillId));

      // Find skills the agent doesn't have
      const missingSkills = allSkills.filter(s => !existingSkillIds.has(s.id));

      // Sort by relevance (could be enhanced with more sophisticated logic)
      return missingSkills.slice(0, 10);
    },

    async findAgentsWithSkill(skillId: string, minLevel?: SkillLevel): Promise<AgentSkillMatch[]> {
      const assessments = await repo.getAssessmentsBySkillId(skillId);

      let filtered = assessments;
      if (minLevel) {
        const minLevelIndex = getLevelIndex(minLevel);
        filtered = assessments.filter(a => getLevelIndex(a.level) >= minLevelIndex);
      }

      return filtered.map(a => ({
        agentId: a.agentId,
        skillId: a.skillId,
        level: a.level,
        score: a.score
      }));
    }
  };
}