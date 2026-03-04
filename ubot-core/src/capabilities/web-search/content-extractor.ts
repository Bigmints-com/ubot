/**
 * Content Extractor
 * Fetches a URL via HTTP and extracts readable text content.
 * No browser dependency — uses plain fetch + HTML parsing.
 */

export interface ExtractedContent {
  title: string;
  text: string;
  wordCount: number;
  url: string;
}

const MAX_TEXT_LENGTH = 5000;
const DEFAULT_TIMEOUT = 15000;

/**
 * Fetch a URL and extract the main readable content.
 */
export async function extractContent(
  url: string,
  timeout = DEFAULT_TIMEOUT
): Promise<ExtractedContent> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; UBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '';

    // Strip scripts, styles, nav, header, footer
    let cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

    // Strip all remaining HTML tags
    cleaned = cleaned.replace(/<[^>]+>/g, ' ');

    // Decode common HTML entities
    cleaned = cleaned
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');

    // Collapse whitespace
    const text = cleaned.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    return { title, text, wordCount, url };
  } finally {
    clearTimeout(timer);
  }
}
