/**
 * Soul Module
 * Ubot's identity, personality, and evolving knowledge about its owner and contacts.
 * 
 * Three soul layers:
 * 1. Bot Soul   — Ubot's own persona (tone, style, personality traits)
 * 2. Owner Soul — Deep profile of the owner (you) — preferences, habits, context
 * 3. Contact Souls — Profiles for each person the owner interacts with
 */

import type { MemoryStore, MemoryCategory } from './memory-store.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Special contact IDs for bot and owner souls */
export const BOT_SOUL_ID = '__bot__';
export const OWNER_SOUL_ID = '__owner__';

/** Soul-specific memory categories */
export type SoulCategory = MemoryCategory | 'personality' | 'style' | 'context';

/* ------------------------------------------------------------------ */
/*  Soul interface                                                     */
/* ------------------------------------------------------------------ */

export interface Soul {
  /** Save or update a piece of soul data */
  learn(soulId: string, category: MemoryCategory, key: string, value: string): void;

  /** Get all soul data for a contact/entity */
  recall(soulId: string): Record<string, string>;

  /** Build a comprehensive system prompt section from all soul data */
  buildSoulPrompt(contactId?: string): string;

  /** Get the raw memory store for direct access */
  getStore(): MemoryStore;
}

/* ------------------------------------------------------------------ */
/*  Default bot persona (seed values)                                  */
/* ------------------------------------------------------------------ */

const DEFAULT_BOT_SOUL: Record<string, Record<string, string>> = {
  identity: {
    name: 'Ubot',
    role: 'Personal AI assistant',
    purpose: 'Help the owner manage their communications and automate tasks',
  },
  personality: {
    tone: 'Warm, conversational, and helpful',
    style: 'Concise but friendly. Uses emoji occasionally. Adapts to the conversation.',
    boundaries: 'Always acts on behalf of the owner. Never reveals it is an AI unless asked directly.',
  },
};

/* ------------------------------------------------------------------ */
/*  Implementation                                                     */
/* ------------------------------------------------------------------ */

export function createSoul(memoryStore: MemoryStore): Soul {
  // Seed bot persona if not already present
  const existingBot = memoryStore.getMemories(BOT_SOUL_ID);
  if (existingBot.length === 0) {
    for (const [category, entries] of Object.entries(DEFAULT_BOT_SOUL)) {
      for (const [key, value] of Object.entries(entries)) {
        memoryStore.saveMemory(BOT_SOUL_ID, category as MemoryCategory, key, value, 'seed', 1.0);
      }
    }
    console.log('[Soul] 🧠 Seeded default bot persona');
  }

  return {
    learn(soulId: string, category: MemoryCategory, key: string, value: string): void {
      memoryStore.saveMemory(soulId, category, key, value, 'extracted', 0.8);
    },

    recall(soulId: string): Record<string, string> {
      const memories = memoryStore.getMemories(soulId);
      const result: Record<string, string> = {};
      for (const m of memories) {
        result[`${m.category}.${m.key}`] = m.value;
      }
      return result;
    },

    buildSoulPrompt(contactId?: string): string {
      const sections: string[] = [];

      // 1. Bot persona
      const botMemories = memoryStore.getMemories(BOT_SOUL_ID);
      if (botMemories.length > 0) {
        sections.push('## Your Identity');
        const grouped = groupByCategory(botMemories);
        for (const [cat, items] of grouped) {
          for (const item of items) {
            sections.push(`- ${item.key}: ${item.value}`);
          }
        }
      }

      // 2. Owner profile
      const ownerMemories = memoryStore.getMemories(OWNER_SOUL_ID);
      if (ownerMemories.length > 0) {
        sections.push('\n## About Your Owner');
        sections.push('This is who you work for. Use this context to serve them better:');
        const grouped = groupByCategory(ownerMemories);
        for (const [cat, items] of grouped) {
          const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
          sections.push(`**${catLabel}:**`);
          for (const item of items) {
            sections.push(`- ${item.key}: ${item.value}`);
          }
        }
      }

      // 3. Contact profile (if replying to a specific person)
      if (contactId && contactId !== OWNER_SOUL_ID && contactId !== BOT_SOUL_ID) {
        const contactMemories = memoryStore.getMemories(contactId);
        if (contactMemories.length > 0) {
          sections.push('\n## About This Contact');
          sections.push('What you know about the person you are currently talking to:');
          const grouped = groupByCategory(contactMemories);
          for (const [cat, items] of grouped) {
            const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
            sections.push(`**${catLabel}:**`);
            for (const item of items) {
              sections.push(`- ${item.key}: ${item.value}`);
            }
          }
          sections.push('\nUse this naturally in conversation. Do not explicitly say "I remember you said..."');
        }
      }

      return sections.join('\n');
    },

    getStore(): MemoryStore {
      return memoryStore;
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function groupByCategory(memories: { category: string; key: string; value: string }[]): Map<string, { key: string; value: string }[]> {
  const grouped = new Map<string, { key: string; value: string }[]>();
  for (const m of memories) {
    const list = grouped.get(m.category) || [];
    list.push({ key: m.key, value: m.value });
    grouped.set(m.category, list);
  }
  return grouped;
}

/* ------------------------------------------------------------------ */
/*  Extraction prompt for soul data                                    */
/* ------------------------------------------------------------------ */

export const SOUL_EXTRACTION_PROMPT = `You are a soul extraction system for an AI assistant called Ubot. 
Ubot is learning about the people it interacts with.

Analyze the conversation and extract facts about the USER (not the assistant). Return a JSON array:

[
  {"category": "identity", "key": "name", "value": "John", "confidence": 0.95},
  {"category": "preference", "key": "language", "value": "English", "confidence": 0.8}
]

Categories:
- identity: name, age, location, occupation, phone, email
- preference: language, communication style, interests, habits
- fact: specific things they mentioned (e.g. "has a dog named Max")
- relationship: their relation to the owner (friend, colleague, family, etc.)
- note: anything else notable

Rules:
- ONLY extract facts the USER explicitly stated or strongly implied
- Return [] if nothing noteworthy was said
- Be conservative — high confidence only for clear statements
- Key names should be lowercase, simple labels
- Respond with ONLY the JSON array, nothing else`;
