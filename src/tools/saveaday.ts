/**
 * SaveADay Tool Module
 *
 * Self-contained module providing booking, catalogues, contacts, feeds,
 * leads, links, referrals, rewards, surveys, tasks, waitlists, and dashboard tools.
 * Follows the exact same pattern as google.ts.
 */

import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from '../tools/types.js';

// ── Tool Definitions ────────────────────────────────────

const SAVEADAY_TOOLS: ToolDefinition[] = [
  // Auth
  {
    name: 'saveaday_auth_status',
    description: 'Check the status of SaveADay authentication (API token connection). Shows if connected, user name, tenant, and base URL.',
    parameters: [],
  },


  // ── Booking System ────────────────────────────────────
  {
    name: 'saveaday_booking_services',
    description: 'List available booking services from SaveADay. Shows service names, durations, and prices.',
    parameters: [
      { name: 'search', type: 'string', description: 'Search services by name', required: false },
      { name: 'limit', type: 'number', description: 'Max results (default 25)', required: false },
    ],
  },
  {
    name: 'saveaday_booking_service_get',
    description: 'Get details of a specific booking service.',
    parameters: [
      { name: 'id', type: 'string', description: 'The service ID', required: true },
    ],
  },
  {
    name: 'saveaday_booking_professionals',
    description: 'List professionals/staff available for bookings.',
    parameters: [
      { name: 'search', type: 'string', description: 'Search by name', required: false },
      { name: 'limit', type: 'number', description: 'Max results (default 25)', required: false },
    ],
  },
  {
    name: 'saveaday_booking_list',
    description: 'List all bookings/appointments. Shows client, service, date/time, and status.',
    parameters: [
      { name: 'search', type: 'string', description: 'Search bookings', required: false },
      { name: 'limit', type: 'number', description: 'Max results (default 25)', required: false },
      { name: 'start_date', type: 'string', description: 'Filter by start date (ISO 8601)', required: false },
      { name: 'end_date', type: 'string', description: 'Filter by end date (ISO 8601)', required: false },
    ],
  },
  {
    name: 'saveaday_booking_get',
    description: 'Get details of a specific booking/appointment by ID.',
    parameters: [{ name: 'id', type: 'string', description: 'The booking ID', required: true }],
  },
  {
    name: 'saveaday_booking_create',
    description: 'Create a new booking/appointment in SaveADay.',
    parameters: [
      { name: 'service_id', type: 'string', description: 'The service ID to book', required: true },
      { name: 'professional_id', type: 'string', description: 'The professional/staff ID', required: false },
      { name: 'client_name', type: 'string', description: 'Client name', required: true },
      { name: 'client_email', type: 'string', description: 'Client email', required: false },
      { name: 'client_phone', type: 'string', description: 'Client phone', required: false },
      { name: 'start_time', type: 'string', description: 'Booking start time (ISO 8601)', required: true },
      { name: 'notes', type: 'string', description: 'Booking notes', required: false },
    ],
  },
  {
    name: 'saveaday_booking_update',
    description: 'Update an existing booking (e.g., change status, reschedule).',
    parameters: [
      { name: 'id', type: 'string', description: 'The booking ID to update', required: true },
      { name: 'status', type: 'string', description: 'New status (e.g., "confirmed", "cancelled", "completed")', required: false },
      { name: 'start_time', type: 'string', description: 'New start time (ISO 8601)', required: false },
      { name: 'notes', type: 'string', description: 'Updated notes', required: false },
    ],
  },
  {
    name: 'saveaday_booking_stats',
    description: 'Get booking statistics (total bookings, by status, etc.).',
    parameters: [],
  },

  // ── Catalogues ────────────────────────────────────────
  {
    name: 'saveaday_catalogues_list',
    description: 'List all catalogues (product/service catalogues).',
    parameters: [
      { name: 'search', type: 'string', description: 'Search catalogues by name', required: false },
      { name: 'limit', type: 'number', description: 'Max results (default 25)', required: false },
    ],
  },
  {
    name: 'saveaday_catalogues_get',
    description: 'Get a specific catalogue by ID.',
    parameters: [{ name: 'id', type: 'string', description: 'The catalogue ID', required: true }],
  },
  {
    name: 'saveaday_catalogues_create',
    description: 'Create a new catalogue.',
    parameters: [
      { name: 'name', type: 'string', description: 'Catalogue name', required: true },
      { name: 'description', type: 'string', description: 'Catalogue description', required: false },
    ],
  },
  {
    name: 'saveaday_catalogues_update',
    description: 'Update an existing catalogue.',
    parameters: [
      { name: 'id', type: 'string', description: 'Catalogue ID', required: true },
      { name: 'name', type: 'string', description: 'Updated name', required: false },
      { name: 'description', type: 'string', description: 'Updated description', required: false },
    ],
  },
  {
    name: 'saveaday_catalogues_items_list',
    description: 'List items in a specific catalogue.',
    parameters: [
      { name: 'catalogue_id', type: 'string', description: 'The catalogue ID', required: true },
      { name: 'search', type: 'string', description: 'Search items', required: false },
      { name: 'limit', type: 'number', description: 'Max results (default 25)', required: false },
    ],
  },
  {
    name: 'saveaday_catalogues_item_get',
    description: 'Get a specific item from a catalogue.',
    parameters: [
      { name: 'catalogue_id', type: 'string', description: 'The catalogue ID', required: true },
      { name: 'item_id', type: 'string', description: 'The item ID', required: true },
    ],
  },
  {
    name: 'saveaday_catalogues_item_create',
    description: 'Add a new item to a catalogue.',
    parameters: [
      { name: 'catalogue_id', type: 'string', description: 'The catalogue ID', required: true },
      { name: 'name', type: 'string', description: 'Item name', required: true },
      { name: 'description', type: 'string', description: 'Item description', required: false },
      { name: 'price', type: 'number', description: 'Item price', required: false },
    ],
  },
  {
    name: 'saveaday_catalogues_item_update',
    description: 'Update an existing item in a catalogue.',
    parameters: [
      { name: 'catalogue_id', type: 'string', description: 'The catalogue ID', required: true },
      { name: 'item_id', type: 'string', description: 'The item ID', required: true },
      { name: 'name', type: 'string', description: 'Updated name', required: false },
      { name: 'description', type: 'string', description: 'Updated description', required: false },
      { name: 'price', type: 'number', description: 'Updated price', required: false },
    ],
  },

  // ── Contacts ──────────────────────────────────────────
  {
    name: 'saveaday_contacts_list',
    description: 'List contacts from SaveADay CRM. Returns name, email, phone, and ID.',
    parameters: [
      { name: 'search', type: 'string', description: 'Search contacts by name, email, or phone', required: false },
      { name: 'limit', type: 'number', description: 'Max contacts to return (default 25)', required: false },
    ],
  },
  {
    name: 'saveaday_contacts_get',
    description: 'Get a specific contact by ID from SaveADay CRM.',
    parameters: [{ name: 'id', type: 'string', description: 'The contact ID', required: true }],
  },
  {
    name: 'saveaday_contacts_create',
    description: 'Create a new contact in SaveADay CRM.',
    parameters: [
      { name: 'first_name', type: 'string', description: 'Contact first name', required: true },
      { name: 'last_name', type: 'string', description: 'Contact last name', required: false },
      { name: 'email', type: 'string', description: 'Email address', required: false },
      { name: 'phone', type: 'string', description: 'Phone number', required: false },
      { name: 'notes', type: 'string', description: 'Additional notes', required: false },
    ],
  },
  {
    name: 'saveaday_contacts_update',
    description: 'Update an existing contact in SaveADay CRM.',
    parameters: [
      { name: 'id', type: 'string', description: 'The contact ID to update', required: true },
      { name: 'first_name', type: 'string', description: 'Updated first name', required: false },
      { name: 'last_name', type: 'string', description: 'Updated last name', required: false },
      { name: 'email', type: 'string', description: 'Updated email', required: false },
      { name: 'phone', type: 'string', description: 'Updated phone', required: false },
      { name: 'notes', type: 'string', description: 'Updated notes', required: false },
    ],
  },
  {
    name: 'saveaday_contacts_delete',
    description: 'Delete a contact from SaveADay CRM by ID.',
    parameters: [{ name: 'id', type: 'string', description: 'The contact ID to delete', required: true }],
  },

  // ── Feeds ─────────────────────────────────────────────
  {
    name: 'saveaday_feeds_list',
    description: 'List all newsletter/content feeds.',
    parameters: [
      { name: 'search', type: 'string', description: 'Search feeds', required: false },
      { name: 'limit', type: 'number', description: 'Max results (default 25)', required: false },
    ],
  },
  {
    name: 'saveaday_feeds_get',
    description: 'Get a specific feed by ID.',
    parameters: [{ name: 'id', type: 'string', description: 'The feed ID', required: true }],
  },
  {
    name: 'saveaday_feeds_posts_list',
    description: 'List posts in a specific feed.',
    parameters: [
      { name: 'feed_id', type: 'string', description: 'The feed ID', required: true },
      { name: 'search', type: 'string', description: 'Search posts', required: false },
      { name: 'limit', type: 'number', description: 'Max results (default 25)', required: false },
    ],
  },
  {
    name: 'saveaday_feeds_post_create',
    description: 'Create a new post in a feed.',
    parameters: [
      { name: 'feed_id', type: 'string', description: 'The feed ID', required: true },
      { name: 'title', type: 'string', description: 'Post title', required: true },
      { name: 'content', type: 'string', description: 'Post content (text or HTML)', required: true },
      { name: 'status', type: 'string', description: 'Post status (draft or published)', required: false },
    ],
  },
  {
    name: 'saveaday_feeds_post_update',
    description: 'Update an existing post in a feed.',
    parameters: [
      { name: 'feed_id', type: 'string', description: 'The feed ID', required: true },
      { name: 'post_id', type: 'string', description: 'The post ID', required: true },
      { name: 'title', type: 'string', description: 'Updated title', required: false },
      { name: 'content', type: 'string', description: 'Updated content', required: false },
      { name: 'status', type: 'string', description: 'Updated status', required: false },
    ],
  },

  // ── Leads (Lead Forms) ────────────────────────────────
  {
    name: 'saveaday_leads_list',
    description: 'List all lead capture forms.',
    parameters: [
      { name: 'search', type: 'string', description: 'Search lead forms by name', required: false },
      { name: 'limit', type: 'number', description: 'Max results (default 25)', required: false },
    ],
  },
  {
    name: 'saveaday_leads_get',
    description: 'Get a specific lead form by ID.',
    parameters: [{ name: 'id', type: 'string', description: 'The form ID', required: true }],
  },
  {
    name: 'saveaday_leads_submissions',
    description: 'List submissions for a specific lead form.',
    parameters: [
      { name: 'form_id', type: 'string', description: 'The form ID', required: true },
      { name: 'search', type: 'string', description: 'Search submissions', required: false },
      { name: 'limit', type: 'number', description: 'Max results (default 25)', required: false },
    ],
  },
  {
    name: 'saveaday_leads_stats',
    description: 'Get lead form submission statistics.',
    parameters: [],
  },

  // ── Links (Link Pages) ────────────────────────────────
  {
    name: 'saveaday_links_list',
    description: 'List all link pages (link-in-bio style pages).',
    parameters: [
      { name: 'search', type: 'string', description: 'Search link pages', required: false },
      { name: 'limit', type: 'number', description: 'Max results (default 25)', required: false },
    ],
  },
  {
    name: 'saveaday_links_get',
    description: 'Get a specific link page by ID.',
    parameters: [{ name: 'id', type: 'string', description: 'The link page ID', required: true }],
  },
  {
    name: 'saveaday_links_create',
    description: 'Create a new link page.',
    parameters: [
      { name: 'name', type: 'string', description: 'Link page name', required: true },
      { name: 'description', type: 'string', description: 'Description', required: false },
    ],
  },
  {
    name: 'saveaday_links_update',
    description: 'Update an existing link page.',
    parameters: [
      { name: 'id', type: 'string', description: 'The link page ID', required: true },
      { name: 'name', type: 'string', description: 'Updated name', required: false },
      { name: 'description', type: 'string', description: 'Updated description', required: false },
    ],
  },
  {
    name: 'saveaday_links_delete',
    description: 'Delete a link page by ID.',
    parameters: [{ name: 'id', type: 'string', description: 'The link page ID to delete', required: true }],
  },

  // ── Referrals ─────────────────────────────────────────
  {
    name: 'saveaday_referrals_campaigns',
    description: 'List all referral campaigns.',
    parameters: [
      { name: 'search', type: 'string', description: 'Search campaigns', required: false },
      { name: 'limit', type: 'number', description: 'Max results (default 25)', required: false },
    ],
  },
  {
    name: 'saveaday_referrals_campaign_get',
    description: 'Get details of a specific referral campaign.',
    parameters: [{ name: 'id', type: 'string', description: 'Campaign ID', required: true }],
  },
  {
    name: 'saveaday_referrals_referrers',
    description: 'List referrers for a specific campaign.',
    parameters: [
      { name: 'campaign_id', type: 'string', description: 'Campaign ID', required: true },
      { name: 'limit', type: 'number', description: 'Max results (default 25)', required: false },
    ],
  },
  {
    name: 'saveaday_referrals_referees',
    description: 'List referees for a specific campaign.',
    parameters: [
      { name: 'campaign_id', type: 'string', description: 'Campaign ID', required: true },
      { name: 'limit', type: 'number', description: 'Max results (default 25)', required: false },
    ],
  },
  {
    name: 'saveaday_referrals_stats',
    description: 'Get referral campaign statistics.',
    parameters: [],
  },

  // ── Rewards (Loyalty) ─────────────────────────────────
  {
    name: 'saveaday_rewards_tiers',
    description: 'List loyalty program tiers.',
    parameters: [{ name: 'limit', type: 'number', description: 'Max results (default 25)', required: false }],
  },
  {
    name: 'saveaday_rewards_subscribers',
    description: 'List loyalty program subscribers/members.',
    parameters: [
      { name: 'search', type: 'string', description: 'Search by name or email', required: false },
      { name: 'limit', type: 'number', description: 'Max results (default 25)', required: false },
    ],
  },
  {
    name: 'saveaday_rewards_subscriber_get',
    description: 'Get details of a loyalty subscriber.',
    parameters: [{ name: 'id', type: 'string', description: 'Subscriber ID', required: true }],
  },
  {
    name: 'saveaday_rewards_award_points',
    description: 'Award loyalty points to a subscriber.',
    parameters: [
      { name: 'subscriber_id', type: 'string', description: 'Subscriber ID to award points to', required: true },
      { name: 'points', type: 'number', description: 'Number of points to award', required: true },
      { name: 'reason', type: 'string', description: 'Reason for awarding points', required: false },
    ],
  },
  {
    name: 'saveaday_rewards_subscriber_history',
    description: 'Get the points/rewards history for a subscriber.',
    parameters: [{ name: 'subscriber_id', type: 'string', description: 'Subscriber ID', required: true }],
  },
  {
    name: 'saveaday_rewards_verify_subscriber',
    description: 'Verify a loyalty subscriber status and check their tier.',
    parameters: [{ name: 'subscriber_id', type: 'string', description: 'Subscriber ID to verify', required: true }],
  },

  // ── Surveys ───────────────────────────────────────────
  {
    name: 'saveaday_surveys_list',
    description: 'List all surveys from SaveADay.',
    parameters: [
      { name: 'search', type: 'string', description: 'Search surveys by name', required: false },
      { name: 'limit', type: 'number', description: 'Max results (default 25)', required: false },
    ],
  },
  {
    name: 'saveaday_surveys_get',
    description: 'Get a specific survey by ID, including its questions and settings.',
    parameters: [{ name: 'id', type: 'string', description: 'The survey ID', required: true }],
  },
  {
    name: 'saveaday_surveys_create',
    description: 'Create a new survey in SaveADay.',
    parameters: [
      { name: 'name', type: 'string', description: 'Survey name', required: true },
      { name: 'description', type: 'string', description: 'Survey description', required: false },
    ],
  },
  {
    name: 'saveaday_surveys_stats',
    description: 'Get survey response statistics.',
    parameters: [],
  },

  // ── Tasks (Boards & Tasks) ────────────────────────────
  {
    name: 'saveaday_tasks_boards_list',
    description: 'List all Kanban/task boards from SaveADay.',
    parameters: [
      { name: 'search', type: 'string', description: 'Search boards by name', required: false },
      { name: 'limit', type: 'number', description: 'Max results (default 25)', required: false },
    ],
  },
  {
    name: 'saveaday_tasks_board_get',
    description: 'Get a specific task board by ID.',
    parameters: [{ name: 'id', type: 'string', description: 'The board ID', required: true }],
  },
  {
    name: 'saveaday_tasks_list',
    description: 'List tasks in a specific board.',
    parameters: [
      { name: 'board_id', type: 'string', description: 'The board ID', required: true },
      { name: 'search', type: 'string', description: 'Search tasks', required: false },
      { name: 'limit', type: 'number', description: 'Max results (default 25)', required: false },
    ],
  },
  {
    name: 'saveaday_tasks_create',
    description: 'Create a new task in a board.',
    parameters: [
      { name: 'board_id', type: 'string', description: 'The board ID', required: true },
      { name: 'title', type: 'string', description: 'Task title', required: true },
      { name: 'description', type: 'string', description: 'Task description', required: false },
      { name: 'status', type: 'string', description: 'Task status/column', required: false },
      { name: 'assignee', type: 'string', description: 'Assignee name or ID', required: false },
      { name: 'priority', type: 'string', description: 'Priority (low, medium, high)', required: false },
    ],
  },
  {
    name: 'saveaday_tasks_update',
    description: 'Update a task in a board (change status, assignee, etc.).',
    parameters: [
      { name: 'board_id', type: 'string', description: 'The board ID', required: true },
      { name: 'task_id', type: 'string', description: 'The task ID', required: true },
      { name: 'title', type: 'string', description: 'Updated title', required: false },
      { name: 'description', type: 'string', description: 'Updated description', required: false },
      { name: 'status', type: 'string', description: 'Updated status/column', required: false },
      { name: 'assignee', type: 'string', description: 'Updated assignee', required: false },
      { name: 'priority', type: 'string', description: 'Updated priority', required: false },
    ],
  },
  {
    name: 'saveaday_tasks_stats',
    description: 'Get task/board statistics.',
    parameters: [],
  },

  // ── Waitlists ─────────────────────────────────────────
  {
    name: 'saveaday_waitlists_list',
    description: 'List all waitlists.',
    parameters: [
      { name: 'search', type: 'string', description: 'Search waitlists', required: false },
      { name: 'limit', type: 'number', description: 'Max results (default 25)', required: false },
    ],
  },
  {
    name: 'saveaday_waitlists_get',
    description: 'Get a specific waitlist by ID.',
    parameters: [{ name: 'id', type: 'string', description: 'The waitlist ID', required: true }],
  },
  {
    name: 'saveaday_waitlists_submissions',
    description: 'List submissions for a specific waitlist.',
    parameters: [
      { name: 'waitlist_id', type: 'string', description: 'The waitlist ID', required: true },
      { name: 'search', type: 'string', description: 'Search submissions', required: false },
      { name: 'limit', type: 'number', description: 'Max results (default 25)', required: false },
    ],
  },
  {
    name: 'saveaday_waitlists_stats',
    description: 'Get waitlist submission statistics.',
    parameters: [],
  },
];

