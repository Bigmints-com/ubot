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
  buildSoulPrompt(contactId?: string, isOwner?: boolean): string;

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
      return docs.map(d => {
        let label = d.personaId;
        if (d.personaId === BOT_SOUL_ID) {
          label = 'Bot Persona';
        } else if (d.personaId === OWNER_SOUL_ID) {
          label = 'Owner Profile';
        } else {
          // Try to extract name from the document content
          const nameMatch = d.content.match(/name:\s*(.+)/i);
          if (nameMatch && nameMatch[1].trim()) {
            label = nameMatch[1].trim();
          } else if (d.personaId.includes('@')) {
            // Format JID as readable: "971569737344@s.whatsapp.net" → "+971569737344"
            label = '+' + d.personaId.replace(/@.*/, '');
          } else if (d.personaId.startsWith('telegram:')) {
            label = 'Telegram ' + d.personaId.replace('telegram:', '');
          }
        }
        return {
          id: d.personaId,
          label,
          updatedAt: d.updatedAt,
          contentLength: d.content.length,
        };
      });
    },

    buildSoulPrompt(contactId?: string, isOwner?: boolean): string {
      const sections: string[] = [];

      // 1. Bot persona
      const botDoc = memoryStore.getDocument(BOT_SOUL_ID);
      if (botDoc && botDoc.content.trim()) {
        sections.push('## Your Identity');
        sections.push(botDoc.content.trim());
      }

      // 2. Owner profile — framing depends on who we're talking to
      const ownerDoc = memoryStore.getDocument(OWNER_SOUL_ID);
      if (ownerDoc && ownerDoc.content.trim() && ownerDoc.content !== DEFAULT_OWNER_SOUL) {
        if (isOwner) {
          // Talking TO the owner — use their profile as context, not personality to adopt
          sections.push('\n## About Your Owner (You Are Talking To Them Right Now)');
          sections.push('The person you are chatting with IS your owner. Use this info to assist them. Do NOT adopt their personality or speech patterns — you are their assistant, not their impersonator:');
        } else {
          // Talking to a third party — owner profile is background context
          sections.push('\n## About Your Owner');
          sections.push('This is who you work for. Use this context to serve them better:');
        }
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

/* ------------------------------------------------------------------ */
/*  Owner merge prompt — append-only, never replaces existing content  */
/* ------------------------------------------------------------------ */

export const OWNER_MERGE_PROMPT = `You are a memory manager for an AI assistant.
Your job is to extract ONLY NEW facts about the owner from a conversation snippet.

You will be given:
1. The CURRENT owner profile document
2. A new CONVERSATION snippet (between the owner and the bot)

Your task:
- Compare the conversation against the existing document
- Extract ONLY facts that are NOT already in the existing document
- If nothing new was learned, respond with exactly: NO_NEW_FACTS
- If there are new facts, respond with a short block in this format:

## New Facts (YYYY-MM-DD)
- [section]: [fact]
- [section]: [fact]

Where [section] is one of: Identity, Contact, Preferences, Work, Schedule, Notes

Example output:
## New Facts (2026-02-18)
- Preferences: Prefers morning meetings before 10am
- Work: Working on a new mobile app called Fikr

Rules:
- NEVER repeat facts already in the existing document
- Be conservative — only add facts explicitly stated or strongly implied
- Keep each fact to one concise line
- Respond with NO_NEW_FACTS if the conversation didn't reveal anything new
- Do NOT include greetings, small talk, or bot responses as facts`;

/**
 * Merge new facts into an existing owner document.
 * Appends a timestamped section at the end, preserving all existing content.
 */
export function mergeIntoOwnerDoc(existingDoc: string, newFacts: string): string {
  // If LLM says nothing new, return unchanged
  if (!newFacts || newFacts.trim() === 'NO_NEW_FACTS') {
    return existingDoc;
  }

  // Parse the new facts into section → facts map
  const factLines = newFacts.split('\n').filter(l => l.trim().startsWith('- '));
  if (factLines.length === 0) return existingDoc;

  // Group facts by section
  const sectionMap: Record<string, string[]> = {};
  for (const line of factLines) {
    const match = line.match(/^-\s*(\w[\w\s]*?):\s*(.+)/);
    if (match) {
      const section = match[1].trim();
      const fact = match[2].trim();
      if (!sectionMap[section]) sectionMap[section] = [];
      sectionMap[section].push(fact);
    }
  }

  if (Object.keys(sectionMap).length === 0) return existingDoc;

  // Append facts into the existing doc under the right sections
  let doc = existingDoc.trimEnd();
  
  for (const [section, facts] of Object.entries(sectionMap)) {
    const sectionHeader = `# ${section}`;
    const sectionIndex = doc.indexOf(sectionHeader);
    
    if (sectionIndex !== -1) {
      // Find the end of this section (next # header or end of doc)
      const afterHeader = sectionIndex + sectionHeader.length;
      const nextSection = doc.indexOf('\n# ', afterHeader);
      const insertPos = nextSection !== -1 ? nextSection : doc.length;
      
      // Append facts before the next section
      const factsText = '\n' + facts.join('\n');
      doc = doc.slice(0, insertPos) + factsText + doc.slice(insertPos);
    } else {
      // Section doesn't exist — add it at the end
      doc += `\n\n${sectionHeader}\n${facts.join('\n')}`;
    }
  }

  return doc;
}
