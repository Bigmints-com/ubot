"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Save,
  Loader2,
  CheckCircle,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Pencil,
  Route,
  Key,
  Bot,
  BarChart3,
  TrendingUp,
} from "lucide-react";
import { ModelSelector } from "@/components/model-selector";

// ─── Provider Presets ────────────────────────────────────────

interface ProviderPreset {
  type: string;
  label: string;
  baseUrl: string;
  icon: string;
  color: string;
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    type: "gemini",
    label: "Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    icon: "✦",
    color: "from-blue-500/20 to-cyan-500/20",
  },
  {
    type: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1/",
    icon: "◎",
    color: "from-green-500/20 to-emerald-500/20",
  },
  {
    type: "openai-compat",
    label: "OpenAI Compatible",
    baseUrl: "",
    icon: "⚡",
    color: "from-slate-500/20 to-gray-500/20",
  },
  {
    type: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1/",
    icon: "⬡",
    color: "from-purple-500/20 to-violet-500/20",
  },
  {
    type: "vertex",
    label: "Vertex AI",
    baseUrl: "",
    icon: "△",
    color: "from-orange-500/20 to-amber-500/20",
  },
  {
    type: "ollama",
    label: "Ollama",
    baseUrl: "http://localhost:11434/v1/",
    icon: "🦙",
    color: "from-yellow-500/20 to-orange-500/20",
  },
  {
    type: "lmstudio",
    label: "LM Studio",
    baseUrl: "http://localhost:1234/v1/",
    icon: "🖥️",
    color: "from-teal-500/20 to-emerald-500/20",
  },
];

// ─── Default models per provider per purpose ─────────────────
// Mirrors DEFAULT_PROVIDER_MODELS from types.ts

const DEFAULT_PROVIDER_MODELS: Record<string, Record<string, string>> = {
  gemini: {
    chat: "gemini-2.0-flash",
    router: "gemini-2.0-flash-lite",
    extraction: "gemini-2.0-flash-lite",
    generation: "gemini-2.0-flash",
    image_generation: "gemini-2.0-flash",
    transcription: "gemini-2.0-flash",
    tts: "gemini-2.0-flash",
  },
  vertex: {
    chat: "gemini-2.0-flash",
    router: "gemini-2.0-flash-lite",
    extraction: "gemini-2.0-flash-lite",
    generation: "gemini-2.0-flash",
    image_generation: "imagen-4.0-generate-preview-0514",
    transcription: "gemini-2.0-flash",
    tts: "gemini-2.0-flash",
  },
  openai: {
    chat: "gpt-4o",
    router: "gpt-4o-mini",
    extraction: "gpt-4o-mini",
    generation: "gpt-4o",
    image_generation: "dall-e-3",
    transcription: "whisper-1",
    tts: "tts-1",
  },
  openrouter: {
    chat: "qwen/qwen3.6-plus:free",
    router: "qwen/qwen3.6-plus:free",
    extraction: "qwen/qwen3.6-plus:free",
    generation: "meta-llama/llama-3.3-70b-instruct:free",
    image_generation: "openai/dall-e-3",
    transcription: "openai/whisper-1",
    tts: "openai/tts-1",
  },
  ollama: {
    chat: "llama3.2:3b",
    router: "llama3.2:3b",
    extraction: "llama3.2:3b",
    generation: "llama3.2:3b",
    transcription: "whisper",
  },
  lmstudio: {
    chat: "local-model",
    router: "local-model",
    extraction: "local-model",
    generation: "local-model",
    transcription: "local-model",
    tts: "local-model",
  },
};

// ─── Purpose Definitions ─────────────────────────────────────

interface PurposeDef {
  key: string;
  label: string;
  description: string;
  icon: string;
}

