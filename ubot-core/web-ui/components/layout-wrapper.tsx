'use client';

import { usePathname } from 'next/navigation';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { PageBreadcrumb } from '@/components/page-breadcrumb';
import { Separator } from '@/components/ui/separator';
import { AppSidebar } from '@/components/app-sidebar';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { LoginScreen } from '@/components/login-screen';
import { Loader2 } from 'lucide-react';
import React from 'react';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * Patterns for paths that should render without the sidebar shell.
 * Forks can add to this via the exported helper.
 */
const publicPagePatterns: RegExp[] = [];

/**
 * Register additional public page patterns (called by extensions).
 * Pages matching these patterns render without the sidebar/header shell.
 */
export function registerPublicPagePatterns(...patterns: RegExp[]): void {
  publicPagePatterns.push(...patterns);
}

function isPublicPage(pathname: string | null): boolean {
  if (!pathname) return false;
  return publicPagePatterns.some(p => p.test(pathname));
}

// ── Layout Wrapper Extensions ───────────────────────────

/**
 * A function that wraps children — used to inject guards or providers
 * (e.g., OnboardingGuard) without modifying layout.tsx.
 */
export type LayoutWrapperFn = (children: React.ReactNode) => React.ReactNode;

const _layoutWrappers: LayoutWrapperFn[] = [];

/**
 * Register a layout wrapper that wraps the main authenticated content.
 * Call at module load time from an extension file.
 * Wrappers are applied in registration order (outermost first).
 */
export function registerLayoutWrapper(wrapper: LayoutWrapperFn): void {
  _layoutWrappers.push(wrapper);
}

function applyLayoutWrappers(content: React.ReactNode): React.ReactNode {
  // Apply in reverse so first registered = outermost wrapper
  return [..._layoutWrappers].reverse().reduce(
    (acc, wrap) => <>{wrap(acc)}</>,
    content
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { authenticated, authRequired, loading } = useAuth();

  // Still checking auth status
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Auth not required (no password configured) — show app directly
  if (!authRequired) return <>{children}</>;

  // Not authenticated — show login screen
  if (!authenticated) return <LoginScreen />;

  // Authenticated — show app
  return <>{children}</>;
}

export function CoreLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isPublicPage(pathname)) {
    return (
      <ThemeProvider>
        <AuthProvider>
          <AuthGate>
            <main className="flex-1 w-[100vw] bg-background min-h-[100dvh] flex flex-col items-center">{children}</main>
          </AuthGate>
        </AuthProvider>
      </ThemeProvider>
    );
  }

  const mainContent = (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <PageBreadcrumb />
          <div className="flex-1" />
          <ThemeToggle />
        </header>
        <main className="flex-1 min-h-0 overflow-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );

  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthGate>
          {applyLayoutWrappers(mainContent)}
        </AuthGate>
      </AuthProvider>
    </ThemeProvider>
  );
}
