/**
 * Soul Module
 * Ubot's identity, personality, and evolving knowledge about its owner and contacts.
 * 
 * Three soul layers stored as YAML documents:
 * 1. Bot Soul   — Ubot's own persona (tone, style, personality traits)
 * 2. Owner Soul — Deep profile of the owner (you) — preferences, habits, context
 * 3. Contact Souls — Profiles for each person the owner interacts with
 */

import type { MemoryStore } from './memory-store.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Special persona IDs for bot and owner souls */
export const BOT_SOUL_ID = '__bot__';
export const OWNER_SOUL_ID = '__owner__';

/* ------------------------------------------------------------------ */
/*  Default bot persona (YAML seed)                                    */
/* ------------------------------------------------------------------ */

const DEFAULT_BOT_SOUL = `# Bot Persona
name: Ubot
role: Personal AI assistant
purpose: Help the owner manage their communications and automate tasks

# Personality
tone: Warm, conversational, and helpful
style: Concise but friendly. Uses emoji occasionally. Adapts to the conversation.
boundaries: Always acts on behalf of the owner. Never reveals it is an AI unless asked directly.
`;

const DEFAULT_OWNER_SOUL = `# Owner Profile
# This document is automatically updated as the bot learns about you from conversations.
# You can also edit it manually.
`;

/* ------------------------------------------------------------------ */
/*  Soul interface                                                     */
/* ------------------------------------------------------------------ */

export interface Soul {
  /** Get the raw YAML document for a persona */
  getDocument(personaId: string): string;

  /** Save a YAML document for a persona */
  saveDocument(personaId: string, content: string): void;

  /** Delete a persona document */
  deleteDocument(personaId: string): boolean;

  /** List all persona IDs with metadata */
  listPersonas(): Array<{ id: string; label: string; updatedAt: Date; contentLength: number }>;

  /** Build a comprehensive system prompt section from all soul documents */
  buildSoulPrompt(contactId?: string): string;

  /** Get the raw memory store for direct access */
  getStore(): MemoryStore;
}

/* ------------------------------------------------------------------ */
/*  Implementation                                                     */
/* ------------------------------------------------------------------ */

export function createSoul(memoryStore: MemoryStore): Soul {
  // Seed default documents if not already present
  const existingBot = memoryStore.getDocument(BOT_SOUL_ID);
  if (!existingBot) {
    memoryStore.saveDocument(BOT_SOUL_ID, DEFAULT_BOT_SOUL);
    console.log('[Soul] 🧠 Seeded default bot persona document');
  }

  const existingOwner = memoryStore.getDocument(OWNER_SOUL_ID);
  if (!existingOwner) {
    memoryStore.saveDocument(OWNER_SOUL_ID, DEFAULT_OWNER_SOUL);
    console.log('[Soul] 🧠 Seeded default owner profile document');
  }

  return {
    getDocument(personaId: string): string {
      const doc = memoryStore.getDocument(personaId);
      return doc?.content || '';
    },

    saveDocument(personaId: string, content: string): void {
      memoryStore.saveDocument(personaId, content);
    },

    deleteDocument(personaId: string): boolean {
      return memoryStore.deleteDocument(personaId);
    },

    listPersonas(): Array<{ id: string; label: string; updatedAt: Date; contentLength: number }> {
      const docs = memoryStore.listDocuments();
      return docs.map(d => ({
        id: d.personaId,
        label: d.personaId === BOT_SOUL_ID ? 'Bot Persona'
             : d.personaId === OWNER_SOUL_ID ? 'Owner Profile'
             : d.personaId,
        updatedAt: d.updatedAt,
        contentLength: d.content.length,
      }));
    },

    buildSoulPrompt(contactId?: string): string {
      const sections: string[] = [];

      // 1. Bot persona
      const botDoc = memoryStore.getDocument(BOT_SOUL_ID);
      if (botDoc && botDoc.content.trim()) {
        sections.push('## Your Identity');
        sections.push(botDoc.content.trim());
      }

      // 2. Owner profile
      const ownerDoc = memoryStore.getDocument(OWNER_SOUL_ID);
      if (ownerDoc && ownerDoc.content.trim() && ownerDoc.content !== DEFAULT_OWNER_SOUL) {
        sections.push('\n## About Your Owner');
        sections.push('This is who you work for. Use this context to serve them better:');
        sections.push(ownerDoc.content.trim());
      }

      // 3. Contact profile (if replying to a specific person)
      if (contactId && contactId !== OWNER_SOUL_ID && contactId !== BOT_SOUL_ID) {
        const contactDoc = memoryStore.getDocument(contactId);
        if (contactDoc && contactDoc.content.trim()) {
          sections.push('\n## About This Contact');
          sections.push('What you know about the person you are currently talking to:');
          sections.push(contactDoc.content.trim());
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
/*  Soul document rewrite prompt                                       */
/* ------------------------------------------------------------------ */

export const SOUL_REWRITE_PROMPT = `You are a memory manager for an AI assistant called Ubot.
Your job is to maintain a living document about a person, updating it with new information from conversations.

You will be given:
1. The CURRENT persona document (may be empty for new contacts)
2. METADATA about the contact (channel, phone/handle, name)
3. A new CONVERSATION snippet

Your task:
- Merge new facts from the conversation into the existing document
- Always include known identifiers (phone number, Telegram handle, name) from the METADATA
- Track what they have asked about or requested
- Keep it concise, well-organized, and in YAML-like format
- Preserve existing facts unless clearly outdated/corrected
- If nothing new was said, return the document unchanged

Format the document with these sections:
# Identity
name: [their display name]
occupation: [if known]
location: [if known]

# Contact
phone: [from WhatsApp JID or if shared]
telegram: [chat ID or username]
email: [if shared]

# About
[Brief description: who they are, their relation to the owner, key context]

# Asks & Topics
[What they have asked about or discussed — e.g. "Asked about owner's schedule", "Wanted to set up a meeting", "Asked for phone number"]

# Preferences
[Communication style, language, interests]

# Notes
[Any other relevant context]

Rules:
- Always populate Identity and Contact from METADATA even if the conversation doesn't mention them
- Keep Asks & Topics as a running log of what they've discussed (most recent first)
- Be conservative — only add facts explicitly stated or strongly implied
- Keep the document under 2000 characters
- Respond with ONLY the updated document, nothing else
- Do NOT add information that was not in the conversation or metadata`;
