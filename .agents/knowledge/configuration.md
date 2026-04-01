# Configuration Reference

All UBOT behavior is driven by `config.json`. See `config.reference.jsonc` for the full annotated reference.

## File Location

UBOT looks for config in this order:
1. `$UBOT_HOME/config.json` (if `UBOT_HOME` env var is set)
2. `./config.json` (current working directory)

## Quick Reference

### Server

```json
{
  "server": {
    "port": 4081,
    "frontend_port": 4080,
    "mode": "local",
    "auth": {
      "mode": "local",
      "username": "admin",
      "password": "your-password"
    }
  }
}
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `port` | number | 11490 | Backend API port |
| `frontend_port` | number | 3015 | Next.js dev server port |
| `mode` | string | `local` | Deployment mode: `local`, `cloud`, `cloud-shared` |
| `auth.mode` | string | `local` | Auth mode: `local` (password) or `sso` (external) |
| `auth.username` | string | `admin` | Local login username |
| `auth.password` | string | auto-gen | Local login password. Auto-generated on first boot if missing |
| `auth.provider` | string | — | SSO provider name (sso mode only) |
| `auth.auth_url` | string | — | SSO login URL (sso mode only) |
| `auth.cookie_name` | string | `session` | SSO cookie name (sso mode only) |

### Theme / Branding

```json
{
  "theme": {
    "app_name": "Ubot",
    "description": "AI Agent Platform",
    "logo_url": "/logo.svg",
    "favicon_url": "/favicon.ico",
    "colors": {
      "primary": "217 91% 60%",
      "background": "240 10% 3.9%",
      "foreground": "0 0% 98%",
      "sidebar": "240 5.9% 10%",
      "accent": "240 3.7% 15.9%",
      "border": "240 3.7% 15.9%"
    },
    "fonts": {
      "heading": "Inter",
      "body": "Inter"
    }
  }
}
```

Theme is applied at runtime by `ThemeInjector` component. Custom app themes override config.json theme.

### Workspace

```json
{
  "workspace": {
    "provider": "local",
    "path": "./workspace"
  }
}
```

### Database

```json
{
  "database": {
    "path": "data/local/ubot.db"
  }
}
```

### Custom Apps Directory

```json
{
  "apps_dir": "custom/apps"
}
```

### LLM Providers

```json
{
  "capabilities": {
    "models": {
      "enabled": true,
      "default": "gemini",
      "providers": {
        "gemini": {
          "enabled": true,
          "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai/",
          "apiKey": "YOUR_API_KEY",
          "model": "models/gemini-2.0-flash"
        },
        "ollama": {
          "enabled": true,
          "baseUrl": "http://localhost:11434/v1",
          "model": "llama3.2:3b"
        }
      }
    }
  }
}
```

## Auth Behavior

### Local Mode (default)
- If `auth.password` is missing → auto-generated on first boot, saved to config.json, printed to console
- Frontend shows `LoginScreen` component
- API endpoints gated by session cookie or Bearer token

### SSO Mode
- No local password gate
- Frontend middleware handles redirect to `auth.auth_url`
- Backend extension hook validates SSO session cookies
- `/api/auth/status` returns `authMode: "sso"`

## Environment Variable Overrides

| Env Var | Overrides | Priority |
|---------|-----------|----------|
| `UBOT_MODE` | `server.mode` | Highest |
| `UBOT_HOME` | Config file location | Highest |
| `DEV_FRONTEND_PORT` | `server.frontend_port` | Falls back to config |
| `NODE_ENV` | Production detection | — |
