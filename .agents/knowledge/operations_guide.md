# Maintenance & Operations Guide

A guide for "Day 2" operations, ensuring the health, durability, and evolution of a Ubot instance.

## 1. Backup & Recovery

All critical state resides in the **Workspace** (`~/.ubot/workspace`).

- **Standard Backup**: Regularly archive the entire workspace directory. This includes personas, the identity soul, and the durable memory database.
- **Recovery**: Restoring the workspace to a new Ubot installation immediately restores the agent's personality and history.

## 2. System Monitoring

Ubot provides built-in tools for operational health:

- **`ubot logs -f`**: Real-time tailing of the engine logs.
- **Tool Registry Audit**: Periodically check the `duration` and `success` rates in the session logs to identify failing integrations or high-latency providers.

## 3. Migration (DB to Markdown)

As Ubot evolves, it moves more state into Markdown:

- **Auto-Sync**: The `Soul` module handles most migrations automatically by exporting SQLite records to `SOUL.md` on startup.
- **Manual Override**: If the filesystem and DB diverge, the filesystem (Markdown) is always treated as the **Primary Source of Truth** for identity.

## 4. Debugging Tool Failures

When an agent reports a tool failure:

1.  **Check Validation**: View logs for `WorkspaceGuard` violations. This usually means the LLM provided an invalid or out-of-bounds path.
2.  **Verify Context**: Ensure the active agent persona has the necessary tool module in its `# Tools` list.
3.  **Test in Isolation**: Use the `src/tools/test-helpers.ts` to run tool modules in a mock environment to verify their logic.

## 5. Engine Updates

- **Update Process**: Pull the latest code, run `make install`, then `ubot restart`. The Makefile handles building both backend and web UI, installing to `~/.ubot`, and merging config.
- **Database Migrations**: Ubot uses an idempotent "ensureTable" pattern (see `skill-repository.ts`). On startup, the engine automatically applies any necessary schema updates to the SQLite files.
- **Config Merging**: `make install` deep-merges `cli/default-config.json` into `~/.ubot/config.json`, adding new keys without overwriting existing values.
