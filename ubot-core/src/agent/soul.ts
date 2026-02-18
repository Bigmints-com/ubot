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
          sections.push('\n## About Your Owner (You Are Talking To Them Right Now)');
          sections.push('The person you are chatting with IS your owner. Use this info to assist them:');
        } else {
          sections.push('\n## About Your Owner');
          sections.push('This is who you work for. Use this context to serve them better:');
        }
        sections.push(ownerDoc.content.trim());
      }

      // 3. Contact layers (if replying to a specific person, not the owner)
      if (contactId && contactId !== OWNER_SOUL_ID && contactId !== BOT_SOUL_ID) {
        // Layer 1: Persona (qualitative)
        const contactDoc = memoryStore.getDocument(contactId);
        if (contactDoc && contactDoc.content.trim()) {
          sections.push('\n## About This Contact');
          sections.push('### Personality & Style');
          sections.push(contactDoc.content.trim());
        }

        // Layer 2: Personal Details (from agent_memories)
        const memories = memoryStore.getMemories(contactId);
        const detailMemories = memories.filter(m => m.category !== 'summary');
        if (detailMemories.length > 0) {
          if (!contactDoc || !contactDoc.content.trim()) {
            sections.push('\n## About This Contact');
          }
          sections.push('\n### Personal Details');
          for (const m of detailMemories) {
            sections.push(`- ${m.key}: ${m.value}`);
          }
        }

        // Layer 3: Chat Summary (rolling digest)
        const summaryMemories = memories.filter(m => m.category === 'summary');
        const chatDigest = summaryMemories.find(m => m.key === 'chat_digest');
        if (chatDigest && chatDigest.value.trim()) {
          sections.push('\n### Conversation History');
          sections.push(chatDigest.value.trim());
        }

        if (contactDoc?.content.trim() || detailMemories.length > 0 || chatDigest) {
          sections.push('\nUse this context naturally. Do not explicitly say "I remember you said..."');
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

export const SOUL_REWRITE_PROMPT = `You are a persona manager for an AI assistant called Ubot.
Your job is to maintain a PERSONALITY PROFILE about a person — who they are qualitatively.

You will be given:
1. The CURRENT persona document (may be empty for new contacts)
2. METADATA about the contact (channel, name)
3. A new CONVERSATION snippet

Your task:
- Update the persona with personality and relationship insights from the conversation
- Focus on WHO they are, not WHAT they discussed
- Keep it concise, well-organized, and in YAML-like format
- Preserve existing traits unless clearly outdated/corrected
- If nothing new about their personality was revealed, return the document unchanged

Format the document with these sections:
# Personality
tone: [how they communicate — formal, casual, brief, verbose, etc.]
language: [preferred language if apparent]
style: [any notable communication patterns]

# Relationship
role: [their relation to the owner — friend, client, colleague, family, unknown]
context: [brief description of who they are and how they relate to the owner]

# Traits
[Key personality traits, interests, or notable characteristics observed from conversations]

# Preferences
[Any stated preferences — communication channel, timing, topics they care about]

Rules:
- This is a PERSONALITY profile, NOT a conversation log
- Do NOT include what they asked about or discussed (that goes in chat summary)
- Do NOT include contact details like phone, email, etc. (that goes in personal details)
- Be conservative — only add traits explicitly demonstrated or strongly implied
- Keep the document under 1000 characters
- Respond with ONLY the updated document, nothing else
- Do NOT add information that was not in the conversation`;

/* ------------------------------------------------------------------ */
/*  Owner merge prompt — append-only, never replaces existing content  */
/* ------------------------------------------------------------------ */

export const OWNER_MERGE_PROMPT = `You are a persona manager for an AI assistant.
Your job is to extract ONLY NEW personality/preference facts about the owner from a conversation.

You will be given:
1. The CURRENT owner profile document
2. A new CONVERSATION snippet (between the owner and the bot)

Your task:
- Compare the conversation against the existing document
- Extract ONLY personality, preference, or identity facts NOT already in the document
- If nothing new was learned, respond with exactly: NO_NEW_FACTS
- If there are new facts, respond with a short block in this format:

## New Facts
- [section]: [fact]
- [section]: [fact]

Where [section] is one of: Personality, Preferences, Traits, Relationship, Context

Example output:
## New Facts
- Preferences: Prefers morning meetings before 10am
- Traits: Entrepreneurial, runs a tech startup

Rules:
- NEVER repeat facts already in the existing document
- Focus on WHO the owner is, not WHAT they discussed
- Do NOT log conversation topics or questions asked
- Keep each fact to one concise line
- Respond with NO_NEW_FACTS if nothing new about their personality was revealed
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

/* ------------------------------------------------------------------ */
/*  Fact extraction prompt — structured personal details as JSON       */
/* ------------------------------------------------------------------ */

export const FACT_EXTRACTION_PROMPT = `Extract structured personal details from this conversation.
Return a JSON object with key-value pairs of facts learned about the USER (not the assistant).

Only include facts that are explicitly stated or very strongly implied.
If no new facts are found, return an empty object: {}

Use these standard keys when applicable:
- name: their full name or display name
- occupation: job title or profession
- company: where they work
- location: city or country
- email: email address
- language: preferred language
- timezone: their timezone if mentioned

You may also use custom keys for other facts (e.g. "birthday", "spouse_name").

Rules:
- Return ONLY valid JSON, nothing else
- Do NOT include conversation topics or what they asked about
- Do NOT include contact channel info (phone, telegram) — that's handled separately
- Keep values concise (single line)`;

/* ------------------------------------------------------------------ */
/*  Chat summary prompt — rolling conversation digest                  */
/* ------------------------------------------------------------------ */

export const SUMMARY_UPDATE_PROMPT = `You maintain a rolling summary of conversations between a person and an AI assistant.

You will be given:
1. The CURRENT summary (may be empty for first conversation)
2. A new CONVERSATION snippet

Your task:
- Update the summary to include key points from the new conversation
- Keep it as a concise digest of all past interactions
- Focus on: what was discussed, what was asked, what was decided/resolved
- Drop trivial details (greetings, small talk)
- Keep the summary under 500 characters
- Most recent topics should appear first

If the current summary is empty, create a new one from the conversation.
Respond with ONLY the updated summary text, nothing else.`;
