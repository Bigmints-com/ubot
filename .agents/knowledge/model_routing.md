# Model Routing & Vertex AI Orchestration

*Added: March 2026. Covers per-purpose model routing, Vertex AI auth, and the Gemini 2.5 migration.*

## Overview

UBOT uses a **purpose-based model routing** system that maps specific tasks to the optimal model. Each "purpose" (chat, router, generation, vision, etc.) can be independently assigned a model, overriding the provider's default.

## Purpose Keys

Defined in `src/engine/types.ts` as `ModelPurpose`:

| Purpose | Use | Default (Vertex) |
|---|---|---|
| `chat` | Primary conversation | `google/gemini-2.5-flash` |
| `router` | Tool/intent classification | `google/gemini-2.5-flash-lite` |
| `generation` | Long-form content generation | `google/gemini-2.5-pro` |
| `vision` | Image/media analysis | `google/gemini-2.5-flash` |
| `embedding` | Semantic search / memory | (provider default) |

Defaults per provider are defined in `DEFAULT_PROVIDER_MODELS` in `types.ts`.

## Config Structure (`~/.ubot/config.json`)

```json
{
  "capabilities": {
    "models": {
      "providers": {
        "vertex": {
          "enabled": true,
          "baseUrl": "https://aiplatform.googleapis.com/v1beta1/projects/<PROJECT_ID>/locations/global/endpoints/openapi",
          "model": "google/gemini-2.5-flash",
          "authType": "vertex-sa",
          "credentialsPath": "~/.ubot/vertex-credentials.json",
          "models": {
            "chat": "google/gemini-2.5-flash",
            "router": "google/gemini-2.5-flash-lite",
            "generation": "google/gemini-2.5-pro",
            "vision": "google/gemini-2.5-flash"
          }
        }
      }
    }
  }
}
```

## Vertex AI Authentication (`src/engine/vertex-auth.ts`)

Vertex AI uses **OAuth2 service account JWT exchange** — not static API keys.

1. Loads `vertex-credentials.json` (Google service account JSON) from `~/.ubot/`
2. Signs a JWT with `RS256` using the private key
3. Exchanges the JWT for a short-lived OAuth2 bearer token at `https://oauth2.googleapis.com/token`
4. Tokens are **cached for 55 minutes** (1-hour TTL minus a 5-minute buffer)

```typescript
// src/engine/vertex-auth.ts
getVertexAccessToken() → Promise<string>
getVertexBaseUrl(projectId, region) → string
```

The orchestrator calls `getVertexAccessToken()` for every LLM call when `authType === 'vertex-sa'`.

## Endpoint: Global vs Regional

**Critical:** Use the **global** endpoint, not regional, to access the full Gemini 2.5 model catalog:

```
✅ https://aiplatform.googleapis.com/v1beta1/projects/<id>/locations/global/endpoints/openapi
❌ https://us-central1-aiplatform.googleapis.com/v1/.../openapi  (limited models)
```

## `getModelForPurpose()` Utility

```typescript
// src/engine/types.ts
getModelForPurpose(provider: ProviderConfig, purpose: ModelPurpose): string
```

Priority order:
1. `provider.models[purpose]` (user-defined per-purpose override)
2. `provider.model` (provider-level default)
3. `DEFAULT_PROVIDER_MODELS[provider.type][purpose]` (hardcoded seed)

## Model Routing Card UI

The **Models** page (`/llms`) includes a `ModelRoutingCard` component (`web/components/model-routing-card.tsx`) that lets users assign specific models per purpose via dropdowns. Changes are saved to `config.json` immediately.

## Usage Metering (`src/engine/metering.ts`)

Every LLM call records token usage:

```typescript
meter.record(model, purpose, providerId, promptTokens, completionTokens)
meter.getSummary() → { totalCalls, totalTokens, byModel, byPurpose }
```

Metering is in-memory per session and surfaced via the dashboard.
