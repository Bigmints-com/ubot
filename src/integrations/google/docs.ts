/**
 * Google Docs API Service
 * 
 * Read and create Google Documents.
 */

import { google } from 'googleapis';

function getDocs(auth: any) {
  return google.docs({ version: 'v1', auth });
}

/**
 * Extract plain text from a Google Doc's structural elements.
 */
function extractText(content: any[]): string {
  const lines: string[] = [];

  for (const element of content) {
    if (element.paragraph) {
      const paraText = element.paragraph.elements
        ?.map((e: any) => e.textRun?.content || '')
        .join('') || '';
      lines.push(paraText);
    } else if (element.table) {
      // Extract table cells
      for (const row of element.table.tableRows || []) {
        const cells = (row.tableCells || []).map((cell: any) => {
          const cellContent = cell.content || [];
          return extractText(cellContent).trim();
        });
        lines.push(`| ${cells.join(' | ')} |`);
      }
      lines.push('');
    } else if (element.sectionBreak) {
      lines.push('---');
    }
  }

  return lines.join('');
}

/**
 * Read a Google Doc's text content.
 */
export async function docsRead(
  auth: any,
  documentId: string,
): Promise<string> {
  const docs = getDocs(auth);

  const res = await docs.documents.get({ documentId });
  const title = res.data.title || documentId;
  const content = res.data.body?.content || [];

  const text = extractText(content);
  const truncated = text.length > 5000 ? text.slice(0, 5000) + '\n\n... (truncated)' : text;

  return `**${title}**\n\nDocument ID: \`${documentId}\`\n\n${truncated}`;
}

/**
 * Create a new Google Doc with content.
 */
export async function docsCreate(
  auth: any,
  options: { title: string; content?: string },
): Promise<string> {
  const docs = getDocs(auth);

  // Create the document
  const res = await docs.documents.create({
    requestBody: { title: options.title },
  });

  const docId = res.data.documentId!;

  // If content is provided, insert it
  if (options.content) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: options.content,
            },
          },
        ],
      },
    });
  }

  return `Document "${options.title}" created.\nID: ${docId}\nURL: https://docs.google.com/document/d/${docId}/edit`;
}
