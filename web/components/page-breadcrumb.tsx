"use client";

import { usePathname } from "next/navigation";

const routeNames: Record<string, string> = {
  "/": "Dashboard",
  "/chat": "Command Center",
  "/skills": "Skills",
  "/whatsapp": "WhatsApp",
  "/imessage": "iMessage",
  "/safety": "Safety Rules",
  "/scheduler": "Scheduler",
  "/settings": "Settings",
};

export function PageBreadcrumb() {
  const pathname = usePathname();
  const name = routeNames[pathname] || "Ubot";

  return (
    <div className="flex items-center text-sm">
      <span className="font-medium">{name}</span>
    </div>
  );
}
