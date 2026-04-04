export interface BlackboardEntry {
  key: string;
  value: any;
  author: string;
  timestamp: Date;
  expiresAt?: Date; // Optional TTL
}

/**
 * Shared Blackboard for Agent Context
 * An in-memory KV store allowing agents to share intermediate findings (e.g. Researcher dumps data here for Writer)
 */
export class Blackboard {
  private static instance: Blackboard;
  private store: Map<string, BlackboardEntry>;

  private constructor() {
    this.store = new Map();
  }

  public static getInstance(): Blackboard {
    if (!Blackboard.instance) {
      Blackboard.instance = new Blackboard();
    }
    return Blackboard.instance;
  }

  /** Write a value to the blackboard */
  public write(key: string, value: any, author: string, ttlSeconds?: number): void {
    const entry: BlackboardEntry = {
      key,
      value,
      author,
      timestamp: new Date()
    };

    if (ttlSeconds && ttlSeconds > 0) {
      entry.expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    }

    this.store.set(key, entry);
    console.log(`[Blackboard] ${author} wrote to '${key}' (TTL: ${ttlSeconds || 'infinite'})`);
  }

  /** Read a value from the blackboard */
  public read(key: string): any | undefined {
    const entry = this.store.get(key);
    
    if (!entry) return undefined;

    // Check expiration
    if (entry.expiresAt && entry.expiresAt.getTime() < Date.now()) {
      this.store.delete(key);
      console.log(`[Blackboard] Entry '${key}' expired. Automatically cleaned up.`);
      return undefined;
    }

    return entry.value;
  }

  /** Read entire blackboard contents (useful for Manager context gathering) */
  public readAll(): Record<string, any> {
    const now = Date.now();
    const result: Record<string, any> = {};

    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt && entry.expiresAt.getTime() < now) {
        this.store.delete(key);
      } else {
        result[key] = entry.value;
      }
    }

    return result;
  }

  /** Delete a specific entry */
  public delete(key: string): boolean {
    return this.store.delete(key);
  }

  /** Clear the entire blackboard (useful at the end of a big workflow session) */
  public clear(): void {
    this.store.clear();
    console.log('[Blackboard] Cleared entirely.');
  }
}

export const blackboard = Blackboard.getInstance();
