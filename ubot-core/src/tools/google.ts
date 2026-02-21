/**
 * Google Apps Tool Module
 *
 * Self-contained module providing Gmail, Drive, Sheets, Docs,
 * Contacts, Calendar, and Places tools with their definitions and executors.
 */

import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from '../tools/types.js';

// ── Tool Definitions ────────────────────────────────────

const GOOGLE_TOOLS: ToolDefinition[] = [
  // Gmail
  {
    name: 'gmail_list',
    description: 'List recent emails from Gmail inbox. Returns sender, subject, snippet, date, and message ID for each email. Use gmail_read to read full email content.',
    parameters: [
      { name: 'query', type: 'string', description: 'Gmail search query (e.g. "is:unread", "from:john@example.com", "subject:invoice", "newer_than:1d"). Default: recent inbox.', required: false },
      { name: 'max_results', type: 'number', description: 'Max emails to return (default 15)', required: false },
    ],
  },
  {
    name: 'gmail_read',
    description: 'Read a specific email by its message ID. Returns the full email body, sender, subject, and date. Get the message ID from gmail_list first.',
    parameters: [
      { name: 'message_id', type: 'string', description: 'The Gmail message ID (from gmail_list)', required: true },
    ],
  },
  {
    name: 'gmail_send',
    description: 'Compose and send an email via Gmail.',
    parameters: [
      { name: 'to', type: 'string', description: 'Recipient email address', required: true },
      { name: 'subject', type: 'string', description: 'Email subject line', required: true },
      { name: 'body', type: 'string', description: 'Email body text', required: true },
      { name: 'cc', type: 'string', description: 'CC recipients (comma-separated)', required: false },
      { name: 'bcc', type: 'string', description: 'BCC recipients (comma-separated)', required: false },
    ],
  },
  {
    name: 'gmail_search',
    description: 'Search emails using Gmail query syntax. Same as gmail_list but focused on search.',
    parameters: [
      { name: 'query', type: 'string', description: 'Gmail search query', required: true },
      { name: 'max_results', type: 'number', description: 'Max results (default 15)', required: false },
    ],
  },
  {
    name: 'gmail_trash',
    description: 'Move an email to trash by its message ID.',
    parameters: [
      { name: 'message_id', type: 'string', description: 'The Gmail message ID to trash', required: true },
    ],
  },
  {
    name: 'gmail_reply',
    description: 'Reply to an email thread. Sends a reply to the sender of the specified message.',
    parameters: [
      { name: 'message_id', type: 'string', description: 'The Gmail message ID to reply to', required: true },
      { name: 'body', type: 'string', description: 'Reply body text', required: true },
    ],
  },
  // Google Drive
  {
    name: 'drive_list',
    description: 'List files and folders in Google Drive. Returns file name, type, size, last modified, and file ID.',
    parameters: [
      { name: 'query', type: 'string', description: 'Drive search query (e.g. "name contains \'report\'", "mimeType=\'application/pdf\'"). Default: all files.', required: false },
      { name: 'max_results', type: 'number', description: 'Max files to return (default 20)', required: false },
      { name: 'folder_id', type: 'string', description: 'List files within a specific folder (by folder ID)', required: false },
    ],
  },
  {
    name: 'drive_search',
    description: 'Search files in Google Drive by name or content.',
    parameters: [
      { name: 'query', type: 'string', description: 'Search term (searches file names and content)', required: true },
      { name: 'max_results', type: 'number', description: 'Max results (default 20)', required: false },
    ],
  },
  {
    name: 'drive_download',
    description: 'Download/read the content of a file from Google Drive. For Google Docs/Sheets, exports as text. Use the file ID from drive_list.',
    parameters: [
      { name: 'file_id', type: 'string', description: 'The Drive file ID to download', required: true },
    ],
  },
  {
    name: 'drive_upload',
    description: 'Upload a text file to Google Drive.',
    parameters: [
      { name: 'name', type: 'string', description: 'File name (e.g. "notes.txt", "report.csv")', required: true },
      { name: 'content', type: 'string', description: 'File content (text)', required: true },
      { name: 'folder_id', type: 'string', description: 'Upload into a specific folder (by folder ID)', required: false },
    ],
  },
  {
    name: 'drive_share',
    description: 'Share a Google Drive file with someone.',
    parameters: [
      { name: 'file_id', type: 'string', description: 'The Drive file ID to share', required: true },
      { name: 'email', type: 'string', description: 'Email address to share with', required: true },
      { name: 'role', type: 'string', description: 'Permission role: "reader", "writer", or "commenter". Default: "reader"', required: false },
    ],
  },
  {
    name: 'drive_create_folder',
    description: 'Create a new folder in Google Drive.',
    parameters: [
      { name: 'name', type: 'string', description: 'Folder name', required: true },
      { name: 'parent_id', type: 'string', description: 'Parent folder ID (omit for root)', required: false },
    ],
  },
  // Google Sheets
  {
    name: 'sheets_read',
    description: 'Read a range of cells from a Google Sheets spreadsheet.',
    parameters: [
      { name: 'spreadsheet_id', type: 'string', description: 'The spreadsheet ID (from the URL or drive_list)', required: true },
      { name: 'range', type: 'string', description: 'Cell range in A1 notation (e.g. "Sheet1!A1:D10", "A1:Z100")', required: true },
    ],
  },
  {
    name: 'sheets_write',
    description: 'Write data to cells in a Google Sheets spreadsheet. Values are provided as a JSON array of arrays.',
    parameters: [
      { name: 'spreadsheet_id', type: 'string', description: 'The spreadsheet ID', required: true },
      { name: 'range', type: 'string', description: 'Cell range in A1 notation (e.g. "Sheet1!A1")', required: true },
      { name: 'values', type: 'string', description: 'JSON array of arrays, e.g. [["Name","Age"],["Alice","30"]]', required: true },
    ],
  },
  {
    name: 'sheets_create',
    description: 'Create a new Google Sheets spreadsheet.',
    parameters: [
      { name: 'title', type: 'string', description: 'Spreadsheet title', required: true },
      { name: 'sheet_names', type: 'string', description: 'Comma-separated sheet tab names. Default: "Sheet1"', required: false },
    ],
  },
  {
    name: 'sheets_list_tabs',
    description: 'List all sheet tabs in a Google Sheets spreadsheet.',
    parameters: [
      { name: 'spreadsheet_id', type: 'string', description: 'The spreadsheet ID', required: true },
    ],
  },
  // Google Docs
  {
    name: 'docs_read',
    description: 'Read the text content of a Google Doc.',
    parameters: [
      { name: 'document_id', type: 'string', description: 'The Google Doc document ID (from the URL or drive_list)', required: true },
    ],
  },
  {
    name: 'docs_create',
    description: 'Create a new Google Doc with optional content.',
    parameters: [
      { name: 'title', type: 'string', description: 'Document title', required: true },
      { name: 'content', type: 'string', description: 'Initial text content for the document', required: false },
    ],
  },
  // Google Contacts
  {
    name: 'google_contacts_list',
    description: 'List contacts from Google Contacts.',
    parameters: [
      { name: 'max_results', type: 'number', description: 'Max contacts to return (default 30)', required: false },
    ],
  },
  {
    name: 'google_contacts_search',
    description: 'Search contacts by name, email, or phone number.',
    parameters: [
      { name: 'query', type: 'string', description: 'Search term (name, email, or phone)', required: true },
      { name: 'max_results', type: 'number', description: 'Max results (default 20)', required: false },
    ],
  },
  {
    name: 'google_contacts_create',
    description: 'Create a new contact in Google Contacts.',
    parameters: [
      { name: 'name', type: 'string', description: 'Contact name', required: true },
      { name: 'email', type: 'string', description: 'Email address', required: false },
      { name: 'phone', type: 'string', description: 'Phone number', required: false },
      { name: 'organization', type: 'string', description: 'Company/organization name', required: false },
    ],
  },
  // Google Calendar
  {
    name: 'gcal_list_events',
    description: 'List events from Google Calendar for a specific day or date range.',
    parameters: [
      { name: 'date', type: 'string', description: 'Date to check: "today", "tomorrow", "this week", or a specific date (e.g. "2026-02-20"). Default: today.', required: false },
      { name: 'max_results', type: 'number', description: 'Max events to return (default 15)', required: false },
    ],
  },
  {
    name: 'gcal_create_event',
    description: 'Create a new event on Google Calendar.',
    parameters: [
      { name: 'summary', type: 'string', description: 'Event title/summary', required: true },
      { name: 'start_time', type: 'string', description: 'Start time (ISO format or natural language like "2026-02-20T14:00:00")', required: true },
      { name: 'end_time', type: 'string', description: 'End time (ISO format)', required: true },
      { name: 'description', type: 'string', description: 'Event description', required: false },
      { name: 'location', type: 'string', description: 'Event location', required: false },
      { name: 'attendees', type: 'string', description: 'Comma-separated email addresses of attendees', required: false },
    ],
  },
  {
    name: 'gcal_update_event',
    description: 'Update an existing Google Calendar event.',
    parameters: [
      { name: 'event_id', type: 'string', description: 'The event ID (from gcal_list_events)', required: true },
      { name: 'summary', type: 'string', description: 'New event title', required: false },
      { name: 'start_time', type: 'string', description: 'New start time', required: false },
      { name: 'end_time', type: 'string', description: 'New end time', required: false },
      { name: 'description', type: 'string', description: 'New description', required: false },
      { name: 'location', type: 'string', description: 'New location', required: false },
    ],
  },
  {
    name: 'gcal_delete_event',
    description: 'Delete/cancel a Google Calendar event.',
    parameters: [
      { name: 'event_id', type: 'string', description: 'The event ID to delete', required: true },
    ],
  },
  // Google Places
  {
    name: 'google_places_search',
    description: 'Search for businesses, restaurants, shops, and other places using Google Places.',
    parameters: [
      { name: 'query', type: 'string', description: 'Search query (e.g. "restaurants near Dubai Marina", "pharmacies in Abu Dhabi")', required: true },
      { name: 'max_results', type: 'number', description: 'Max results (default 10)', required: false },
    ],
  },
  {
    name: 'google_places_details',
    description: 'Get detailed information about a specific place including reviews, hours, phone, website.',
    parameters: [
      { name: 'place_id', type: 'string', description: 'The Google Place ID (from google_places_search)', required: true },
    ],
  },
  {
    name: 'google_places_nearby',
    description: 'Find places near a specific location (latitude/longitude).',
    parameters: [
      { name: 'latitude', type: 'number', description: 'Latitude of the center point', required: true },
      { name: 'longitude', type: 'number', description: 'Longitude of the center point', required: true },
      { name: 'radius', type: 'number', description: 'Search radius in meters (default 1000)', required: false },
      { name: 'type', type: 'string', description: 'Place type filter (e.g. "restaurant", "hospital", "gas_station")', required: false },
      { name: 'max_results', type: 'number', description: 'Max results (default 10)', required: false },
    ],
  },
  // Google Auth Management
  {
    name: 'google_auth_status',
    description: 'Check the status of Google Apps authentication (Gmail, Drive, Calendar, etc.).',
    parameters: [],
  },
];

