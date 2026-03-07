/**
 * Follow-Up Checker
 *
 * Periodic service that checks for due follow-ups and executes them.
 * When a follow-up is due, it spawns an agent session with the conversation
 * context, allowing the agent to decide the best way to follow up.
 */

import type { FollowUpStore, FollowUp } from '../../memory/followups.js';

interface FollowUpCheckerDeps {
  followUpStore: FollowUpStore;
  /** The orchestrator's chat function */
  chat: (sessionId: string, message: string, source: string, contactName?: string, isOwner?: boolean) => Promise<any>;
  /** Send a message via a specific channel */
  sendMessage?: (channel: string, contactId: string, message: string) => Promise<boolean>;
}

let checkInterval: ReturnType<typeof setInterval> | null = null;
const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Start the periodic follow-up checker.
 * Scans for due follow-ups every 15 minutes and processes them.
 */
export function startFollowUpChecker(deps: FollowUpCheckerDeps): () => void {
  console.log('[FollowUpChecker] Starting periodic follow-up checker (every 15 min)');

  // Run immediately once, then on interval
  processFollowUps(deps).catch(err => {
    console.error('[FollowUpChecker] Initial check failed:', err.message);
  });

  checkInterval = setInterval(() => {
    processFollowUps(deps).catch(err => {
      console.error('[FollowUpChecker] Periodic check failed:', err.message);
    });
  }, CHECK_INTERVAL_MS);

  return () => {
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
      console.log('[FollowUpChecker] Stopped');
    }
  };
}

/**
 * Process all due follow-ups.
 */
async function processFollowUps(deps: FollowUpCheckerDeps): Promise<void> {
  const dueFollowUps = deps.followUpStore.getDue();
  if (dueFollowUps.length === 0) return;

  console.log(`[FollowUpChecker] Found ${dueFollowUps.length} due follow-up(s)`);

  // Process in priority order (getDue already returns sorted by priority DESC, date ASC)
  for (const followUp of dueFollowUps) {
    try {
      await processOneFollowUp(followUp, deps);
    } catch (err: any) {
      console.error(`[FollowUpChecker] Failed to process follow-up ${followUp.id}:`, err.message);
      // Reschedule for 30 minutes later after failure
      const retryAt = new Date(Date.now() + 30 * 60 * 1000);
      deps.followUpStore.recordAttempt(followUp.id, retryAt);
    }
  }
}

/**
 * Process a single follow-up by spawning an agent session.
 */
async function processOneFollowUp(followUp: FollowUp, deps: FollowUpCheckerDeps): Promise<void> {
  console.log(`[FollowUpChecker] Processing follow-up ${followUp.id}: "${followUp.reason}" for ${followUp.contactId}`);

  // Build the agent prompt with full context
  const prompt = buildFollowUpPrompt(followUp);
  const sessionId = `followup-${followUp.id}-${Date.now()}`;

  try {
    // Spawn an agent session to handle the follow-up
    const result = await deps.chat(sessionId, prompt, 'web', 'follow-up-agent', true);
    const response = result.content || '';

    // Check if the agent determined the follow-up should be sent
    if (response.toLowerCase().includes('[no_action_needed]')) {
      // Agent decided no follow-up is needed — mark as completed
      deps.followUpStore.complete(followUp.id, 'Agent determined no follow-up needed: ' + response.slice(0, 200));
      console.log(`[FollowUpChecker] Follow-up ${followUp.id} — no action needed`);
    } else if (response.toLowerCase().includes('[reschedule]')) {
      // Agent wants to reschedule — push back by an hour
      const nextAt = new Date(Date.now() + 60 * 60 * 1000);
      deps.followUpStore.recordAttempt(followUp.id, nextAt);
      console.log(`[FollowUpChecker] Follow-up ${followUp.id} rescheduled to ${nextAt.toISOString()}`);
    } else {
      // Agent produced a follow-up message — record attempt
      // The agent should have used send_message tool to actually send the message
      // We just track the attempt
      const hasMoreAttempts = deps.followUpStore.recordAttempt(followUp.id);
      if (!hasMoreAttempts) {
        console.log(`[FollowUpChecker] Follow-up ${followUp.id} expired after ${followUp.maxAttempts} attempts`);
      } else {
        // Reschedule for next check based on priority
        const delayMs = getRetryDelay(followUp);
        const nextAt = new Date(Date.now() + delayMs);
        deps.followUpStore.recordAttempt(followUp.id, nextAt);
        console.log(`[FollowUpChecker] Follow-up ${followUp.id} attempt recorded, next check at ${nextAt.toISOString()}`);
      }
    }
  } catch (err: any) {
    console.error(`[FollowUpChecker] Agent session failed for follow-up ${followUp.id}:`, err.message);
    // Reschedule
    const retryAt = new Date(Date.now() + 30 * 60 * 1000);
    deps.followUpStore.recordAttempt(followUp.id, retryAt);
  }
}

/**
 * Build a prompt for the follow-up agent session.
 */
function buildFollowUpPrompt(followUp: FollowUp): string {
  return `You are following up on a conversation that needs closure.

## Follow-Up Details
- **Follow-Up ID:** ${followUp.id}
- **Contact:** ${followUp.contactId} (via ${followUp.channel})
- **Reason:** ${followUp.reason}
- **Priority:** ${followUp.priority}
- **Attempt:** ${followUp.attempts + 1}/${followUp.maxAttempts}
- **Originally scheduled at:** ${followUp.followUpAt.toISOString()}
- **Created:** ${followUp.createdAt.toISOString()}

## Conversation Context
${followUp.context}

## Instructions
1. Review the context and determine the best course of action.
2. If the issue has already been resolved (check recent messages using search_messages), respond with [NO_ACTION_NEEDED] and explain why.
3. If you need more time (e.g., owner still hasn't responded to the original ask_owner), respond with [RESCHEDULE] and explain why.
4. Otherwise, compose and send an appropriate follow-up message to the contact via ${followUp.channel} using the send_message tool.
5. After sending, use complete_followup with follow-up ID "${followUp.id}" to mark it as done.

## Follow-Up Message Guidelines
- Be natural and conversational — don't make it obvious this is an automated follow-up
- Reference the original conversation context
- If checking on a pending request: "Hi! Just following up on your earlier question about..."
- If delivering information: "Great news! I have an update regarding..."
- Keep it brief and actionable`;
}

/**
 * Get retry delay based on follow-up priority.
 */
function getRetryDelay(followUp: FollowUp): number {
  switch (followUp.priority) {
    case 'urgent':  return 30 * 60 * 1000;  // 30 minutes
    case 'high':    return 2 * 60 * 60 * 1000;  // 2 hours
    case 'normal':  return 4 * 60 * 60 * 1000;  // 4 hours
    case 'low':     return 24 * 60 * 60 * 1000; // 24 hours
    default:        return 4 * 60 * 60 * 1000;
  }
}
