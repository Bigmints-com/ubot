"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Activity,
  Clock,
  Hash,
  MessageCircle,
  Bot,
  Wifi,
  WifiOff,
} from "lucide-react";
import { api } from "@/lib/api";

interface AppState {
  name: string;
  version: string;
  uptime: number;
  requestCount: number;
}

interface WAStatus {
  status: string;
}

interface ChatConfig {
  model: string;
  baseUrl: string;
}

export default function DashboardPage() {
  const [state, setState] = useState<AppState | null>(null);
  const [waStatus, setWaStatus] = useState<WAStatus | null>(null);
  const [chatConfig, setChatConfig] = useState<ChatConfig | null>(null);

  useEffect(() => {
    api<AppState>("/api/state").then(setState).catch(() => {});
    api<WAStatus>("/api/whatsapp/status").then(setWaStatus).catch(() => {});
    api<ChatConfig>("/api/chat/config").then(setChatConfig).catch(() => {});
  }, []);

  const formatUptime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const waConnected = waStatus?.status === "connected";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Ubot Agent Core overview and status
        </p>
      </div>

      <Separator />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <Activity className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant="default" className="bg-green-600">
              Online
            </Badge>
            <p className="text-xs text-muted-foreground mt-2">
              {state?.name} v{state?.version}
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
              {state ? formatUptime(state.uptime) : "—"}
            </div>
            <p className="text-xs text-muted-foreground">Since last restart</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Requests</CardTitle>
            <Hash className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {state?.requestCount ?? "—"}
            </div>
            <p className="text-xs text-muted-foreground">Total API calls</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">WhatsApp</CardTitle>
            {waConnected ? (
              <Wifi className="size-4 text-green-500" />
            ) : (
              <WifiOff className="size-4 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            <Badge variant={waConnected ? "default" : "secondary"}>
              {waStatus?.status || "Unknown"}
            </Badge>
            <p className="text-xs text-muted-foreground mt-2">
              Connection status
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="size-5" />
              LLM Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Model</span>
              <Badge variant="outline">{chatConfig?.model || "—"}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Base URL</span>
              <span className="text-sm font-mono">
                {chatConfig?.baseUrl || "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="size-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Use the sidebar to navigate to the Command Center for AI chat, or
              manage your WhatsApp connection, skills, and safety rules.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
