"use client";

import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/api";

const routeNames: Record<string, string> = {
  "/": "Dashboard",
  "/chat": "Command Center",
  "/skills": "Skills",
  "/whatsapp": "WhatsApp",
  "/telegram": "Telegram",
  "/imessage": "iMessage",
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
  "/approvals": "Approvals",
};

export function PageBreadcrumb() {
  const pathname = usePathname();
  const name = routeNames[pathname] || "Ubot";

  const clearChatHistory = async () => {
    try {
      await api("/api/chat/clear", {
        method: "POST",
        body: { sessionId: "web-console" },
      });
      window.location.reload();
    } catch { /* ignore */ }
  };

  return (
    <div className="flex items-center justify-between flex-1">
      <span className="font-medium text-sm">{name}</span>
      {pathname === "/chat" && (
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={clearChatHistory}
          title="Clear chat history"
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
