# Backend Architecture

## Entry Point

`src/index.ts` — single HTTP server handling:
- Auth gate (local password or SSO via extension)
- Auth endpoints (`/api/auth/status`, `/api/auth/login`, `/api/auth/logout`)
- API routing (`/api/*` → `src/api/index.ts`)
- Frontend proxy (dev mode) or static serving (production)
- WebSocket upgrade handling (webchat, HMR)

## Key Modules

```
src/
├── index.ts                # HTTP server, auth, routing
├── data/
│   ├── config.ts           # Config loading, types, resolveAuthConfig()
│   ├── database/           # SQLite / NullDatabase connections
│   ├── local-workspace.ts  # Filesystem workspace provider
│   └── workspace-provider.ts # WorkspaceProvider interface
├── engine/
│   ├── orchestrator.ts     # Multi-model orchestrator
│   ├── tool-router.ts      # Purpose-based tool routing
│   └── types.ts            # LLM provider types
├── lib/
│   ├── features.ts         # Feature flags, deployment mode
│   ├── app-loader.ts       # Custom app discovery and registration
│   └── custom-app.ts       # CustomApp, EngineHook, AuthPlugin interfaces
├── hooks/
│   └── extensions.ts       # Hook registry (middleware, workspace, etc.)
├── api/
│   ├── index.ts            # API route handler
│   └── middleware/
│       └── auth.ts         # API key authentication
├── tools/
│   └── types.ts            # ToolModule interface
└── channels/
    ├── whatsapp/
    ├── telegram/
    ├── imessage/
    └── webchat/
```

## Config Loading

```typescript
import { loadUbotConfig } from './data/config.js';
const config = loadUbotConfig(); // Cached after first call
```

Resolution order:
1. `$UBOT_HOME/config.json`
2. `./config.json`

## Auth System

### resolveAuthConfig()

Central function that normalizes auth settings:

```typescript
import { resolveAuthConfig } from './data/config.js';

const auth = resolveAuthConfig(config);
// auth.mode: 'local' | 'sso'
// auth.username, auth.password (local mode)
// auth.provider, auth.auth_url (sso mode)
```

Supports both new `server.auth` structure and deprecated flat `access_username`/`access_password`.

### Auto-Generation (Local Mode)

If `server.auth.mode` is `local` and no password is set:
1. Generate 16-char random password
2. Save to `config.json` under `server.auth`
3. Print to console with instructions

### SSO Mode

In SSO mode, the local auth gate is completely bypassed:
- No password checking
- No session cookies
- `/api/auth/status` returns `authMode: "sso"`
- Extension hook's auth plugin handles everything

## Custom App Loading

At startup, `loadCustomApps()` in `app-loader.ts`:

1. Scans `apps_dir` (default: `custom/apps/`)
2. For each dir, imports `manifest.ts`
3. Checks `deploymentModes` against current `MODE`
4. Registers engine hooks, auth plugin, theme, nav, tools via `registerHooks()`

## Theme API

`/api/app/theme` returns the active theme:

```json
{
  "theme": {
    "appName": "My App",
    "logoUrl": "/logo.svg",
    "colors": { "primary": "hsl(263 70% 58%)" }
  }
}
```

Resolution: Custom app theme → config.json `theme` → null

## Feature Flags

`/api/features` returns mode and feature flags:

```json
{
  "mode": "local",
  "features": {
    "whatsapp": true,
    "telegram": true,
    "ollama": true,
    "filesystem": true
  }
}
```

Feature values computed from deployment mode in `src/lib/features.ts`.
