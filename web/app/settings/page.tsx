"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Settings, Save, RefreshCw, FolderOpen, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";

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

export default function SettingsPage() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Filesystem state
  const [allowedPaths, setAllowedPaths] = useState<string[]>([]);
  const [newPath, setNewPath] = useState("");
  const [fsSaving, setFsSaving] = useState(false);
  const [fsSaved, setFsSaved] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const data = await api<AgentConfig>("/api/chat/config");
      setConfig(data);
    } catch {
      /* ignore */
    }
  }, []);

  const loadFilesystem = useCallback(async () => {
    try {
      const data = await api<{ filesystem: { allowed_paths: string[] } }>("/api/config/integrations");
      setAllowedPaths(data.filesystem?.allowed_paths || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadFilesystem();
  }, [loadConfig, loadFilesystem]);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api("/api/chat/config", { method: "PUT", body: config });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const saveFilesystem = async () => {
    setFsSaving(true);
    try {
      await api("/api/config/integrations", { method: "PUT", body: { filesystem: { allowed_paths: allowedPaths } } });
      setFsSaved(true);
      setTimeout(() => setFsSaved(false), 2000);
    } catch {
      /* ignore */
    } finally {
      setFsSaving(false);
    }
  };

  const updateField = (field: keyof AgentConfig, value: unknown) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="size-6" />
          Settings
        </h1>
        <p className="text-muted-foreground">
          Configure agent behavior and owner identity
        </p>
      </div>

      <Separator />

      <div className="space-y-4 max-w-2xl">
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

        <Separator className="my-6" />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="size-4" />
              Filesystem Access
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Directories the agent is allowed to read/write. Leave empty to restrict to workspace only.
            </p>
            <div className="space-y-2">
              {allowedPaths.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={p} readOnly className="font-mono text-sm" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive"
                    onClick={() => {
                      const paths = [...allowedPaths];
                      paths.splice(i, 1);
                      setAllowedPaths(paths);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  placeholder="/path/to/directory"
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!newPath.trim()}
                  onClick={() => {
                    setAllowedPaths([...allowedPaths, newPath.trim()]);
                    setNewPath("");
                  }}
                >
                  <Plus className="size-4 mr-1" /> Add
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={saveFilesystem} disabled={fsSaving} size="sm">
                {fsSaving ? (
                  <RefreshCw className="size-4 mr-2 animate-spin" />
                ) : (
                  <Save className="size-4 mr-2" />
                )}
                {fsSaving ? "Saving..." : "Save Paths"}
              </Button>
              {fsSaved && (
                <Badge variant="default" className="bg-green-600">
                  Saved
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
