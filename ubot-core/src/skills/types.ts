/**
 * Skill Types
 * Defines types for the skills framework
 */

export type SkillCategory = 'technical' | 'creative' | 'analytical' | 'communication' | 'management';

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  level: SkillLevel;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface SkillAssessment {
  skillId: string;
  level: SkillLevel;
  score: number;
  assessedAt: Date;
  notes?: string;
}