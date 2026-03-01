# Data Interchange & Schemas

To ensure interoperability between messaging platforms, the orchestrator, and tools, Ubot uses a set of standardized JSON schemas for all data exchange.

## 1. SkillEvent (Input Normalization)

Adapters normalize all incoming events into this common structure:

```json
{
  "source": "whatsapp",
  "type": "message",
  "from": "+971569737344",
  "body": "Check my schedule",
  "timestamp": "2026-02-25T13:30:55Z",
  "data": {
    "isGroup": false,
    "senderName": "Pretheesh"
  }
}
```

## 2. ToolCall (Agent Intent)

The Orchestrator communicates intent to the Tool Registry using this format:

```json
{
  "toolName": "google_calendar_list_events",
  "arguments": {
    "startTime": "2026-02-25T00:00:00Z",
    "endTime": "2026-02-25T23:59:59Z"
  }
}
```

## 3. ToolExecutionResult (Capability Feedback)

Tools return results in a uniform success/error wrapper:

```json
{
  "toolName": "google_calendar_list_events",
  "success": true,
  "result": "You have 3 meetings today...",
  "duration": 450
}
```

## 4. SafetyCheckResult (Moderation Output)

The safety layer evaluates every interaction before final execution:

```json
{
  "safe": true,
  "score": 0.95,
  "violations": [],
  "actions": ["allow"],
  "metadata": {
    "rulesApplied": 12,
    "contentLength": 180
  }
}
```
