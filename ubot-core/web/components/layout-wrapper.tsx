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
      <AuthProvider>
        <AuthGate>
          <main className="flex-1 w-[100vw] bg-background min-h-[100dvh] flex flex-col items-center">{children}</main>
        </AuthGate>
      </AuthProvider>
    );
  }

  return (
    <AuthProvider>
      <AuthGate>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <PageBreadcrumb />
            </header>
            <main className="flex-1 min-h-0 overflow-auto">{children}</main>
          </SidebarInset>
        </SidebarProvider>
      </AuthGate>
    </AuthProvider>
  );
}
