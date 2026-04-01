# Frontend Architecture

## Tech Stack
- **Framework**: Next.js 16 (App Router, Turbopack)
- **Styling**: Tailwind CSS v4 + shadcn/ui components
- **State**: React hooks + SWR for API fetching
- **Icons**: Lucide React

## Directory Structure

```
web-ui/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx          # Root layout (static metadata, ThemeInjector)
│   ├── page.tsx            # Home page (uses useHomePageOverride)
│   ├── chat/               # Command center
│   ├── skills/             # Skill management
│   ├── settings/           # Settings page
│   └── ...
├── components/
│   ├── ui/                 # shadcn/ui primitives
│   ├── app-sidebar.tsx     # Main sidebar navigation
│   ├── layout-wrapper.tsx  # Auth gate, public page handling
│   ├── theme-injector.tsx  # Runtime theme application
│   └── page-breadcrumb.tsx # Breadcrumb system
├── hooks/
│   ├── use-auth.tsx        # Authentication state
│   └── use-features.ts    # Feature flags from backend
├── lib/
│   ├── api.ts              # API client helper
│   ├── extensions.tsx      # Extension loader (fork override point)
│   └── utils.ts            # Utilities
└── public/                 # Static assets (logos, favicons)
```

## Extension Points

### extensions.tsx (THE fork override point)

This is the ONLY file that should differ between upstream and forks:

**Upstream** (no-op):
```typescript
export function ExtensionsLoader() { return null; }
export function useHomePageOverride() { return null; }
```

**Fork** (imports fork-specific extensions):
```typescript
import { MyExtensionsLoader } from './my-extensions';
export function ExtensionsLoader() { return <MyExtensionsLoader />; }
export function useHomePageOverride() { return MyDashboard; }
```

### Sidebar Registration

```typescript
import { registerSidebarItems, registerSidebarExtensions } from "@/components/app-sidebar";

// Add items to existing groups
registerSidebarItems('Capabilities', [
  { title: "My Feature", href: "/myfeature", icon: SomeIcon },
]);

// Add entirely new groups
registerSidebarExtensions({
  position: 'after-capabilities',
  groups: [{
    label: 'My Section',
    items: [{ title: "Item", href: "/item", icon: SomeIcon }],
  }],
});
```

### Breadcrumb Registration

```typescript
import { registerBreadcrumbRoutes, registerFeatureRoutes } from "@/components/page-breadcrumb";

registerBreadcrumbRoutes({ "/mypage": "My Page" });
registerFeatureRoutes([
  { prefix: "/myfeature", label: "My Feature", listHref: "/myfeature" },
]);
```

### Layout Wrapper

```typescript
import { registerLayoutWrapper, registerPublicPagePatterns } from "@/components/layout-wrapper";

// Public pages skip auth
registerPublicPagePatterns(/^\/embed\//, /^\/public\//);

// Wrap all authenticated pages
registerLayoutWrapper((children) => <MyGuard>{children}</MyGuard>);
```

## Theming

Branding is applied at runtime by `ThemeInjector`:

1. Fetches `/api/app/theme` on mount
2. Sets `document.title` from `theme.appName`
3. Updates link[rel="icon"] from `theme.faviconUrl`
4. Injects CSS custom properties from `theme.colors`
5. Loads Google Fonts from `theme.fonts`

**No code changes needed per fork** — just change `config.json`:

```json
{
  "theme": {
    "app_name": "My App",
    "colors": { "primary": "hsl(263 70% 58%)" }
  }
}
```

## Authentication Flow

The `AuthGate` in `layout-wrapper.tsx` handles auth:

1. Fetches `/api/auth/status`
2. If `authMode: "sso"` → middleware handles redirects (no login screen)
3. If `authMode: "local"` and `authRequired: true` → shows `LoginScreen`
4. If `authenticated: true` → renders children

## Feature Flags

`useFeatures()` hook fetches `/api/features` and returns:

```typescript
const { features, mode, isCloud, isSaaS } = useFeatures();
// features.whatsapp, features.telegram, etc.
```

Used to conditionally show sidebar items and page content.
