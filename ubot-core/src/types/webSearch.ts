export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}

export interface WebSearchConfig {
    provider: string;
    maxResults?: number;
}