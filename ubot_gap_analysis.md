# UBOT Gap Analysis: Current State vs The Vision

## The Vision
An autonomous, multi-agent, sub-agent tool that can receive a complex instruction like *"write an article about X, publish it on Substack, cross-post to LinkedIn"* and just **do it** — reliably, every time, without human intervention.

## The Reality (Updated 2026-03-27)
A single-agent loop with a **middleware pipeline** that provides retry, circuit-breaking, and logging. It calls tools sequentially, recovers from failures, tracks progress, and schedules follow-ups. Significant progress since initial analysis, but still single-agent.

---

## Gap 1: Single-Agent, Not Multi-Agent

> [!CAUTION]
> This is the biggest architectural gap. Everything else flows from it.

**What exists:** One `AgentOrchestrator` with one LLM loop. It calls one tool at a time, waits for the result, then decides what to do next. There's no concept of delegation, parallel execution, or specialized agents for different domains.

**What's been added:**
- ✅ `SubagentRunner` — can spawn isolated background sub-tasks with timeout protection
- ❌ No task decomposition planner
- ❌ No parallel execution
- ❌ No agent specialization

**Status: 🔴 15% complete** — foundation exists (`SubagentRunner`), but no orchestration layer on top.

---

## Gap 2: Fire-and-Forget Execution (No Task Persistence)

**What exists now:**
- ✅ `write_todos` — in-memory progress tracking for multi-step tasks (verified working with `pending → in_progress → completed/failed` lifecycle)
- ✅ `schedule_followup` — schedule delayed messages to come back to the user
- ✅ **Async API mode** — `POST /api/chat {async: true}` returns `202 Accepted` with a `jobId`, client polls `GET /api/chat/job/:id` for results. Prevents HTTP timeouts on 30-75s multi-tool chains.
- ✅ Iteration limit raised to 25 (handles longer chains)

**What's still missing:**
- ❌ **SQLite persistence** — todos and jobs are in-memory, lost on restart
- ❌ **Cross-turn continuation** — if a task needs more than 25 iterations, it stops
- ❌ **Resume-on-failure** — if Chrome crashes mid-task, no auto-recovery

**Status: 🟡 40% complete** — progress tracking and async API work in production. Persistence layer needed.

---

## Gap 3: Infrastructure Fragility

| Issue | Root Cause | Status |
|-------|-----------|--------|
| Chrome dies silently | Launched ad-hoc, no process supervision | ✅ Fixed (systemd) |
| CDP config lost on deploy | `make update` overwrites config.json | ✅ Fixed (merge, not overwrite) |
| Playwright launches own browser | `--cdp-endpoint` missing from args | ✅ Fixed |
| Playwright MCP times out | Default 30s too short for heavy pages | ✅ Fixed (60s) |
| No health checks | Nothing monitors Chrome, Playwright, or UBOT | ❌ Not addressed |
| Config protection | Deploy should NEVER overwrite CDP/MCP settings | ✅ Fixed (config merge preserves existing values) |

**Status: 🟢 70% complete** — all critical infra issues fixed. Health monitoring loop still needed.

---

## Gap 4: Memory Poisoning Loop

**What happened:** The `SUMMARY_UPDATE_PROMPT` told the model to "preserve tool outcomes" in the chat digest. When a tool failed, that failure got recorded permanently. Self-reinforcing failure loop.

**What's fixed:**
- ✅ Prompt now says "never record failures"
- ✅ Tool failure messages are explicit: *"do NOT tell the user it succeeded. Report the actual error."*
- ✅ `write_todos` correctly tracks `failed` status (verified in production logs)

**What's still needed:**
- ❌ Separate memory layers (facts / task state / error log)
- ❌ Memory validation before injection
- ❌ Expiring error memories

**Status: 🟡 35% complete** — band-aids work, but no structural fix to memory architecture.

---

## Gap 5: Model-Prompt Coupling

**Status: 🟡 30% complete**

**What's been done:**
- ✅ ToolSelector — lightweight classifier (Flash-Lite) runs BEFORE the main LLM to route tools, reducing context by ~11K tokens
- ✅ Better structured system prompt with explicit tool routing rules

**What's still missing:**
- ❌ Prompt management — prompts still hardcoded in TypeScript
- ❌ No behavioral test suite
- ❌ No runtime A/B testing

---

## Gap 6: No Tool Execution Observability

**Status: ✅ 85% complete**

**What's been built:**
- ✅ **LoggingMiddleware** — every tool call logged with `✓/✗`, timing, and args
- ✅ **Turn Summary** — `Turn Summary: 8 iterations, 7 tool calls (✓ 6, ✗ 1)` after every turn
- ✅ **Failed Tools log** — explicit listing of which tools failed and why
- ✅ **Error diagnostics** — `web_fetch` now extracts `err.cause` for actionable messages (`UND_ERR_SOCKET`, `ECONNRESET` instead of just "fetch failed")
- ✅ **Token cost tracking** — token usage shown per message in web UI
- ✅ **Tool badges** — visible in web UI showing which tools were called
- ✅ **Thread auto-naming** — threads named from first message content

