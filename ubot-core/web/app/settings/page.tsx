"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Settings, Bot, Save, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

interface AgentConfig {
  model: string;
  baseUrl: string;
  systemPrompt: string;
  maxHistoryMessages: number;
  autoReplyWhatsApp: boolean;
  autoReplyContacts: string[];
  ownerPhone: string;
}

export default function SettingsPage() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadConfig = async () => {
    try {
      const data = await api<AgentConfig>("/api/chat/config");
      setConfig(data);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api("/api/chat/config", {
        method: "PUT",
        body: config,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof AgentConfig, value: unknown) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure the agent and system preferences
        </p>
      </div>

      <Separator />

      <Tabs defaultValue="llm">
        <TabsList>
          <TabsTrigger value="llm">
            <Bot className="size-4 mr-2" />
            LLM
          </TabsTrigger>
          <TabsTrigger value="agent">
            <Settings className="size-4 mr-2" />
            Agent
          </TabsTrigger>
        </TabsList>

        <TabsContent value="llm" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>LLM Provider</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  value={config?.model || ""}
                  onChange={(e) => updateField("model", e.target.value)}
                  placeholder="glm-5:cloud"
                />
                <p className="text-xs text-muted-foreground">
                  The Ollama model name to use for chat completions
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="baseUrl">Base URL</Label>
                <Input
                  id="baseUrl"
                  value={config?.baseUrl || ""}
                  onChange={(e) => updateField("baseUrl", e.target.value)}
                  placeholder="http://localhost:11434/v1"
                />
                <p className="text-xs text-muted-foreground">
                  OpenAI-compatible API base URL (Ollama, vLLM, etc.)
                </p>
              </div>

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
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agent" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Auto-Reply</CardTitle>
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
                  onCheckedChange={(v) =>
                    updateField("autoReplyWhatsApp", v)
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Owner Phone</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ownerPhone">Phone Number</Label>
                <Input
                  id="ownerPhone"
                  value={config?.ownerPhone || ""}
                  onChange={(e) => updateField("ownerPhone", e.target.value)}
                  placeholder="+971569737344"
                />
                <p className="text-xs text-muted-foreground">
                  Your WhatsApp phone number. When a third party asks the bot
                  something sensitive, approval requests will be sent to this
                  number.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
  );
}
