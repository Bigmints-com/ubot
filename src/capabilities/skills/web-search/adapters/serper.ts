/**
 * Serper.dev Search Adapter
 *
 * Uses the Serper.dev Google SERP API for reliable, structured web search.
 * Requires SERPER_API_KEY environment variable.
 *
 * API: POST https://google.serper.dev/search
 * Docs: https://serper.dev/docs
 */

export interface SerperSearchOptions {
  /** Max results to return (default 10) */
  count?: number;
  /** Country code (default "us") */
  gl?: string;
  /** Language code (default "en") */
  hl?: string;
}

export interface SerperResult {
  title: string;
  link: string;
  snippet: string;
  position?: number;
  date?: string;
  sitelinks?: Array<{ title: string; link: string }>;
}

export interface SerperResponse {
  searchParameters: {
    q: string;
    gl: string;
    hl: string;
    type: string;
  };
  organic: SerperResult[];
  answerBox?: {
    title?: string;
    answer?: string;
    snippet?: string;
    link?: string;
  };
  knowledgeGraph?: {
    title?: string;
    type?: string;
    description?: string;
    website?: string;
  };
  peopleAlsoAsk?: Array<{ question: string; snippet: string; link: string }>;
}

/**
 * Get the Serper API key from environment.
 */
export function getSerperApiKey(): string | null {
  return process.env.SERPER_API_KEY || null;
}

/**
 * Check if Serper.dev search is available.
 */
export function isSerperAvailable(): boolean {
  return !!getSerperApiKey();
}

/**
 * Search the web using Serper.dev (Google SERP API).
 *
 * @param query - Search query
 * @param options - Search options
 * @returns Formatted search results string
 * @throws If API key is missing or request fails
 */
export async function serperSearch(
  query: string,
  options: SerperSearchOptions = {},
): Promise<{ results: SerperResult[]; answerBox?: SerperResponse['answerBox']; knowledgeGraph?: SerperResponse['knowledgeGraph'] }> {
  const apiKey = getSerperApiKey();
  if (!apiKey) {
    throw new Error('SERPER_API_KEY environment variable not set');
  }

  const { count = 10, gl = 'us', hl = 'en' } = options;

  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: query,
      gl,
      hl,
      num: count,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Serper API error (${response.status}): ${errorText}`);
  }

  const data: SerperResponse = await response.json();

  return {
    results: data.organic || [],
    answerBox: data.answerBox,
    knowledgeGraph: data.knowledgeGraph,
  };
}

/**
 * Format Serper results into a readable string for the LLM.
 */
export function formatSerperResults(
  query: string,
  results: SerperResult[],
  answerBox?: SerperResponse['answerBox'],
  knowledgeGraph?: SerperResponse['knowledgeGraph'],
): string {
  const parts: string[] = [];

  // Answer box (if present)
  if (answerBox?.answer || answerBox?.snippet) {
    parts.push(`**Quick Answer:** ${answerBox.answer || answerBox.snippet}`);
    if (answerBox.link) parts.push(`   Source: ${answerBox.link}`);
    parts.push('');
  }

  // Knowledge graph (if present)
  if (knowledgeGraph?.title) {
    const kgParts = [`**${knowledgeGraph.title}**`];
    if (knowledgeGraph.type) kgParts.push(`(${knowledgeGraph.type})`);
    if (knowledgeGraph.description) kgParts.push(`\n   ${knowledgeGraph.description}`);
    if (knowledgeGraph.website) kgParts.push(`\n   Website: ${knowledgeGraph.website}`);
    parts.push(kgParts.join(' '));
    parts.push('');
  }

  // Organic results
  if (results.length === 0) {
    parts.push(`No results found for "${query}".`);
  } else {
    parts.push(`Search results for "${query}":\n`);
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      parts.push(`${i + 1}. **${r.title}**`);
      parts.push(`   ${r.link}`);
      if (r.snippet) parts.push(`   ${r.snippet}`);
      if (r.date) parts.push(`   📅 ${r.date}`);
      parts.push('');
    }
  }

  return parts.join('\n').trim();
}