// ── Executor Registration ───────────────────────────────

function registerExecutors(registry: ToolRegistry): void {
  /**
   * Shared wrapper: checks service enablement + auth before executing.
   */
  const wrap = (toolName: string, fn: () => Promise<string>) => {
    return async () => {
      const { getGoogleAuthClient, getServiceForTool, getGoogleServicesConfig } = await import('../integrations/google/auth.js');

      // Check if the service is enabled
      const serviceKey = getServiceForTool(toolName);
      if (serviceKey) {
        const config = getGoogleServicesConfig();
        if (!config[serviceKey]) {
          return `The ${serviceKey} service is disabled. The owner can enable it in Google Apps settings.`;
        }
      }

      const auth = await getGoogleAuthClient();
      if (!auth) {
        throw new Error('Google not authenticated. The owner needs to authorize Google access first via Google Apps in the dashboard.');
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
        console.error(`[Google] ${toolName} error:`, err.message);
        return { toolName, success: false, error: err.message, duration: 0 };
      }
    });
  };

  const getAuth = async () => {
    const { getGoogleAuthClient } = await import('../integrations/google/auth.js');
    return (await getGoogleAuthClient())!;
  };

  // Gmail
  safe('gmail_list', async (args) => {
    const { gmailList } = await import('../integrations/google/gmail.js');
    return gmailList(await getAuth(), { query: args.query as string | undefined, maxResults: args.max_results ? Number(args.max_results) : undefined });
  });
  safe('gmail_read', async (args) => {
    const { gmailRead } = await import('../integrations/google/gmail.js');
    return gmailRead(await getAuth(), String(args.message_id));
  });
  safe('gmail_send', async (args) => {
    const { gmailSend } = await import('../integrations/google/gmail.js');
    return gmailSend(await getAuth(), { to: String(args.to), subject: String(args.subject), body: String(args.body), cc: args.cc as string | undefined, bcc: args.bcc as string | undefined });
  });
  safe('gmail_search', async (args) => {
    const { gmailSearch } = await import('../integrations/google/gmail.js');
    return gmailSearch(await getAuth(), String(args.query), args.max_results ? Number(args.max_results) : undefined);
  });
  safe('gmail_trash', async (args) => {
    const { gmailTrash } = await import('../integrations/google/gmail.js');
    return gmailTrash(await getAuth(), String(args.message_id));
  });
  safe('gmail_reply', async (args) => {
    const { gmailReply } = await import('../integrations/google/gmail.js');
    return gmailReply(await getAuth(), { messageId: String(args.message_id), body: String(args.body) });
  });

  // Drive
  safe('drive_list', async (args) => {
    const { driveList } = await import('../integrations/google/drive.js');
    return driveList(await getAuth(), { query: args.query as string | undefined, maxResults: args.max_results ? Number(args.max_results) : undefined, folderId: args.folder_id as string | undefined });
  });
  safe('drive_search', async (args) => {
    const { driveSearch } = await import('../integrations/google/drive.js');
    return driveSearch(await getAuth(), String(args.query), args.max_results ? Number(args.max_results) : undefined);
  });
  safe('drive_download', async (args) => {
    const { driveDownload } = await import('../integrations/google/drive.js');
    return driveDownload(await getAuth(), String(args.file_id));
  });
  safe('drive_upload', async (args) => {
    const { driveUpload } = await import('../integrations/google/drive.js');
    return driveUpload(await getAuth(), { name: String(args.name), content: String(args.content), folderId: args.folder_id as string | undefined });
  });
  safe('drive_share', async (args) => {
    const { driveShare } = await import('../integrations/google/drive.js');
    return driveShare(await getAuth(), { fileId: String(args.file_id), email: String(args.email), role: args.role as string | undefined });
  });
  safe('drive_create_folder', async (args) => {
    const { driveCreateFolder } = await import('../integrations/google/drive.js');
    return driveCreateFolder(await getAuth(), { name: String(args.name), parentId: args.parent_id as string | undefined });
  });

  // Sheets
  safe('sheets_read', async (args) => {
    const { sheetsRead } = await import('../integrations/google/sheets.js');
    return sheetsRead(await getAuth(), { spreadsheetId: String(args.spreadsheet_id), range: String(args.range) });
  });
  safe('sheets_write', async (args) => {
    const { sheetsWrite } = await import('../integrations/google/sheets.js');
    let values: string[][];
    try { values = JSON.parse(String(args.values)); } catch { throw new Error('Invalid values format. Must be a JSON array of arrays.'); }
    return sheetsWrite(await getAuth(), { spreadsheetId: String(args.spreadsheet_id), range: String(args.range), values });
  });
  safe('sheets_create', async (args) => {
    const { sheetsCreate } = await import('../integrations/google/sheets.js');
    const sheetNames = args.sheet_names ? String(args.sheet_names).split(',').map(s => s.trim()) : undefined;
    return sheetsCreate(await getAuth(), { title: String(args.title), sheetNames });
  });
  safe('sheets_list_tabs', async (args) => {
    const { sheetsList } = await import('../integrations/google/sheets.js');
    return sheetsList(await getAuth(), String(args.spreadsheet_id));
  });

  // Docs
  safe('docs_read', async (args) => {
    const { docsRead } = await import('../integrations/google/docs.js');
    return docsRead(await getAuth(), String(args.document_id));
  });
  safe('docs_create', async (args) => {
    const { docsCreate } = await import('../integrations/google/docs.js');
    return docsCreate(await getAuth(), { title: String(args.title), content: args.content as string | undefined });
  });

  // Contacts
  safe('google_contacts_list', async (args) => {
    const { contactsList } = await import('../integrations/google/contacts.js');
    return contactsList(await getAuth(), { maxResults: args.max_results ? Number(args.max_results) : undefined });
  });
  safe('google_contacts_search', async (args) => {
    const { contactsSearch } = await import('../integrations/google/contacts.js');
    return contactsSearch(await getAuth(), String(args.query), args.max_results ? Number(args.max_results) : undefined);
  });
  safe('google_contacts_create', async (args) => {
    const { contactsCreate } = await import('../integrations/google/contacts.js');
    return contactsCreate(await getAuth(), { name: String(args.name), email: args.email as string | undefined, phone: args.phone as string | undefined, organization: args.organization as string | undefined });
  });

  // Calendar
  safe('gcal_list_events', async (args) => {
    const { calendarListEvents } = await import('../integrations/google/calendar.js');
    return calendarListEvents(await getAuth(), { date: args.date as string | undefined, maxResults: args.max_results ? Number(args.max_results) : undefined });
  });
  safe('gcal_create_event', async (args) => {
    const { calendarCreateEvent } = await import('../integrations/google/calendar.js');
    return calendarCreateEvent(await getAuth(), { summary: String(args.summary), startTime: String(args.start_time), endTime: String(args.end_time), description: args.description as string | undefined, location: args.location as string | undefined, attendees: args.attendees as string | undefined });
  });
  safe('gcal_update_event', async (args) => {
    const { calendarUpdateEvent } = await import('../integrations/google/calendar.js');
    return calendarUpdateEvent(await getAuth(), { eventId: String(args.event_id), summary: args.summary as string | undefined, startTime: args.start_time as string | undefined, endTime: args.end_time as string | undefined, description: args.description as string | undefined, location: args.location as string | undefined });
  });
  safe('gcal_delete_event', async (args) => {
    const { calendarDeleteEvent } = await import('../integrations/google/calendar.js');
    return calendarDeleteEvent(await getAuth(), { eventId: String(args.event_id) });
  });

  // Places
  safe('google_places_search', async (args) => {
    const { placesSearch } = await import('../integrations/google/places.js');
    return placesSearch(await getAuth(), String(args.query), args.max_results ? Number(args.max_results) : undefined);
  });
  safe('google_places_details', async (args) => {
    const { placesDetails } = await import('../integrations/google/places.js');
    return placesDetails(await getAuth(), String(args.place_id));
  });
  safe('google_places_nearby', async (args) => {
    const { placesNearby } = await import('../integrations/google/places.js');
    return placesNearby(await getAuth(), { latitude: Number(args.latitude), longitude: Number(args.longitude), radius: args.radius ? Number(args.radius) : undefined, type: args.type as string | undefined, maxResults: args.max_results ? Number(args.max_results) : undefined });
  });

  // Auth status (no auth check needed for this one)
  registry.register('google_auth_status', async () => {
    try {
      const { getGoogleAuthStatus } = await import('../integrations/google/auth.js');
      const status = getGoogleAuthStatus();
      const lines = [
        `Google Apps Authentication Status:`,
        `  Credentials file: ${status.hasCredentials ? '✅ Found' : '❌ Not found'} (${status.credentialsPath})`,
        `  Token: ${status.hasToken ? '✅ Saved' : '❌ Not found'} (${status.tokenPath})`,
        `  Authenticated: ${status.isAuthenticated ? '✅ Yes' : '❌ No'}`,
      ];
      if (!status.hasCredentials) {
        lines.push('', '⚠️ To set up Google Apps, download OAuth2 Desktop credentials from Google Cloud Console and save as creds/google-oauth-credentials.json');
      }
      return { toolName: 'google_auth_status', success: true, result: lines.join('\n'), duration: 0 };
    } catch (err: any) {
      return { toolName: 'google_auth_status', success: false, error: err.message, duration: 0 };
    }
  });
}

// ── Module Export ────────────────────────────────────────

const googleToolModule: ToolModule = {
  name: 'google',
  tools: GOOGLE_TOOLS,
  register(registry: ToolRegistry, _ctx: ToolContext) {
    registerExecutors(registry);
  },
};

export default googleToolModule;
