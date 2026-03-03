"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Save,
  RefreshCw,
  Search,
  Eye,
  EyeOff,
  Check,
} from "lucide-react";
import { api } from "@/lib/api";

export default function WebSearchPage() {
  const [serperKey, setSerperKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ serper_api_key: string; serper_configured: boolean }>(
        "/api/config/integrations"
      );
      setSerperKey(data.serper_api_key || "");
      setConfigured(data.serper_configured);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (serperKey && !serperKey.includes("••••")) body.serper_api_key = serperKey;
      await api("/api/config/integrations", { method: "PUT", body });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      load();
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Search className="size-6" />
          Web Search
        </h1>
        <p className="text-muted-foreground">
          Configure search providers for the agent
        </p>
      </div>

      <Separator />

      <div className="space-y-4 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Serper.dev (Google Search API)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Serper.dev provides structured Google search results. This is the
              primary search provider. Without it, the agent falls back to
              DuckDuckGo (less reliable).
            </p>
            <div className="space-y-2">
              <Label htmlFor="serperKey">API Key</Label>
              <div className="relative">
                <Input
                  id="serperKey"
                  type={showKey ? "text" : "password"}
                  value={serperKey}
                  onChange={(e) => setSerperKey(e.target.value)}
                  placeholder="Enter Serper API key"
                  className="pr-10"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 size-7"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </Button>
              </div>
              {configured && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <Check className="size-3" /> API key is configured and active
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Get a free API key at{" "}
                <a href="https://serper.dev" target="_blank" rel="noopener" className="underline">
                  serper.dev
                </a>{" "}
                — 2,500 free searches/month.
              </p>
            </div>

            <Separator />

            <div>
              <h4 className="text-sm font-medium mb-2">Fallback Chain</h4>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li className={configured ? "text-green-600 font-medium" : ""}>
                  Serper.dev (Google SERP API) {configured ? "✓" : "— not configured"}
                </li>
                <li>DuckDuckGo (free, no key needed)</li>
                <li>Puppeteer-based search (heavyweight fallback)</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <RefreshCw className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
            {saving ? "Saving..." : "Save"}
          </Button>
          {saved && (
            <Badge variant="default" className="bg-green-600">Saved</Badge>
          )}
        </div>
      </div>
    </div>
  );
}