const PURPOSES: PurposeDef[] = [
  {
    key: "chat",
    label: "Chat",
    description: "User-facing conversations — best quality",
    icon: "💬",
  },
  {
    key: "router",
    label: "Router",
    description: "Tool classification — speed over quality",
    icon: "🔀",
  },
  {
    key: "extraction",
    label: "Extraction",
    description: "Persona & fact extraction — structured output",
    icon: "🧠",
  },
  {
    key: "generation",
    label: "Generation",
    description: "Creative tasks — skill & content generation",
    icon: "✨",
  },
  {
    key: "image_generation",
    label: "Image Gen",
    description: "Image creation — DALL-E, Imagen, etc.",
    icon: "🎨",
  },
  {
    key: "transcription",
    label: "Transcription",
    description: "Audio to text — Whisper, Gemini, etc.",
    icon: "🎤",
  },
  {
    key: "tts",
    label: "TTS",
    description: "Text to speech — voice synthesis",
    icon: "🔊",
  },
];

// ─── Types ───────────────────────────────────────────────────

interface ConfiguredProvider {
  key: string;
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  authType?: string;
  models?: Record<string, string>;
}

/** Get the model name for a provider+purpose.
 *  Priority: per-purpose override → provider default model → hardcoded fallback */
function getModelForProvider(
  providerKey: string,
  purpose: string,
  providerModels?: Record<string, string>,
  defaultModel?: string,
): string {
  return (
    providerModels?.[purpose] ||
    defaultModel ||
    DEFAULT_PROVIDER_MODELS[providerKey]?.[purpose] ||
    ""
  );
}

// ─── Main Component ──────────────────────────────────────────

