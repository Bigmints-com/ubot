# Registry: Skills & Automations

A catalog of automated workflows that allow Ubot to react to events without manual prompts.

## 1. Automation Model

All skills follow the **Trigger → Processor → Outcome** pipeline.

## 2. Common Skill Templates

### 🕒 Daily Briefing

- **Trigger**: `cron:tick` (Every morning at 8:00 AM).
- **Processor**: Search for top news and calendar events, then summarize into a "Good Morning" message.
- **Outcome**: `send_message` to the owner.

### 📬 Smart Responder

- **Trigger**: `whatsapp:message`.
- **Condition**: "When someone asks about my availability."
- **Processor**: Multi-stage pipeline:
  1. `tool:google_calendar_list_events`
  2. `prompt: "Based on these events, suggest a time..."`
- **Outcome**: `reply`.

### 🗃️ Auto-Archiver

- **Trigger**: `email:received`.
- **Condition**: "If the email is a receipt or invoice."
- **Processor**: `tool:files_write_file` to `workspace/finances/`.
- **Outcome**: `silent`.

## 3. Advanced Workflow Pipelines

Project Nexus enabled multi-stage workflows. A single skill can now chain multiple "Processors" together, passing variables like `{{stage_1.result}}` to `stage_2`. This allows for complex logic such as:

1.  **Stage 1 (Search)**: Gather raw data.
2.  **Stage 2 (Analyze)**: LLM processing of the raw data.
3.  **Stage 3 (Execute)**: Tool call based on the analysis.
4.  **Stage 4 (Notify)**: Final confirmation to the user.
