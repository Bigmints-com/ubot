/**
 * Skill Types
 */

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  level: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
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