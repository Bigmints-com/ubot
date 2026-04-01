"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Save, RotateCcw, Loader2, CheckCircle } from "lucide-react";

interface Provider {
  id: string;
  name: string;
  model: string;
}

interface PurposeConfig {
  key: string;
  label: string;
  description: string;
  icon: string;
}

const PURPOSES: PurposeConfig[] = [
  {
    key: "chat",
    label: "Chat",
    description: "Primary user-facing conversation — needs best quality model",
    icon: "💬",
  },
  {
    key: "router",
    label: "Router",
    description: "Tool module classification (Phase 1) — needs speed, not quality",
    icon: "🔀",
  },
  {
    key: "extraction",
    label: "Extraction",
    description: "Soul data extraction (persona, facts, summary) — structured output",
    icon: "🧠",
  },
  {
    key: "generation",
    label: "Generation",
    description: "Skill generation, onboarding analysis — creative tasks",
    icon: "✨",
  },
];

export function ModelRoutingCard() {
  const [routing, setRouting] = useState<Record<string, string>>({});
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch("/api/config/model-routing")
      .then((r) => r.json())
      .then((data) => {
        setRouting(data.routing || {});
        setProviders(data.providers || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleChange = (purpose: string, providerId: string) => {
    setRouting((prev) => {
      const next = { ...prev };
      if (providerId === "__default__") {
        delete next[purpose];
      } else {
        next[purpose] = providerId;
      }
      return next;
    });
    setDirty(true);
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      for (const p of PURPOSES) {
        payload[p.key] = routing[p.key] || "";
      }
      await fetch("/api/config/model-routing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routing: payload }),
      });
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save model routing:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setRouting({});
    setDirty(true);
    setSaved(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin mr-2" />
        Loading routing config…
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <p>No model providers configured yet.</p>
          <p className="text-sm mt-1">Add providers in the Chat tab first, then configure routing here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Purpose-Based Model Routing</CardTitle>
          <CardDescription>
            Assign different providers to different task types for cost optimization.
            Unset purposes use the default provider.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {PURPOSES.map((purpose) => {
            const currentProvider = providers.find((p) => p.id === routing[purpose.key]);
            return (
              <div
                key={purpose.key}
                className="flex items-start gap-4 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="text-2xl mt-0.5">{purpose.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{purpose.label}</span>
                    {currentProvider ? (
                      <Badge variant="secondary" className="text-xs">
                        {currentProvider.model || currentProvider.name}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Default
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{purpose.description}</p>
                </div>
                <Select
                  value={routing[purpose.key] || "__default__"}
                  onValueChange={(v) => handleChange(purpose.key, v)}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Default provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">
                      <span className="text-muted-foreground">Default provider</span>
                    </SelectItem>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="capitalize">{p.name}</span>
                        {p.model && (
                          <span className="text-muted-foreground ml-1 text-xs">({p.model})</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={handleReset} disabled={saving}>
          <RotateCcw className="size-3.5 mr-1.5" />
          Reset All
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
          {saving ? (
            <Loader2 className="size-3.5 mr-1.5 animate-spin" />
          ) : saved ? (
            <CheckCircle className="size-3.5 mr-1.5" />
          ) : (
            <Save className="size-3.5 mr-1.5" />
          )}
          {saved ? "Saved" : "Save Routing"}
        </Button>
      </div>
    </div>
  );
}
