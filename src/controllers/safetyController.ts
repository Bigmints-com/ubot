import { Request, Response } from 'express';
import { SafetyService } from '../services/safetyService.js';

const safetyService = SafetyService.getInstance();

export const getSafetyPolicies = async (req: Request, res: Response): Promise<void> => {
  try {
    const policies = safetyService.getPolicies();
    res.json({
      success: true,
      data: policies,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve safety policies',
    });
  }
};

export const checkSafety = async (req: Request, res: Response): Promise<void> => {
  try {
    const { content, policyId } = req.body;

    if (!content) {
      res.status(400).json({
        success: false,
        error: 'Content is required',
      });
      return;
    }

    const result = await safetyService.checkContent(content, policyId || 'strict');
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Safety check failed',
    });
  }
};

export const getSafetyPolicy = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const policy = safetyService.getPolicyById(id);

    if (!policy) {
      res.status(404).json({
        success: false,
        error: 'Policy not found',
      });
      return;
    }

    res.json({
      success: true,
      data: policy,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve policy',
    });
  }
};