import { describe, it, expect, beforeEach } from 'vitest';
import { toolAnalytics, ToolUsageStats } from './tool-analytics.js';

describe('Tool Analytics', () => {
  beforeEach(() => {
    toolAnalytics.reset();
  });

  it('should record tool executions', () => {
    toolAnalytics.recordExecution('test_tool', true, 100);
    const stats = toolAnalytics.getStats();
    expect(stats).toHaveProperty('test_tool');
    expect(stats['test_tool'].totalCalls).toBe(1);
    expect(stats['test_tool'].successfulCalls).toBe(1);
    expect(stats['test_tool'].failedCalls).toBe(0);
    expect(stats['test_tool'].averageDuration).toBe(100);
  });

  it('should record failed tool executions', () => {
    toolAnalytics.recordExecution('fail_tool', false, 50, 'Test error');
    const stats = toolAnalytics.getStats();
    expect(stats).toHaveProperty('fail_tool');
    expect(stats['fail_tool'].totalCalls).toBe(1);
    expect(stats['fail_tool'].successfulCalls).toBe(0);
    expect(stats['fail_tool'].failedCalls).toBe(1);
    expect(stats['fail_tool'].errorRate).toBe(1);
  });

  it('should calculate error rates correctly', () => {
    toolAnalytics.recordExecution('rate_test', true, 100);
    toolAnalytics.recordExecution('rate_test', false, 50, 'First error');
    toolAnalytics.recordExecution('rate_test', true, 75);
    toolAnalytics.recordExecution('rate_test', false, 30, 'Second error');
    
    const stats = toolAnalytics.getStats();
    expect(stats['rate_test'].totalCalls).toBe(4);
    expect(stats['rate_test'].successfulCalls).toBe(2);
    expect(stats['rate_test'].failedCalls).toBe(2);
    expect(stats['rate_test'].errorRate).toBe(0.5);
  });

  it('should calculate average durations correctly', () => {
    toolAnalytics.recordExecution('avg_test', true, 100);
    toolAnalytics.recordExecution('avg_test', true, 200);
    toolAnalytics.recordExecution('avg_test', true, 300);
    
    const stats = toolAnalytics.getStats();
    expect(stats['avg_test'].averageDuration).toBeCloseTo(200); // (100+200+300)/3
  });

  it('should get stats for specific tool', () => {
    toolAnalytics.recordExecution('specific_tool', true, 150);
    const toolStats = toolAnalytics.getToolStats('specific_tool');
    expect(toolStats).not.toBeNull();
    expect(toolStats!.totalCalls).toBe(1);
    expect(toolStats!.successfulCalls).toBe(1);
  });

  it('should return null for non-existent tool', () => {
    const toolStats = toolAnalytics.getToolStats('non_existent_tool');
    expect(toolStats).toBeNull();
  });

  it('should reset all stats', () => {
    toolAnalytics.recordExecution('reset_test', true, 100);
    expect(toolAnalytics.getStats()).toHaveProperty('reset_test');
    
    toolAnalytics.reset();
    expect(toolAnalytics.getStats()).toEqual({});
  });

  it('should convert to JSON', () => {
    toolAnalytics.recordExecution('json_test', true, 200);
    const json = toolAnalytics.toJSON();
    expect(json).toHaveProperty('stats');
    expect(json).toHaveProperty('timestamp');
    expect(json.stats).toHaveProperty('json_test');
  });
});