# Glossary

## Core Concepts

| Term | Definition |
|------|-----------|
| **UBOT** | The AI Agent Platform core. Provides orchestrator, tools, channels, and dashboard. |
| **Config.json** | The single source of truth for all runtime configuration. |
| **Custom App** | A backend extension package in `custom/apps/<id>/` providing hooks, auth, theme, tools. |
| **Extension** | A frontend registration (sidebar items, breadcrumbs, layout wrappers). |
| **Mode** | Deployment mode: `local`, `cloud`, `cloud-shared`. Controls feature availability. |
| **Fork** | A downstream project (like SaveADay) that extends UBOT via config + extensions. |

## Backend

| Term | Definition |
|------|-----------|
| **Orchestrator** | The multi-model AI engine that routes user messages to tools. |
| **Tool Module** | A collection of tools exposed to the AI agent (e.g., CRM CRUD operations). |
| **Engine Hook** | Backend extension: extra LLM providers, model routing, role resolution. |
| **Auth Plugin** | Custom authentication handler (e.g., SSO). |
| **AppTheme** | Branding config: app name, logo, colors, fonts. |
| **WorkspaceProvider** | Abstraction for file storage (local filesystem or GCS). |
| **NullDatabase** | In-memory database used in `cloud-shared` mode (data is ephemeral). |
| **resolveAuthConfig()** | Function that normalizes auth settings from config.json. |

## Frontend

| Term | Definition |
|------|-----------|
| **ExtensionsLoader** | Component in layout that triggers side-effect registrations. |
| **ThemeInjector** | Component that applies theme (title, favicon, CSS vars) at runtime. |
| **AuthGate** | Component in layout-wrapper that enforces authentication. |
| **RegisterSidebarItems** | Function to inject items into existing sidebar groups. |
| **RegisterSidebarExtensions** | Function to add new sidebar groups at specific positions. |
| **useFeatures()** | Hook returning feature flags and deployment mode. |
| **useHomePageOverride()** | Hook returning custom dashboard component (null = default). |

## Channels

| Term | Definition |
|------|-----------|
| **WhatsApp** | Local-only channel via WhatsApp Web bridge. |
| **Telegram** | Bot channel via Telegram Bot API (all modes). |
| **iMessage** | Local-only channel via macOS Messages.app bridge. |
| **Webchat** | Embeddable web widget with WebSocket connection. |

## Skills

| Term | Definition |
|------|-----------|
| **Skill** | An automated pipeline: Trigger → Processor → Outcome. |
| **Trigger** | Event that activates a skill (message, email, cron, etc.). |
| **Processor** | Natural language instructions for the LLM. |
| **Outcome** | What happens with the result (reply, send, store, silent). |