**Remaining:**
- ❌ Dashboard-level tool analytics (most used, most failed, avg latency)
- ❌ Task replay for debugging

---

## Gap 7: No Error Recovery Strategy

**Status: ✅ 80% complete**

**What's been built (verified with E2E edge case tests):**
- ✅ **RetryMiddleware** — exponential backoff for transient failures. Verified: `Retrying web_fetch (attempt 1/2): fetch failed (UND_ERR_SOCKET)` → `(attempt 2/2)` → give up
- ✅ **CircuitBreakerMiddleware** — monitors tool health, opens circuit after 3 consecutive failures
- ✅ **Pipeline continues after failures** — confirmed: 10 tool calls in single turn, continued past web_fetch failure
- ✅ **Error classification** — transient errors (socket, timeout) trigger retry; permanent errors (auth, 404) don't
- ✅ **Explicit failure reporting** — agent uses `"failed"` status in todos, provides error evidence

**Remaining:**
- ❌ Fallback strategies (if browser fails, offer manual alternative)
- ❌ Auto-recovery (restart Chrome if CDP drops)

---

## Prioritized Roadmap (Updated)

### Phase 1: Make What Exists Reliable ~~(1-2 weeks)~~ ✅ 90% DONE
1. ~~Fix tool routing (create_skill vs browser)~~ ✅ Done
2. ~~Fix iteration limits~~ ✅ Done  
3. ~~Fix Chrome infrastructure~~ ✅ Done (systemd)
4. Add health monitoring loop (Chrome CDP, Playwright, LLM) — ❌ remaining
5. ~~Add structured tool execution logging~~ ✅ Done (LoggingMiddleware)
6. ~~Protect config.json from deploy overwrites~~ ✅ Done (merge strategy)
7. ~~Add retry logic for transient tool failures~~ ✅ Done (RetryMiddleware)
8. ~~Add circuit breaker~~ ✅ Done (CircuitBreakerMiddleware)
9. ~~Fix error diagnostics~~ ✅ Done (web_fetch cause extraction)
10. ~~Thread auto-naming~~ ✅ Done
11. ~~Async API for long chains~~ ✅ Done

### Phase 2: Task Persistence (2-3 weeks) — 🟡 40% DONE
1. ✅ In-memory todo tracking (write_todos + TodoStore)
2. ✅ Async API with job polling (POST async → GET job/:id)
3. ❌ SQLite-backed persistence for todos, jobs, and subagent results
4. ❌ Long-running tasks that continue across agent turns
5. ❌ Resume-on-failure for browser workflows

### Phase 3: Multi-Agent Architecture (4-6 weeks) — 🔴 15% DONE
1. ✅ SubagentRunner foundation (isolated background tasks)
2. ❌ Task decomposition planner
3. ❌ Specialized agent types (BrowserAgent, WritingAgent, SocialAgent)
4. ❌ Agent-to-agent delegation
5. ❌ Parallel sub-task execution
6. ❌ Result aggregation and reporting

### Phase 4: Self-Improving System (ongoing) — 🔴 5% DONE
1. ❌ Behavioral test suite (50+ known requests → expected tool calls)
2. ❌ Prompt A/B testing
3. ❌ Tool usage analytics (which tools fail most, average latency)
4. ❌ Auto-generate skills from successful manual workflows

---

## Edge Case Test Results Summary

All 10 edge case tests pass (2026-03-27):
| Test | Result |
|------|--------|
| Empty message | ✅ HTTP 400 |
| Missing field | ✅ HTTP 400 |
| Invalid JSON | ✅ Handled |
| Bad URL browse | ✅ Error recovery |
| Schedule + evidence | ✅ ID returned |
| Concurrent requests | ✅ No cross-contamination |
| Invalid tool params | ✅ Rejected with clear message |
| Multi-tool chain w/ errors | ✅ 10 tools, continued past failures |
| RetryMiddleware | ✅ 2 retries with backoff |
| Error recovery chain | ✅ 7 tools, all steps completed |

---

## Updated Bottom Line

UBOT has evolved from a **fragile single-agent loop** to a **reliable middleware-hardened orchestrator**. It now:
- Retries transient failures with exponential backoff
- Tracks progress with accurate status (`failed` vs `completed`)
- Handles multi-tool chains (10+ tools in a single turn, 74s)
- Provides async API for long-running tasks
- Auto-names threads for usability
- Logs every tool call with diagnostic detail

**The next frontier is Phase 2 (SQLite persistence)** — making todos, jobs, and subagent results survive restarts. After that, Phase 3 (multi-agent) becomes feasible because the reliability foundation is now solid.
