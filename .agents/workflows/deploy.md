---
description: How to build and deploy UBOT changes to the runtime
---

# Deploy UBOT Changes

> **IMPORTANT**: `npm run build` only compiles to `ubot-core/dist/`.
> The runtime loads from `~/.ubot/lib/`. You MUST run `make update`
> to deploy changes, or they will NOT take effect.

## Deploy Locally

1. From the project root, run `make update` — this builds, copies to `~/.ubot/lib/`, and auto-restarts if running:
   // turbo

```bash
cd /Users/pretheesh/Projects/ubot && make update
```

2. If prompted about Full Disk Access, type `N` to skip.

3. Verify the server restarted:
   // turbo

```bash
ubot logs | tail -5
```

## Deploy to Remote Server (via `ubot-server` SSH alias)

The remote server uses SSH alias `ubot-server` (configured in `~/.ssh/config`).
SSH key auth is set up — no password required.

1. Build locally first:
   // turbo

```bash
cd /Users/pretheesh/Projects/ubot && npm run build --prefix ubot-core
```

2. Sync the compiled lib to the remote server:
   // turbo

```bash
rsync -az /Users/pretheesh/Projects/ubot/ubot-core/dist/ ubot-server:/root/.ubot/lib/
```

3. Sync config and credentials (if changed):
   // turbo

```bash
rsync -az ~/.ubot/config.json ~/.ubot/vertex-credentials.json ubot-server:/root/.ubot/
```

4. Restart on remote:
   // turbo

```bash
ssh ubot-server "export PATH=\$PATH:/root/.local/bin && ubot restart"
```

5. Verify:
   // turbo

```bash
ssh ubot-server "ubot logs | tail -10"
```

## First-time Install

If Ubot hasn't been installed yet, use `make install` instead:

```bash
cd /Users/pretheesh/Projects/ubot && make install
```

## Common Mistake

**DO NOT** just run `npm run build` or `npx tsc` and then `ubot restart`.
That only rebuilds to `dist/` — the runtime still uses old code from `~/.ubot/lib/`.

Always use `make update` for local deploys, or the rsync steps above for remote.
