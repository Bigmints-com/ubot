---
description: How to build and deploy UBOT changes to the runtime
---

# Deploy UBOT Changes

> **IMPORTANT**: `npm run build` only compiles to `ubot-core/dist/`.
> The runtime loads from `~/.ubot/lib/`. You MUST run `make update`
> to deploy changes, or they will NOT take effect.

## Steps

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

## First-time Install

If Ubot hasn't been installed yet, use `make install` instead:

```bash
cd /Users/pretheesh/Projects/ubot && make install
```

## Common Mistake

**DO NOT** just run `npm run build` or `npx tsc` and then `ubot restart`.
That only rebuilds to `dist/` — the runtime still uses old code from `~/.ubot/lib/`.

Always use `make update` for deploying code changes.
