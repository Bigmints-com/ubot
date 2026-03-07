# Maintenance & Operations Guide

A guide for "Day 2" operations, ensuring the health, durability, and evolution of a Ubot instance.

## 1. Build & Deploy

```bash
cd ~/Projects/ubot/ubot-core
npm run build                          # Compiles TypeScript → dist/
cp -R dist/* ~/.ubot/lib/             # Deploy to production
kill $(pgrep -f "node.*ubot/lib")     # Stop old process
sleep 2
cd ~/.ubot && UBOT_HOME=$HOME/.ubot NODE_ENV=production \
  nohup node ~/.ubot/lib/index.js >> ~/.ubot/logs/ubot.log 2>&1 &
```

## 2. Monitoring

- **Logs**: `tail -f ~/.ubot/logs/ubot.log | grep -v "GET /api/"`
- **Tool count**: `grep "tools total" ~/.ubot/logs/ubot.log | tail -1`
- **Visitor tool count**: `grep "Tools available" ~/.ubot/logs/ubot.log | tail -5` (should be 11 for visitor, 131+ for owner)
- **Skill matching**: `grep "SkillEngine" ~/.ubot/logs/ubot.log | tail -20`
- **Message flow**: `grep "Unified\|RateLimiter" ~/.ubot/logs/ubot.log | tail -20`

## 3. Debugging Common Issues

### Tool not found (visitor session)

If a skill fails with "Unknown tool: X", add the tool to `VISITOR_SAFE_TOOL_NAMES` in `src/engine/tools.ts`.

### JID decode error

If `wa_respond_to_bot` fails with "Cannot destructure property 'user' of jidDecode(...)", the JID isn't normalized. The tool should handle this automatically, but verify the `to` parameter includes `@s.whatsapp.net`.

### LLM hallucinating tool calls

If log shows `0 tool calls` but the response text contains `[Used tools: ...]`, the LLM is writing tool names as text instead of using structured function calling. This often happens after repeated tool failures — fix the underlying tool error.

### Skill not firing

Check the two-phase matching:

1. Phase 1: `grep "Phase 1" ~/.ubot/logs/ubot.log` — are candidates found?
2. Phase 2: `grep "Phase 2" ~/.ubot/logs/ubot.log` — does the condition match?

## 4. Skill Management

Skills are file-based in `~/.ubot/skills/<skill-name>/SKILL.md`. To add/edit/remove:

- Create: `mkdir ~/.ubot/skills/my-skill && vim ~/.ubot/skills/my-skill/SKILL.md`
- Edit: Modify the SKILL.md file directly — changes are picked up automatically on next event
- Delete: Remove the directory

## 5. Backup & Recovery

All critical state resides in `~/.ubot/`:

- `config.json` — System configuration
- `skills/` — All skill definitions (SKILL.md files)
- `sessions/` — WhatsApp auth session data
- `data/ubot.db` — SQLite database (conversations, contacts, memories)
- `lib/` — Compiled JavaScript (can be regenerated from source)

## 6. Knowledge Maintenance Rule

> **When adding or removing tools, always update `/.agents/knowledge/registry_tools.md`** with the tool name, parameters, and description. This is the canonical reference and must stay in sync with the codebase.
