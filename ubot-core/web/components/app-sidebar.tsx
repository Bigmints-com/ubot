"use client";

import {
  LayoutDashboard,
  MessageSquare,
  Puzzle,
  MessageCircle,
  Send,
  ShieldAlert,
  Clock,
  Settings,
  Bot,
  Brain,
  Globe,
  FolderOpen,
  ScrollText,
  Plug,
  Terminal,
  Apple,
  Lock,
  CheckCircle,
  Activity,
  Search,
  Calendar,
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

const coreItems = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Command Center", href: "/chat", icon: MessageSquare },
  { title: "Vault", href: "/vault", icon: Lock },
];

const agentItems = [
  { title: "Personas", href: "/personas", icon: Brain },
  { title: "Skills", href: "/skills", icon: Puzzle },
];

const automationItems = [
  { title: "Scheduler", href: "/scheduler", icon: Clock },
  { title: "Approvals", href: "/approvals", icon: CheckCircle },
  { title: "Safety Rules", href: "/safety", icon: ShieldAlert },
];

const channelItems = [
  { title: "WhatsApp", href: "/whatsapp", icon: MessageCircle },
  { title: "Telegram", href: "/telegram", icon: Send },
  { title: "iMessage", href: "/imessage", icon: Apple },
];

const capabilityItems = [
  { title: "Models", href: "/llms", icon: Bot },
  { title: "Web Search", href: "/web-search", icon: Search },
  { title: "CLI Agents", href: "/cli", icon: Terminal },
  { title: "Filesystem", href: "/filesystem", icon: FolderOpen },
  { title: "Google Apps", href: "/google", icon: Calendar },
  { title: "MCP Servers", href: "/mcp-servers", icon: Plug },
];

const monitorItems = [
  { title: "Logs", href: "/logs", icon: ScrollText },
  { title: "Tools Health", href: "/tools", icon: Activity },
];

export function AppSidebar() {
  const pathname = usePathname();

  const renderItem = (item: (typeof coreItems)[0]) => (
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
          <SidebarGroupLabel>Core</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {coreItems.map(renderItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Agents</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {agentItems.map(renderItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Automation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {automationItems.map(renderItem)}
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

        <SidebarGroup>
          <SidebarGroupLabel>Capabilities</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {capabilityItems.map(renderItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Monitor</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {monitorItems.map(renderItem)}
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
