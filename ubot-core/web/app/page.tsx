"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  Clock,
  MessageCircle,
  Send,
  Globe,
  Monitor,
  ArrowDown,
  ArrowUp,
  Wrench,
  AlertTriangle,
  Bot,
  Wifi,
  WifiOff,
  BarChart3,
} from "lucide-react";
import { api } from "@/lib/api";

interface ChannelMetrics {
  messagesIn: number;
  messagesOut: number;
  lastActivity: string | null;
}

interface ToolMetrics {
  calls: number;
  errors: number;
  lastUsed: string | null;
}

interface MetricsSummary {
  uptime: number;
  startedAt: string;
  channels: Record<string, ChannelMetrics>;
  tools: Record<string, ToolMetrics>;
  totals: {
    messagesIn: number;
    messagesOut: number;
    toolCalls: number;
    toolErrors: number;
  };
}

interface WAStatus {
  status: string;
}

interface TGStatus {
  status: string;
  botUsername: string | null;
}

interface ChatConfig {
  model: string;
  baseUrl: string;
}

const CHANNEL_CONFIG: Record<
  string,
  { label: string; icon: typeof MessageCircle; color: string; bgColor: string; borderColor: string }
> = {
  whatsapp: {
    label: "WhatsApp",
    icon: MessageCircle,
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20",
  },
  telegram: {
    label: "Telegram",
    icon: Send,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
  },
  web: {
    label: "Web Console",
    icon: Monitor,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
  },
  google: {
    label: "Google APIs",
    icon: Globe,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
  },
};

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [waStatus, setWaStatus] = useState<WAStatus | null>(null);
  const [tgStatus, setTGStatus] = useState<TGStatus | null>(null);
  const [chatConfig, setChatConfig] = useState<ChatConfig | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [m, wa, tg, cfg] = await Promise.allSettled([
        api<MetricsSummary>("/api/metrics"),
        api<WAStatus>("/api/whatsapp/status"),
        api<TGStatus>("/api/telegram/status"),
        api<ChatConfig>("/api/chat/config"),
      ]);
      if (m.status === "fulfilled") setMetrics(m.value);
      if (wa.status === "fulfilled") setWaStatus(wa.value);
      if (tg.status === "fulfilled") setTGStatus(tg.value);
      if (cfg.status === "fulfilled") setChatConfig(cfg.value);
    } catch {}
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const formatUptime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    return `${h}h ${m}m`;
  };

  const totals = metrics?.totals || {
    messagesIn: 0,
    messagesOut: 0,
    toolCalls: 0,
    toolErrors: 0,
  };

  // Connection statuses
  const channelStatus: Record<string, boolean> = {
    whatsapp: waStatus?.status === "connected",
    telegram: tgStatus?.status === "connected",
    web: true, // always available
  };

  // Top tools (sorted by call count)
  const topTools = metrics?.tools
    ? Object.entries(metrics.tools)
        .sort(([, a], [, b]) => b.calls - a.calls)
        .slice(0, 10)
    : [];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart3 className="h-8 w-8 text-sky-400" />
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Real-time overview of agent activity across all channels
          </p>
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Messages In
            </CardTitle>
            <ArrowDown className="size-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.messagesIn}</div>
            <p className="text-xs text-muted-foreground">
              Across all channels
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Messages Out
            </CardTitle>
            <ArrowUp className="size-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.messagesOut}</div>
            <p className="text-xs text-muted-foreground">Responses sent</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tool Calls</CardTitle>
            <Wrench className="size-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.toolCalls}</div>
            <p className="text-xs text-muted-foreground">
              {totals.toolErrors > 0 ? (
                <span className="text-red-400">
                  {totals.toolErrors} error
                  {totals.toolErrors !== 1 ? "s" : ""}
                </span>
              ) : (
                "No errors"
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uptime</CardTitle>
            <Clock className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics ? formatUptime(metrics.uptime) : "—"}
            </div>
            <p className="text-xs text-muted-foreground">Since last restart</p>
          </CardContent>
        </Card>
      </div>

      {/* Channel Cards */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Channels</h2>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          {["whatsapp", "telegram", "web"].map((key) => {
            const cfg = CHANNEL_CONFIG[key];
            const ch = metrics?.channels?.[key];
            const connected = channelStatus[key] ?? false;
            const Icon = cfg.icon;

            return (
              <Card
                key={key}
                className={`${cfg.borderColor} border`}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Icon className={`size-4 ${cfg.color}`} />
                      {cfg.label}
                    </span>
                    {key !== "web" && (
                      <Badge
                        variant="outline"
                        className="gap-1 text-xs"
                      >
                        {connected ? (
                          <Wifi className="size-3 text-emerald-400" />
                        ) : (
                          <WifiOff className="size-3 text-zinc-400" />
                        )}
                        {connected ? "Connected" : "Offline"}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-1.5">
                      <ArrowDown className="size-3 text-emerald-400" />
                      <span className="text-lg font-bold">
                        {ch?.messagesIn ?? 0}
                      </span>
                      <span className="text-xs text-muted-foreground">in</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ArrowUp className="size-3 text-blue-400" />
                      <span className="text-lg font-bold">
                        {ch?.messagesOut ?? 0}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        out
                      </span>
                    </div>
                  </div>
                  {ch?.lastActivity && (
                    <p className="text-[10px] text-muted-foreground mt-2">
                      Last:{" "}
                      {new Date(ch.lastActivity).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Bottom Row: Tool Usage + LLM Config */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Tool Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Wrench className="size-4" />
              Tool Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topTools.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No tool calls yet
              </p>
            ) : (
              <div className="space-y-2">
                {topTools.map(([name, t]) => {
                  const errorRate =
                    t.calls > 0
                      ? Math.round((t.errors / t.calls) * 100)
                      : 0;
                  return (
                    <div
                      key={name}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="font-mono text-xs truncate max-w-[200px]">
                        {name}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="font-bold">{t.calls}</span>
                        {errorRate > 0 && (
                          <span className="text-xs text-red-400 flex items-center gap-0.5">
                            <AlertTriangle className="size-3" />
                            {errorRate}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* LLM Config */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Bot className="size-4" />
              LLM Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge variant="default" className="bg-emerald-600">
                <Activity className="size-3 mr-1" />
                Online
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Model</span>
              <Badge variant="outline">{chatConfig?.model || "—"}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Base URL</span>
              <span className="text-xs font-mono text-muted-foreground truncate max-w-[200px]">
                {chatConfig?.baseUrl || "—"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
