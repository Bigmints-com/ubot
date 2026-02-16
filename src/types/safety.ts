export type SafetyLevel = 'strict' | 'moderate' | 'lenient';

export interface SafetyRule {
  id: string;
  pattern: RegExp;
  description: string;
  level: SafetyLevel;
}

export interface SafetyPolicy {
  id: string;
  name: string;
  description: string;
  level: SafetyLevel;
  rules: SafetyRule[];
  enabled: boolean;
}

export interface SafetyCheckResult {
  passed: boolean;
  blocked: boolean;
  reason?: string;
  violations: string[];
}

export interface SanitizedOutput {
  content: string;
  warnings: string[];
}