// ── Executor Registration ───────────────────────────────

function registerExecutors(registry: ToolRegistry): void {
  const wrap = (toolName: string, fn: () => Promise<string>) => {
    return async () => {
      const { getSaveADayToken, getServiceForSaveADayTool, getSaveADayServicesConfig } = await import('../integrations/saveaday/auth.js');
      const serviceKey = getServiceForSaveADayTool(toolName);
      if (serviceKey) {
        const config = getSaveADayServicesConfig();
        if (!config[serviceKey]) {
          return `The ${serviceKey} service is disabled. The owner can enable it in SaveADay settings.`;
        }
      }
      const token = getSaveADayToken();
      if (!token) {
        throw new Error('SaveADay not connected. The owner needs to connect SaveADay first via the SaveADay settings page in the dashboard.');
      }
      return fn();
    };
  };

  const safe = (toolName: string, fn: (args: Record<string, unknown>) => Promise<string>) => {
    registry.register(toolName, async (args) => {
      try {
        const result = await wrap(toolName, () => fn(args))();
        return { toolName, success: true, result, duration: 0 };
      } catch (err: any) {
        console.error(`[SaveADay] ${toolName} error:`, err.message);
        return { toolName, success: false, error: err.message, duration: 0 };
      }
    });
  };

  // Auth status
  registry.register('saveaday_auth_status', async () => {
    try {
      const { getSaveADayAuthStatus } = await import('../integrations/saveaday/auth.js');
      const status = getSaveADayAuthStatus();
      const lines = [
        `SaveADay Connection Status:`,
        `  Token: ${status.hasToken ? '✅ Saved' : '❌ Not found'}`,
        `  Authenticated: ${status.isAuthenticated ? '✅ Yes' : '❌ No'}`,
        `  Base URL: ${status.baseUrl}`,
      ];
      if (status.userName) lines.push(`  User: ${status.userName}`);
      if (status.tenantId) lines.push(`  Tenant: ${status.tenantId}`);
      if (!status.hasToken) {
        lines.push('', '⚠️ To connect SaveADay, go to the SaveADay settings page in the dashboard and enter your API token.');
      }
      return { toolName: 'saveaday_auth_status', success: true, result: lines.join('\n'), duration: 0 };
    } catch (err: any) {
      return { toolName: 'saveaday_auth_status', success: false, error: err.message, duration: 0 };
    }
  });


  // ── Booking ───────────────────────────────────────────
  safe('saveaday_booking_services', async (args) => {
    const { bookingListServices } = await import('../integrations/saveaday/booking.js');
    return bookingListServices({ search: args.search as string | undefined, limit: args.limit ? Number(args.limit) : undefined });
  });
  safe('saveaday_booking_service_get', async (args) => {
    const { bookingGetService } = await import('../integrations/saveaday/booking.js');
    return bookingGetService(String(args.id));
  });
  safe('saveaday_booking_professionals', async (args) => {
    const { bookingListProfessionals } = await import('../integrations/saveaday/booking.js');
    return bookingListProfessionals({ search: args.search as string | undefined, limit: args.limit ? Number(args.limit) : undefined });
  });
  safe('saveaday_booking_list', async (args) => {
    const { bookingListBookings } = await import('../integrations/saveaday/booking.js');
    return bookingListBookings({ search: args.search as string | undefined, limit: args.limit ? Number(args.limit) : undefined, startDate: args.start_date as string | undefined, endDate: args.end_date as string | undefined });
  });
  safe('saveaday_booking_get', async (args) => {
    const { bookingGetBooking } = await import('../integrations/saveaday/booking.js');
    return bookingGetBooking(String(args.id));
  });
  safe('saveaday_booking_create', async (args) => {
    const { bookingCreateBooking } = await import('../integrations/saveaday/booking.js');
    const data: any = { serviceId: String(args.service_id), clientName: String(args.client_name), startTime: String(args.start_time) };
    if (args.professional_id) data.professionalId = String(args.professional_id);
    if (args.client_email) data.clientEmail = String(args.client_email);
    if (args.client_phone) data.clientPhone = String(args.client_phone);
    if (args.notes) data.notes = String(args.notes);
    return bookingCreateBooking(data);
  });
  safe('saveaday_booking_update', async (args) => {
    const { bookingUpdateBooking } = await import('../integrations/saveaday/booking.js');
    const data: any = {};
    if (args.status) data.status = String(args.status);
    if (args.start_time) data.startTime = String(args.start_time);
    if (args.notes) data.notes = String(args.notes);
    return bookingUpdateBooking(String(args.id), data);
  });
  safe('saveaday_booking_stats', async () => {
    const { bookingGetStats } = await import('../integrations/saveaday/booking.js');
    return bookingGetStats();
  });

  // ── Catalogues ────────────────────────────────────────
  safe('saveaday_catalogues_list', async (args) => {
    const { cataloguesList } = await import('../integrations/saveaday/catalogues.js');
    return cataloguesList({ search: args.search as string | undefined, limit: args.limit ? Number(args.limit) : undefined });
  });
  safe('saveaday_catalogues_get', async (args) => {
    const { cataloguesGet } = await import('../integrations/saveaday/catalogues.js');
    return cataloguesGet(String(args.id));
  });
  safe('saveaday_catalogues_create', async (args) => {
    const { cataloguesCreate } = await import('../integrations/saveaday/catalogues.js');
    const data: any = { name: String(args.name) };
    if (args.description) data.description = String(args.description);
    return cataloguesCreate(data);
  });
  safe('saveaday_catalogues_update', async (args) => {
    const { cataloguesUpdate } = await import('../integrations/saveaday/catalogues.js');
    const data: any = {};
    if (args.name) data.name = String(args.name);
    if (args.description) data.description = String(args.description);
    return cataloguesUpdate(String(args.id), data);
  });
  safe('saveaday_catalogues_items_list', async (args) => {
    const { cataloguesListItems } = await import('../integrations/saveaday/catalogues.js');
    return cataloguesListItems(String(args.catalogue_id), { search: args.search as string | undefined, limit: args.limit ? Number(args.limit) : undefined });
  });
  safe('saveaday_catalogues_item_get', async (args) => {
    const { cataloguesGetItem } = await import('../integrations/saveaday/catalogues.js');
    return cataloguesGetItem(String(args.catalogue_id), String(args.item_id));
  });
  safe('saveaday_catalogues_item_create', async (args) => {
    const { cataloguesCreateItem } = await import('../integrations/saveaday/catalogues.js');
    const data: any = { name: String(args.name) };
    if (args.description) data.description = String(args.description);
    if (args.price) data.price = Number(args.price);
    return cataloguesCreateItem(String(args.catalogue_id), data);
  });
  safe('saveaday_catalogues_item_update', async (args) => {
    const { cataloguesUpdateItem } = await import('../integrations/saveaday/catalogues.js');
    const data: any = {};
    if (args.name) data.name = String(args.name);
    if (args.description) data.description = String(args.description);
    if (args.price !== undefined) data.price = Number(args.price);
    return cataloguesUpdateItem(String(args.catalogue_id), String(args.item_id), data);
  });

  // ── Contacts ──────────────────────────────────────────
  safe('saveaday_contacts_list', async (args) => {
    const { contactsList } = await import('../integrations/saveaday/contacts.js');
    return contactsList({ search: args.search as string | undefined, limit: args.limit ? Number(args.limit) : undefined });
  });
  safe('saveaday_contacts_get', async (args) => {
    const { contactsGet } = await import('../integrations/saveaday/contacts.js');
    return contactsGet(String(args.id));
  });
  safe('saveaday_contacts_create', async (args) => {
    const { contactsCreate } = await import('../integrations/saveaday/contacts.js');
    const data: any = { firstName: String(args.first_name) };
    if (args.last_name) data.lastName = String(args.last_name);
    if (args.email) data.email = String(args.email);
    if (args.phone) data.phone = String(args.phone);
    if (args.notes) data.notes = String(args.notes);
    return contactsCreate(data);
  });
  safe('saveaday_contacts_update', async (args) => {
    const { contactsUpdate } = await import('../integrations/saveaday/contacts.js');
    const data: any = {};
    if (args.first_name) data.firstName = String(args.first_name);
    if (args.last_name) data.lastName = String(args.last_name);
    if (args.email) data.email = String(args.email);
    if (args.phone) data.phone = String(args.phone);
    if (args.notes) data.notes = String(args.notes);
    return contactsUpdate(String(args.id), data);
  });
  safe('saveaday_contacts_delete', async (args) => {
    const { contactsDelete } = await import('../integrations/saveaday/contacts.js');
    return contactsDelete(String(args.id));
  });

  // ── Feeds ─────────────────────────────────────────────
  safe('saveaday_feeds_list', async (args) => {
    const { feedsList } = await import('../integrations/saveaday/feeds.js');
    return feedsList({ search: args.search as string | undefined, limit: args.limit ? Number(args.limit) : undefined });
  });
  safe('saveaday_feeds_get', async (args) => {
    const { feedsGet } = await import('../integrations/saveaday/feeds.js');
    return feedsGet(String(args.id));
  });
  safe('saveaday_feeds_posts_list', async (args) => {
    const { feedsListPosts } = await import('../integrations/saveaday/feeds.js');
    return feedsListPosts(String(args.feed_id), { search: args.search as string | undefined, limit: args.limit ? Number(args.limit) : undefined });
  });
  safe('saveaday_feeds_post_create', async (args) => {
    const { feedsCreatePost } = await import('../integrations/saveaday/feeds.js');
    const data: any = { title: String(args.title), content: String(args.content) };
    if (args.status) data.status = String(args.status);
    return feedsCreatePost(String(args.feed_id), data);
  });
  safe('saveaday_feeds_post_update', async (args) => {
    const { feedsUpdatePost } = await import('../integrations/saveaday/feeds.js');
    const data: any = {};
    if (args.title) data.title = String(args.title);
    if (args.content) data.content = String(args.content);
    if (args.status) data.status = String(args.status);
    return feedsUpdatePost(String(args.feed_id), String(args.post_id), data);
  });

  // ── Leads (Lead Forms) ────────────────────────────────
  safe('saveaday_leads_list', async (args) => {
    const { formsList } = await import('../integrations/saveaday/forms.js');
    return formsList({ search: args.search as string | undefined, limit: args.limit ? Number(args.limit) : undefined });
  });
  safe('saveaday_leads_get', async (args) => {
    const { formsGet } = await import('../integrations/saveaday/forms.js');
    return formsGet(String(args.id));
  });
  safe('saveaday_leads_submissions', async (args) => {
    const { formsListSubmissions } = await import('../integrations/saveaday/forms.js');
    return formsListSubmissions(String(args.form_id), { search: args.search as string | undefined, limit: args.limit ? Number(args.limit) : undefined });
  });
  safe('saveaday_leads_stats', async () => {
    const { formsGetStats } = await import('../integrations/saveaday/forms.js');
    return formsGetStats();
  });

  // ── Links (Link Pages) ────────────────────────────────
  safe('saveaday_links_list', async (args) => {
    const { linksList } = await import('../integrations/saveaday/links.js');
    return linksList({ search: args.search as string | undefined, limit: args.limit ? Number(args.limit) : undefined });
  });
  safe('saveaday_links_get', async (args) => {
    const { linksGet } = await import('../integrations/saveaday/links.js');
    return linksGet(String(args.id));
  });
  safe('saveaday_links_create', async (args) => {
    const { linksCreate } = await import('../integrations/saveaday/links.js');
    const data: any = { name: String(args.name) };
    if (args.description) data.description = String(args.description);
    return linksCreate(data);
  });
  safe('saveaday_links_update', async (args) => {
    const { linksUpdate } = await import('../integrations/saveaday/links.js');
    const data: any = {};
    if (args.name) data.name = String(args.name);
    if (args.description) data.description = String(args.description);
    return linksUpdate(String(args.id), data);
  });
  safe('saveaday_links_delete', async (args) => {
    const { linksDelete } = await import('../integrations/saveaday/links.js');
    return linksDelete(String(args.id));
  });

  // ── Referrals ─────────────────────────────────────────
  safe('saveaday_referrals_campaigns', async (args) => {
    const { referralsListCampaigns } = await import('../integrations/saveaday/referrals.js');
    return referralsListCampaigns({ search: args.search as string | undefined, limit: args.limit ? Number(args.limit) : undefined });
  });
  safe('saveaday_referrals_campaign_get', async (args) => {
    const { referralsGetCampaign } = await import('../integrations/saveaday/referrals.js');
    return referralsGetCampaign(String(args.id));
  });
  safe('saveaday_referrals_referrers', async (args) => {
    const { referralsListReferrers } = await import('../integrations/saveaday/referrals.js');
    return referralsListReferrers(String(args.campaign_id), { limit: args.limit ? Number(args.limit) : undefined });
  });
  safe('saveaday_referrals_referees', async (args) => {
    const { referralsListReferees } = await import('../integrations/saveaday/referrals.js');
    return referralsListReferees(String(args.campaign_id), { limit: args.limit ? Number(args.limit) : undefined });
  });
  safe('saveaday_referrals_stats', async () => {
    const { referralsGetStats } = await import('../integrations/saveaday/referrals.js');
    return referralsGetStats();
  });

  // ── Rewards ───────────────────────────────────────────
  safe('saveaday_rewards_tiers', async (args) => {
    const { rewardsListTiers } = await import('../integrations/saveaday/rewards.js');
    return rewardsListTiers({ limit: args.limit ? Number(args.limit) : undefined });
  });
  safe('saveaday_rewards_subscribers', async (args) => {
    const { rewardsListSubscribers } = await import('../integrations/saveaday/rewards.js');
    return rewardsListSubscribers({ search: args.search as string | undefined, limit: args.limit ? Number(args.limit) : undefined });
  });
  safe('saveaday_rewards_subscriber_get', async (args) => {
    const { rewardsGetSubscriber } = await import('../integrations/saveaday/rewards.js');
    return rewardsGetSubscriber(String(args.id));
  });
  safe('saveaday_rewards_award_points', async (args) => {
    const { rewardsAwardPoints } = await import('../integrations/saveaday/rewards.js');
    const data: any = { subscriberId: String(args.subscriber_id), points: Number(args.points) };
    if (args.reason) data.reason = String(args.reason);
    return rewardsAwardPoints(data);
  });
  safe('saveaday_rewards_subscriber_history', async (args) => {
    const { rewardsGetSubscriberHistory } = await import('../integrations/saveaday/rewards.js');
    return rewardsGetSubscriberHistory(String(args.subscriber_id));
  });
  safe('saveaday_rewards_verify_subscriber', async (args) => {
    const { rewardsVerifySubscriber } = await import('../integrations/saveaday/rewards.js');
    return rewardsVerifySubscriber(String(args.subscriber_id));
  });

  // ── Surveys ───────────────────────────────────────────
  safe('saveaday_surveys_list', async (args) => {
    const { surveysList } = await import('../integrations/saveaday/surveys.js');
    return surveysList({ search: args.search as string | undefined, limit: args.limit ? Number(args.limit) : undefined });
  });
  safe('saveaday_surveys_get', async (args) => {
    const { surveysGet } = await import('../integrations/saveaday/surveys.js');
    return surveysGet(String(args.id));
  });
  safe('saveaday_surveys_create', async (args) => {
    const { surveysCreate } = await import('../integrations/saveaday/surveys.js');
    const data: any = { name: String(args.name) };
    if (args.description) data.description = String(args.description);
    return surveysCreate(data);
  });
  safe('saveaday_surveys_stats', async () => {
    const { surveysGetStats } = await import('../integrations/saveaday/surveys.js');
    return surveysGetStats();
  });

  // ── Tasks (Boards + Tasks) ────────────────────────────
  safe('saveaday_tasks_boards_list', async (args) => {
    const { boardsList } = await import('../integrations/saveaday/boards.js');
    return boardsList({ search: args.search as string | undefined, limit: args.limit ? Number(args.limit) : undefined });
  });
  safe('saveaday_tasks_board_get', async (args) => {
    const { boardsGet } = await import('../integrations/saveaday/boards.js');
    return boardsGet(String(args.id));
  });
  safe('saveaday_tasks_list', async (args) => {
    const { boardsListTasks } = await import('../integrations/saveaday/boards.js');
    return boardsListTasks(String(args.board_id), { search: args.search as string | undefined, limit: args.limit ? Number(args.limit) : undefined });
  });
  safe('saveaday_tasks_create', async (args) => {
    const { boardsCreateTask } = await import('../integrations/saveaday/boards.js');
    const data: any = { title: String(args.title) };
    if (args.description) data.description = String(args.description);
    if (args.status) data.status = String(args.status);
    if (args.assignee) data.assignee = String(args.assignee);
    if (args.priority) data.priority = String(args.priority);
    return boardsCreateTask(String(args.board_id), data);
  });
  safe('saveaday_tasks_update', async (args) => {
    const { boardsUpdateTask } = await import('../integrations/saveaday/boards.js');
    const data: any = {};
    if (args.title) data.title = String(args.title);
    if (args.description) data.description = String(args.description);
    if (args.status) data.status = String(args.status);
    if (args.assignee) data.assignee = String(args.assignee);
    if (args.priority) data.priority = String(args.priority);
    return boardsUpdateTask(String(args.board_id), String(args.task_id), data);
  });
  safe('saveaday_tasks_stats', async () => {
    const { boardsGetStats } = await import('../integrations/saveaday/boards.js');
    return boardsGetStats();
  });

  // ── Waitlists ─────────────────────────────────────────
  safe('saveaday_waitlists_list', async (args) => {
    const { waitlistsList } = await import('../integrations/saveaday/waitlists.js');
    return waitlistsList({ search: args.search as string | undefined, limit: args.limit ? Number(args.limit) : undefined });
  });
  safe('saveaday_waitlists_get', async (args) => {
    const { waitlistsGet } = await import('../integrations/saveaday/waitlists.js');
    return waitlistsGet(String(args.id));
  });
  safe('saveaday_waitlists_submissions', async (args) => {
    const { waitlistsListSubmissions } = await import('../integrations/saveaday/waitlists.js');
    return waitlistsListSubmissions(String(args.waitlist_id), { search: args.search as string | undefined, limit: args.limit ? Number(args.limit) : undefined });
  });
  safe('saveaday_waitlists_stats', async () => {
    const { waitlistsGetStats } = await import('../integrations/saveaday/waitlists.js');
    return waitlistsGetStats();
  });
}

// ── Module Export ────────────────────────────────────────

const saveadayToolModule: ToolModule = {
  name: 'saveaday',
  tools: SAVEADAY_TOOLS,
  register(registry: ToolRegistry, _ctx: ToolContext) {
    registerExecutors(registry);
  },
};

export default saveadayToolModule;
