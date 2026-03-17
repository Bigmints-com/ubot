"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, Save, RefreshCw, Check, ChevronRight } from "lucide-react";

// ── Core Route Names ────────────────────────────────────

const coreRouteNames: Record<string, string> = {
  "/": "Dashboard",
  "/chat": "Command Center",
  "/skills": "Skills",
  "/whatsapp": "WhatsApp",
  "/telegram": "Telegram",
  "/safety": "Safety Rules",
  "/scheduler": "Scheduler",
  "/settings": "Settings",
  "/llms": "Models",
  "/web-search": "Web Search",
  "/cli": "CLI Agents",
  "/filesystem": "Filesystem",
  "/google": "Google Apps",
  "/mcp-servers": "MCP Servers",
  "/tools": "Tools Health",
  "/logs": "Logs",
  "/vault": "Vault",
  "/personas": "Personas",
  "/agent-defaults": "Agent Defaults",
  "/approvals": "Approvals",
  "/webchat": "Web Chat",
  "/apple": "Apple Services",
};

// ── Extension Points ────────────────────────────────────

const extRouteNames: Record<string, string> = {};
const extFeatureRoutes: { prefix: string; label: string; listHref: string }[] = [];
const extTopBarWidgets: Array<() => React.ReactNode> = [];

/**
 * Register additional route names for breadcrumbs.
 */
export function registerBreadcrumbRoutes(routes: Record<string, string>): void {
  Object.assign(extRouteNames, routes);
}

/**
 * Register feature routes for hierarchical breadcrumbs.
 * e.g., { prefix: '/saveaday/catalogues', label: 'Catalogues', listHref: '/saveaday/catalogues' }
 */
export function registerFeatureRoutes(routes: { prefix: string; label: string; listHref: string }[]): void {
  extFeatureRoutes.push(...routes);
}

/**
 * Register additional widgets to show in the top bar (e.g., app switcher).
 */
export function registerTopBarWidget(widget: () => React.ReactNode): void {
  extTopBarWidgets.push(widget);
}

// ── Top Bar Actions ─────────────────────────────────────

interface TopBarActions {
  onSave?: () => void;
  onDelete?: () => void;
  saving?: boolean;
  saved?: boolean;
}

// Global action state — pages can register their actions
let _actions: TopBarActions = {};
let _listeners: (() => void)[] = [];

export function setTopBarActions(actions: TopBarActions) {
  _actions = actions;
  _listeners.forEach((fn) => fn());
}

export function clearTopBarActions() {
  _actions = {};
  _listeners.forEach((fn) => fn());
}

function useTopBarActions(): TopBarActions {
  const [actions, setActions] = useState<TopBarActions>({});
  useEffect(() => {
    const update = () => setActions({ ..._actions });
    _listeners.push(update);
    update();
    return () => {
      _listeners = _listeners.filter((fn) => fn !== update);
    };
  }, []);
  return actions;
}

// ── Detail Name ─────────────────────────────────────────

let _detailName = "";
let _detailListeners: (() => void)[] = [];

export function setTopBarDetailName(name: string) {
  _detailName = name;
  _detailListeners.forEach((fn) => fn());
  _listeners.forEach((fn) => fn());
}

export function clearTopBarDetailName() {
  _detailName = "";
  _detailListeners.forEach((fn) => fn());
  _listeners.forEach((fn) => fn());
}

// ── Component ───────────────────────────────────────────

export function PageBreadcrumb() {
  const pathname = usePathname();
  const actions = useTopBarActions();

  const handleClearChat = () => {
    window.dispatchEvent(new CustomEvent("ubot:clear-chat"));
  };

  // All route names (core + extensions)
  const routeNames = { ...coreRouteNames, ...extRouteNames };

  // Check if this is a feature detail page
  const featureRoute = extFeatureRoutes.find((r) => pathname?.startsWith(r.prefix));
  const isDetailPage =
    featureRoute &&
    pathname !== featureRoute.listHref &&
    pathname !== `${featureRoute.listHref}/new`;

  // Build breadcrumb segments
  let breadcrumb: { label: string; href?: string }[] = [];

  if (featureRoute) {
    breadcrumb.push({ label: featureRoute.label, href: featureRoute.listHref });

    if (pathname === `${featureRoute.listHref}/new`) {
      breadcrumb.push({ label: "New" });
    } else if (isDetailPage) {
      breadcrumb.push({ label: _detailName || "..." });
    }
  }

  const staticName = routeNames[pathname || ""];

  return (
    <div className="flex items-center justify-between flex-1">
      <div className="flex items-center gap-1.5">
        {breadcrumb.length > 0 ? (
          breadcrumb.map((seg, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && (
                <ChevronRight className="size-3 text-muted-foreground" />
              )}
              {seg.href ? (
                <a
                  href={seg.href}
                  className="font-medium text-sm text-muted-foreground hover:text-foreground transition"
                >
                  {seg.label}
                </a>
              ) : (
                <span className="font-medium text-sm">{seg.label}</span>
              )}
            </span>
          ))
        ) : (
          <span className="font-medium text-sm">
            {staticName || "Ubot"}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {/* Extension widgets (e.g., app switcher) */}
        {extTopBarWidgets.map((Widget, i) => (
          <Widget key={i} />
        ))}

        {/* Feature page actions (Save/Delete) */}
        {actions.onDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive h-7 px-2 text-xs"
            onClick={actions.onDelete}
          >
            <Trash2 className="size-3.5 mr-1" /> Delete
          </Button>
        )}
        {actions.onSave && (
          <Button
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={actions.onSave}
            disabled={actions.saving}
          >
            {actions.saved ? (
              <>
                <Check className="size-3.5 mr-1" /> Saved
              </>
            ) : actions.saving ? (
              <>
                <RefreshCw className="size-3.5 mr-1 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save className="size-3.5 mr-1" /> Save
              </>
            )}
          </Button>
        )}

        {/* Chat-specific clear button */}
        {pathname === "/chat" && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleClearChat}
            title="Clear chat history"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
