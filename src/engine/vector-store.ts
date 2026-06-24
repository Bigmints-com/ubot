import type { DatabaseConnection } from '../data/database/types.js';

export interface AgentMemoryMatch {
  id: string;
  sessionId: string;
  agentId: string;
  content: string;
  metadata: Record<string, any>;
  similarity: number;
}

/**
 * Persists and retrieves agent insights using Supabase pgvector
 */
export class VectorStore {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  /** Insert a new semantic memory */
  async storeMemory(
    sessionId: string,
    agentId: string,
    content: string,
    embedding: number[],
    metadata: Record<string, any> = {}
  ): Promise<string | null> {
    const { data, error } = await this.db.get_client()
      .from('youbot_agent_memories')
      .insert({
        session_id: sessionId,
        agent_id: agentId,
        content,
        embedding,
        metadata
      })
      .select('id')
      .single();

    if (error) {
      console.error(`[VectorStore] Failed to store memory:`, error.message);
      return null;
    }

    return data.id;
  }

  /** Find similar memories using pgvector similarity search */
  async findSimilar(
    queryEmbedding: number[],
    matchThreshold: number = 0.75, // 0.75 is a reasonable default for cosine similarity
    matchCount: number = 5,
    filterSessionId?: string,
    filterAgentId?: string
  ): Promise<AgentMemoryMatch[]> {
    
    const params: any = {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount
    };

    if (filterSessionId) params.filter_session_id = filterSessionId;
    if (filterAgentId) params.filter_agent_id = filterAgentId;

    const { data, error } = await this.db.get_client().rpc('match_agent_memories', params);

    if (error) {
      console.error(`[VectorStore] Similarity search failed:`, error.message);
      return [];
    }

    // Map snake_case to camelCase
    return (data || []).map((row: any) => ({
      id: row.id,
      sessionId: row.session_id,
      agentId: row.agent_id,
      content: row.content,
      metadata: row.metadata,
      similarity: row.similarity
    }));
  }
}
