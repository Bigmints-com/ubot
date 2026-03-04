/**
 * Apple Services Tool Module
 *
 * macOS-only module providing Apple Calendar, Contacts, Notes, and Mail tools
 * via AppleScript (`osascript`). Requires macOS and Full Disk Access for
 * Contacts and Mail.
 */

import { execFile } from 'child_process';
import { platform } from 'os';
import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from '../../tools/types.js';
import { toolResult, safeExecutor } from '../../tools/types.js';

// ── AppleScript Helper ──────────────────────────────────

const IS_MACOS = platform() === 'darwin';
const APPLESCRIPT_TIMEOUT = 15_000; // 15 seconds

function runAppleScript(script: string): Promise<string> {
  if (!IS_MACOS) {
    return Promise.reject(new Error('Apple tools are only available on macOS'));
  }
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], { timeout: APPLESCRIPT_TIMEOUT }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.trim() || err.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// ── Tool Definitions ────────────────────────────────────

const APPLE_TOOLS: ToolDefinition[] = [
  // ─── Calendar ─────────────────────────────────────────
  {
    name: 'apple_cal_list_events',
    description: 'List upcoming events from Apple Calendar. Returns event title, date/time, location, and calendar name.',
    parameters: [
      { name: 'days_ahead', type: 'number', description: 'Number of days ahead to look (default 7)', required: false },
      { name: 'calendar_name', type: 'string', description: 'Filter by calendar name (default: all calendars)', required: false },
      { name: 'max_results', type: 'number', description: 'Max events to return (default 20)', required: false },
    ],
  },
  {
    name: 'apple_cal_create_event',
    description: 'Create a new event on Apple Calendar.',
    parameters: [
      { name: 'summary', type: 'string', description: 'Event title/summary', required: true },
      { name: 'start_time', type: 'string', description: 'Start date-time (e.g. "2026-03-10 14:00")', required: true },
      { name: 'end_time', type: 'string', description: 'End date-time (e.g. "2026-03-10 15:00")', required: true },
      { name: 'calendar_name', type: 'string', description: 'Calendar to add to (default: first calendar)', required: false },
      { name: 'location', type: 'string', description: 'Event location', required: false },
      { name: 'notes', type: 'string', description: 'Event notes/description', required: false },
    ],
  },
  {
    name: 'apple_cal_delete_event',
    description: 'Delete an event from Apple Calendar by its title and date.',
    parameters: [
      { name: 'summary', type: 'string', description: 'Event title to match', required: true },
      { name: 'date', type: 'string', description: 'Date of the event (e.g. "2026-03-10")', required: true },
      { name: 'calendar_name', type: 'string', description: 'Calendar name (default: searches all)', required: false },
    ],
  },

  // ─── Contacts ─────────────────────────────────────────
  {
    name: 'apple_contacts_list',
    description: 'List contacts from Apple Contacts app.',
    parameters: [
      { name: 'max_results', type: 'number', description: 'Max contacts to return (default 30)', required: false },
    ],
  },
  {
    name: 'apple_contacts_search',
    description: 'Search Apple Contacts by name, email, or phone number.',
    parameters: [
      { name: 'query', type: 'string', description: 'Search term (name, email, or phone)', required: true },
    ],
  },

  // ─── Notes ────────────────────────────────────────────
  {
    name: 'apple_notes_list',
    description: 'List notes from Apple Notes app.',
    parameters: [
      { name: 'folder', type: 'string', description: 'Folder name to filter (default: all folders)', required: false },
      { name: 'max_results', type: 'number', description: 'Max notes to return (default 20)', required: false },
    ],
  },
  {
    name: 'apple_notes_read',
    description: 'Read the content of a specific note from Apple Notes.',
    parameters: [
      { name: 'note_name', type: 'string', description: 'Name/title of the note to read', required: true },
    ],
  },
  {
    name: 'apple_notes_create',
    description: 'Create a new note in Apple Notes.',
    parameters: [
      { name: 'title', type: 'string', description: 'Note title', required: true },
      { name: 'body', type: 'string', description: 'Note body content', required: true },
      { name: 'folder', type: 'string', description: 'Folder to create in (default: Notes folder)', required: false },
    ],
  },

  // ─── Mail ─────────────────────────────────────────────
  {
    name: 'apple_mail_list',
    description: 'List recent emails from Apple Mail inbox.',
    parameters: [
      { name: 'mailbox', type: 'string', description: 'Mailbox name (default: INBOX)', required: false },
      { name: 'max_results', type: 'number', description: 'Max emails to return (default 20)', required: false },
    ],
  },
  {
    name: 'apple_mail_read',
    description: 'Read the content of an email from Apple Mail by its subject.',
    parameters: [
      { name: 'subject', type: 'string', description: 'Subject or partial subject of the email to read', required: true },
      { name: 'mailbox', type: 'string', description: 'Mailbox to search (default: INBOX)', required: false },
    ],
  },
  {
    name: 'apple_mail_send',
    description: 'Compose and send an email via Apple Mail.',
    parameters: [
      { name: 'to', type: 'string', description: 'Recipient email address', required: true },
      { name: 'subject', type: 'string', description: 'Email subject', required: true },
      { name: 'body', type: 'string', description: 'Email body (plain text)', required: true },
    ],
  },
];

