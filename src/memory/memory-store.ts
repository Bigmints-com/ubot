import { v4 as uuidv4 } from "uuid";
import type { DatabaseConnection } from "../data/database/types.js";
import type { MemoryCategory, MemoryEntry, SoulDocument } from "./types.js";
import { rowToMemory } from "./utils.js";


export interface MemoryStore {
	saveMemory(
		contactId: string,
		category: MemoryCategory,
		key: string,
		value: string,
		source?: string,
		confidence?: number,
		ttlSeconds?: number,
	): Promise<MemoryEntry>;
	getMemories(
		contactId: string,
		category?: MemoryCategory,
	): Promise<MemoryEntry[]>;
	getAllMemories(): Promise<MemoryEntry[]>;
	searchMemories(query: string): Promise<MemoryEntry[]>;
	deleteMemory(id: string): Promise<boolean>;
	clearContactMemories(contactId: string): Promise<void>;
	formatForPrompt(contactId: string): Promise<string>;

	getDocument(personaId: string): Promise<SoulDocument | null>;
	saveDocument(personaId: string, content: string): Promise<SoulDocument>;
	deleteDocument(personaId: string): Promise<boolean>;
	listDocuments(): Promise<SoulDocument[]>;
}

export function createMemoryStore(db: DatabaseConnection): MemoryStore {
	const getClient = () => db.get_client();

	return {
		async saveMemory(
			contactId,
			category,
			key,
			value,
			source = "extracted",
			confidence = 0.8,
			ttlSeconds?: number,
		): Promise<MemoryEntry> {
			const now = new Date().toISOString();
			const expiresAt = ttlSeconds
				? new Date(Date.now() + ttlSeconds * 1000).toISOString()
				: null;

			// Check existing memory
			const { data: existing } = await getClient()
				.from("youbot_memories")
				.select("*")
				.eq("contact_id", contactId)
				.eq("category", category)
				.eq("key", key)
				.single();

			if (existing) {
				await getClient()
					.from("youbot_memories")
					.update({
						value,
						source,
						confidence,
						updated_at: now,
						expires_at: expiresAt,
					})
					.eq("id", existing.id);

				console.log(
					`[Memory] Updated: ${contactId} → ${category}/${key} = "${value}"`,
				);
				return {
					...rowToMemory(existing),
					value,
					source,
					confidence,
					updatedAt: new Date(now),
				};
			}

			const id = uuidv4();
			await getClient().from("youbot_memories").insert({
				id,
				contact_id: contactId,
				category,
				key,
				value,
				source,
				confidence,
				expires_at: expiresAt,
				created_at: now,
				updated_at: now,
			});

			console.log(
				`[Memory] Saved: ${contactId} → ${category}/${key} = "${value}"`,
			);
			return {
				id,
				contactId,
				category,
				key,
				value,
				source,
				confidence,
				createdAt: new Date(now),
				updatedAt: new Date(now),
			};
		},

		async getMemories(contactId, category?): Promise<MemoryEntry[]> {
			let query = getClient()
				.from("youbot_memories")
				.select("*")
				.eq("contact_id", contactId);

			if (category) {
				query = query.eq("category", category);
			}

			// Filter out expired entries
			query = query.or(
				`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`,
			);

			const { data, error } = await query.order("updated_at", {
				ascending: false,
			});
			if (error || !data) return [];
			return data.map(rowToMemory);
		},

		async getAllMemories(): Promise<MemoryEntry[]> {
			const { data, error } = await getClient()
				.from("youbot_memories")
				.select("*")
				.order("updated_at", { ascending: false });
			if (error || !data) return [];
			return data.map(rowToMemory);
		},

		async searchMemories(query: string): Promise<MemoryEntry[]> {
			const { data, error } = await getClient()
				.from("youbot_memories")
				.select("*")
				.textsearch("value", query)
				.order("updated_at", { ascending: false });
			if (error || !data) return [];
			return data.map(rowToMemory);
		},

		async deleteMemory(id: string): Promise<boolean> {
			const { error } = await getClient()
				.from("youbot_memories")
				.delete()
				.eq("id", id);
			if (error) return false;
			return true;
		},

		async clearContactMemories(contactId: string): Promise<void> {
			await getClient()
				.from("youbot_memories")
				.delete()
				.eq("contact_id", contactId);
		},

		async formatForPrompt(contactId: string): Promise<string> {
			const memories = await this.getMemories(contactId, "fact");
			if (memories.length === 0) return "";

			const formatted = memories.map((m) => `${m.key}: ${m.value}`).join("\n");
			return `Memory facts for ${contactId}:\n${formatted}`;
		},

		async getDocument(personaId: string): Promise<SoulDocument | null> {
			const { data, error } = await getClient()
				.from("youbot_soul_documents")
				.select("*")
				.eq("persona_id", personaId)
				.single();
			if (error || !data) return null;
			return {
				id: data.id,
				personaId: data.persona_id,
				content: data.content,
				createdAt: new Date(data.created_at),
				updatedAt: new Date(data.updated_at),
			};
		},

		async saveDocument(
			personaId: string,
			content: string,
		): Promise<SoulDocument> {
			const now = new Date().toISOString();
			const { data, error } = await getClient()
				.from("youbot_soul_documents")
				.upsert(
					{
						persona_id: personaId,
						content,
						created_at: now,
						updated_at: now,
					},
					{ onConflict: "persona_id" },
				)
				.select("*")
				.single();

			if (error || !data) {
				throw new Error(
					`Failed to save document for ${personaId}: ${error?.message}`,
				);
			}

			return {
				id: data.id,
				personaId: data.persona_id,
				content: data.content,
				createdAt: new Date(data.created_at),
				updatedAt: new Date(data.updated_at),
			};
		},

		async deleteDocument(personaId: string): Promise<boolean> {
			const { error } = await getClient()
				.from("youbot_soul_documents")
				.delete()
				.eq("persona_id", personaId);
			if (error) return false;
			return true;
		},

		async listDocuments(): Promise<SoulDocument[]> {
			const { data, error } = await getClient()
				.from("youbot_soul_documents")
				.select("*")
				.order("updated_at", { ascending: false });
			if (error || !data) return [];
			return data.map((d: any) => ({
				id: d.id,
				personaId: d.persona_id,
				content: d.content,
				createdAt: new Date(d.created_at),
				updatedAt: new Date(d.updated_at),
			}));
		},
	};
}
