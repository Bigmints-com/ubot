"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Settings,
  Save,
  RefreshCw,
  Zap,
  Mail,
  Calendar,
  Search,
  MapPin,
  Bot,
  Terminal,
  FileText,
  Sheet,
  HardDrive,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";

// ── Purpose metadata ──

const PURPOSE_META: Record<string, { label: string; description: string; icon: any }> = {
  chat:         { label: "Chat Model",    description: "LLM used for conversations",      icon: Bot },
  search:       { label: "Web Search",    description: "Search engine for web queries",    icon: Search },
  cli:          { label: "CLI Agent",     description: "Coding CLI for project tasks",     icon: Terminal },
  email:        { label: "Email",         description: "Send and read emails",             icon: Mail },
  calendar:     { label: "Calendar",      description: "Manage events and schedules",       icon: Calendar },
  maps:         { label: "Maps & Places", description: "Location search and details",       icon: MapPin },
  documents:    { label: "Documents",     description: "Create and read documents",          icon: FileText },
  spreadsheets: { label: "Spreadsheets",  description: "Read and write spreadsheet data",   icon: Sheet },
  storage:      { label: "Cloud Storage", description: "File storage and sharing",          icon: HardDrive },
  contacts:     { label: "Contacts",      description: "Manage contact information",        icon: Users },
};

// The order purposes are displayed
const PURPOSE_ORDER = [
  "chat", "search", "cli", "email", "calendar", "maps",
  "documents", "spreadsheets", "storage", "contacts",
];

// ── Types ──

interface AgentConfig {
  model: string;
  baseUrl: string;
  systemPrompt: string;
  maxHistoryMessages: number;
  autoReplyWhatsApp: boolean;
  autoReplyTelegram: boolean;
  autoReplyContacts: string[];
  ownerPhone: string;
  ownerTelegramId: string;
  ownerTelegramUsername: string;
}

interface DefaultOption {
  value: string;
  label: string;
}

// ── Component ──

export default function SettingsPage() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Defaults state
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<Record<string, DefaultOption[]>>({});
  const [defaultsSaving, setDefaultsSaving] = useState(false);
  const [defaultsSaved, setDefaultsSaved] = useState(false);

  // ── Load ──

  const loadConfig = useCallback(async () => {
    try {
      const data = await api<AgentConfig>("/api/chat/config");
      setConfig(data);
    } catch { /* ignore */ }
  }, []);

  const loadDefaults = useCallback(async () => {
    try {
      const [dData, oData] = await Promise.all([
        api<{ defaults: Record<string, string> }>("/api/config/defaults"),
        api<{ options: Record<string, DefaultOption[]> }>("/api/config/defaults/options"),
      ]);
      setDefaults(dData.defaults || {});
      setOptions(oData.options || {});
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadConfig();
    loadDefaults();
  }, [loadConfig, loadDefaults]);

  // ── Save ──

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api("/api/chat/config", { method: "PUT", body: config });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const handleDefaultChange = async (purpose: string, value: string) => {
    const updated = { ...defaults, [purpose]: value };
    setDefaults(updated);
    setDefaultsSaving(true);
    try {
      await api("/api/config/defaults", {
        method: "PUT",
        body: { defaults: { [purpose]: value } },
      });
      setDefaultsSaved(true);
      setTimeout(() => setDefaultsSaved(false), 2000);
    } catch { /* ignore */ }
    finally { setDefaultsSaving(false); }
  };

  const updateField = (field: keyof AgentConfig, value: unknown) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  };

  // Only show purposes that have at least one option
  const activePurposes = PURPOSE_ORDER.filter(
    (p) => options[p] && options[p].length > 0
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="size-6" />
          Settings
        </h1>
        <p className="text-muted-foreground">
          Configure agent behavior, default providers, and owner identity
        </p>
      </div>

      <Separator />

      <div className="space-y-4">
        {/* ── Agent Defaults ── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="size-4" />
                  Agent Defaults
                </CardTitle>
                <CardDescription>
                  Choose the default provider for each purpose. When multiple providers can handle
                  the same task, the agent uses these preferences.
                </CardDescription>
              </div>
              {defaultsSaved && (
                <Badge variant="default" className="bg-green-600 shrink-0">
                  Saved
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {activePurposes.map((purpose) => {
                const meta = PURPOSE_META[purpose];
                if (!meta) return null;
                const Icon = meta.icon;
                const purposeOptions = options[purpose] || [];
                const currentValue = defaults[purpose] || "";

                return (
                  <div
                    key={purpose}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0">
                      <Icon className="size-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <Label className="text-sm font-medium">{meta.label}</Label>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {meta.description}
                      </p>
                    </div>
                    <Select
                      value={currentValue}
                      onValueChange={(v) => handleDefaultChange(purpose, v)}
                      disabled={defaultsSaving}
                    >
                      <SelectTrigger className="w-[160px] shrink-0 h-8 text-xs">
                        <SelectValue placeholder="Not set" />
                      </SelectTrigger>
                      <SelectContent>
                        {purposeOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
              {activePurposes.length === 0 && (
                <p className="text-sm text-muted-foreground col-span-2 py-4 text-center">
                  No providers configured yet. Add providers in the Capabilities pages to set defaults.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Context ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Context</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="maxHistory">Max History Messages</Label>
              <Input
                id="maxHistory"
                type="number"
                value={config?.maxHistoryMessages || 20}
                onChange={(e) =>
                  updateField("maxHistoryMessages", parseInt(e.target.value))
                }
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of conversation messages to include in context
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── Auto-Reply ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Auto-Reply</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>WhatsApp Auto-Reply</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically respond to incoming WhatsApp messages
                </p>
              </div>
              <Switch
                checked={config?.autoReplyWhatsApp || false}
                onCheckedChange={(v) => updateField("autoReplyWhatsApp", v)}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Telegram Auto-Reply</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically respond to incoming Telegram messages from visitors
                </p>
              </div>
              <Switch
                checked={config?.autoReplyTelegram || false}
                onCheckedChange={(v) => updateField("autoReplyTelegram", v)}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Owner Identity ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Owner Identity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Your identity across messaging channels. Used to recognize you as the owner.
            </p>

            <div className="space-y-2">
              <Label htmlFor="ownerPhone">WhatsApp Number</Label>
              <Input
                id="ownerPhone"
                value={config?.ownerPhone || ""}
                onChange={(e) => updateField("ownerPhone", e.target.value)}
                placeholder="+971569737344"
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="ownerTelegramUsername">Telegram Username</Label>
              <Input
                id="ownerTelegramUsername"
                value={config?.ownerTelegramUsername || ""}
                onChange={(e) => updateField("ownerTelegramUsername", e.target.value)}
                placeholder="singsungwong"
              />
              <p className="text-xs text-muted-foreground">
                Your Telegram username (without @).
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ownerTelegramId">Telegram Chat ID</Label>
              <Input
                id="ownerTelegramId"
                value={config?.ownerTelegramId || ""}
                onChange={(e) => updateField("ownerTelegramId", e.target.value)}
                placeholder="Auto-detected on first message"
              />
              <p className="text-xs text-muted-foreground">
                Auto-saved after your first message to the bot.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2">
          <Button onClick={saveConfig} disabled={saving}>
            {saving ? (
              <RefreshCw className="size-4 mr-2 animate-spin" />
            ) : (
              <Save className="size-4 mr-2" />
            )}
            {saving ? "Saving..." : "Save Settings"}
          </Button>
          {saved && (
            <Badge variant="default" className="bg-green-600">
              Saved
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
