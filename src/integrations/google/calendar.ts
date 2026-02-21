/**
 * Google Calendar API Service
 * 
 * List, create, update, and delete calendar events.
 */

import { google } from 'googleapis';

function getCalendar(auth: any) {
  return google.calendar({ version: 'v3', auth });
}

/** Format an event for display */
function formatEvent(event: any): string {
  const title = event.summary || '(untitled)';
  const start = event.start?.dateTime || event.start?.date || '';
  const end = event.end?.dateTime || event.end?.date || '';
  const location = event.location || '';
  const description = event.description || '';
  const status = event.status || '';

  const startStr = start ? new Date(start).toLocaleString() : '';
  const endStr = end ? new Date(end).toLocaleString() : '';
  const timeStr = startStr && endStr ? `${startStr} — ${endStr}` : startStr || 'All day';

  const parts = [`📅 **${title}**`, `   🕐 ${timeStr}`];
  if (location) parts.push(`   📍 ${location}`);
  if (description) parts.push(`   📝 ${description.slice(0, 100)}`);
  parts.push(`   ID: \`${event.id}\``);
  if (status === 'cancelled') parts.push('   ❌ CANCELLED');

  return parts.join('\n');
}

/**
 * List events for a date range.
 */
export async function calendarListEvents(
  auth: any,
  options?: { date?: string; maxResults?: number; calendarId?: string },
): Promise<string> {
  const calendar = getCalendar(auth);
  const calendarId = options?.calendarId || 'primary';
  const maxResults = options?.maxResults ?? 15;

  // Parse date
  let timeMin: Date;
  let timeMax: Date;
  const dateStr = (options?.date || 'today').toLowerCase();

  if (dateStr === 'today') {
    timeMin = new Date();
    timeMin.setHours(0, 0, 0, 0);
    timeMax = new Date();
    timeMax.setHours(23, 59, 59, 999);
  } else if (dateStr === 'tomorrow') {
    timeMin = new Date();
    timeMin.setDate(timeMin.getDate() + 1);
    timeMin.setHours(0, 0, 0, 0);
    timeMax = new Date(timeMin);
    timeMax.setHours(23, 59, 59, 999);
  } else if (dateStr === 'this week') {
    timeMin = new Date();
    timeMin.setHours(0, 0, 0, 0);
    timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + 7);
    timeMax.setHours(23, 59, 59, 999);
  } else {
    timeMin = new Date(options?.date || '');
    if (isNaN(timeMin.getTime())) {
      timeMin = new Date();
      timeMin.setHours(0, 0, 0, 0);
    }
    timeMax = new Date(timeMin);
    timeMax.setHours(23, 59, 59, 999);
  }

  const res = await calendar.events.list({
    calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = res.data.items || [];
  if (events.length === 0) {
    return `No events found for ${dateStr}.`;
  }

  const formatted = events.map(formatEvent).join('\n\n');
  return `Found ${events.length} event(s) for ${dateStr}:\n\n${formatted}`;
}

/**
 * Create a calendar event.
 */
export async function calendarCreateEvent(
  auth: any,
  options: {
    summary: string;
    startTime: string;
    endTime: string;
    description?: string;
    location?: string;
    calendarId?: string;
    attendees?: string;
  },
): Promise<string> {
  const calendar = getCalendar(auth);
  const calendarId = options.calendarId || 'primary';

  const event: any = {
    summary: options.summary,
    start: { dateTime: new Date(options.startTime).toISOString() },
    end: { dateTime: new Date(options.endTime).toISOString() },
  };

  if (options.description) event.description = options.description;
  if (options.location) event.location = options.location;
  if (options.attendees) {
    event.attendees = options.attendees
      .split(',')
      .map(e => ({ email: e.trim() }));
  }

  const res = await calendar.events.insert({
    calendarId,
    requestBody: event,
  });

  const created = res.data;
  const startStr = created.start?.dateTime
    ? new Date(created.start.dateTime).toLocaleString()
    : '';

  return `Event "${created.summary}" created.\nTime: ${startStr}\nID: ${created.id}\nLink: ${created.htmlLink || 'N/A'}`;
}

/**
 * Update an existing event.
 */
export async function calendarUpdateEvent(
  auth: any,
  options: {
    eventId: string;
    summary?: string;
    startTime?: string;
    endTime?: string;
    description?: string;
    location?: string;
    calendarId?: string;
  },
): Promise<string> {
  const calendar = getCalendar(auth);
  const calendarId = options.calendarId || 'primary';

  // Get existing event
  const existing = await calendar.events.get({
    calendarId,
    eventId: options.eventId,
  });

  const update: any = { ...existing.data };
  if (options.summary) update.summary = options.summary;
  if (options.description) update.description = options.description;
  if (options.location) update.location = options.location;
  if (options.startTime) update.start = { dateTime: new Date(options.startTime).toISOString() };
  if (options.endTime) update.end = { dateTime: new Date(options.endTime).toISOString() };

  const res = await calendar.events.update({
    calendarId,
    eventId: options.eventId,
    requestBody: update,
  });

  return `Event "${res.data.summary}" updated. ID: ${res.data.id}`;
}

/**
 * Delete/cancel an event.
 */
export async function calendarDeleteEvent(
  auth: any,
  options: { eventId: string; calendarId?: string },
): Promise<string> {
  const calendar = getCalendar(auth);
  const calendarId = options.calendarId || 'primary';

  await calendar.events.delete({
    calendarId,
    eventId: options.eventId,
  });

  return `Event ${options.eventId} deleted.`;
}
