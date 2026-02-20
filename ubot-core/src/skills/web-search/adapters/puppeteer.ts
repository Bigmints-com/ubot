/**
 * Puppeteer Search Adapter
 * Uses the existing BrowserSkill's Puppeteer instance to perform real web searches
 * via Google, with DuckDuckGo as fallback.
 */

import { getBrowserSkill } from '../../../browser-skill.js';
import type { SearchResultItem } from '../types.js';
import { generateResultId, extractDomain, detectResultType } from '../utils.js';

export interface SearchAdapterOptions {
  maxResults?: number;
  timeout?: number;
}

// ── Rate Limiting ──────────────────────────────────
const RATE_LIMIT = {
  minIntervalMs: 5000,       // Minimum 5s between searches
  dailyCap: 100,             // Max 100 searches per day
  humanDelayMinMs: 1000,     // Random delay 1-3s before each search
  humanDelayMaxMs: 3000,
};

let lastSearchTime = 0;
let dailySearchCount = 0;
let dailyResetDate = new Date().toDateString();

/** Enforce rate limits and add human-like delay */
async function enforceRateLimit(): Promise<void> {
  // Reset daily counter at midnight
  const today = new Date().toDateString();
  if (today !== dailyResetDate) {
    dailySearchCount = 0;
    dailyResetDate = today;
  }

  // Check daily cap
  if (dailySearchCount >= RATE_LIMIT.dailyCap) {
    throw new Error(`Daily search limit reached (${RATE_LIMIT.dailyCap}). Try again tomorrow.`);
  }

  // Enforce minimum interval
  const elapsed = Date.now() - lastSearchTime;
  if (elapsed < RATE_LIMIT.minIntervalMs) {
    const waitMs = RATE_LIMIT.minIntervalMs - elapsed;
    console.log(`[WebSearch] Rate limit: waiting ${waitMs}ms before next search`);
    await new Promise(r => setTimeout(r, waitMs));
  }

  // Add random human-like delay
  const humanDelay = RATE_LIMIT.humanDelayMinMs +
    Math.random() * (RATE_LIMIT.humanDelayMaxMs - RATE_LIMIT.humanDelayMinMs);
  await new Promise(r => setTimeout(r, humanDelay));

  lastSearchTime = Date.now();
  dailySearchCount++;
  console.log(`[WebSearch] Search #${dailySearchCount}/${RATE_LIMIT.dailyCap} today`);
}

/**
 * Search Google via Puppeteer and extract results from the DOM.
 * Opens a new tab to avoid interfering with other browser operations.
 * Falls back to DuckDuckGo if Google fails.
 * Rate-limited: 5s min interval, 100/day cap, random human-like delay.
 */
export async function puppeteerSearch(
  query: string,
  options: SearchAdapterOptions = {}
): Promise<SearchResultItem[]> {
  const maxResults = options.maxResults ?? 5;
  const timeout = options.timeout ?? 15000;

  await enforceRateLimit();

  try {
    const results = await searchGoogle(query, maxResults, timeout);
    if (results.length > 0) return results;
  } catch (err) {
    console.warn('[WebSearch] Google search failed, trying DuckDuckGo:', err instanceof Error ? err.message : err);
  }

  // Fallback to DuckDuckGo
  try {
    return await searchDuckDuckGo(query, maxResults, timeout);
  } catch (err) {
    console.error('[WebSearch] DuckDuckGo fallback also failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

/** Open a new tab in the shared browser, run work, then close the tab */
async function withNewTab<T>(work: (page: any) => Promise<T>, timeout: number): Promise<T> {
  const browser = getBrowserSkill();
  // Access the underlying browser via ensureBrowser trick — navigate a dummy then get browser
  // We need the raw Puppeteer browser to open a new page
  const skill = browser as any;

  // Trigger lazy init if needed by calling a lightweight method
  if (!skill.browser) {
    await browser.navigate('about:blank');
  }

  const rawBrowser = skill.browser;
  if (!rawBrowser) throw new Error('Browser not available');

  const page = await rawBrowser.newPage();
  page.setDefaultTimeout(timeout);

  try {
    return await work(page);
  } finally {
    await page.close().catch(() => {});
  }
}

/** Search Google and extract results from the DOM */
async function searchGoogle(
  query: string,
  maxResults: number,
  timeout: number
): Promise<SearchResultItem[]> {
  return withNewTab(async (page) => {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${Math.min(maxResults + 5, 20)}&hl=en`;
    console.log(`[WebSearch] Google: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });

    // Dismiss Google consent banner if present
    try {
      const consentBtn = await page.$('[id="L2AGLb"], button[id="L2AGLb"], [aria-label="Accept all"]');
      if (consentBtn) {
        await consentBtn.click();
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {});
      }
    } catch {
      // No consent banner — fine
    }

    // Wait for search results to render
    await page.waitForSelector('#search', { timeout: 10000 });

    // Extract results from the DOM
    const raw: Array<{ title: string; url: string; snippet: string }> = await page.evaluate(() => {
      const results: Array<{ title: string; url: string; snippet: string }> = [];
      const items = document.querySelectorAll('#search .g');

      items.forEach((item: any) => {
        const linkEl = item.querySelector('a[href]');
        const titleEl = item.querySelector('h3');
        // Snippet can be in various containers
        const snippetEl = item.querySelector('.VwiC3b, [data-sncf], [style*="-webkit-line-clamp"], .IsZvec');

        if (linkEl && titleEl) {
          const href = linkEl.getAttribute('href') || '';
          // Skip Google internal links
          if (href.startsWith('http') && !href.includes('google.com/search')) {
            results.push({
              title: titleEl.textContent?.trim() || '',
              url: href,
              snippet: snippetEl?.textContent?.trim() || '',
            });
          }
        }
      });

      return results;
    });

    return raw.slice(0, maxResults).map((r, i) => ({
      id: generateResultId(),
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      type: detectResultType(r.url),
      domain: extractDomain(r.url),
      relevanceScore: Math.max(0.5, 1 - i * 0.05),
      position: i + 1,
      retrievedAt: new Date(),
    }));
  }, timeout);
}

/** Fallback: search DuckDuckGo HTML version */
async function searchDuckDuckGo(
  query: string,
  maxResults: number,
  timeout: number
): Promise<SearchResultItem[]> {
  return withNewTab(async (page) => {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    console.log(`[WebSearch] DuckDuckGo fallback: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });

    const raw: Array<{ title: string; url: string; snippet: string }> = await page.evaluate(() => {
      const results: Array<{ title: string; url: string; snippet: string }> = [];
      const items = document.querySelectorAll('.result');

      items.forEach((item: any) => {
        const linkEl = item.querySelector('.result__a');
        const snippetEl = item.querySelector('.result__snippet');

        if (linkEl) {
          const href = linkEl.getAttribute('href') || '';
          results.push({
            title: linkEl.textContent?.trim() || '',
            url: href.startsWith('//') ? `https:${href}` : href,
            snippet: snippetEl?.textContent?.trim() || '',
          });
        }
      });

      return results;
    });

    return raw.slice(0, maxResults).map((r, i) => ({
      id: generateResultId(),
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      type: detectResultType(r.url),
      domain: extractDomain(r.url),
      relevanceScore: Math.max(0.5, 1 - i * 0.05),
      position: i + 1,
      retrievedAt: new Date(),
    }));
  }, timeout);
}
