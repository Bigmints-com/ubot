import pino from 'pino';
import { SearchResult } from '../types/webSearch.js';

const logger = pino();

export async function performSearch(query: string, config?: any): Promise<SearchResult[]> {
    logger.info({ query }, 'Performing web search');

    try {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`DuckDuckGo API returned ${response.status}`);
        }

        const data = await response.json();

        if (!data.RelatedTopics) {
            return [];
        }

        return data.RelatedTopics
            .filter((topic: any) => topic.Text && !topic.Text.startsWith('Did you mean'))
            .slice(0, config?.maxResults || 5)
            .map((topic: any) => ({
                title: topic.Text,
                url: topic.FirstURL,
                snippet: topic.Text
            }));
    } catch (error) {
        logger.error(error, 'Web search failed');
        throw error;
    }
}