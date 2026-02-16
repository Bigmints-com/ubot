import type { Request, Response, NextFunction } from 'express';
import { SafetyService } from '../services/safetyService.js';

const safetyService = SafetyService.getInstance();

export const safetyCheckMiddleware = (
  policyId: string = 'strict',
  options: { bodyKey?: string; queryKey?: string; skipOnSuccess?: boolean } = {}
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { bodyKey = 'message', queryKey, skipOnSuccess = false } = options;

      let contentToCheck = '';

      if (queryKey && req.query[queryKey]) {
        contentToCheck = String(req.query[queryKey]);
      } else if (bodyKey && req.body[bodyKey]) {
        contentToCheck = String(req.body[bodyKey]);
      }

      if (!contentToCheck) {
        next();
        return;
      }

      const result = await safetyService.checkContent(contentToCheck, policyId);

      if (result.blocked) {
        res.status(403).json({
          success: false,
          error: 'Safety Policy Violation',
          details: result,
        });
        return;
      }

      if (skipOnSuccess) {
        next();
      } else {
        next();
      }
    } catch (error) {
      logger.error('Safety middleware error', error);
      next();
    }
  };
};

export const sanitizeResponseMiddleware = (
  policyId: string = 'strict'
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const originalSend = res.send;

    res.send = function (data: any): Response {
      if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data);
          if (parsed.content) {
            const sanitized = safetyService.sanitizeOutput(parsed.content, policyId);
            parsed.content = sanitized.content;
            if (sanitized.warnings.length > 0) {
              parsed.warnings = sanitized.warnings;
            }
            data = JSON.stringify(parsed);
          }
        } catch (e) {
          // Not JSON, leave as is
        }
      }
      return originalSend.call(this, data);
    };

    next();
  };
};