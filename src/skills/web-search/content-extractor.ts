/**
 * Content Extractor
 * Uses Puppeteer to navigate to a URL and extract readable text content.
 * Opens a new tab to avoid interfering with other browser operations.
 */

import { getBrowserSkill } from '../../browser-skill.js';

export interface ExtractedContent {
  title: string;
  text: string;
  wordCount: number;
  url: string;
}

const MAX_TEXT_LENGTH = 5000;
const DEFAULT_TIMEOUT = 15000;

/**
 * Navigate to a URL and extract the main readable content.
 */
export async function extractContent(
  url: string,
  timeout = DEFAULT_TIMEOUT
): Promise<ExtractedContent> {
  const browser = getBrowserSkill();
  const skill = browser as any;

  // Ensure browser is initialized
  if (!skill.browser) {
    await browser.navigate('about:blank');
  }

  const rawBrowser = skill.browser;
  if (!rawBrowser) throw new Error('Browser not available');

  const page = await rawBrowser.newPage();
  page.setDefaultTimeout(timeout);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    const title = await page.title();

    const text: string = await page.evaluate(() => {
      // Remove noise elements
      const removeSelectors = [
        'script', 'style', 'noscript', 'svg', 'iframe',
        'nav', 'header', 'footer', '[role="navigation"]',
        '[role="banner"]', '[role="contentinfo"]',
        '.ad, .ads, .advertisement, .sidebar, .menu, .nav',
        '#cookie-banner, .cookie-notice, .gdpr',
      ];
      removeSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => el.remove());
      });

      // Try to find the main content container
      const mainEl =
        document.querySelector('article') ||
        document.querySelector('main') ||
        document.querySelector('[role="main"]') ||
        document.querySelector('.post-content, .article-body, .entry-content') ||
        document.body;

      const raw = (mainEl as any).innerText || '';
      // Collapse whitespace
      return raw.replace(/\n{3,}/g, '\n\n').trim();
    });

    const trimmed = text.slice(0, MAX_TEXT_LENGTH);
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

    return { title, text: trimmed, wordCount, url };
  } finally {
    await page.close().catch(() => {});
  }
}
