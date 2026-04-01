# Building Custom Apps

Custom apps are the primary extension mechanism for UBOT. They let you add authentication, branding, navigation, backend tools, and API routes — all without modifying upstream code.

## Directory Structure

```
custom/apps/<app-id>/
├── manifest.ts          # Required: app declaration
├── engine-hooks.ts      # Optional: LLM provider overrides, RBAC
├── auth/
│   └── my-sso.ts        # Optional: custom auth plugin
├── routes/
│   └── navigation.ts    # Optional: sidebar nav groups
└── tools/
    └── index.ts         # Optional: tool modules
```

## Step 1: Create the Manifest

The manifest declares your app and opts into which features to provide:

```typescript
// custom/apps/myapp/manifest.ts
import type { CustomApp } from '../../../src/lib/custom-app.js';

const myApp: CustomApp = {
  id: 'myapp',
  name: 'My App',
  version: '1.0.0',

  // Optional: restrict to specific deployment modes
  // Modes: 'local' | 'cloud' | 'cloud-shared'
  // Omit to support all modes
  deploymentModes: ['local', 'cloud'],

  // Each of these is lazy-loaded only when needed
  engineHooks: () => import('./engine-hooks.js'),
  auth: () => import('./auth/my-sso.js'),
  theme: () => import('./theme.js'),
  navigation: () => import('./routes/navigation.js'),
  toolModules: [() => import('./tools/index.js')],
};

export default myApp;
```

## Step 2: Add a Theme

Themes control branding, colors, fonts, and favicon:

```typescript
// custom/apps/myapp/theme.ts
import type { AppTheme } from '../../../src/lib/custom-app.js';

const theme: AppTheme = {
  appName: 'My App',
  logoUrl: '/my-logo.svg',       // Place in web-ui/public/
  faviconUrl: '/my-favicon.ico',
  colors: {
    primary: 'hsl(263 70% 58%)',  // Purple brand
    background: 'hsl(240 10% 4%)',
    foreground: 'hsl(240 5% 96%)',
    sidebar: 'hsl(240 10% 6%)',
    accent: 'hsl(263 70% 20%)',
    border: 'hsl(240 5% 12%)',
  },
  fonts: {
    heading: 'Inter',
    body: 'Inter',
  },
};

export default theme;
```

**Alternative**: You can also set theme directly in `config.json` without a custom app:

```json
{
  "theme": {
    "app_name": "My App",
    "logo_url": "/my-logo.svg",
    "colors": {
      "primary": "hsl(263 70% 58%)"
    }
  }
}
```

Custom app themes take priority over config.json themes.

## Step 3: Add Engine Hooks

Engine hooks modify the AI agent's behavior:

```typescript
// custom/apps/myapp/engine-hooks.ts
import type { EngineHook } from '../../../src/lib/custom-app.js';

const hooks: EngineHook = {
  // Add extra LLM providers
  getExtraProviders() {
    return [
      {
        id: 'managed-gemini',
        name: 'Managed Gemini',
        baseUrl: 'https://api.myapp.com/v1/openai/',
        apiKey: process.env.MANAGED_API_KEY || '',
        model: 'gemini-2.0-flash',
      },
    ];
  },

  // Override default model routing
  getDefaultModelRouting() {
    return {
      chat: 'managed-gemini',
    };
  },

  // Custom role resolution (e.g., RBAC from your auth system)
  resolveRole(sessionId, source, isOwnerDetected) {
    // Return null to fall back to UBOT's default (owner/visitor)
    return null;
  },

  // Extra tool modules that the orchestrator should know about
  getExtraToolModules() {
    return {
      'myapp-crm': 'Manage contacts, leads, and customer data',
    };
  },

  // Modules that should always be loaded (not behind purpose routing)
  getAlwaysOnModules() {
    return ['myapp-crm'];
  },
};

export default hooks;
```

## Step 4: Add Auth Plugin

Auth plugins handle authentication for your deployment:

```typescript
// custom/apps/myapp/auth/my-sso.ts
import type http from 'http';
import type { AuthPlugin, AuthResult, SessionUser } from '../../../../src/lib/custom-app.js';

const ssoAuth: AuthPlugin = {
  // Only active in cloud modes
  modes: ['cloud', 'cloud-shared'],

  async authenticate(req: http.IncomingMessage): Promise<AuthResult | null> {
    const cookie = req.headers.cookie;
    // Parse your SSO session cookie
    // Return null to fall back to default auth
    return null;
  },

  getLoginUrl(returnTo?: string): string | null {
    const base = process.env.AUTH_URL || 'https://auth.myapp.com';
    return `${base}/login?returnTo=${encodeURIComponent(returnTo || '/')}`;
  },

  async validateSession(cookie: string): Promise<SessionUser | null> {
    // Validate the session token, return user info
    return null;
  },
};

export default ssoAuth;
```

## Step 5: Add Navigation

Navigation groups appear in the sidebar:

```typescript
// custom/apps/myapp/routes/navigation.ts
import type { NavGroup } from '../../../../src/lib/custom-app.js';

const navigation: NavGroup[] = [
  {
    title: 'My App',
    items: [
      { title: 'Dashboard', url: '/myapp', icon: 'LayoutGrid' },
      { title: 'Contacts', url: '/myapp/contacts', icon: 'Users' },
      { title: 'Settings', url: '/myapp/settings', icon: 'Settings' },
    ],
  },
];

export default navigation;
```

## Step 6: Add Tool Modules

Tool modules expose capabilities to the AI agent:

```typescript
// custom/apps/myapp/tools/index.ts
import type { ToolModule } from '../../../../src/tools/types.js';

const myToolModule: ToolModule = {
  id: 'myapp-crm',
  name: 'My App CRM',
  description: 'Manage contacts and customer relationships',

  tools: [
    {
      name: 'list_contacts',
      description: 'List all contacts',
      parameters: {},
      execute: async () => {
        // Your tool logic here
        return { contacts: [] };
      },
    },
  ],
};

export default myToolModule;
```

## Step 7: Frontend Extensions

Create frontend pages under `web-ui/app/myapp/` and register sidebar items:

```typescript
// web-ui/lib/myapp-extensions.tsx
"use client";

import { LayoutGrid } from "lucide-react";
import { registerSidebarItems } from "@/components/app-sidebar";
import { registerBreadcrumbRoutes } from "@/components/page-breadcrumb";

// Sidebar
registerSidebarItems('Capabilities', [
  { title: "My App", href: "/myapp", icon: LayoutGrid },
]);

// Breadcrumbs
registerBreadcrumbRoutes({
  "/myapp": "My App",
  "/myapp/contacts": "Contacts",
});

export function MyAppExtensionsLoader() {
  return null;
}
```

Then import in `web-ui/lib/extensions.tsx`:

```typescript
import { MyAppExtensionsLoader } from './myapp-extensions';

export function ExtensionsLoader() {
  return <MyAppExtensionsLoader />;
}
```

## Config for Custom Apps

Set the custom apps directory in config.json:

```json
{
  "apps_dir": "custom/apps"
}
```

Apps are auto-discovered at startup. Each subdirectory must have a `manifest.ts` (or `.js`) default export implementing `CustomApp`.

## Theme Resolution Order

1. **Custom app theme** (from `custom/apps/<id>/theme.ts`) — highest priority
2. **Config.json theme** (from `theme` section) — fallback
3. **UBOT defaults** — bare minimum (name: "Ubot", default shadcn colors)

## Deployment Mode Filtering

Apps can restrict themselves to specific modes:

```typescript
deploymentModes: ['local', 'cloud'],  // Not available in cloud-shared
```

If omitted, the app is loaded in all modes.
