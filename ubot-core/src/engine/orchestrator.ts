/**
 * Agent Orchestrator
 * The core agent loop: message → LLM → tool execution → response
 * 
 * Uses native OpenAI-compatible tool calling (works with Ollama, Gemini, OpenAI, etc.)
 */

import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import type { 
  AgentConfig, AgentResponse, ChatMessageMetadata,
  ToolExecutionResult, AgentDefinition, Attachment
} from './types.js';
import type { ConversationStore } from '../memory/conversation.js';
import type { MemoryStore } from '../memory/memory-store.js';
import { type Soul, SOUL_REWRITE_PROMPT, OWNER_MERGE_PROMPT, FACT_EXTRACTION_PROMPT, SUMMARY_UPDATE_PROMPT, mergeIntoOwnerDoc, OWNER_SOUL_ID } from '../memory/soul.js';
import { formatToolsForAPI, createToolRegistry, getToolsForSource, getToolAliases, type ToolRegistry } from './tools.js';
import { loadAgentDefinitions } from './agent-loader.js';
import { metricsCollector } from '../metrics/index.js';
import { log } from '../logger/ring-buffer.js';
import { logCapability } from '../capabilities/cli/capability-log.js';
import { LoopDetector } from './loop-detector.js';

export interface AgentOrchestrator {
  /** Process a message and return the agent's response */
  chat(sessionId: string, message: string, source?: 'web' | 'whatsapp' | 'telegram' | 'imessage', contactName?: string, isOwner?: boolean, attachments?: Attachment[]): Promise<AgentResponse>;
  /** Direct LLM text generation (no tools) — for skill generation, etc. */
  generate(systemPrompt: string, userMessage: string): Promise<string>;
  /** Get the current config */
  getConfig(): AgentConfig;
  /** Update config */
  updateConfig(updates: Partial<AgentConfig>): AgentConfig;
  /** Get the tool registry for registering tool executors */
  getToolRegistry(): ToolRegistry;
  /** Get the conversation store */
  getConversationStore(): ConversationStore;
  /** Get the memory store */
  getMemoryStore(): MemoryStore;
  /** Get the soul */
  getSoul(): Soul;
  /** Switch the active specialized agent for a session */
  switchAgent(sessionId: string, agentId: string | null): void;
  /** List available specialized agents */
  listAgents(): AgentDefinition[];
  /** Get raw markdown for a specialized agent */
  getAgentMarkdown(agentId: string): string | null;
  /** Save raw markdown for a specialized agent and reload it */
  saveAgentMarkdown(agentId: string, content: string): void;
}

