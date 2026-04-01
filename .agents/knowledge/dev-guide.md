# Dev Guide

## Prerequisites

- Node.js >= 20
- pnpm (for SaveADay monorepo) or npm (for standalone UBOT)
- macOS recommended (for iMessage, Apple integrations)

## Quick Start (Upstream UBOT)

```bash
cd ubot-core
npm install
npm run dev          # Starts backend + frontend
```

Backend runs on `server.port` (config.json), frontend on `server.frontend_port`.

## Quick Start (SaveADay)

```bash
cd saveaday
pnpm install
./restart.sh         # Starts all apps (API, Auth, UBOT, Relay)
```

## Project Structure

```
ubot-core/
├── src/              # Backend TypeScript (compiled with tsc)
├── web-ui/           # Next.js frontend (compiled with Turbopack)
├── custom/           # Extension directory
│   ├── apps/         # Custom app manifests
│   ├── modules/      # Custom tool modules
│   └── themes/       # Theme overrides
├── workspace/        # User workspace (skills, soul, etc.)
├── data/             # SQLite database
├── config.json       # Runtime configuration
└── config.reference.jsonc  # Documented config reference
```

## Building

```bash
# Backend
npx tsc                    # Compile TypeScript

# Frontend
cd web-ui && npm run build # Production build

# Both
npm run build              # Full build
```

## Linting

```bash
cd web-ui && npm run lint  # Next.js ESLint
```

**Always lint before completing any task.**

## Deploying

```bash
# Cloud Run (SaveADay)
./scripts/deploy-app.sh ubot 8080 app.saveaday.ai
```

Production mode:
- Backend serves built frontend directly (no proxy)
- Single container: Next.js standalone + UBOT backend
- NullDatabase in `cloud-shared` mode

## Syncing Fork with Upstream

```bash
# From SaveADay monorepo
# Copy files that should be identical:
cp ubot-core/src/index.ts       saveaday/apps/ubot/src/index.ts
cp ubot-core/src/data/config.ts saveaday/apps/ubot/src/data/config.ts
cp ubot-core/src/lib/features.ts saveaday/apps/ubot/src/lib/features.ts
cp ubot-core/src/lib/app-loader.ts saveaday/apps/ubot/src/lib/app-loader.ts
cp ubot-core/web-ui/components/app-sidebar.tsx saveaday/apps/ubot/web-ui/components/app-sidebar.tsx
# ... etc
```

**Files that should NOT be synced** (fork-specific):
- `config.json`
- `web-ui/lib/extensions.tsx`
- `web-ui/lib/saveaday-extensions.tsx`
- `custom/apps/`

## Key Debugging

### "No login screen showing"
Check `/api/auth/status`:
```bash
curl http://localhost:4081/api/auth/status
# Should return: { "authRequired": true, "authMode": "local" }
```

### "Custom app not loading"
1. Check `deploymentModes` in manifest matches current `server.mode`
2. Check console for `[AppLoader]` messages
3. Verify `apps_dir` in config points to correct directory

### "Theme not applying"
1. Check `/api/app/theme` returns expected values
2. Check browser console for ThemeInjector errors
3. Custom app theme overrides config.json theme
