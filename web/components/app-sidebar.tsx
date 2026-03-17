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
  Zap,
  type LucideIcon,
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
import { useFeatures, type Features } from "@/hooks/use-features";

// ── Nav Item Types ──────────────────────────────────────

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Optional: only show this item if the named feature is enabled */
  feature?: keyof Features;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  /** Only show this group if at least one item passes feature filter */
  hideIfEmpty?: boolean;
  /** Only show in specific modes */
  condition?: (ctx: { mode: string; features: Features; isCloud: boolean; isSaaS: boolean }) => boolean;
}

// ── Extension Point ─────────────────────────────────────

type SidebarPosition = 'after-core' | 'after-agents' | 'after-automation' | 'after-channels' | 'after-capabilities';

interface SidebarExtension {
  position: SidebarPosition;
  groups: NavGroup[];
}

const _extensions: SidebarExtension[] = [];

/**
 * Register additional sidebar nav groups from extensions.
 * Call this at module load time (e.g., in a client-side extension file).
 */
export function registerSidebarExtensions(ext: SidebarExtension): void {
  _extensions.push(ext);
}

// Inject items into an existing named group (e.g., 'Capabilities')
type ExistingGroup = 'Core' | 'Agents' | 'Automation' | 'Channels' | 'Capabilities' | 'Monitor';

const _groupInjections: Map<ExistingGroup, NavItem[]> = new Map();

/**
 * Register additional items to inject into an existing sidebar group.
 * Items will be appended to the group's list and filtered by feature flags.
 */
export function registerSidebarItems(group: ExistingGroup, items: NavItem[]): void {
  const existing = _groupInjections.get(group) || [];
  _groupInjections.set(group, [...existing, ...items]);
}

interface FooterExtension {
  items: NavItem[];
  condition?: (ctx: { isCloud: boolean; isSaaS: boolean }) => boolean;
}

const _footerExtensions: FooterExtension[] = [];

export function registerSidebarFooterExtensions(ext: FooterExtension): void {
  _footerExtensions.push(ext);
}

// ── Core Nav Items ──────────────────────────────────────

const coreItems: NavItem[] = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Command Center", href: "/chat", icon: MessageSquare },
];

const agentItems: NavItem[] = [
  { title: "Personas", href: "/personas", icon: Brain },
  { title: "Skills", href: "/skills", icon: Puzzle },
  { title: "Agent Defaults", href: "/agent-defaults", icon: Zap },
  { title: "Safety Rules", href: "/safety", icon: ShieldAlert },
  { title: "Vault", href: "/vault", icon: Lock },
];

const automationItems: NavItem[] = [
  { title: "Scheduler", href: "/scheduler", icon: Clock },
  { title: "Approvals", href: "/approvals", icon: CheckCircle },
];

const channelItems: NavItem[] = [
  { title: "WhatsApp", href: "/whatsapp", icon: MessageCircle, feature: "whatsapp" },
  { title: "Telegram", href: "/telegram", icon: Send, feature: "telegram" },
  { title: "Web Chat", href: "/webchat", icon: Globe, feature: "webchat" },
];

const capabilityItems: NavItem[] = [
  { title: "Models", href: "/llms", icon: Bot },
  { title: "Web Search", href: "/web-search", icon: Search, feature: "webSearch" },
  { title: "CLI Agents", href: "/cli", icon: Terminal, feature: "cli" },
  { title: "Filesystem", href: "/filesystem", icon: FolderOpen, feature: "filesystem" },
  { title: "Google Apps", href: "/google", icon: Calendar, feature: "google" },
  { title: "Apple Services", href: "/apple", icon: Apple, feature: "appleServices" },
  { title: "MCP Servers", href: "/mcp-servers", icon: Plug, feature: "mcp" },
];

/** Merge core items with any injected extension items for a group */
function getGroupItems(group: ExistingGroup, coreItems: NavItem[]): NavItem[] {
  const injected = _groupInjections.get(group) || [];
  return [...coreItems, ...injected];
}

const monitorItems: NavItem[] = [
  { title: "Logs", href: "/logs", icon: ScrollText },
  { title: "Tools Health", href: "/tools", icon: Activity },
];

// ── Sidebar Component ───────────────────────────────────

export function AppSidebar() {
  const pathname = usePathname();
  const { features, isSaaS, isCloud, mode } = useFeatures();

  const ctx = { mode, features, isCloud, isSaaS };

  /** Filter items based on feature flags */
  const filterItems = (items: NavItem[]) =>
    items.filter((item) => !item.feature || features[item.feature]);

  const renderItem = (item: NavItem) => (
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

  const renderGroup = (group: NavGroup, key: string) => {
    if (group.condition && !group.condition(ctx)) return null;
    const filtered = filterItems(group.items);
    if (group.hideIfEmpty && filtered.length === 0) return null;
    return (
      <SidebarGroup key={key}>
        <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {filtered.map(renderItem)}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  const getExtensions = (position: SidebarPosition) =>
    _extensions
      .filter(e => e.position === position)
      .flatMap(e => e.groups);

  const filteredChannels = filterItems(channelItems);
  const filteredCapabilities = filterItems(getGroupItems('Capabilities', capabilityItems));

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
                  <span className="truncate font-bold">
                    {isSaaS ? "SaveADay" : "Ubot"}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {isSaaS ? "AI Command Center" : "Agent Core"}
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

        {/* Extension point: after-core */}
        {getExtensions('after-core').map((g, i) => renderGroup(g, `ext-core-${i}`))}

        <SidebarGroup>
          <SidebarGroupLabel>Agents</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {agentItems.map(renderItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Extension point: after-agents */}
        {getExtensions('after-agents').map((g, i) => renderGroup(g, `ext-agents-${i}`))}

        <SidebarGroup>
          <SidebarGroupLabel>Automation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {automationItems.map(renderItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Extension point: after-automation */}
        {getExtensions('after-automation').map((g, i) => renderGroup(g, `ext-auto-${i}`))}

        {/* Channels — only show if any channel features are enabled */}
        {filteredChannels.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Channels</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredChannels.map(renderItem)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Extension point: after-channels */}
        {getExtensions('after-channels').map((g, i) => renderGroup(g, `ext-chan-${i}`))}

        <SidebarGroup>
          <SidebarGroupLabel>Capabilities</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredCapabilities.map(renderItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Extension point: after-capabilities */}
        {getExtensions('after-capabilities').map((g, i) => renderGroup(g, `ext-cap-${i}`))}

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
          {/* Footer extension items */}
          {_footerExtensions
            .filter(e => !e.condition || e.condition({ isCloud, isSaaS }))
            .flatMap(e => e.items)
            .map(renderItem)}
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
              <span>v1.0.0{isSaaS ? " · SaaS" : mode === "cloud" ? " · Cloud" : ""}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
