import { describe, it, expect } from 'vitest';
import saveadayModule from './saveaday.js';
import { registerModule } from './test-helpers.js';

const EXPECTED_GROUPS = {
  auth: ['saveaday_auth_status'],
  booking: [
    'saveaday_booking_services', 'saveaday_booking_service_get', 'saveaday_booking_professionals',
    'saveaday_booking_list', 'saveaday_booking_get', 'saveaday_booking_create',
    'saveaday_booking_update', 'saveaday_booking_stats',
  ],
  catalogues: [
    'saveaday_catalogues_list', 'saveaday_catalogues_get', 'saveaday_catalogues_create', 'saveaday_catalogues_update',
    'saveaday_catalogues_items_list', 'saveaday_catalogues_item_get', 'saveaday_catalogues_item_create', 'saveaday_catalogues_item_update',
  ],
  contacts: [
    'saveaday_contacts_list', 'saveaday_contacts_get', 'saveaday_contacts_create',
    'saveaday_contacts_update', 'saveaday_contacts_delete',
  ],
  feeds: [
    'saveaday_feeds_list', 'saveaday_feeds_get', 'saveaday_feeds_posts_list',
    'saveaday_feeds_post_create', 'saveaday_feeds_post_update',
  ],
  leads: ['saveaday_leads_list', 'saveaday_leads_get', 'saveaday_leads_submissions', 'saveaday_leads_stats'],
  links: ['saveaday_links_list', 'saveaday_links_get', 'saveaday_links_create', 'saveaday_links_update', 'saveaday_links_delete'],
  referrals: [
    'saveaday_referrals_campaigns', 'saveaday_referrals_campaign_get',
    'saveaday_referrals_referrers', 'saveaday_referrals_referees', 'saveaday_referrals_stats',
  ],
  rewards: [
    'saveaday_rewards_tiers', 'saveaday_rewards_subscribers', 'saveaday_rewards_subscriber_get',
    'saveaday_rewards_award_points', 'saveaday_rewards_subscriber_history', 'saveaday_rewards_verify_subscriber',
  ],
  surveys: ['saveaday_surveys_list', 'saveaday_surveys_get', 'saveaday_surveys_create', 'saveaday_surveys_stats'],
  tasks: [
    'saveaday_tasks_boards_list', 'saveaday_tasks_board_get', 'saveaday_tasks_list',
    'saveaday_tasks_create', 'saveaday_tasks_update', 'saveaday_tasks_stats',
  ],
  waitlists: ['saveaday_waitlists_list', 'saveaday_waitlists_get', 'saveaday_waitlists_submissions', 'saveaday_waitlists_stats'],
};

const ALL_TOOLS = Object.values(EXPECTED_GROUPS).flat();

describe('SaveADay Tool Module', () => {
  it('should export correct module metadata', () => {
    expect(saveadayModule.name).toBe('saveaday');
    expect(saveadayModule.tools.length).toBeGreaterThanOrEqual(55);
  });

  it('should register all executors', () => {
    const registry = registerModule(saveadayModule);
    for (const name of ALL_TOOLS) {
      expect(registry.has(name), `${name} should be registered`).toBe(true);
    }
  });

  describe('tool definitions', () => {
    it('should have unique tool names', () => {
      const names = saveadayModule.tools.map(t => t.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('all tools should have descriptions', () => {
      for (const tool of saveadayModule.tools) {
        expect(tool.description, `${tool.name} should have a description`).toBeTruthy();
      }
    });

    it('all parameters should have type and description', () => {
      for (const tool of saveadayModule.tools) {
        for (const param of tool.parameters) {
          expect(param.type, `${tool.name}.${param.name} should have a type`).toBeTruthy();
          expect(param.description, `${tool.name}.${param.name} should have a description`).toBeTruthy();
        }
      }
    });
  });

  describe('booking tools', () => {
    it('should have all booking tools registered', () => {
      const registry = registerModule(saveadayModule);
      for (const name of EXPECTED_GROUPS.booking) {
        expect(registry.has(name)).toBe(true);
      }
    });

    it('saveaday_booking_create should require service_id and client_name', () => {
      const tool = saveadayModule.tools.find(t => t.name === 'saveaday_booking_create');
      if (tool) {
        const required = tool.parameters.filter(p => p.required).map(p => p.name);
        expect(required).toContain('service_id');
        expect(required).toContain('client_name');
      }
    });
  });

  describe('contacts tools', () => {
    it('should have all contacts tools registered', () => {
      const registry = registerModule(saveadayModule);
      for (const name of EXPECTED_GROUPS.contacts) {
        expect(registry.has(name)).toBe(true);
      }
    });

    it('saveaday_contacts_create should require first_name', () => {
      const tool = saveadayModule.tools.find(t => t.name === 'saveaday_contacts_create');
      if (tool) {
        const required = tool.parameters.filter(p => p.required).map(p => p.name);
        expect(required).toContain('first_name');
      }
    });
  });

  describe('catalogues tools', () => {
    it('should have all catalogue tools registered', () => {
      const registry = registerModule(saveadayModule);
      for (const name of EXPECTED_GROUPS.catalogues) {
        expect(registry.has(name)).toBe(true);
      }
    });
  });

  describe('tasks tools', () => {
    it('should have all tasks tools registered', () => {
      const registry = registerModule(saveadayModule);
      for (const name of EXPECTED_GROUPS.tasks) {
        expect(registry.has(name)).toBe(true);
      }
    });

    it('saveaday_tasks_create should require board_id and title', () => {
      const tool = saveadayModule.tools.find(t => t.name === 'saveaday_tasks_create');
      if (tool) {
        const required = tool.parameters.filter(p => p.required).map(p => p.name);
        expect(required).toContain('board_id');
        expect(required).toContain('title');
      }
    });
  });

  describe('executor error handling', () => {
    // SaveADay tools require API auth — should fail gracefully
    it('saveaday_auth_status should handle missing auth gracefully', async () => {
      const registry = registerModule(saveadayModule);
      const result = await registry.call('saveaday_auth_status');
      // May succeed (returning "not connected") or fail — either is acceptable
      expect(result.toolName).toBe('saveaday_auth_status');
    });

    it('saveaday_contacts_list should fail gracefully without auth', async () => {
      const registry = registerModule(saveadayModule);
      const result = await registry.call('saveaday_contacts_list', {});
      expect(result.toolName).toBe('saveaday_contacts_list');
      // Should either error or return a message about auth
    });
  });
});
