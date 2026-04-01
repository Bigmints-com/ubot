"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Apple,
  Calendar,
  Users,
  StickyNote,
  Mail,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CapabilityTools } from "@/components/capability-tools";

interface AppleConfig {
  enabled: boolean;
  services: Record<string, { enabled: boolean }>;
}

const SERVICES = [
  {
    key: "calendar",
    name: "Apple Calendar",
    description: "List, create, and delete calendar events",
    icon: Calendar,
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
  },
  {
    key: "contacts",
    name: "Apple Contacts",
    description: "Search and list contacts from macOS Contacts app",
    icon: Users,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
  },
  {
    key: "notes",
    name: "Apple Notes",
    description: "Read, create, and list notes in Apple Notes",
    icon: StickyNote,
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/20",
  },
  {
    key: "mail",
    name: "Apple Mail",
    description: "Read, search, and send emails via Apple Mail",
    icon: Mail,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/20",
  },
];

export default function ApplePage() {
  const [config, setConfig] = useState<AppleConfig>({
    enabled: true,
    services: {
      calendar: { enabled: true },
      contacts: { enabled: true },
      notes: { enabled: true },
      mail: { enabled: true },
    },
  });

  const fetchConfig = useCallback(async () => {
    try {
      const data = await api<AppleConfig>("/api/config/capabilities/apple");
      setConfig(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const saveConfig = async (updated: AppleConfig) => {
    setConfig(updated);
    try {
      await api("/api/config/capabilities/apple", {
        method: "PUT",
        body: updated,
      });
    } catch (err: any) {
      toast.error("Failed to save Apple config");
      setConfig(config); // revert
    }
  };

  const toggleMaster = () => {
    saveConfig({ ...config, enabled: !config.enabled });
  };

  const toggleService = (key: string) => {
    const current = config.services?.[key]?.enabled !== false;
    saveConfig({
      ...config,
      services: {
        ...config.services,
        [key]: { enabled: !current },
      },
    });
  };

  const isMacOS = true; // We're always on macOS for the agent

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-zinc-600 to-zinc-800 shadow-lg shadow-zinc-500/20">
          <Apple className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Apple Services</h1>
          <p className="text-sm text-muted-foreground">
            macOS-native integrations for Calendar, Contacts, Notes, and Mail via AppleScript
          </p>
        </div>
      </div>

      {/* Platform Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Apple className="h-5 w-5" />
              Apple Integration
            </span>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="gap-1.5">
                <span className={`h-2 w-2 rounded-full ${config.enabled ? "bg-emerald-500" : "bg-zinc-500"}`} />
                {config.enabled ? "Enabled" : "Disabled"}
              </Badge>
              <Switch
                checked={config.enabled}
                onCheckedChange={toggleMaster}
              />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-2 p-3 rounded-lg border bg-emerald-500/5 border-emerald-500/20 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>macOS Detected</span>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg border bg-amber-500/5 border-amber-500/20 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
              <span>Contacts & Mail need Full Disk Access</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Services */}
      <Card>
        <CardHeader>
          <CardTitle>Services</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enable or disable individual Apple services. Disabled services won&apos;t be available to the agent.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SERVICES.map((service) => {
              const enabled = config.services?.[service.key]?.enabled !== false;
              const Icon = service.icon;

              return (
                <div
                  key={service.key}
                  className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
                    !config.enabled
                      ? "opacity-50 border-zinc-800"
                      : enabled
                        ? `${service.bgColor} ${service.borderColor}`
                        : "border-zinc-800 bg-zinc-900/50"
                  }`}
                >
                  <div
                    className={`flex items-center justify-center h-10 w-10 rounded-lg shrink-0 ${
                      enabled && config.enabled
                        ? `${service.bgColor}`
                        : "bg-zinc-800"
                    }`}
                  >
                    <Icon
                      className={`h-5 w-5 ${
                        enabled && config.enabled
                          ? service.color
                          : "text-zinc-500"
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{service.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {service.description}
                    </p>
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={() => toggleService(service.key)}
                    disabled={!config.enabled}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <CapabilityTools capability="apple" />
    </div>
  );
}