export function createAgentOrchestrator(
  config: AgentConfig,
  conversationStore: ConversationStore,
  memoryStore: MemoryStore,
  soul: Soul,
  workspacePath?: string,
): AgentOrchestrator {
  let currentConfig = { ...config };
  const toolRegistry = createToolRegistry();
  
  // Register core orchestrator tools
  toolRegistry.register('list_agents', async () => {
    const list = Array.from(agents.values());
    if (list.length === 0) return { toolName: 'list_agents', success: true, result: 'No specialized agents found in workspace/agents/', duration: 0 };
    const formatted = list.map(a => `- ${a.id}: ${a.name} (${a.description})`).join('\n');
    return { toolName: 'list_agents', success: true, result: `Available agents:\n${formatted}`, duration: 0 };
  });

  toolRegistry.register('switch_agent', async (args) => {
    const agentId = String(args.agentId || '');
    const sessionId = String(args.sessionId || '');
    
    if (!sessionId) return { toolName: 'switch_agent', success: false, error: 'sessionId is required', duration: 0 };
    
    if (!agentId || agentId === 'main' || agentId === 'none') {
      sessionAgents.delete(sessionId);
      return { toolName: 'switch_agent', success: true, result: 'Switched back to main Ubot persona.', duration: 0 };
    }
    
    if (!agents.has(agentId)) {
      return { toolName: 'switch_agent', success: false, error: `Agent "${agentId}" not found.`, duration: 0 };
    }
    
    sessionAgents.set(sessionId, agentId);
    const agent = agents.get(agentId)!;
    return { toolName: 'switch_agent', success: true, result: `Successfully switched to ${agent.name}. Instructions updated.`, duration: 0 };
  });
  
  // Multi-agent state
  const agents = new Map<string, AgentDefinition>();
  const sessionAgents = new Map<string, string>(); // sessionId -> agentId

  // Load specialized agents from workspace
  if (workspacePath) {
    const loadedAgents = loadAgentDefinitions(workspacePath);
    for (const agent of loadedAgents) {
      agents.set(agent.id, agent);
      console.log(`[Orchestrator] Loaded specialized agent: ${agent.id} (${agent.name})`);
    }
  }

  function createLLMClient(): OpenAI {
    return new OpenAI({
      apiKey: currentConfig.llmApiKey,
      baseURL: currentConfig.llmBaseUrl,
    });
  }

  function buildSystemPrompt(agentId?: string): string {
    let basePrompt = currentConfig.systemPrompt;
    
    // Override with specialized agent prompt if applicable
    if (agentId && agents.has(agentId)) {
      const agent = agents.get(agentId)!;
      if (agent.systemPrompt) {
        basePrompt = agent.systemPrompt;
      }
    }

    return basePrompt.replace('{{tools}}', 'Tools are provided natively via the API. Use function calls to execute them.');
  }

  type ChatMsg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

  function buildMessages(sessionId: string, userMessage: string, isOwner: boolean = false, attachments?: Attachment[]): ChatMsg[] {
    const history = conversationStore.getHistory(sessionId, currentConfig.maxHistoryMessages);
    const activeAgentId = sessionAgents.get(sessionId);
    
    // Build system prompt with soul data (bot persona + owner + contact)
    let systemPrompt = buildSystemPrompt(activeAgentId);
    const soulPrompt = soul.buildSoulPrompt(sessionId, isOwner);
    if (soulPrompt) {
      systemPrompt += '\n\n' + soulPrompt;
    }

    const messages: ChatMsg[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Inject session-level rolling summary as context preamble
    // This provides long-term memory beyond the message history window
    const sessionSummary = soul.getStore().getMemories(sessionId, 'summary')
      .find(m => m.key === 'chat_digest');
    if (sessionSummary && sessionSummary.value.trim()) {
      messages.push({
        role: 'user',
        content: `[Previous conversation context — DO NOT reference this message directly, use it as background knowledge]\n${sessionSummary.value}`,
      });
      messages.push({
        role: 'assistant',
        content: 'Understood, I have context from our previous conversations.',
      });
    }

    // Add conversation history with tool call context
    for (const msg of history) {
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        // If this message had tool calls, annotate them inline so LLM knows what it did
        let content = msg.content || '';
        if (msg.metadata?.toolCall) {
          const toolNames = msg.metadata.toolCall.toolName;
          if (toolNames && !content.includes('[Used tools:')) {
            content += `\n[Used tools: ${toolNames}]`;
          }
        }
        messages.push({ role: 'assistant', content });
      }
    }

    // Build multimodal user message if attachments are present
    if (attachments && attachments.length > 0) {
      const contentParts: Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }> = [];

      // Add document text content as context before the user message
      const docTexts: string[] = [];
      for (const att of attachments) {
        if (att.textContent) {
          docTexts.push(`[Content of ${att.filename}]:\n${att.textContent}`);
        }
      }
      
      // User message text (with document context prepended if any)
      const fullText = docTexts.length > 0
        ? `${docTexts.join('\n\n')}\n\n${userMessage}`
        : userMessage;
      contentParts.push({ type: 'text', text: fullText });

      // Add image attachments as image_url content parts
      for (const att of attachments) {
        if (att.base64 && att.mimeType.startsWith('image/')) {
          contentParts.push({
            type: 'image_url',
            image_url: { url: `data:${att.mimeType};base64,${att.base64}`, detail: 'auto' },
          });
        }
      }

      messages.push({ role: 'user', content: contentParts as any });
    } else {
      // Plain text message (no attachments)
      messages.push({ role: 'user', content: userMessage });
    }

    return messages;
  }

  /** Extract/update all three data layers from a conversation turn */
  async function extractSoulData(sessionId: string, userMessage: string, assistantResponse: string, source?: 'web' | 'whatsapp' | 'telegram', contactName?: string, isOwner: boolean = false, toolResults: ToolExecutionResult[] = []): Promise<void> {
    if (!userMessage || !assistantResponse) return;

    // Build action-aware conversation text for memory extraction
    let conversationText = `User: ${userMessage}\nAssistant: ${assistantResponse}`;
    if (toolResults.length > 0) {
      const toolSummary = toolResults
        .map(r => `  - ${r.toolName}: ${r.success ? (r.result?.slice(0, 150) || 'Success') : `Failed: ${r.error}`}`)
        .join('\n');
      conversationText += `\n[Actions taken:\n${toolSummary}]`;
    }

    try {
      const client = createLLMClient();

      if (isOwner) {
        // ── OWNER: persona merge + fact extraction + summary ──
        const currentDoc = soul.getDocument(OWNER_SOUL_ID);
        if (!currentDoc) return;

        // Run all three layers in parallel (same as contacts)
        const [mergeResult, factsResult, summaryResult] = await Promise.allSettled([
          // Layer 1: Persona merge (append-only)
          (() => {
            const prompt = `CURRENT OWNER PROFILE:\n${currentDoc}\n\nOWNER'S MESSAGE:\n${userMessage}`;
            return client.chat.completions.create({
              model: currentConfig.llmModel,
              messages: [
                { role: 'system', content: OWNER_MERGE_PROMPT },
                { role: 'user', content: prompt },
              ],
              temperature: 0.1,
              max_tokens: 800,
            });
          })(),

          // Layer 2: Structured facts (personal details)
          client.chat.completions.create({
            model: currentConfig.llmModel,
            messages: [
              { role: 'system', content: FACT_EXTRACTION_PROMPT },
              { role: 'user', content: `User: ${userMessage}` },
            ],
            temperature: 0.0,
            max_tokens: 300,
          }),

          // Layer 3: Chat summary (rolling digest)
          (() => {
            const existingSummary = memoryStore.getMemories(OWNER_SOUL_ID, 'summary')
              .find(m => m.key === 'chat_digest');
            return client.chat.completions.create({
              model: currentConfig.llmModel,
              messages: [
                { role: 'system', content: SUMMARY_UPDATE_PROMPT },
                { role: 'user', content: existingSummary
                  ? `CURRENT SUMMARY:\n${existingSummary.value}\n\nNEW CONVERSATION:\n${conversationText}`
                  : `CURRENT SUMMARY:\n(empty - first conversation)\n\nNEW CONVERSATION:\n${conversationText}`
                },
              ],
              temperature: 0.1,
              max_tokens: 300,
            });
          })(),
        ]);

        // Process Layer 1: Persona merge
        if (mergeResult.status === 'fulfilled') {
          const newFacts = mergeResult.value.choices[0]?.message?.content || '';
          if (newFacts.trim() && newFacts.trim() !== 'NO_NEW_FACTS') {
            const merged = mergeIntoOwnerDoc(currentDoc, newFacts);
            if (merged !== currentDoc) {
              soul.saveDocument(OWNER_SOUL_ID, merged);
              console.log(`[Soul] ✏️ Merged new facts into owner profile (${merged.length} chars)`);
            }
          } else {
            console.log('[Soul] Owner conversation — no new persona facts');
          }
        } else {
          console.error('[Soul] Owner merge failed:', mergeResult.reason?.message);
        }

        // Process Layer 2: Structured facts
        if (factsResult.status === 'fulfilled') {
          const factsRaw = factsResult.value.choices[0]?.message?.content || '{}';
          try {
            const cleaned = factsRaw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const facts = JSON.parse(cleaned);
            let count = 0;
            for (const [key, value] of Object.entries(facts)) {
              if (typeof value === 'string' && value.trim()) {
                memoryStore.saveMemory(OWNER_SOUL_ID, 'identity', key, value.trim(), 'extracted');
                count++;
              }
            }
            if (count > 0) console.log(`[Soul] 📋 Saved ${count} owner facts to agent_memories`);
          } catch {
            console.log('[Soul] Owner fact extraction — no valid JSON returned');
          }
        } else {
          console.error('[Soul] Owner fact extraction failed:', factsResult.reason?.message);
        }

        // Process Layer 3: Summary
        if (summaryResult.status === 'fulfilled') {
          const summary = summaryResult.value.choices[0]?.message?.content || '';
          if (summary.trim()) {
            memoryStore.saveMemory(OWNER_SOUL_ID, 'summary', 'chat_digest', summary.trim(), 'system');
            console.log(`[Soul] 📝 Updated owner chat summary (${summary.length} chars)`);
          }
        } else {
          console.error('[Soul] Owner summary update failed:', summaryResult.reason?.message);
        }
      } else {
        // ── CONTACT: three-layer extraction ───────────────────
        const personaId = sessionId;
        const currentDoc = soul.getDocument(personaId);

        // Read owner name for context
        const ownerDoc = soul.getDocument(OWNER_SOUL_ID);
        const ownerNameMatch = ownerDoc?.match(/name:\s*(.+)/i);
        const ownerName = ownerNameMatch ? ownerNameMatch[1].trim() : '';

        const ownerContext = ownerName
          ? `\nCONTEXT: The owner of this AI assistant is "${ownerName}". The user in this conversation is "${contactName || 'unknown'}". Only record facts about the USER.`
          : '';

        // Save contact details from metadata immediately (no LLM needed)
        if (contactName) {
          memoryStore.saveMemory(personaId, 'identity', 'name', contactName, 'metadata');
        }
        if (source === 'whatsapp' && sessionId.includes('@')) {
          const phone = '+' + sessionId.replace(/@.*/, '');
          memoryStore.saveMemory(personaId, 'identity', 'phone', phone, 'metadata');
          memoryStore.saveMemory(personaId, 'identity', 'channel', 'whatsapp', 'metadata');
        }
        if (source === 'telegram' && sessionId.startsWith('telegram:')) {
          memoryStore.saveMemory(personaId, 'identity', 'telegram_id', sessionId.replace('telegram:', ''), 'metadata');
          memoryStore.saveMemory(personaId, 'identity', 'channel', 'telegram', 'metadata');
        }

        // Run three LLM calls in parallel for efficiency
        const [personaResult, factsResult, summaryResult] = await Promise.allSettled([
          // Layer 1: Persona (qualitative personality profile)
          client.chat.completions.create({
            model: currentConfig.llmModel,
            messages: [
              { role: 'system', content: SOUL_REWRITE_PROMPT },
              { role: 'user', content: currentDoc
                ? `CURRENT DOCUMENT:\n${currentDoc}\n\nMETADATA:\nname: ${contactName || 'unknown'}${ownerContext}\n\nNEW CONVERSATION:\n${conversationText}`
                : `CURRENT DOCUMENT:\n(empty - this is a new person)\n\nMETADATA:\nname: ${contactName || 'unknown'}${ownerContext}\n\nNEW CONVERSATION:\n${conversationText}`
              },
            ],
            temperature: 0.1,
            max_tokens: 1000,
          }),

          // Layer 2: Structured facts (personal details as JSON)
          client.chat.completions.create({
            model: currentConfig.llmModel,
            messages: [
              { role: 'system', content: FACT_EXTRACTION_PROMPT },
              { role: 'user', content: conversationText },
            ],
            temperature: 0.0,
            max_tokens: 300,
          }),

          // Layer 3: Chat summary (rolling digest)
          (() => {
            const existingSummary = memoryStore.getMemories(personaId, 'summary')
              .find(m => m.key === 'chat_digest');
            return client.chat.completions.create({
              model: currentConfig.llmModel,
              messages: [
                { role: 'system', content: SUMMARY_UPDATE_PROMPT },
                { role: 'user', content: existingSummary
                  ? `CURRENT SUMMARY:\n${existingSummary.value}\n\nNEW CONVERSATION:\n${conversationText}`
                  : `CURRENT SUMMARY:\n(empty - first conversation)\n\nNEW CONVERSATION:\n${conversationText}`
                },
              ],
              temperature: 0.1,
              max_tokens: 300,
            });
          })(),
        ]);

        // Process Layer 1: Persona document
        if (personaResult.status === 'fulfilled') {
          const updatedDoc = personaResult.value.choices[0]?.message?.content || '';
          if (updatedDoc.trim()) {
            soul.saveDocument(personaId, updatedDoc.trim());
            console.log(`[Soul] 🧠 Updated persona for ${personaId} (${updatedDoc.length} chars)`);
          }
        } else {
          console.error('[Soul] Persona extraction failed:', personaResult.reason?.message);
        }

        // Process Layer 2: Structured facts
        if (factsResult.status === 'fulfilled') {
          const factsRaw = factsResult.value.choices[0]?.message?.content || '{}';
          try {
            // Strip markdown code fences if present
            const cleaned = factsRaw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const facts = JSON.parse(cleaned);
            let count = 0;
            for (const [key, value] of Object.entries(facts)) {
              if (typeof value === 'string' && value.trim()) {
                memoryStore.saveMemory(personaId, 'identity', key, value.trim(), 'extracted');
                count++;
              }
            }
            if (count > 0) {
              console.log(`[Soul] 📋 Extracted ${count} facts for ${personaId}`);
            }
          } catch {
            // JSON parse failed — skip silently
          }
        }

        // Process Layer 3: Chat summary
        if (summaryResult.status === 'fulfilled') {
          const summary = summaryResult.value.choices[0]?.message?.content || '';
          if (summary.trim()) {
            memoryStore.saveMemory(personaId, 'summary', 'chat_digest', summary.trim(), 'extracted');
            console.log(`[Soul] 💬 Updated chat summary for ${personaId}`);
          }
        } else {
          console.error('[Soul] Summary update failed:', summaryResult.reason?.message);
        }
      }
    } catch (err: any) {
      console.error('[Soul] Data extraction error:', err.message);
    }
  }

  async function callLLM(
    messages: ChatMsg[],
    isOwner: boolean = true,
    agentId?: string,
  ): Promise<{
    content: string;
    toolCalls: Array<{ id: string; toolName: string; arguments: Record<string, unknown> }>;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  }> {
    const client = createLLMClient();
    
    // Determine allowed tools
    let filteredTools = getToolsForSource(isOwner);
    if (agentId && agents.has(agentId)) {
      const agent = agents.get(agentId)!;
      if (agent.allowedTools && agent.allowedTools.length > 0) {
        filteredTools = filteredTools.filter(t => agent.allowedTools!.includes(t.name));
      }
    }

    const tools = formatToolsForAPI(filteredTools);
    log.info('Agent', `Calling LLM: ${currentConfig.llmModel} (via ${currentConfig.llmBaseUrl})`);
    log.info('Agent', `Tools available: ${filteredTools.length} (isOwner: ${isOwner})`);
    
    try {
      const completion = await client.chat.completions.create({
        model: currentConfig.llmModel,
        messages,
        temperature: currentConfig.temperature,
        max_tokens: currentConfig.maxTokens,
        tools,
      });

      const choice = completion.choices?.[0];
      if (!choice) {
        log.error('Agent', `No choices in LLM response: ${JSON.stringify(completion).slice(0, 500)}`);
        return { content: '', toolCalls: [], usage: undefined };
      }
      const content = choice.message?.content || '';
      const nativeToolCalls = choice.message?.tool_calls || [];
      
      const toolCalls = nativeToolCalls
        .filter((tc: any) => tc.type === 'function' && tc.function)
        .map((tc: any) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || '{}');
        } catch {
          // Invalid JSON — pass empty args
        }
        return {
          id: tc.id,
          toolName: tc.function.name,
          arguments: args,
        };
      });

      const usage = completion.usage ? {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
      } : undefined;

      log.info('Agent', `LLM response: ${content.length} chars text, ${toolCalls.length} tool calls`);
      if (toolCalls.length > 0) {
        log.info('Agent', `Tool calls: ${toolCalls.map(tc => `${tc.toolName}(${JSON.stringify(tc.arguments)})`).join(', ')}`);
      }

      return { content, toolCalls, usage };
    } catch (err: any) {
      log.error('Agent', `LLM call failed: ${err.message}`);
      throw new Error(`LLM call failed: ${err.message}`);
    }
  }

  return {
    async chat(
      sessionId: string,
      message: string,
      source: 'web' | 'whatsapp' | 'telegram' = 'web',
      contactName?: string,
      isOwner?: boolean,
      attachments?: Attachment[],
    ): Promise<AgentResponse> {
      const startTime = Date.now();
      const toolResults: ToolExecutionResult[] = [];

      // Track incoming message
      metricsCollector.recordMessage(source || 'web', 'in');

      // Ensure session exists
      conversationStore.getOrCreateSession(
        sessionId,
        source,
        source === 'web' ? 'Command Center' : contactName || sessionId
      );

      // Store the user message
      const userMetadata: ChatMessageMetadata = {
        source,
        whatsappJid: source === 'whatsapp' ? sessionId : undefined,
        contactName,
        attachments,
      };
      conversationStore.addMessage(sessionId, 'user', message, userMetadata);

      // isOwner is now passed in by the unified message handler.
      // Fallback: if not explicitly provided, assume web === owner (backward compat)
      const ownerFlag = isOwner ?? (source === 'web');

      // Build the messages array with history (pass isOwner for soul prompt framing)
      let messages = buildMessages(sessionId, message, ownerFlag, attachments);
      let lastUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;

      // Agent loop with tool calling
      let iteration = 0;
      let finalContent = '';
      const loopDetector = new LoopDetector();

      while (iteration < currentConfig.maxToolIterations) {
        iteration++;

        const activeAgentId = sessionAgents.get(sessionId);
        const llmResult = await callLLM(messages, ownerFlag, activeAgentId);
        lastUsage = llmResult.usage;

        if (llmResult.toolCalls.length === 0) {
          // No tool calls — check if this is an "I can't" response
          // If so, auto-triage to see if we have tools or could build one
          const cantPhrases = [
            "i can't", "i cannot", "i don't have", "i'm unable", "not available",
            "no tool", "don't currently", "not supported", "beyond my", "outside my",
            "i lack", "not possible for me", "i'm not able",
          ];
          const lowerContent = llmResult.content.toLowerCase();
          const signalsInability = cantPhrases.some(p => lowerContent.includes(p));

          if (signalsInability && iteration === 1 && toolRegistry.has('cli_triage')) {
            // Auto-triage: check if we actually DO have tools for this
            log.info('Agent', `Fallback triage triggered — LLM said it can't, checking if tools exist`);
            const triageResult = await toolRegistry.execute({
              toolName: 'cli_triage',
              arguments: { request: message },
              rawText: '',
            });
            toolResults.push(triageResult);
            metricsCollector.recordTool('cli_triage', triageResult.success);

            if (triageResult.success && triageResult.result) {
              // Re-inject triage result and let LLM reconsider
              messages.push({
                role: 'assistant',
                content: llmResult.content || null,
                tool_calls: [{
                  id: 'auto_triage',
                  type: 'function' as const,
                  function: { name: 'cli_triage', arguments: JSON.stringify({ request: message }) },
                }],
              } as ChatMsg);
              messages.push({
                role: 'tool',
                tool_call_id: 'auto_triage',
                content: triageResult.result,
              } as ChatMsg);
              log.info('Agent', `Fallback triage result: ${triageResult.result.slice(0, 200)}`);
              // Audit log the triage
              logCapability({
                action: 'triage',
                request: message,
                triageVerdict: triageResult.result.match(/Verdict:\s*(\w+)/i)?.[1] || 'unknown',
                triageReason: triageResult.result.slice(0, 500),
                sessionId,
                source,
              });
              // Continue the loop — LLM will see triage result and act on it
              continue;
            }
          }

          // Truly the final response
          finalContent = llmResult.content;
          break;
        }

        // Add assistant message with tool_calls to context
        messages.push({
          role: 'assistant',
          content: llmResult.content || null,
          tool_calls: llmResult.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.toolName,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        } as ChatMsg);

        // Execute tool calls and add results
        for (const toolCall of llmResult.toolCalls) {
          // Resolve tool aliases (e.g. browser_click → mcp_playwright_browser_click)
          let resolvedToolName = toolCall.toolName;
          const aliases = getToolAliases();
          if (aliases.has(toolCall.toolName)) {
            resolvedToolName = aliases.get(toolCall.toolName)!;
            log.info('ToolRouter', `Alias: ${toolCall.toolName} → ${resolvedToolName}`);
          }

          log.info('Agent', `Executing: ${resolvedToolName}(${JSON.stringify(toolCall.arguments)})`);
          const result = await toolRegistry.execute({
            toolName: resolvedToolName,
            arguments: toolCall.arguments,
            rawText: '',
          });
          toolResults.push(result);

          // Track tool usage
          metricsCollector.recordTool(toolCall.toolName, result.success);

          // Add tool result as a "tool" role message (OpenAI format)
          const toolResultContent = result.success 
            ? (result.result || 'Success') 
            : `Error: ${result.error}`;
          if (result.success) {
            log.info('Agent', `Tool result for ${toolCall.toolName}: ${toolResultContent.slice(0, 200)}`);
          } else {
            log.error('Agent', `Tool failed: ${toolCall.toolName} — ${result.error}`);
          }
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResultContent,
          } as ChatMsg);

          // Check for loop detection
          const loopCheck = loopDetector.record(
            toolCall.toolName,
            toolCall.arguments,
            toolResultContent,
          );
          if (loopCheck.shouldStop) {
            log.warn('Agent', `Loop detected: ${loopCheck.reason}`);
            messages.push({
              role: 'system',
              content: `⚠️ LOOP DETECTED: ${loopCheck.reason}\n\nStop repeating the same tool calls. Respond with what you have so far, or try a different approach.`,
            } as ChatMsg);
            // Don't break — let the LLM see the warning and self-correct.
            // But if critical, force break.
            if (loopCheck.severity === 'critical') {
              finalContent = 'I was repeating the same action without making progress. Let me try a different approach.';
              break;
            }
          }
        }

        // If this was the last iteration, use whatever text we have
        if (iteration >= currentConfig.maxToolIterations) {
          finalContent = llmResult.content || 'I completed the requested actions.';
        }
      }

      // Store the assistant response
      const assistantMetadata: ChatMessageMetadata = {
        source: 'web',
        toolCall: toolResults.length > 0 ? {
          toolName: toolResults.map(r => r.toolName).join(', '),
          arguments: {},
        } : undefined,
        usage: lastUsage,
        model: currentConfig.llmModel,
      };
      conversationStore.addMessage(sessionId, 'assistant', finalContent, assistantMetadata);

      // Track outgoing message
      metricsCollector.recordMessage(source || 'web', 'out');

      // Extract soul data in the background (don't block the response)
      extractSoulData(sessionId, message, finalContent, source, contactName, ownerFlag, toolResults).catch((err: any) => {
        console.error('[Soul] Background extraction failed:', err.message);
      });

      return {
        content: finalContent,
        toolCalls: toolResults,
        usage: lastUsage,
        model: currentConfig.llmModel,
        duration: Date.now() - startTime,
        attachments,
      };
    },

    async generate(systemPrompt: string, userMessage: string): Promise<string> {
      const client = createLLMClient();
      try {
        const completion = await client.chat.completions.create({
          model: currentConfig.llmModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: currentConfig.temperature,
          max_tokens: currentConfig.maxTokens,
          // No tools — pure text generation
        });
        return completion.choices[0]?.message?.content || '';
      } catch (err: any) {
        log.error('Agent', `Generate call failed: ${err.message}`);
        throw new Error(`LLM generate failed: ${err.message}`);
      }
    },

    getConfig(): AgentConfig {
      return { ...currentConfig };
    },

    updateConfig(updates: Partial<AgentConfig>): AgentConfig {
      currentConfig = { ...currentConfig, ...updates };

      // Derive flat LLM fields from the active provider
      if (currentConfig.llmProviders?.length > 0) {
        const activeProvider = currentConfig.llmProviders.find(
          p => p.id === currentConfig.defaultLlmProviderId
        ) || currentConfig.llmProviders.find(p => p.isDefault) || currentConfig.llmProviders[0];

        if (activeProvider) {
          currentConfig.llmBaseUrl = activeProvider.baseUrl;
          currentConfig.llmModel = activeProvider.model;
          currentConfig.llmApiKey = activeProvider.apiKey;
          currentConfig.defaultLlmProviderId = activeProvider.id;
        }
      }

      return { ...currentConfig };
    },

    getToolRegistry(): ToolRegistry {
      return toolRegistry;
    },

    getConversationStore(): ConversationStore {
      return conversationStore;
    },

    getMemoryStore(): MemoryStore {
      return memoryStore;
    },

    getSoul(): Soul {
      return soul;
    },
    
    switchAgent(sessionId: string, agentId: string | null): void {
      if (!agentId || agentId === 'main') {
        sessionAgents.delete(sessionId);
      } else {
        sessionAgents.set(sessionId, agentId);
      }
    },

    listAgents(): AgentDefinition[] {
      return Array.from(agents.values());
    },

    getAgentMarkdown(agentId: string): string | null {
      if (!workspacePath) return null;
      const filePath = path.join(workspacePath, 'agents', `${agentId}.agent.md`);
      if (!fs.existsSync(filePath)) return null;
      try {
        return fs.readFileSync(filePath, 'utf8');
      } catch (err: any) {
        console.error(`[Orchestrator] Error reading agent file ${filePath}:`, err.message);
        return null;
      }
    },

    saveAgentMarkdown(agentId: string, content: string): void {
      if (!workspacePath) return;
      const agentsDir = path.join(workspacePath, 'agents');
      if (!fs.existsSync(agentsDir)) fs.mkdirSync(agentsDir, { recursive: true });
      
      const filePath = path.join(agentsDir, `${agentId}.agent.md`);
      try {
        fs.writeFileSync(filePath, content, 'utf8');
        // Reload the agent definition using the already imported function
        const loadedAgents = loadAgentDefinitions(workspacePath);
        const updatedAgent = loadedAgents.find(a => a.id === agentId);
        if (updatedAgent) {
          agents.set(agentId, updatedAgent);
          console.log(`[Orchestrator] 🔄 Reloaded specialized agent: ${agentId}`);
        }
      } catch (err: any) {
        console.error(`[Orchestrator] Error writing agent file ${filePath}:`, err.message);
      }
    },
  };
}
