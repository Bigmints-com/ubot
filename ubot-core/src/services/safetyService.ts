import { logger } from '../services/logger.js';
import type { SafetyPolicy, SafetyCheckResult, SanitizedOutput, SafetyRule } from '../types/safety.js';

export class SafetyService {
  private static instance: SafetyService;
  private policies: Map<string, SafetyPolicy> = new Map();

  private constructor() {
    this.initializeDefaultPolicies();
  }

  public static getInstance(): SafetyService {
    if (!SafetyService.instance) {
      SafetyService.instance = new SafetyService();
    }
    return SafetyService.instance;
  }

  private initializeDefaultPolicies(): void {
    const defaultRules: SafetyRule[] = [
      {
        id: 'xss',
        pattern: /<script\b[^>]*>([\s\S]*?)<\/script>/gi,
        description: 'XSS Attack Pattern',
        level: 'strict',
      },
      {
        id: 'sql_injection',
        pattern: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER)\b)/gi,
        description: 'SQL Injection Pattern',
        level: 'strict',
      },
      {
        id: 'command_injection',
        pattern: /(\b(rm|exec|eval|system|shell_exec)\b)/gi,
        description: 'Command Injection Pattern',
        level: 'strict',
      },
      {
        id: 'profanity',
        pattern: /\b(fuck|shit|damn|bitch|ass)\b/gi,
        description: 'Profanity Filter',
        level: 'moderate',
      },
    ];

    const strictPolicy: SafetyPolicy = {
      id: 'strict',
      name: 'Strict Safety Policy',
      description: 'Blocks potential attacks and harmful content',
      level: 'strict',
      rules: defaultRules,
      enabled: true,
    };

    const moderatePolicy: SafetyPolicy = {
      id: 'moderate',
      name: 'Moderate Safety Policy',
      description: 'Blocks attacks but allows mild profanity',
      level: 'moderate',
      rules: defaultRules.filter((r) => r.id !== 'profanity'),
      enabled: true,
    };

    this.policies.set(strictPolicy.id, strictPolicy);
    this.policies.set(moderatePolicy.id, moderatePolicy);
  }

  public getPolicies(): SafetyPolicy[] {
    return Array.from(this.policies.values()).filter((p) => p.enabled);
  }

  public getPolicyById(id: string): SafetyPolicy | undefined {
    return this.policies.get(id);
  }

  public async checkContent(
    content: string,
    policyId: string = 'strict'
  ): Promise<SafetyCheckResult> {
    const policy = this.policies.get(policyId);
    if (!policy) {
      logger.warn(`Safety policy ${policyId} not found`);
      return { passed: true, blocked: false, violations: [] };
    }

    const violations: string[] = [];
    let blocked = false;

    for (const rule of policy.rules) {
      const matches = content.match(rule.pattern);
      if (matches) {
        violations.push(rule.description);
        if (rule.level === 'strict') {
          blocked = true;
        }
      }
    }

    const passed = !blocked;
    const reason = blocked ? 'Content blocked by safety policy' : undefined;

    logger.debug(`Safety check for policy ${policyId}: ${passed ? 'PASSED' : 'BLOCKED'}`);

    return {
      passed,
      blocked,
      reason,
      violations,
    };
  }

  public sanitizeOutput(content: string, policyId: string = 'strict'): SanitizedOutput {
    const policy = this.policies.get(policyId);
    if (!policy) {
      return { content, warnings: [] };
    }

    let sanitized = content;
    const warnings: string[] = [];

    // Remove script tags
    sanitized = sanitized.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, '');

    // Replace profanity with asterisks (simple implementation)
    policy.rules.forEach((rule) => {
      if (rule.id === 'profanity') {
        sanitized = sanitized.replace(rule.pattern, '****');
        warnings.push('Profanity filtered');
      }
    });

    return { content: sanitized, warnings };
  }
}