"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Globe,
  Wifi,
  WifiOff,
  RefreshCw,
  Save,
  Copy,
  Check,
  ExternalLink,
  Code,
  Palette,
  Key,
  Server,
  BotMessageSquare,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface ChatConfig {
  autoReplyWebchat: boolean;
  webchatEnabled: boolean;
  webchatToken: string;
  webchatRelayUrl: string;
  webchatBotSecret: string;
  webchatOwnerKey: string;
  webchatWidgetTitle: string;
  webchatWidgetColor: string;
  webchatWelcomeMessage: string;
  webchatAvatarUrl: string;
}

interface WebchatStatus {
  status: string;
  relayUrl: string;
  error: string;
}

export default function WebchatPage() {
  const [config, setConfig] = useState<ChatConfig | null>(null);
  const [connStatus, setConnStatus] = useState<WebchatStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const data = await api<ChatConfig>("/api/chat/config");
      setConfig(data);
    } catch { /* ignore */ }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api<WebchatStatus>("/api/webchat/status");
      setConnStatus(data);
    } catch {
      setConnStatus({ status: "unknown", relayUrl: "", error: "" });
    }
  }, []);

  useEffect(() => {
    loadConfig();
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [loadConfig, fetchStatus]);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api("/api/chat/config", { method: "PUT", body: config });
      toast.success("Web Chat settings saved. Restart YOUBOT for relay changes to take effect.");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof ChatConfig, value: unknown) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopied(null), 2000);
    } catch { toast.error("Failed to copy"); }
  };

  const relayUrl = config?.webchatRelayUrl || "";
  const ownerKey = config?.webchatOwnerKey || "";
  const ownerUrl = relayUrl && ownerKey ? `${relayUrl}/k/${ownerKey}` : "";
  const embedSnippet = relayUrl
    ? `<script src="${relayUrl}/widget.js"\n        data-server="${relayUrl}"></script>`
    : "";

  const status = connStatus?.status || "unknown";
  const isConnected = status === "connected";
  const isConnecting = status === "connecting";
  const statusColor = isConnected
    ? "bg-emerald-500"
    : isConnecting
      ? "bg-amber-500"
      : "bg-muted-foreground";

  return (
    <div className="p-6 pb-12 space-y-6 flex-1">
      {/* Header */}
      <div className="flex items-center gap-3 border-b pb-6 mb-6">
        <Globe className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Web Chat</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Embed a chat widget on any website — messages flow through a cloud relay
          </p>
        </div>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              {isConnected ? (
                <Wifi className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <WifiOff className="h-5 w-5 text-muted-foreground" />
              )}
              Connection Status
            </span>
            <Badge variant="outline" className="gap-1.5">
              <span className={`h-2 w-2 rounded-full ${statusColor}`} />
              {status}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isConnected && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Globe className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="font-medium text-emerald-700 dark:text-emerald-300">
                  Connected to Relay
                </p>
                <p className="text-sm text-muted-foreground font-mono">
                  {connStatus?.relayUrl || relayUrl}
                </p>
              </div>
            </div>
          )}

          {connStatus?.error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {connStatus.error}
            </div>
          )}

          {!isConnected && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Relay URL</label>
                <Input
                  value={config?.webchatRelayUrl || ""}
                  onChange={(e) => updateField("webchatRelayUrl", e.target.value)}
                  placeholder="https://youbot-webchat-xxx.run.app"
                />
                <p className="text-xs text-muted-foreground">
                  URL of the deployed webchat relay server
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Bot Secret</label>
                <Input
                  type="password"
                  value={config?.webchatBotSecret || ""}
                  onChange={(e) => updateField("webchatBotSecret", e.target.value)}
                  placeholder="your-secret-key"
                />
                <p className="text-xs text-muted-foreground">
                  Must match the BOT_SECRET on the relay
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Web Chat</Label>
              <p className="text-xs text-muted-foreground">Allow visitors to chat with your bot</p>
            </div>
            <Switch
              checked={config?.webchatEnabled ?? true}
              onCheckedChange={(v) => updateField("webchatEnabled", v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Auto-Reply */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BotMessageSquare className="h-5 w-5" />
            Auto-Reply
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="wc-auto-reply">Webchat Auto-Reply</Label>
              <p className="text-xs text-muted-foreground">
                Automatically respond to incoming webchat messages
              </p>
            </div>
            <Switch
              id="wc-auto-reply"
              checked={config?.autoReplyWebchat ?? true}
              onCheckedChange={(v) => updateField("autoReplyWebchat", v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Owner Key */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-5 w-5" />
            Owner Key
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              type="password"
              value={config?.webchatOwnerKey || ""}
              onChange={(e) => updateField("webchatOwnerKey", e.target.value)}
              placeholder="your-owner-secret"
              className="flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(config?.webchatOwnerKey || "", "Owner Key")}
            >
              {copied === "Owner Key" ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Access the chat via <code className="text-xs bg-muted px-1 rounded">{relayUrl || "relay"}?key=YOUR_KEY</code> to be recognized as the owner.
          </p>
          {ownerUrl && (
            <div className="flex items-center gap-2">
              <Input readOnly value={ownerUrl} className="font-mono text-xs flex-1" />
              <Button variant="outline" size="icon" onClick={() => copyToClipboard(ownerUrl, "Owner link")}>
                {copied === "Owner link" ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
              <Button variant="outline" size="icon" asChild>
                <a href={ownerUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Widget Customization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-5 w-5" />
            Widget Customization
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Display Name</label>
            <Input
              value={config?.webchatWidgetTitle || ""}
              onChange={(e) => updateField("webchatWidgetTitle", e.target.value)}
              placeholder="Chat with us"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Brand Color</label>
            <div className="flex items-center gap-2">
              <Input
                value={config?.webchatWidgetColor || "#6366f1"}
                onChange={(e) => updateField("webchatWidgetColor", e.target.value)}
                placeholder="#6366f1"
                className="flex-1"
              />
              <div
                className="size-9 rounded-md border shrink-0"
                style={{ backgroundColor: config?.webchatWidgetColor || "#6366f1" }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Logo / Avatar URL</label>
            <div className="flex items-center gap-2">
              <Input
                value={config?.webchatAvatarUrl || ""}
                onChange={(e) => updateField("webchatAvatarUrl", e.target.value)}
                placeholder="https://example.com/logo.png"
                className="flex-1"
              />
              {config?.webchatAvatarUrl && (
                <div className="size-9 rounded-full border overflow-hidden shrink-0">
                  <img src={config.webchatAvatarUrl} alt="Logo" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Welcome Message</label>
            <Textarea
              value={config?.webchatWelcomeMessage || ""}
              onChange={(e) => updateField("webchatWelcomeMessage", e.target.value)}
              placeholder="Hi there! How can I help you today?"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Embed Code */}
      {relayUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Code className="h-5 w-5" />
              Embed Code
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <pre className="bg-muted rounded-md p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap break-all">
                {embedSnippet}
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(embedSnippet, "Embed")}
              >
                {copied === "Embed" ? <Check className="size-3 mr-1" /> : <Copy className="size-3 mr-1" />}
                {copied === "Embed" ? "Copied" : "Copy"}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Input readOnly value={relayUrl} className="font-mono text-sm flex-1" />
              <Button variant="outline" size="icon" onClick={() => copyToClipboard(relayUrl, "URL")}>
                {copied === "URL" ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
              <Button variant="outline" size="icon" asChild>
                <a href={relayUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save */}
      <Button onClick={saveConfig} disabled={saving} className="gap-2">
        {saving ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}
        {saving ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
