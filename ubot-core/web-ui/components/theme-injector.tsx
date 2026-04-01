'use client';

/**
 * ThemeInjector
 *
 * Fetches the active custom app theme from /api/app/theme at startup
 * and injects it as CSS custom properties on :root.
 *
 * Covers:
 *   - Base colors: --primary, --background, --foreground, --accent, --border
 *   - Sidebar variants: --sidebar, --sidebar-primary, --sidebar-accent,
 *     --sidebar-border, --sidebar-ring (derived from theme colors)
 *   - Document title and favicon
 *
 * Noop for vanilla UBOT when no theme is configured.
 */

import { useEffect } from 'react';
import type { AppTheme } from '@/../src/lib/custom-app.js';

export function ThemeInjector() {
  useEffect(() => {
    async function injectTheme() {
      try {
        const res = await fetch('/api/app/theme');
        if (!res.ok) return;
        const { theme } = await res.json() as { theme: (AppTheme & { cssVars?: Record<string, string> }) | null };
        if (!theme) return;

        const root = document.documentElement;

        // Apply base CSS vars from server-computed cssVars map
        if (theme.cssVars) {
          for (const [key, value] of Object.entries(theme.cssVars)) {
            root.style.setProperty(key, value);
          }
        }

        // Derive sidebar variants from theme colors so nav uses the brand palette
        const c = theme.colors;
        if (c) {
          if (c.sidebar)    root.style.setProperty('--sidebar',                c.sidebar);
          if (c.primary)    root.style.setProperty('--sidebar-primary',        c.primary);
          if (c.foreground) root.style.setProperty('--sidebar-primary-foreground', c.foreground);
          if (c.accent)     root.style.setProperty('--sidebar-accent',         c.accent);
          if (c.foreground) root.style.setProperty('--sidebar-accent-foreground', c.foreground);
          if (c.border)     root.style.setProperty('--sidebar-border',         c.border);
          if (c.primary)    root.style.setProperty('--sidebar-ring',           c.primary);
          if (c.foreground) root.style.setProperty('--sidebar-foreground',     c.foreground);
        }

        // Update document title
        if (theme.appName) {
          document.title = theme.appName;
        }

        // Update favicon if provided
        if (theme.faviconUrl) {
          const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
          if (favicon) {
            favicon.href = theme.faviconUrl;
          } else {
            const link = document.createElement('link');
            link.rel = 'icon';
            link.href = theme.faviconUrl;
            document.head.appendChild(link);
          }
        }

        console.log(`[Theme] Applied theme: ${theme.appName}`);
      } catch {
        // Silently ignore — vanilla UBOT without theme config is fine
      }
    }

    injectTheme();
  }, []);

  return null;
}
