/**
 * Skills Framework Types
 * Defines skill structures, assessments, and matching types
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

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  level: SkillLevel;
  tags: string[];
  parentId?: string;
  metadata: SkillMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillMetadata {
  prerequisites?: string[];
  relatedSkills?: string[];
  certificationRequired?: boolean;
  estimatedHoursToMaster?: number;
  customFields?: Record<string, unknown>;
}

export interface SkillAssessment {
  id: string;
  skillId: string;
  agentId: string;
  level: SkillLevel;
  score: number;
  confidence: number;
  evidence: AssessmentEvidence[];
  assessedBy: string;
  assessedAt: Date;
  expiresAt?: Date;
}

export interface AssessmentEvidence {
  type: 'task_completion' | 'peer_review' | 'certification' | 'self_assessment' | 'test';
  description: string;
  weight: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
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

export interface SkillRequirement {
  skillId: string;
  minimumLevel: SkillLevel;
  preferredLevel?: SkillLevel;
  weight: number;
  required: boolean;
}

export interface SkillFrameworkConfig {
  maxSkillsPerAgent: number;
  assessmentExpirationDays: number;
  minConfidenceThreshold: number;
  levelWeights: Record<SkillLevel, number>;
  categoryWeights: Record<SkillCategory, number>;
}

export interface SkillFilter {
  category?: SkillCategory;
  level?: SkillLevel;
  tags?: string[];
  search?: string;
  agentId?: string;
}

export interface SkillListResult {
  skills: Skill[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SkillRecommendation {
  skillId: string;
  skillName: string;
  reason: string;
  priority: number;
  estimatedEffort: string;
}

export interface SkillProgress {
  skillId: string;
  skillName: string;
  currentLevel: SkillLevel;
  targetLevel: SkillLevel;
  progress: number;
  milestones: SkillMilestone[];
}

export interface SkillMilestone {
  id: string;
  description: string;
  completed: boolean;
  completedAt?: Date;
}

export const LEVEL_HIERARCHY: SkillLevel[] = ['beginner', 'intermediate', 'advanced', 'expert', 'master'];

export const DEFAULT_LEVEL_WEIGHTS: Record<SkillLevel, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
  expert: 4,
  master: 5
};

export const DEFAULT_CATEGORY_WEIGHTS: Record<SkillCategory, number> = {
  technical: 1.0,
  communication: 0.8,
  leadership: 0.9,
  'problem-solving': 1.0,
  creativity: 0.7,
  domain: 0.9,
  tools: 0.6,
  custom: 0.5
};