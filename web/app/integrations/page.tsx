"use client";

import { useCallback, useEffect, useState } from "react";
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
  Save,
  RefreshCw,
  Search,
  Terminal,
  FolderOpen,
  Eye,
  EyeOff,
  Check,
  Plus,
  Trash2,
  Plug,
} from "lucide-react";
import { api } from "@/lib/api";

interface IntegrationsConfig {
  serper_api_key: string;
  serper_configured: boolean;
  cli: { enabled: boolean; provider: string; workDir: string; timeout: number };
  filesystem: { allowed_paths: string[] };
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<IntegrationsConfig | null>(null);
  const [serperKey, setSerperKey] = useState("");
  const [showSerperKey, setShowSerperKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newPath, setNewPath] = useState("");

  const loadIntegrations = useCallback(async () => {
    try {
      const data = await api<IntegrationsConfig>("/api/config/integrations");
      setIntegrations(data);
      setSerperKey(data.serper_api_key || "");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (serperKey && !serperKey.includes("••••")) body.serper_api_key = serperKey;
      if (integrations?.cli) body.cli = integrations.cli;
      if (integrations?.filesystem) body.filesystem = integrations.filesystem;
      await api("/api/config/integrations", { method: "PUT", body });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      loadIntegrations();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Plug className="size-6" />
          Integrations
        </h1>
        <p className="text-muted-foreground">
          API keys, filesystem access, and agent configuration
        </p>
      </div>

      <Separator />

      <div className="space-y-4 max-w-2xl">
        {/* Web Search */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="size-4" />
              Web Search (Serper.dev)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Serper.dev provides Google search results for the agent. Without
              this key, the bot falls back to DuckDuckGo.
            </p>
            <div className="space-y-2">
              <Label htmlFor="serperKey">API Key</Label>
              <div className="relative">
                <Input
                  id="serperKey"
                  type={showSerperKey ? "text" : "password"}
                  value={serperKey}
                  onChange={(e) => setSerperKey(e.target.value)}
                  placeholder="Enter Serper API key"
                  className="pr-10"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 size-7"
                  onClick={() => setShowSerperKey(!showSerperKey)}
                >
                  {showSerperKey ? (
                    <EyeOff className="size-3.5" />
                  ) : (
                    <Eye className="size-3.5" />
                  )}
                </Button>
              </div>
              {integrations?.serper_configured && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <Check className="size-3" /> Serper API key is configured
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Get a free key at{" "}
                <a
                  href="https://serper.dev"
                  target="_blank"
                  rel="noopener"
                  className="underline"
                >
                  serper.dev
                </a>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* CLI Config */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Terminal className="size-4" />
              CLI Agent
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Enable CLI</Label>
                <p className="text-xs text-muted-foreground">
                  Allow the agent to execute CLI commands
                </p>
              </div>
              <Switch
                checked={integrations?.cli?.enabled || false}
                onCheckedChange={(v) =>
                  setIntegrations((prev) =>
                    prev
                      ? { ...prev, cli: { ...prev.cli, enabled: v } }
                      : prev
                  )
                }
              />
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select
                  value={integrations?.cli?.provider || "gemini"}
                  onValueChange={(v) =>
                    setIntegrations((prev) =>
                      prev
                        ? { ...prev, cli: { ...prev.cli, provider: v } }
                        : prev
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini">Gemini</SelectItem>
                    <SelectItem value="claude">Claude</SelectItem>
                    <SelectItem value="codex">Codex</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Timeout (ms)</Label>
                <Input
                  type="number"
                  value={integrations?.cli?.timeout || 300000}
                  onChange={(e) =>
                    setIntegrations((prev) =>
                      prev
                        ? {
                            ...prev,
                            cli: {
                              ...prev.cli,
                              timeout: parseInt(e.target.value) || 300000,
                            },
                          }
                        : prev
                    )
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filesystem */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="size-4" />
              Filesystem Access
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Directories the agent is allowed to read/write. Leave empty to
              restrict to workspace only.
            </p>
            <div className="space-y-2">
              {(integrations?.filesystem?.allowed_paths || []).map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={p} readOnly className="font-mono text-sm" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive"
                    onClick={() => {
                      const paths = [
                        ...(integrations?.filesystem?.allowed_paths || []),
                      ];
                      paths.splice(i, 1);
                      setIntegrations((prev) =>
                        prev
                          ? {
                              ...prev,
                              filesystem: { allowed_paths: paths },
                            }
                          : prev
                      );
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
                    const paths = [
                      ...(integrations?.filesystem?.allowed_paths || []),
                      newPath.trim(),
                    ];
                    setIntegrations((prev) =>
                      prev
                        ? { ...prev, filesystem: { allowed_paths: paths } }
                        : prev
                    );
                    setNewPath("");
                  }}
                >
                  <Plus className="size-4 mr-1" /> Add
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <RefreshCw className="size-4 mr-2 animate-spin" />
            ) : (
              <Save className="size-4 mr-2" />
            )}
            {saving ? "Saving..." : "Save Changes"}
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
