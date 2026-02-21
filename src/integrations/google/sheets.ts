/**
 * Google Sheets API Service
 * 
 * Read, write, and create spreadsheets.
 */

import { google } from 'googleapis';

function getSheets(auth: any) {
  return google.sheets({ version: 'v4', auth });
}

/**
 * Read a range of cells from a spreadsheet.
 */
export async function sheetsRead(
  auth: any,
  options: { spreadsheetId: string; range: string },
): Promise<string> {
  const sheets = getSheets(auth);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: options.spreadsheetId,
    range: options.range,
  });

  const rows = res.data.values || [];
  if (rows.length === 0) {
    return `No data found in range "${options.range}".`;
  }

  // Format as a readable table
  const header = rows[0];
  const maxWidths = header.map((_: any, i: number) =>
    Math.max(...rows.map(row => String(row[i] || '').length))
  );

  const formatRow = (row: any[]) =>
    row.map((cell, i) => String(cell || '').padEnd(maxWidths[i] || 0)).join(' | ');

  const lines = [
    formatRow(header),
    maxWidths.map((w: number) => '-'.repeat(w)).join('-|-'),
    ...rows.slice(1).map(formatRow),
  ];

  return `**${options.range}** (${rows.length} rows × ${header.length} columns):\n\n\`\`\`\n${lines.join('\n')}\n\`\`\``;
}

/**
 * Write data to a range of cells.
 */
export async function sheetsWrite(
  auth: any,
  options: { spreadsheetId: string; range: string; values: string[][] },
): Promise<string> {
  const sheets = getSheets(auth);

  const res = await sheets.spreadsheets.values.update({
    spreadsheetId: options.spreadsheetId,
    range: options.range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: options.values },
  });

  return `Updated ${res.data.updatedCells} cells in range "${options.range}".`;
}

/**
 * Create a new spreadsheet.
 */
export async function sheetsCreate(
  auth: any,
  options: { title: string; sheetNames?: string[] },
): Promise<string> {
  const sheets = getSheets(auth);

  const sheetProps = (options.sheetNames || ['Sheet1']).map(name => ({
    properties: { title: name },
  }));

  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: options.title },
      sheets: sheetProps,
    },
  });

  const id = res.data.spreadsheetId;
  const url = res.data.spreadsheetUrl;
  return `Spreadsheet "${options.title}" created.\nID: ${id}\nURL: ${url}`;
}

/**
 * List sheet tabs in a spreadsheet.
 */
export async function sheetsList(
  auth: any,
  spreadsheetId: string,
): Promise<string> {
  const sheets = getSheets(auth);

  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'properties.title,sheets.properties',
  });

  const title = res.data.properties?.title || spreadsheetId;
  const sheetTabs = res.data.sheets || [];

  if (sheetTabs.length === 0) {
    return `Spreadsheet "${title}" has no sheets.`;
  }

  const tabList = sheetTabs.map((s, i) => {
    const props = s.properties;
    return `${i + 1}. **${props?.title}** (${props?.gridProperties?.rowCount} rows × ${props?.gridProperties?.columnCount} columns)`;
  }).join('\n');

  return `**${title}** — ${sheetTabs.length} sheet(s):\n\n${tabList}`;
}
