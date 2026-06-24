import { describe, it, expect } from 'vitest';
import appleModule from '../../capabilities/apple/tools.js';
import { registerModule } from './test-helpers.js';

const EXPECTED_TOOLS = [
  // Calendar (3)
  'apple_cal_list_events', 'apple_cal_create_event', 'apple_cal_delete_event',
  // Contacts (2)
  'apple_contacts_list', 'apple_contacts_search',
  // Notes (3)
  'apple_notes_list', 'apple_notes_read', 'apple_notes_create',
  // Mail (3)
  'apple_mail_list', 'apple_mail_read', 'apple_mail_send',
];

describe('Apple Tool Module', () => {
  it('should export correct module metadata', () => {
    expect(appleModule.name).toBe('apple');
    expect(appleModule.tools.length).toBe(11);
  });

  it('should register all 11 executors on macOS', () => {
    const registry = registerModule(appleModule);
    // On macOS, all 11 should be registered; on other platforms, 0
    const isMacOS = process.platform === 'darwin';
    const expectedCount = isMacOS ? 11 : 0;
    expect(registry.registeredNames()).toHaveLength(expectedCount);
    if (isMacOS) {
      for (const name of EXPECTED_TOOLS) {
        expect(registry.has(name), `${name} should be registered`).toBe(true);
      }
    }
  });

  describe('tool definitions', () => {
    it('should have unique tool names', () => {
      const names = appleModule.tools.map(t => t.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('all tools should have descriptions', () => {
      for (const tool of appleModule.tools) {
        expect(tool.description, `${tool.name} should have a description`).toBeTruthy();
      }
    });

    it('all parameters should have type and description', () => {
      for (const tool of appleModule.tools) {
        for (const param of tool.parameters) {
          expect(param.type, `${tool.name}.${param.name} should have a type`).toBeTruthy();
          expect(param.description, `${tool.name}.${param.name} should have a description`).toBeTruthy();
        }
      }
    });

    // Calendar
    it('apple_cal_create_event should require summary, start_time, end_time', () => {
      const tool = appleModule.tools.find(t => t.name === 'apple_cal_create_event')!;
      const required = tool.parameters.filter(p => p.required).map(p => p.name);
      expect(required).toContain('summary');
      expect(required).toContain('start_time');
      expect(required).toContain('end_time');
    });

    // Contacts
    it('apple_contacts_search should require query', () => {
      const tool = appleModule.tools.find(t => t.name === 'apple_contacts_search')!;
      expect(tool.parameters.find(p => p.name === 'query')?.required).toBe(true);
    });

    // Notes
    it('apple_notes_create should require title and body', () => {
      const tool = appleModule.tools.find(t => t.name === 'apple_notes_create')!;
      const required = tool.parameters.filter(p => p.required).map(p => p.name);
      expect(required).toContain('title');
      expect(required).toContain('body');
    });

    // Mail
    it('apple_mail_send should require to, subject, body', () => {
      const tool = appleModule.tools.find(t => t.name === 'apple_mail_send')!;
      const required = tool.parameters.filter(p => p.required).map(p => p.name);
      expect(required).toContain('to');
      expect(required).toContain('subject');
      expect(required).toContain('body');
    });
  });
});
