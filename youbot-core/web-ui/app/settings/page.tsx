"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

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
  primaryEscalationChannel: 'telegram' | 'whatsapp' | 'both';
}

// ── Component ──

export default function SettingsPage() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // ── Load ──

  const loadConfig = useCallback(async () => {
    try {
      const data = await api<AgentConfig>("/api/chat/config");
      setConfig(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // ── Save ──

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api("/api/chat/config", { method: "PUT", body: config });
      toast.success("Settings saved");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      toast.error("Failed to save settings");
    }
    finally { setSaving(false); }
  };

  const updateField = (field: keyof AgentConfig, value: unknown) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  };

  return (
    <div className="p-6 pb-12 space-y-6 flex-1">
      {/* Header */}
      <div className="flex items-center gap-3 border-b pb-6 mb-6">
        <Settings className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure agent behavior, default providers, and owner identity
          </p>
        </div>
      </div>

      <div className="space-y-4">
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
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  updateField("maxHistoryMessages", isNaN(val) ? 0 : val);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of conversation messages to include in context
              </p>
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

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="ownerTelegramId">Telegram Chat ID</Label>
              <Input
                id="ownerTelegramId"
                value={config?.ownerTelegramId || ""}
                onChange={(e) => updateField("ownerTelegramId", e.target.value)}
                placeholder="123456789"
              />
              <p className="text-xs text-muted-foreground">
                Your exact Telegram Chat ID.
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Primary Escalation Channel</Label>
              <Select
                value={config?.primaryEscalationChannel || "both"}
                onValueChange={(value) => updateField("primaryEscalationChannel", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select primary channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Both (WhatsApp & Telegram)</SelectItem>
                  <SelectItem value="telegram">Telegram Only</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp Only</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Which channel YouBot uses to ask you for approvals, send reminders, or escalate issues.
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