// ── Executor Registration ───────────────────────────────

function registerExecutors(registry: ToolRegistry): void {
  const safe = (name: string, fn: (args: Record<string, unknown>) => Promise<string>) => {
    registry.register(name, safeExecutor(name, fn));
  };

  // ─── Calendar Executors ─────────────────────────────

  safe('apple_cal_list_events', async (args) => {
    const days = Number(args.days_ahead) || 7;
    const calName = args.calendar_name as string | undefined;
    const max = Number(args.max_results) || 20;

    const calFilter = calName
      ? `of calendar "${calName.replace(/"/g, '\\"')}"`
      : '';

    const script = `
      tell application "Calendar"
        set startDate to current date
        set endDate to startDate + (${days} * days)
        set results to {}
        set eventCount to 0
        repeat with cal in calendars
          ${calName ? `if name of cal is "${calName.replace(/"/g, '\\"')}" then` : ''}
          set evts to (every event of cal whose start date ≥ startDate and start date ≤ endDate)
          repeat with evt in evts
            if eventCount < ${max} then
              set evtStart to start date of evt
              set evtEnd to end date of evt
              set evtSummary to summary of evt
              set evtLocation to ""
              try
                set evtLocation to location of evt
              end try
              set end of results to evtSummary & " | " & (evtStart as string) & " → " & (evtEnd as string) & " | " & evtLocation & " | [" & (name of cal) & "]"
              set eventCount to eventCount + 1
            end if
          end repeat
          ${calName ? 'end if' : ''}
        end repeat
        if (count of results) = 0 then
          return "No events found in the next " & ${days} & " days."
        end if
        set AppleScript's text item delimiters to linefeed
        return results as text
      end tell
    `;
    return await runAppleScript(script);
  });

  safe('apple_cal_create_event', async (args) => {
    const summary = (args.summary as string).replace(/"/g, '\\"');
    const startTime = (args.start_time as string).replace(/"/g, '\\"');
    const endTime = (args.end_time as string).replace(/"/g, '\\"');
    const calName = (args.calendar_name as string || '').replace(/"/g, '\\"');
    const location = (args.location as string || '').replace(/"/g, '\\"');
    const notes = (args.notes as string || '').replace(/"/g, '\\"');

    const script = `
      tell application "Calendar"
        set targetCal to first calendar${calName ? ` whose name is "${calName}"` : ''}
        set startDate to date "${startTime}"
        set endDate to date "${endTime}"
        tell targetCal
          set newEvent to make new event with properties {summary:"${summary}", start date:startDate, end date:endDate${location ? `, location:"${location}"` : ''}${notes ? `, description:"${notes}"` : ''}}
        end tell
        return "Created event: ${summary} on " & (startDate as string)
      end tell
    `;
    return await runAppleScript(script);
  });

  safe('apple_cal_delete_event', async (args) => {
    const summary = (args.summary as string).replace(/"/g, '\\"');
    const date = (args.date as string).replace(/"/g, '\\"');
    const calName = (args.calendar_name as string || '').replace(/"/g, '\\"');

    const script = `
      tell application "Calendar"
        set targetDate to date "${date}"
        set endOfDay to targetDate + (1 * days)
        set deleted to false
        repeat with cal in calendars
          ${calName ? `if name of cal is "${calName}" then` : ''}
          set evts to (every event of cal whose summary is "${summary}" and start date ≥ targetDate and start date < endOfDay)
          repeat with evt in evts
            delete evt
            set deleted to true
          end repeat
          ${calName ? 'end if' : ''}
        end repeat
        if deleted then
          return "Deleted event: ${summary}"
        else
          return "No event found matching '${summary}' on ${date}"
        end if
      end tell
    `;
    return await runAppleScript(script);
  });

  // ─── Contacts Executors ─────────────────────────────

  safe('apple_contacts_list', async (args) => {
    const max = Number(args.max_results) || 30;
    const script = `
      tell application "Contacts"
        set results to {}
        set ppl to every person
        set maxCount to ${max}
        if (count of ppl) < maxCount then set maxCount to (count of ppl)
        repeat with i from 1 to maxCount
          set p to item i of ppl
          set pName to name of p
          set pEmail to ""
          set pPhone to ""
          try
            set pEmail to value of first email of p
          end try
          try
            set pPhone to value of first phone of p
          end try
          set end of results to pName & " | " & pEmail & " | " & pPhone
        end repeat
        set AppleScript's text item delimiters to linefeed
        return results as text
      end tell
    `;
    return await runAppleScript(script);
  });

  safe('apple_contacts_search', async (args) => {
    const query = (args.query as string).replace(/"/g, '\\"');
    const script = `
      tell application "Contacts"
        set results to {}
        set matchedPeople to (every person whose name contains "${query}")
        repeat with p in matchedPeople
          set pName to name of p
          set pEmail to ""
          set pPhone to ""
          try
            set pEmail to value of first email of p
          end try
          try
            set pPhone to value of first phone of p
          end try
          set end of results to pName & " | " & pEmail & " | " & pPhone
        end repeat
        if (count of results) = 0 then
          return "No contacts found matching '${query}'"
        end if
        set AppleScript's text item delimiters to linefeed
        return results as text
      end tell
    `;
    return await runAppleScript(script);
  });

  // ─── Notes Executors ────────────────────────────────

  safe('apple_notes_list', async (args) => {
    const folder = (args.folder as string || '').replace(/"/g, '\\"');
    const max = Number(args.max_results) || 20;

    const script = folder
      ? `
        tell application "Notes"
          set results to {}
          set noteCount to 0
          set targetFolder to first folder whose name is "${folder}"
          repeat with n in notes of targetFolder
            if noteCount < ${max} then
              set nName to name of n
              set nDate to modification date of n
              set end of results to nName & " | Modified: " & (nDate as string)
              set noteCount to noteCount + 1
            end if
          end repeat
          set AppleScript's text item delimiters to linefeed
          return results as text
        end tell
      `
      : `
        tell application "Notes"
          set results to {}
          set noteCount to 0
          repeat with n in notes
            if noteCount < ${max} then
              set nName to name of n
              set nDate to modification date of n
              set nFolder to ""
              try
                set nFolder to name of container of n
              end try
              set end of results to nName & " | " & nFolder & " | Modified: " & (nDate as string)
              set noteCount to noteCount + 1
            end if
          end repeat
          set AppleScript's text item delimiters to linefeed
          return results as text
        end tell
      `;
    return await runAppleScript(script);
  });

  safe('apple_notes_read', async (args) => {
    const noteName = (args.note_name as string).replace(/"/g, '\\"');
    const script = `
      tell application "Notes"
        set matchedNotes to (every note whose name is "${noteName}")
        if (count of matchedNotes) = 0 then
          return "No note found with name '${noteName}'"
        end if
        set targetNote to first item of matchedNotes
        set noteBody to plaintext of targetNote
        return "# " & name of targetNote & linefeed & linefeed & noteBody
      end tell
    `;
    return await runAppleScript(script);
  });

  safe('apple_notes_create', async (args) => {
    const title = (args.title as string).replace(/"/g, '\\"');
    const body = (args.body as string).replace(/"/g, '\\"').replace(/\n/g, '<br>');
    const folder = (args.folder as string || '').replace(/"/g, '\\"');

    const targetFolder = folder
      ? `first folder whose name is "${folder}"`
      : 'default account';

    const script = `
      tell application "Notes"
        tell ${targetFolder}
          make new note with properties {name:"${title}", body:"<h1>${title}</h1><br>${body}"}
        end tell
        return "Created note: ${title}"
      end tell
    `;
    return await runAppleScript(script);
  });

  // ─── Mail Executors ─────────────────────────────────

  safe('apple_mail_list', async (args) => {
    const mailbox = (args.mailbox as string || 'INBOX').replace(/"/g, '\\"');
    const max = Number(args.max_results) || 20;

    const script = `
      tell application "Mail"
        set results to {}
        set msgCount to 0
        repeat with acct in accounts
          try
            set mb to mailbox "${mailbox}" of acct
            set msgs to messages of mb
            repeat with msg in msgs
              if msgCount < ${max} then
                set msgSubject to subject of msg
                set msgSender to sender of msg
                set msgDate to date received of msg
                set msgRead to read status of msg
                set readFlag to "●"
                if msgRead then set readFlag to "○"
                set end of results to readFlag & " " & msgSubject & " | From: " & msgSender & " | " & (msgDate as string)
                set msgCount to msgCount + 1
              end if
            end repeat
          end try
        end repeat
        if (count of results) = 0 then
          return "No emails found in " & "${mailbox}"
        end if
        set AppleScript's text item delimiters to linefeed
        return results as text
      end tell
    `;
    return await runAppleScript(script);
  });

  safe('apple_mail_read', async (args) => {
    const subject = (args.subject as string).replace(/"/g, '\\"');
    const mailbox = (args.mailbox as string || 'INBOX').replace(/"/g, '\\"');

    const script = `
      tell application "Mail"
        repeat with acct in accounts
          try
            set mb to mailbox "${mailbox}" of acct
            set msgs to (messages of mb whose subject contains "${subject}")
            if (count of msgs) > 0 then
              set msg to first item of msgs
              set msgSubject to subject of msg
              set msgSender to sender of msg
              set msgDate to date received of msg
              set msgContent to content of msg
              return "Subject: " & msgSubject & linefeed & "From: " & msgSender & linefeed & "Date: " & (msgDate as string) & linefeed & linefeed & msgContent
            end if
          end try
        end repeat
        return "No email found matching subject '${subject}'"
      end tell
    `;
    return await runAppleScript(script);
  });

  safe('apple_mail_send', async (args) => {
    const to = (args.to as string).replace(/"/g, '\\"');
    const subject = (args.subject as string).replace(/"/g, '\\"');
    const body = (args.body as string).replace(/"/g, '\\"');

    const script = `
      tell application "Mail"
        set newMessage to make new outgoing message with properties {subject:"${subject}", content:"${body}", visible:false}
        tell newMessage
          make new to recipient at end of to recipients with properties {address:"${to}"}
        end tell
        send newMessage
        return "Email sent to ${to} with subject '${subject}'"
      end tell
    `;
    return await runAppleScript(script);
  });
}

// ── Module Export ────────────────────────────────────────

const appleToolModule: ToolModule = {
  name: 'apple',
  tools: APPLE_TOOLS,
  register(registry: ToolRegistry, _ctx: ToolContext) {
    if (!IS_MACOS) {
      console.log('[Apple] Skipping — not running on macOS');
      return;
    }
    registerExecutors(registry);
  },
};

export default appleToolModule;
