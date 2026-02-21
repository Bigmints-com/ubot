import { describe, it, expect } from 'vitest';
import googleModule from './google.js';
import { registerModule } from './test-helpers.js';

const EXPECTED_TOOLS = [
  // Gmail (6)
  'gmail_list', 'gmail_read', 'gmail_send', 'gmail_search', 'gmail_trash', 'gmail_reply',
  // Drive (6)
  'drive_list', 'drive_search', 'drive_download', 'drive_upload', 'drive_share', 'drive_create_folder',
  // Sheets (4)
  'sheets_read', 'sheets_write', 'sheets_create', 'sheets_list_tabs',
  // Docs (2)
  'docs_read', 'docs_create',
  // Contacts (3)
  'google_contacts_list', 'google_contacts_search', 'google_contacts_create',
  // Calendar (4)
  'gcal_list_events', 'gcal_create_event', 'gcal_update_event', 'gcal_delete_event',
  // Places (3)
  'google_places_search', 'google_places_details', 'google_places_nearby',
  // Auth (1)
  'google_auth_status',
];

describe('Google Tool Module', () => {
  it('should export correct module metadata', () => {
    expect(googleModule.name).toBe('google');
    expect(googleModule.tools.length).toBe(29);
  });

  it('should register all 29 executors', () => {
    const registry = registerModule(googleModule);
    expect(registry.registeredNames()).toHaveLength(29);
    for (const name of EXPECTED_TOOLS) {
      expect(registry.has(name), `${name} should be registered`).toBe(true);
    }
  });

  describe('tool definitions', () => {
    it('should have unique tool names', () => {
      const names = googleModule.tools.map(t => t.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('all tools should have descriptions', () => {
      for (const tool of googleModule.tools) {
        expect(tool.description, `${tool.name} should have a description`).toBeTruthy();
      }
    });

    it('all parameters should have type and description', () => {
      for (const tool of googleModule.tools) {
        for (const param of tool.parameters) {
          expect(param.type, `${tool.name}.${param.name} should have a type`).toBeTruthy();
          expect(param.description, `${tool.name}.${param.name} should have a description`).toBeTruthy();
        }
      }
    });

    // Gmail
    it('gmail_send should require to, subject, body', () => {
      const tool = googleModule.tools.find(t => t.name === 'gmail_send')!;
      const required = tool.parameters.filter(p => p.required).map(p => p.name);
      expect(required).toContain('to');
      expect(required).toContain('subject');
      expect(required).toContain('body');
    });

    it('gmail_read should require message_id', () => {
      const tool = googleModule.tools.find(t => t.name === 'gmail_read')!;
      expect(tool.parameters.find(p => p.name === 'message_id')?.required).toBe(true);
    });

    // Drive
    it('drive_upload should require name and content', () => {
      const tool = googleModule.tools.find(t => t.name === 'drive_upload')!;
      const required = tool.parameters.filter(p => p.required).map(p => p.name);
      expect(required).toContain('name');
      expect(required).toContain('content');
    });

    // Sheets
    it('sheets_read should require spreadsheet_id and range', () => {
      const tool = googleModule.tools.find(t => t.name === 'sheets_read')!;
      const required = tool.parameters.filter(p => p.required).map(p => p.name);
      expect(required).toContain('spreadsheet_id');
      expect(required).toContain('range');
    });

    // Calendar
    it('gcal_create_event should require summary, start_time, end_time', () => {
      const tool = googleModule.tools.find(t => t.name === 'gcal_create_event')!;
      const required = tool.parameters.filter(p => p.required).map(p => p.name);
      expect(required).toContain('summary');
      expect(required).toContain('start_time');
      expect(required).toContain('end_time');
    });

    // Places
    it('google_places_nearby should require latitude and longitude', () => {
      const tool = googleModule.tools.find(t => t.name === 'google_places_nearby')!;
      const required = tool.parameters.filter(p => p.required).map(p => p.name);
      expect(required).toContain('latitude');
      expect(required).toContain('longitude');
    });

    // Auth
    it('google_auth_status should have no parameters', () => {
      const tool = googleModule.tools.find(t => t.name === 'google_auth_status')!;
      expect(tool.parameters).toHaveLength(0);
    });
  });

  describe('executor error handling', () => {
    // Google tools use dynamic import for auth — google_auth_status handles errors internally
    it('google_auth_status should return a result without crashing', async () => {
      const registry = registerModule(googleModule);
      const result = await registry.call('google_auth_status');
      expect(result.toolName).toBe('google_auth_status');
    });
  });
});
