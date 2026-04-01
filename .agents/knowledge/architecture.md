# UBOT Architecture

## System Overview

UBOT is an extensible AI agent platform that runs as a single Node.js process.

```
┌─────────────────────────────────────────────────────┐
│                    HTTP Server                       │
│  ┌──────────────────┐  ┌──────────────────────────┐ │
│  │  Next.js Frontend │  │  Backend API             │ │
│  │  (web-ui/)        │  │  (src/)                  │ │
│  │  Port: config     │  │  Port: config            │ │
│  │  frontend_port    │  │  server.port             │ │
│  └──────────────────┘  └──────────────────────────┘ │
│                              │                       │
│  ┌──────────────────────────┐│┌────────────────────┐│
│  │     Agent Engine          ││   Custom Apps       ││
│  │  ┌──────────────────┐    │││  custom/apps/      ││
│  │  │  Orchestrator    │    │││  ├── manifest.ts   ││
│  │  │  Tool Router     │    │││  ├── auth/         ││
│  │  │  LLM Providers   │    │││  ├── theme/        ││
│  │  └──────────────────┘    │││  └── tools/        ││
│  └──────────────────────────┘│└────────────────────┘│
│                              │                       │
│  ┌──────────────────────────┐│┌────────────────────┐│
│  │   Channels               ││   Storage           ││
│  │   WhatsApp, Telegram     ││   SQLite / Null     ││
│  │   iMessage, Webchat      ││   Workspace (local) ││
│  └──────────────────────────┘│└────────────────────┘│
└─────────────────────────────────────────────────────┘
```

## Request Flow

1. HTTP request arrives at `server.port`
2. Extension middleware hook runs (if registered)
3. Auth gate checks credentials (mode-dependent: local password or SSO)
4. API routes handled by `src/api/index.ts`
5. Non-API requests proxied to Next.js frontend (dev) or served from build (prod)

## Deployment Modes

Configured via `server.mode` in config.json (env `UBOT_MODE` overrides):

| Mode | Storage | Channels | Use Case |
|------|---------|----------|----------|
| `local` | SQLite on disk | All (WhatsApp, Telegram, iMessage, Webchat) | Self-hosted on user machine |
| `cloud` | SQLite in volume | Telegram, Webchat | Single-tenant dedicated cloud |
| `cloud-shared` | NullDatabase | Telegram, Webchat | Multi-tenant SaaS |

## Config-Driven Architecture

**Everything is in `config.json`.** No behavior should be hardcoded outside config.

| What | Config Key | Default |
|------|-----------|---------|
| Backend port | `server.port` | 11490 |
| Frontend port | `server.frontend_port` | 3015 |
| Deploy mode | `server.mode` | local |
| Auth mode | `server.auth.mode` | local |
| Auth credentials | `server.auth.username/password` | admin / auto-generated |
| Database path | `database.path` | data/local/ubot.db |
| Workspace path | `workspace.path` | ./workspace |
| Custom apps dir | `apps_dir` | custom/apps |
| App name | `theme.app_name` | Ubot |
| Colors | `theme.colors.*` | shadcn defaults |

## Extension Points

UBOT is extensible via **Custom Apps** (backend) and **Frontend Extensions** (web-ui):

### Backend Extensions (Custom Apps)
Located in `custom/apps/<id>/manifest.ts`. Can provide:
- **Engine Hooks** — extra LLM providers, model routing, role resolution
- **Auth Plugin** — custom authentication (e.g., SSO)
- **Theme** — branding, colors, fonts, favicon
- **Navigation** — sidebar groups
- **Tool Modules** — new capabilities
- **API Routes** — custom endpoints

### Frontend Extensions
Located in `web-ui/lib/extensions.tsx`. Can provide:
- **ExtensionsLoader** — side-effect registrations at module load
- **useHomePageOverride** — custom dashboard component
- Sidebar items via `registerSidebarItems()`
- Breadcrumbs via `registerBreadcrumbRoutes()`
- Layout wrappers via `registerLayoutWrapper()`

## Fork Architecture

UBOT supports forks with zero upstream modification:

```
Upstream (read-only)          Fork (customizations only)
├── src/                      ├── src/     (synced from upstream)
├── web-ui/                   ├── web-ui/  (synced from upstream)
│   ├── lib/extensions.tsx    │   ├── lib/extensions.tsx   ← OVERRIDE
│   └── ...                   │   ├── lib/fork-extensions.tsx ← NEW
│                             │   └── ...
├── custom/apps/              ├── custom/apps/
│   └── (empty)               │   └── myapp/manifest.ts   ← NEW
└── config.json               └── config.json             ← DIFFERENT
```

Only these files differ between upstream and a fork:
1. `config.json` — different auth, theme, ports
2. `web-ui/lib/extensions.tsx` — imports fork-specific extensions
3. `web-ui/lib/<fork>-extensions.tsx` — sidebar/breadcrumb registrations
4. `custom/apps/<id>/` — backend app manifest, hooks, tools
