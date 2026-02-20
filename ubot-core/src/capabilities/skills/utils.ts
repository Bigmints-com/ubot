/**
 * Skills Framework Utilities
 * Helper functions for skill calculations and transformations
 */

import type {
  SkillLevel,
  SkillCategory,
  Skill,
  SkillAssessment,
  SkillRequirement,
  SkillGap,
  SkillMatch
} from './types.js';
import { LEVEL_HIERARCHY, DEFAULT_LEVEL_WEIGHTS, DEFAULT_CATEGORY_WEIGHTS } from './types.js';

export function getLevelIndex(level: SkillLevel): number {
  return LEVEL_HIERARCHY.indexOf(level);
}

export function compareLevels(level1: SkillLevel, level2: SkillLevel): number {
  return getLevelIndex(level1) - getLevelIndex(level2);
}

export function isLevelAtLeast(current: SkillLevel, required: SkillLevel): boolean {
  return getLevelIndex(current) >= getLevelIndex(required);
}

export function getLevelDifference(from: SkillLevel, to: SkillLevel): number {
  return getLevelIndex(to) - getLevelIndex(from);
}

export function calculateSkillScore(
  level: SkillLevel,
  category: SkillCategory,
  customWeights?: Partial<Record<SkillLevel, number>>
): number {
  const levelWeights = { ...DEFAULT_LEVEL_WEIGHTS, ...customWeights };
  const levelWeight = levelWeights[level];
  const categoryWeight = DEFAULT_CATEGORY_WEIGHTS[category] ?? 1;

  return levelWeight * categoryWeight;
}

export function calculateOverallSkillScore(assessments: SkillAssessment[], skills: Skill[]): number {
  if (assessments.length === 0) return 0;

  const skillMap = new Map(skills.map(s => [s.id, s]));
  let totalScore = 0;
  let maxPossibleScore = 0;

  for (const assessment of assessments) {
    const skill = skillMap.get(assessment.skillId);
    if (!skill) continue;

    const score = calculateSkillScore(assessment.level, skill.category);
    const maxScore = calculateSkillScore('master', skill.category);

    totalScore += score * assessment.confidence;
    maxPossibleScore += maxScore;
  }

  return maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0;
}

export function findSkillGaps(
  assessments: SkillAssessment[],
  requirements: SkillRequirement[]
): SkillGap[] {
  const assessmentMap = new Map<string, SkillAssessment>();
  for (const a of assessments) {
    if (!assessmentMap.has(a.skillId)) {
      assessmentMap.set(a.skillId, a);
    }
  }

  const gaps: SkillGap[] = [];

  for (const req of requirements) {
    const assessment = assessmentMap.get(req.skillId);
    const currentLevel = assessment?.level ?? null;
    const currentIdx = currentLevel ? getLevelIndex(currentLevel) : -1;
    const requiredIdx = getLevelIndex(req.minimumLevel);
    const gap = Math.max(0, requiredIdx - Math.max(currentIdx, 0));

    if (gap > 0 || req.required) {
      gaps.push({
        skillId: req.skillId,
        skillName: req.skillId,
        requiredLevel: req.minimumLevel,
        currentLevel,
        gap,
        priority: calculateGapPriority(gap, req.required, req.weight),
        recommendations: []
      });
    }
  }

  return gaps.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

export function calculateGapPriority(
  gap: number,
  required: boolean,
  weight: number
): 'low' | 'medium' | 'high' | 'critical' {
  if (required && gap >= 3) return 'critical';
  if (required && gap >= 2) return 'high';
  if (gap >= 2 || weight >= 0.8) return 'high';
  if (gap >= 1 || weight >= 0.5) return 'medium';
  return 'low';
}

export function matchSkillsToRequirements(
  assessments: SkillAssessment[],
  requirements: SkillRequirement[],
  minConfidence: number = 0.5
): SkillMatch[] {
  const assessmentMap = new Map<string, SkillAssessment>();
  for (const a of assessments) {
    if (!assessmentMap.has(a.skillId)) {
      assessmentMap.set(a.skillId, a);
    }
  }

  return requirements.map(req => {
    const assessment = assessmentMap.get(req.skillId);
    const matchedLevel = assessment?.level ?? 'beginner';
    const confidence = assessment?.confidence ?? 0;

    const matchScore = calculateMatchScore(
      matchedLevel,
      req.minimumLevel,
      req.preferredLevel,
      confidence
    );

    return {
      skillId: req.skillId,
      skillName: req.skillId,
      requiredLevel: req.minimumLevel,
      matchedLevel,
      matchScore,
      isMatch: matchScore >= minConfidence,
      agentId: assessment?.agentId ?? ''
    };
  });
}

export function calculateMatchScore(
  matchedLevel: SkillLevel,
  minimumLevel: SkillLevel,
  preferredLevel?: SkillLevel,
  confidence: number = 1.0
): number {
  const matchedIdx = getLevelIndex(matchedLevel);
  const minimumIdx = getLevelIndex(minimumLevel);
  const preferredIdx = preferredLevel ? getLevelIndex(preferredLevel) : minimumIdx + 1;

  if (matchedIdx < minimumIdx) {
    return (matchedIdx / minimumIdx) * 0.5 * confidence;
  }

  if (preferredLevel && matchedIdx >= preferredIdx) {
    return 1.0 * confidence;
  }

  const range = Math.max(1, preferredIdx - minimumIdx);
  const position = matchedIdx - minimumIdx;
  return (0.7 + (position / range) * 0.3) * confidence;
}

export function aggregateSkillsByCategory(
  skills: Skill[]
): Record<SkillCategory, Skill[]> {
  const result: Record<SkillCategory, Skill[]> = {
    technical: [],
    communication: [],
    leadership: [],
    'problem-solving': [],
    creativity: [],
    domain: [],
    tools: [],
    custom: []
  };

  for (const skill of skills) {
    if (result[skill.category]) {
      result[skill.category].push(skill);
    }
  }

  return result;
}

export function getTopSkills(
  assessments: SkillAssessment[],
  skills: Skill[],
  limit: number = 5
): Array<{ skill: Skill; assessment: SkillAssessment }> {
  const skillMap = new Map(skills.map(s => [s.id, s]));

  const withSkills = assessments
    .map(a => ({
      skill: skillMap.get(a.skillId),
      assessment: a
    }))
    .filter((item): item is { skill: Skill; assessment: SkillAssessment } => 
      item.skill !== undefined
    );

  return withSkills
    .sort((a, b) => {
      const levelDiff = getLevelIndex(b.assessment.level) - getLevelIndex(a.assessment.level);
      if (levelDiff !== 0) return levelDiff;
      return b.assessment.confidence - a.assessment.confidence;
    })
    .slice(0, limit);
}

export function validateSkillName(name: string): boolean {
  return name.length >= 2 && name.length <= 100 && /^[a-zA-Z0-9\s\-_]+$/.test(name);
}

export function validateSkillDescription(description: string): boolean {
  return description.length <= 1000;
}

export function normalizeTag(tag: string): string {
  return tag.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');
}

export function skillToSummary(skill: Skill): string {
  return `${skill.name} (${skill.category}, ${skill.level})`;
}

export function assessmentToSummary(assessment: SkillAssessment): string {
  return `Skill ${assessment.skillId}: ${assessment.level} (confidence: ${Math.round(assessment.confidence * 100)}%)`;
}