export default function ModelsPage() {
  const [providers, setProviders] = useState<
    Record<string, ConfiguredProvider>
  >({});
  const [routing, setRouting] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [usage, setUsage] = useState<any>(null);
  const [usagePeriod, setUsagePeriod] = useState<string>("30d");

  // ── Data loading ───────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const [provRes, routeRes] = await Promise.all([
        fetch("/api/integrations/models"),
        fetch("/api/config/model-routing"),
      ]);

      if (provRes.ok) {
        const data = await provRes.json();
        setProviders(
          Object.fromEntries(
            Object.entries(data.providers || {}).map(
              ([key, p]: [string, any]) => [
                key,
                {
                  key,
                  enabled: p.enabled !== false,
                  baseUrl: (p.baseUrl || "") as string,
                  apiKey: (p.apiKey || "") as string,
                  model: (p.model || "") as string,
                  authType: (p.authType || "") as string,
                  models: (p.models || {}) as Record<string, string>,
                },
              ],
            ),
          ),
        );
      }

      if (routeRes.ok) {
        const data = await routeRes.json();
        setRouting(data.routing || {});
      }
    } catch (err) {
      console.error("Failed to load models config:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsage = useCallback(async (period: string) => {
    try {
      const res = await fetch(`/api/metering/usage?period=${period}`);
      if (res.ok) setUsage(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);
  useEffect(() => {
    loadUsage(usagePeriod);
  }, [usagePeriod, loadUsage]);

  // ── Computed: enabled providers for routing dropdowns ───────

  const enabledProviders = Object.values(providers).filter(
    (p) =>
      p.enabled &&
      (p.apiKey ||
        p.authType === "vertex-sa" ||
        p.key === "ollama" ||
        p.baseUrl?.includes("localhost")),
  );

  // ── Auto-routing logic ─────────────────────────────────────
  // When only 1 provider: all purposes use it
  // When multiple: chat uses default, others use cheapest/fastest

  function getAutoRoutedProvider(purpose: string): {
    providerId: string;
    model: string;
  } {
    if (enabledProviders.length === 0) return { providerId: "", model: "" };
    if (enabledProviders.length === 1) {
      const p = enabledProviders[0];
      return {
        providerId: p.key,
        model: getModelForProvider(p.key, purpose, p.models, p.model),
      };
    }

    const fallbackProvider = enabledProviders[0];

    // Smart defaults based on purpose
    let picked: ConfiguredProvider;
    switch (purpose) {
      case "chat":
      case "generation":
        picked = fallbackProvider;
        break;
      case "router":
      case "extraction":
        // Prefer cheapest: gemini > openrouter > vertex > openai
        picked =
          enabledProviders.find((p) => p.key === "gemini") ||
          enabledProviders.find((p) => p.key === "openrouter") ||
          fallbackProvider;
        break;
      case "image_generation":
        // Prefer vertex (Imagen) > openai (DALL-E) > others
        picked =
          enabledProviders.find((p) => p.key === "vertex") ||
          enabledProviders.find((p) => p.key === "openai") ||
          fallbackProvider;
        break;
      case "transcription":
        // Prefer ollama (local whisper) > openai (whisper-1) > others
        picked =
          enabledProviders.find((p) => p.key === "ollama") ||
          enabledProviders.find((p) => p.key === "openai") ||
          fallbackProvider;
        break;
      case "tts":
        picked =
          enabledProviders.find((p) => p.key === "openai") || fallbackProvider;
        break;
      default:
        picked = fallbackProvider;
    }
    return {
      providerId: picked.key,
      model: getModelForProvider(
        picked.key,
        purpose,
        picked.models,
        picked.model,
      ),
    };
  }

  function getEffectiveProvider(purpose: string): {
    id: string;
    model: string;
    isAuto: boolean;
  } {
    const override = routing[purpose];
    if (override) {
      let providerId = override;
      let specifiedModel = "";
      if (override.includes("/")) {
        const parts = override.split("/");
        providerId = parts[0];
        specifiedModel = parts.slice(1).join("/");
      }
      const p = enabledProviders.find((ep) => ep.key === providerId);
      if (p) {
        return {
          id: p.key,
          model:
            specifiedModel ||
            getModelForProvider(p.key, purpose, p.models, p.model),
          isAuto: false,
        };
      }
    }
    const auto = getAutoRoutedProvider(purpose);
    return { id: auto.providerId, model: auto.model, isAuto: true };
  }

  // ── Provider CRUD ──────────────────────────────────────────

  async function addProvider(
    type: string,
    apiKey: string,
    model: string,
    extra?: { projectId?: string; region?: string; baseUrl?: string; modelOverride?: string },
  ) {
    const preset = PROVIDER_PRESETS.find((p) => p.type === type);
    if (!preset) return;

    const body: Record<string, unknown> = {
      key: type,
      baseUrl: extra?.baseUrl || preset.baseUrl,
      apiKey,
      model: extra?.modelOverride || model,
      enabled: true,
    };

    // Vertex AI: include project/region for base URL generation
    if (type === "vertex" && extra) {
      body.projectId = extra.projectId;
      body.region = extra.region || "us-central1";
    }

    const res = await fetch("/api/integrations/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) await loadData();
  }

  async function updateProvider(
    key: string,
    updates: Partial<ConfiguredProvider>,
  ) {
    const res = await fetch(`/api/integrations/models/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) await loadData();
  }

  async function deleteProvider(key: string) {
    const res = await fetch(`/api/integrations/models/${key}`, {
      method: "DELETE",
    });
    if (res.ok) await loadData();
  }

  async function toggleProvider(key: string) {
    const res = await fetch(`/api/integrations/models/${key}/toggle`, {
      method: "PUT",
    });
    if (res.ok) await loadData();
  }

  // ── Routing save ───────────────────────────────────────────

  async function saveRouting() {
    setSaving(true);
    try {
      await fetch("/api/config/model-routing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routing }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save routing:", err);
    } finally {
      setSaving(false);
    }
  }

  function handleRoutingChange(purpose: string, providerId: string) {
    setRouting((prev) => {
      const next = { ...prev };
      if (providerId === "__auto__") {
        delete next[purpose];
      } else {
        next[purpose] = providerId;
      }
      return next;
    });
  }

  // ── Loading state ──────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin mr-2" />
        Loading model configuration…
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bot className="size-6" />
          AI Models
        </h1>
        <p className="text-muted-foreground mt-1">
          Add your API keys and the system will automatically route tasks to the
          best model
        </p>
      </div>

      {/* ─── Section 1: API Keys ──────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="size-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">API Keys</h2>
            <Badge variant="secondary" className="text-xs">
              {enabledProviders.length} active
            </Badge>
          </div>
          <AddProviderDialog
            presets={PROVIDER_PRESETS}
            existingKeys={Object.keys(providers)}
            onAdd={addProvider}
          />
        </div>

        {Object.keys(providers).length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Key className="size-8 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No providers configured</p>
              <p className="text-sm mt-1">Add an API key to get started</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {Object.values(providers).map((provider) => (
              <ProviderCard
                key={provider.key}
                provider={provider}
                preset={PROVIDER_PRESETS.find((p) => p.type === provider.key)}
                onToggle={() => toggleProvider(provider.key)}
                onUpdate={(u) => updateProvider(provider.key, u)}
                onDelete={() => deleteProvider(provider.key)}
              />
            ))}
          </div>
        )}
      </div>
      {/* ─── Section 2: Model Routing ─────────────────────────── */}
      {enabledProviders.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Route className="size-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Task Routing</h2>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>
                {enabledProviders.length === 1
                  ? `All tasks routed to ${enabledProviders[0].key}. Add more providers for multi-model routing.`
                  : "System auto-assigns the best model per task based on cost & capability. Override below."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {PURPOSES.map((purpose) => {
                const effective = getEffectiveProvider(purpose.key);
                const providerMeta = effective.id
                  ? PROVIDER_PRESETS.find((p) => p.type === effective.id)
                  : null;
                // Strip the provider prefix from model display (e.g. "openrouter/qwen/..." → "qwen/...")
                const displayModel = effective.model
                  ? effective.model.startsWith(`${effective.id}/`)
                    ? effective.model.slice(effective.id.length + 1)
                    : effective.model
                  : "";
                return (
                  <div
                    key={purpose.key}
                    className="flex items-center gap-4 p-3 rounded-lg border bg-card/50 hover:bg-accent/30 transition-colors"
                  >
                    <span className="text-xl w-8 text-center">
                      {purpose.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {purpose.label}
                        </span>
                        {providerMeta && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 gap-0.5"
                          >
                            <span>{providerMeta.icon}</span>
                            <span>{providerMeta.label}</span>
                          </Badge>
                        )}
                        {displayModel && (
                          <Badge
                            variant="outline"
                            className="text-xs font-mono font-normal"
                          >
                            {displayModel}
                            {effective.isAuto && (
                              <span className="ml-1 opacity-60">(auto)</span>
                            )}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {purpose.description}
                      </p>
                    </div>
                    <ModelSelector
                      value={routing[purpose.key]}
                      onChange={(val) =>
                        handleRoutingChange(purpose.key, val || "__auto__")
                      }
                      inheritLabel={`Auto${providerMeta ? ` · ${providerMeta.icon} ${providerMeta.label}` : ""}${displayModel ? ` — ${displayModel.split("/").pop()}` : ""}`}
                      className="w-[280px]"
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button size="sm" onClick={saveRouting} disabled={saving}>
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
      )}

      {/* ─── Section 3: Usage Metering ─────────────────────── */}
      {usage && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="size-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Usage & Costs</h2>
            </div>
            <Select value={usagePeriod} onValueChange={setUsagePeriod}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Calls</p>
                <p className="text-xl font-bold">
                  {Object.values(
                    (usage.byPurpose || {}) as Record<
                      string,
                      { calls: number }
                    >,
                  )
                    .reduce((s, p) => s + p.calls, 0)
                    .toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Input Tokens</p>
                <p className="text-xl font-bold">
                  {(usage.totalInputTokens || 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Output Tokens</p>
                <p className="text-xl font-bold">
                  {(usage.totalOutputTokens || 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-1">
                  <TrendingUp className="size-3 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Est. Cost</p>
                </div>
                <p className="text-xl font-bold text-primary">
                  ${(usage.totalCost || 0).toFixed(4)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* By Purpose + By Model side-by-side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* By Purpose */}
            {usage.byPurpose && Object.keys(usage.byPurpose).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">By Purpose</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {Object.entries(
                    usage.byPurpose as Record<
                      string,
                      {
                        calls: number;
                        inputTokens: number;
                        outputTokens: number;
                        cost: number;
                      }
                    >,
                  ).map(([purpose, data]) => (
                    <div
                      key={purpose}
                      className="flex items-center justify-between p-2 rounded border bg-card/50"
                    >
                      <div>
                        <span className="text-sm font-medium capitalize">
                          {purpose}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {data.calls} calls
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-muted-foreground">
                          {(
                            data.inputTokens + data.outputTokens
                          ).toLocaleString()}{" "}
                          tokens
                        </span>
                        <span className="text-xs font-mono text-primary ml-2">
                          ${data.cost.toFixed(4)}
                        </span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* By Model */}
            {usage.byModel && Object.keys(usage.byModel).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">By Model</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {Object.entries(
                    usage.byModel as Record<
                      string,
                      {
                        calls: number;
                        inputTokens: number;
                        outputTokens: number;
                        cost: number;
                      }
                    >,
                  ).map(([model, data]) => (
                    <div
                      key={model}
                      className="flex items-center justify-between p-2 rounded border bg-card/50"
                    >
                      <div>
                        <span className="text-xs font-mono">{model}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {data.calls} calls
                        </span>
                      </div>
                      <span className="text-xs font-mono text-primary">
                        ${data.cost.toFixed(4)}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Provider Card ───────────────────────────────────────────

function ProviderCard({
  provider,
  preset,
  onToggle,
  onUpdate,
  onDelete,
}: {
  provider: ConfiguredProvider;
  preset?: ProviderPreset;
  onToggle: () => void;
  onUpdate: (updates: Partial<ConfiguredProvider>) => void;
  onDelete: () => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editKey, setEditKey] = useState("");
  const [editBaseUrl, setEditBaseUrl] = useState("");
  const [editModel, setEditModel] = useState("");

  const isOllama = provider.key === "ollama";
  const isLmstudio = provider.key === "lmstudio";
  const isLocalFree = isOllama || isLmstudio;

  const maskedKey = provider.apiKey
    ? provider.apiKey.slice(0, 4) +
      "•".repeat(Math.min(24, provider.apiKey.length - 4))
    : "";

  function handleSaveEdit() {
    const updates: Partial<ConfiguredProvider> = {};
    if (editKey) updates.apiKey = editKey;
    if (editBaseUrl) updates.baseUrl = editBaseUrl;
    if (editModel) updates.model = editModel;
    if (Object.keys(updates).length > 0) onUpdate(updates);
    setEditing(false);
    setEditKey("");
    setEditBaseUrl("");
    setEditModel("");
  }

  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
        provider.enabled ? "bg-card" : "bg-muted/30 opacity-60"
      }`}
    >
      {/* Icon */}
      <div className="text-2xl w-10 h-10 rounded-lg flex items-center justify-center bg-muted/50 shrink-0">
        {preset?.icon || "⚙"}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold capitalize">{provider.key}</span>
          <Badge variant="outline" className="text-[10px] uppercase font-mono">
            {provider.key}
          </Badge>
          {provider.apiKey || provider.authType === "vertex-sa" ? (
            <Badge
              variant="secondary"
              className="text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
            >
              ✓{" "}
              {provider.authType === "vertex-sa"
                ? "Service Account"
                : "Configured"}
            </Badge>
          ) : (
            <Badge
              variant="secondary"
              className="text-[10px] text-muted-foreground"
            >
              Not configured
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          {provider.authType === "vertex-sa" ? (
            <span className="font-mono text-muted-foreground">
              ☁️ Vertex AI Service Account
            </span>
          ) : provider.apiKey ? (
            <button
              onClick={() => setShowKey(!showKey)}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              {showKey ? (
                <EyeOff className="size-3" />
              ) : (
                <Eye className="size-3" />
              )}
              <span className="font-mono">
                {showKey ? provider.apiKey : maskedKey}
              </span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {!isLocalFree && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-3.5" />
          </Button>
        )}
        <Switch checked={provider.enabled} onCheckedChange={onToggle} />
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {/* Edit Dialog */}
      {!isLocalFree && (
        <Dialog open={editing} onOpenChange={(open) => {
          if (!open) {
            setEditKey("");
            setEditBaseUrl("");
            setEditModel("");
          }
          setEditing(open);
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="capitalize">
                Edit {provider.key}
              </DialogTitle>
              <DialogDescription>
                {provider.key === "openai-compat"
                  ? "Update connection settings"
                  : "Update your API key"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {provider.key === "openai-compat" && (
                <>
                  <div className="space-y-2">
                    <Label>Base URL</Label>
                    <Input
                      placeholder="https://your-api.example.com/v1"
                      value={editBaseUrl}
                      onChange={(e) => setEditBaseUrl(e.target.value)}
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground">
                      Current: {provider.baseUrl || "—"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Model Name</Label>
                    <Input
                      placeholder="e.g. llama-3.1-70b"
                      value={editModel}
                      onChange={(e) => setEditModel(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Current: {provider.model || "—"}
                    </p>
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label>API Key</Label>
                <Input
                  type="password"
                  placeholder="Leave blank to keep current key"
                  value={editKey}
                  onChange={(e) => setEditKey(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveEdit}
                  disabled={
                    provider.key === "openai-compat"
                      ? !editKey && !editBaseUrl && !editModel
                      : !editKey
                  }
                >
                  Save
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Add Provider Dialog ─────────────────────────────────────

function AddProviderDialog({
  presets,
  existingKeys,
  onAdd,
}: {
  presets: ProviderPreset[];
  existingKeys: string[];
  onAdd: (
    type: string,
    apiKey: string,
    model: string,
    extra?: {
      projectId?: string;
      region?: string;
      serviceAccountJson?: string;
      baseUrl?: string;
      modelOverride?: string;
    },
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  // Vertex-specific state
  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const [projectId, setProjectId] = useState("");
  const [region, setRegion] = useState("us-central1");

  // OpenAI Compatible state
  const [compatBaseUrl, setCompatBaseUrl] = useState("");
  const [compatModel, setCompatModel] = useState("");

  const availablePresets = presets.filter(
    (p) => !existingKeys.includes(p.type),
  );
  const isVertex = selectedType === "vertex";
  const isCompat = selectedType === "openai-compat";

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setServiceAccountJson(text);
      try {
        const parsed = JSON.parse(text);
        if (parsed.project_id) setProjectId(parsed.project_id);
      } catch {
        /* ignore */
      }
    };
    reader.readAsText(file);
  }

  async function handleAdd() {
    if (!selectedType) return;
    setSaving(true);

    try {
      if (isVertex) {
        if (!serviceAccountJson || !projectId) return;
        // Upload service account credentials first
        const credRes = await fetch("/api/integrations/vertex/credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serviceAccountJson }),
        });
        if (!credRes.ok) {
          const err = await credRes.json();
          alert(`Failed to save credentials: ${err.error}`);
          return;
        }
        // Then add the provider
        onAdd("vertex", "__vertex_sa__", "", {
          projectId,
          region,
          serviceAccountJson,
        });
      } else if (selectedType === "ollama" || selectedType === "lmstudio") {
        onAdd(selectedType, "", "");
      } else if (selectedType === "openai-compat") {
        if (!apiKey || !compatBaseUrl.trim() || !compatModel.trim()) return;
        onAdd(selectedType, apiKey, "", {
          baseUrl: compatBaseUrl.trim().replace(/\/+$/, ""),
          modelOverride: compatModel.trim(),
        });
      } else {
        if (!apiKey) return;
        onAdd(selectedType, apiKey, "");
      }

      setOpen(false);
      setSelectedType("");
      setApiKey("");
      setServiceAccountJson("");
      setProjectId("");
      setRegion("us-central1");
      setCompatBaseUrl("");
      setCompatModel("");
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = isVertex
    ? !!serviceAccountJson && !!projectId
    : selectedType === "ollama" || selectedType === "lmstudio"
      ? true
      : isCompat
        ? !!selectedType && !!apiKey && !!compatBaseUrl && !!compatModel
        : !!selectedType && !!apiKey;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={availablePresets.length === 0}>
          <Plus className="size-3.5 mr-1.5" />
          Add Provider
        </Button>
      </DialogTrigger>
      <DialogContent className={isVertex ? "max-w-lg" : ""}>
        <DialogHeader>
          <DialogTitle>Add AI Provider</DialogTitle>
          <DialogDescription>
            {isVertex
              ? "Upload your Google Cloud service account JSON key"
              : isCompat
                ? "Connect any OpenAI-compatible API (LM APIs, vLLM, Ollama with OpenAI server, etc.)"
                : "Enter your API key to enable a new model provider"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Provider</Label>
            <div className="grid grid-cols-2 gap-2">
              {availablePresets.map((preset) => (
                <button
                  key={preset.type}
                  onClick={() => setSelectedType(preset.type)}
                  className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-colors ${
                    selectedType === preset.type
                      ? "border-primary bg-primary/10"
                      : "hover:bg-accent/50"
                  }`}
                >
                  <span className="text-lg">{preset.icon}</span>
                  <span className="font-medium text-sm">{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          {selectedType && !isVertex && !isCompat && selectedType !== "ollama" && (
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input
                type="password"
                placeholder={`Enter your ${presets.find((p) => p.type === selectedType)?.label} API key`}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoFocus
              />
            </div>
          )}

          {selectedType === "ollama" && (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">
                🦙 Local Ollama
              </p>
              <p>
                Ollama runs locally — no API key needed. Just make sure Ollama
                is running on your machine.
              </p>
              <p className="mt-2 font-mono text-xs">http://localhost:11434</p>
            </div>
          )}

          {isCompat && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Base URL <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="https://your-api.example.com/v1"
                  value={compatBaseUrl}
                  onChange={(e) => setCompatBaseUrl(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  The OpenAI-compatible API endpoint (include /v1 if applicable)
                </p>
              </div>
              <div className="space-y-2">
                <Label>API Key <span className="text-red-500">*</span></Label>
                <Input
                  type="password"
                  placeholder="Enter your API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Model Name <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="e.g. llama-3.1-70b or qwen2.5-72b"
                  value={compatModel}
                  onChange={(e) => setCompatModel(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The model identifier used by your API provider
                </p>
              </div>
            </div>
          )}

          {isVertex && (
            <>
              <div className="space-y-2">
                <Label>Service Account JSON</Label>
                <div className="flex gap-2 items-center">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-medium hover:bg-accent/50 transition-colors">
                      📎 Upload JSON file
                    </span>
                  </label>
                  {serviceAccountJson && (
                    <Badge
                      variant="secondary"
                      className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-500/10"
                    >
                      ✓ File loaded
                    </Badge>
                  )}
                </div>
                <textarea
                  className="w-full h-24 rounded-md border bg-muted/30 p-2 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Or paste your service account JSON here..."
                  value={serviceAccountJson}
                  onChange={(e) => {
                    setServiceAccountJson(e.target.value);
                    try {
                      const parsed = JSON.parse(e.target.value);
                      if (parsed.project_id) setProjectId(parsed.project_id);
                    } catch {
                      /* ignore while typing */
                    }
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Project ID</Label>
                  <Input
                    placeholder="my-project-id"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Region</Label>
                  <Select value={region} onValueChange={setRegion}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        "us-central1",
                        "us-east4",
                        "us-west1",
                        "europe-west1",
                        "europe-west4",
                        "asia-southeast1",
                      ].map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={!canSubmit || saving}>
              {saving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Add Provider
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
