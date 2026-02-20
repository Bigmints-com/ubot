/**
 * Skill Types
 */

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert' | 'master';

export type SkillCategory =
  | 'technical'
  | 'communication'
  | 'leadership'
  | 'problem-solving'
  | 'creativity'
  | 'domain'
  | 'tools'
  | 'custom';

export const LEVEL_HIERARCHY: SkillLevel[] = [
  'beginner',
  'intermediate',
  'advanced',
  'expert',
  'master',
];

export const DEFAULT_LEVEL_WEIGHTS: Record<SkillLevel, number> = {
  beginner: 0.2,
  intermediate: 0.4,
  advanced: 0.6,
  expert: 0.8,
  master: 1.0,
};

export const DEFAULT_CATEGORY_WEIGHTS: Record<SkillCategory, number> = {
  technical: 1.0,
  communication: 0.8,
  leadership: 0.9,
  'problem-solving': 1.0,
  creativity: 0.7,
  domain: 0.9,
  tools: 0.6,
  custom: 0.5,
};

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  level: SkillLevel;
  tags: string[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillAssessment {
  id: string;
  skillId: string;
  agentId: string;
  level: SkillLevel;
  score: number;
  confidence: number;
  evidence: string[];
  assessedAt: Date;
  validUntil?: Date;
}

export interface SkillRequirement {
  skillId: string;
  minimumLevel: SkillLevel;
  preferredLevel?: SkillLevel;
  required: boolean;
  weight: number;
}

export interface SkillGap {
  skillId: string;
  skillName: string;
  requiredLevel: SkillLevel;
  currentLevel: SkillLevel | null;
  gap: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

export interface SkillMatch {
  skillId: string;
  skillName: string;
  requiredLevel: SkillLevel;
  matchedLevel: SkillLevel;
  matchScore: number;
  isMatch: boolean;
  agentId: string;
}

export interface SkillFrameworkConfig {
  maxSkills?: number;
  enableAutoAssessment?: boolean;
  assessmentInterval?: number;
}

export interface SkillContext {
  skillId: string;
  sessionId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface SkillResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}