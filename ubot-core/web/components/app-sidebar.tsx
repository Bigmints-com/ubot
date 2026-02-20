"use client";

import {
  LayoutDashboard,
  MessageSquare,
  Puzzle,
  MessageCircle,
  Send,
  Shield,
  Clock,
  Settings,
  Bot,
  Brain,
  Globe,
  ScrollText,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";

const mainItems = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Command Center", href: "/chat", icon: MessageSquare },
  { title: "Approvals", href: "/approvals", icon: Shield },
  { title: "Skills", href: "/skills", icon: Puzzle },
  { title: "Personas", href: "/personas", icon: Brain },
  { title: "Safety Rules", href: "/safety", icon: Shield },
  { title: "Scheduler", href: "/scheduler", icon: Clock },
  { title: "Logs", href: "/logs", icon: ScrollText },
];

const channelItems = [
  { title: "WhatsApp", href: "/whatsapp", icon: MessageCircle },
  { title: "Telegram", href: "/telegram", icon: Send },
  { title: "Google Apps", href: "/google", icon: Globe },
];

export function AppSidebar() {
  const pathname = usePathname();

  const renderItem = (item: (typeof mainItems)[0]) => (
    <SidebarMenuItem key={item.href}>
      <SidebarMenuButton
        asChild
        isActive={
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href)
        }
        tooltip={item.title}
      >
        <Link href={item.href}>
          <item.icon />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
                  <Bot className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-bold">Ubot</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Agent Core
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map(renderItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Channels</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {channelItems.map(renderItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === "/settings"} tooltip="Settings">
              <Link href="/settings">
                <Settings />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton size="sm" className="text-xs text-muted-foreground">
              <span>v1.0.0</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
