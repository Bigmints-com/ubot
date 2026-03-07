/**
 * Web Fetch Tool Module
 *
 * Lightweight HTTP-only URL content extraction.
 * Unlike browse_url (Puppeteer), this uses native fetch() + HTML stripping.
 * Fast, low-overhead, and suitable for static content pages.
 *
 * For JS-heavy SPAs, the agent should use browse_url instead.
 */

import type { ToolModule, ToolRegistry, ToolContext, ToolDefinition } from '../../tools/types.js';

// ─── Response Cache (15-min TTL) ──────────────────────────
const cache = new Map<string, { content: string; timestamp: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

function getCached(url: string): string | null {
  const entry = cache.get(url);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(url);
    return null;
  }
  return entry.content;
}

function setCache(url: string, content: string): void {
  // Limit cache size
  if (cache.size > 200) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(url, { content, timestamp: Date.now() });
}

// ─── HTML to Markdown/Text Extraction ─────────────────────

function htmlToMarkdown(html: string): string {
  let md = html;
  // Remove script/style/nav/footer tags and their content
  md = md.replace(/<(script|style|nav|footer|header|noscript|iframe|svg)[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Remove HTML comments
  md = md.replace(/<!--[\s\S]*?-->/g, '');
  // Convert headings
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n');
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n');
  // Convert links
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  // Convert bold/italic
  md = md.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
  md = md.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*');
  // Convert code
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');
  // Convert lists
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
  // Convert blockquote
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '> $1\n');
  // Convert line breaks / paragraphs
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<\/p>/gi, '\n\n');
  md = md.replace(/<p[^>]*>/gi, '');
  md = md.replace(/<\/div>/gi, '\n');
  md = md.replace(/<div[^>]*>/gi, '');
  // Convert tables (basic)
  md = md.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_, row: string) => {
    const cells = row.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [];
    return '| ' + cells.map((c: string) => c.replace(/<[^>]+>/g, '').trim()).join(' | ') + ' |\n';
  });
  // Convert images
  md = md.replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, '[$1]');
  // Strip all remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');
  // Decode common HTML entities
  md = md.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code)));
  // Clean up whitespace
  md = md.replace(/\n{3,}/g, '\n\n').trim();
  return md;
}

function htmlToText(html: string): string {
  let text = html;
  text = text.replace(/<(script|style|nav|footer|header|noscript|iframe|svg)[^>]*>[\s\S]*?<\/\1>/gi, '');
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

// ─── Extract page title ───────────────────────────────────
function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() : null;
}

// ─── Tool Definition ──────────────────────────────────────

const WEB_FETCH_TOOLS: ToolDefinition[] = [
  {
    name: 'web_fetch',
    description: 'Fetch a URL and extract its content as markdown or plain text. Fast and lightweight (no browser needed). For JavaScript-heavy pages, use browse_url instead.',
    parameters: [
      { name: 'url', type: 'string', description: 'URL to fetch', required: true },
      { name: 'extract_mode', type: 'string', description: '"markdown" (default) or "text"', required: false },
      { name: 'max_chars', type: 'number', description: 'Max characters to return (default 50000)', required: false },
    ],
  },
];

// ─── Module ───────────────────────────────────────────────

const webFetchToolModule: ToolModule = {
  name: 'web-fetch',
  tools: WEB_FETCH_TOOLS,
  register(registry: ToolRegistry, _ctx: ToolContext) {
    registry.register('web_fetch', async (args) => {
      const url = String(args.url || '').trim();
      if (!url) return { toolName: 'web_fetch', success: false, error: 'Missing "url" parameter', duration: 0 };
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return { toolName: 'web_fetch', success: false, error: 'URL must start with http:// or https://', duration: 0 };
      }

      const mode = String(args.extract_mode || 'markdown').toLowerCase();
      const maxChars = Math.min(Number(args.max_chars) || 50000, 100000);
      const start = Date.now();

      // Check cache
      const cacheKey = `${url}::${mode}`;
      const cached = getCached(cacheKey);
      if (cached) {
        const truncated = cached.length > maxChars ? cached.slice(0, maxChars) + '\n\n[... truncated]' : cached;
        return { toolName: 'web_fetch', success: true, result: truncated, duration: Date.now() - start };
      }

      try {
        // Temporarily disable TLS verification for this fetch
        // (handles corporate proxies, self-signed certs, missing local issuer certs)
        const prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

        let response: Response;
        try {
          response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; UbotFetch/1.0)',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(15000),
          });
        } finally {
          // Restore TLS setting
          if (prevTls === undefined) {
            delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
          } else {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls;
          }
        }

        if (!response.ok) {
          return {
            toolName: 'web_fetch',
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
            duration: Date.now() - start,
          };
        }

        const contentType = response.headers.get('content-type') || '';
        const body = await response.text();

        let result: string;
        const title = extractTitle(body);
        const titleLine = title ? `# ${title}\n\n` : '';

        if (contentType.includes('application/json')) {
          result = `${titleLine}URL: ${url}\n\n\`\`\`json\n${body}\n\`\`\``;
        } else if (contentType.includes('text/plain')) {
          result = `${titleLine}URL: ${url}\n\n${body}`;
        } else {
          // HTML
          const extracted = mode === 'text' ? htmlToText(body) : htmlToMarkdown(body);
          result = `${titleLine}URL: ${url}\n\n${extracted}`;
        }

        // Cache the result
        setCache(cacheKey, result);

        // Truncate if needed
        if (result.length > maxChars) {
          result = result.slice(0, maxChars) + '\n\n[... truncated]';
        }

        console.log(`[web_fetch] Fetched ${url} (${result.length} chars, ${Date.now() - start}ms)`);
        return { toolName: 'web_fetch', success: true, result, duration: Date.now() - start };
      } catch (err: any) {
        const msg = err.name === 'TimeoutError' ? `Request timed out after 15s` : err.message;
        return { toolName: 'web_fetch', success: false, error: msg, duration: Date.now() - start };
      }
    });
  },
};

export default webFetchToolModule;
