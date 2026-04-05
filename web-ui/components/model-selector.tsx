"use client";

/**
 * ModelSelector — Reusable model picker grouped by enabled LLM providers.
 * 
 * Fetches available models from `/api/integrations/models` and `/api/llm-providers/models`,
 * groups them by provider with labels and icons, and only shows enabled providers.
 * 
 * Usage:
 *   <ModelSelector value={agent.model} onChange={(model) => setModel(model)} />
 */

import { useEffect, useState, useCallback } from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

// ── Provider display metadata ────────────────────────────────

const PROVIDER_META: Record<string, { label: string; icon: string }> = {
  gemini:     { label: "Gemini",     icon: "✦" },
  openai:     { label: "OpenAI",     icon: "◎" },
  openrouter: { label: "OpenRouter", icon: "⬡" },
  vertex:     { label: "Vertex AI",  icon: "△" },
  ollama:     { label: "Ollama",     icon: "🦙" },
};

function getProviderLabel(key: string, isDefault: boolean): string {
  const meta = PROVIDER_META[key];
  const label = meta ? `${meta.icon} ${meta.label}` : key;
  return isDefault ? `${label} (default)` : label;
}

// ── Types ────────────────────────────────────────────────────

interface ProviderModels {
  providerId: string;
  label: string;
  isDefault: boolean;
  models: { id: string; name: string }[];
}

interface ModelSelectorProps {
  /** Currently selected model ID, or undefined for "inherit default" */
  value?: string;
  /** Called when the user selects a model. undefined = inherit default. */
  onChange: (model: string | undefined) => void;
  /** Placeholder text for the "inherit" option. Default: "Inherit from default" */
  inheritLabel?: string;
  /** Additional CSS class on the trigger */
  className?: string;
}

export function ModelSelector({
  value,
  onChange,
  inheritLabel = "Inherit from default provider",
  className,
}: ModelSelectorProps) {
  const [groups, setGroups] = useState<ProviderModels[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadModels = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // Fetch enabled providers from the canonical integrations API
      const provRes = await fetch("/api/integrations/models");
      if (!provRes.ok) throw new Error("Failed to fetch providers");
      const provData = await provRes.json();
      const defaultKey = provData.default || "";
      
      // Filter to enabled providers only
      interface ProviderData { enabled?: boolean; apiKey?: string; authType?: string; key?: string; baseUrl?: string; model?: string }
      const enabledProviders = Object.entries(provData.providers || {} as Record<string, ProviderData>)
        .filter(([, p]) => (p as ProviderData).enabled !== false)
        .filter(([, p]) => {
          const pd = p as ProviderData;
          return pd.apiKey || pd.authType === 'vertex-sa' || ['ollama'].includes(pd.key || '') || (pd.baseUrl && pd.baseUrl.includes('localhost'));
        })
        .map(([key, p]) => {
          const pd = p as ProviderData;
          return {
            key,
            baseUrl: pd.baseUrl || "",
            apiKey: pd.apiKey || "",
            model: pd.model || "",
            isDefault: key === defaultKey,
          };
        });

      // Fetch available models for each provider in parallel
      const groupResults = await Promise.allSettled(
        enabledProviders.map(async (prov) => {
          const params = new URLSearchParams({
            providerId: prov.key,
            baseUrl: prov.baseUrl,
            apiKey: prov.apiKey,
            provider: prov.key,
          });
          
          try {
            const res = await fetch(`/api/llm-providers/models?${params}`);
            if (res.ok) {
              const data = await res.json();
              return {
                providerId: prov.key,
                label: getProviderLabel(prov.key, prov.isDefault),
                isDefault: prov.isDefault,
                models: (data.models || []) as { id: string; name: string }[],
              };
            }
          } catch { /* fall through */ }
          
          // Fallback: just show the provider's configured default model
          if (prov.model) {
            return {
              providerId: prov.key,
              label: getProviderLabel(prov.key, prov.isDefault),
              isDefault: prov.isDefault,
              models: [{ id: prov.model, name: prov.model }],
            };
          }
          return null;
        })
      );

      const resolved = groupResults
        .filter((r): r is PromiseFulfilledResult<ProviderModels | null> => r.status === "fulfilled")
        .map((r) => r.value)
        .filter((g): g is ProviderModels => g !== null && g.models.length > 0)
        // Default provider first, then alphabetical
        .sort((a, b) => {
          if (a.isDefault && !b.isDefault) return -1;
          if (!a.isDefault && b.isDefault) return 1;
          return a.providerId.localeCompare(b.providerId);
        });

      setGroups(resolved);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center gap-2 h-9 px-3 rounded-md border text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Loading models…
      </div>
    );
  }

  // Error or no providers: fall back to text input
  if (error || groups.length === 0) {
    return (
      <Input
        value={value || ""}
        placeholder={inheritLabel}
        onChange={(e) => onChange(e.target.value || undefined)}
        className={className}
      />
    );
  }

  return (
    <Select
      value={value || "__default__"}
      onValueChange={(val) => onChange(val === "__default__" ? undefined : val)}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={inheritLabel} />
      </SelectTrigger>
      <SelectContent className="max-h-[320px]">
        <SelectItem value="__default__">
          <span className="text-muted-foreground">{inheritLabel}</span>
        </SelectItem>
        {groups.map((group) => (
          <SelectGroup key={group.providerId}>
            <SelectLabel className="text-xs font-semibold uppercase tracking-wider">
              {group.label}
            </SelectLabel>
            {group.models.map((m) => (
              <SelectItem key={`${group.providerId}:${m.id}`} value={m.id.includes('/') ? m.id : `${group.providerId}/${m.id}`}>
                <span className="font-mono text-xs">{m.name}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
