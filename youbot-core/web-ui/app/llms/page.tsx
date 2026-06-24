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
        fetch(`/api/integrations/models?t=${Date.now()}`),
        fetch(`/api/config/model-routing?t=${Date.now()}`),
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
    <div className="p-6 pb-12 space-y-6 flex-1">
      {/* Header */}
      <div className="flex items-center gap-3 border-b pb-6 mb-6">
        <Bot className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Models</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Add your API keys and the system will automatically route tasks to the best model
          </p>
        </div>
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
      {/* ─── Section 3: Usage Metering ─────────────────────── */}
      {usage && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="size-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Usage & Costs</h2>
            </div>
            <Select value={usagePeriod} onValueChange={setUsagePeriod}>
              <SelectTrigger className="w-[150px]">
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Object.values(
                    (usage.byPurpose || {}) as Record<
                      string,
                      { calls: number }
                    >,
                  )
                    .reduce((s, p) => s + p.calls, 0)
                    .toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Input Tokens</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(usage.totalInputTokens || 0).toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Output Tokens</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(usage.totalOutputTokens || 0).toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Est. Cost</CardTitle>
                <TrendingUp className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">
                  ${(usage.totalCost || 0).toFixed(4)}
                </div>
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
  
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<{id: string, name: string}[]>([]);

  const isOllama = provider.key === "ollama";
  const isLmstudio = provider.key === "lmstudio";
  const isLocalFree = isOllama || isLmstudio;

  const maskedKey = provider.apiKey
    ? provider.apiKey.slice(0, 4) +
      "•".repeat(Math.min(24, provider.apiKey.length - 4))
    : "";

  const fetchModels = async () => {
    setFetchingModels(true);
    try {
      const bUrl = editBaseUrl || provider.baseUrl || "";
      const aKey = editKey || provider.apiKey || "";
      const res = await fetch(`/api/integrations/models/models?provider=${provider.key}&providerKey=${provider.key}&baseUrl=${encodeURIComponent(bUrl)}&apiKey=${encodeURIComponent(aKey)}`);
      const data = await res.json();
      if (data.models && data.models.length > 0) {
        setFetchedModels(data.models);
        if (!editModel) {
          setEditModel(data.models[0].id);
        }
      } else {
        alert(data.error || "No models found or failed to load");
      }
    } catch (e) {
      alert("Failed to fetch models");
    } finally {
      setFetchingModels(false);
    }
  };

  function handleSaveEdit() {
    const updates: Partial<ConfiguredProvider> = {};
    if (editKey) updates.apiKey = editKey;
    if (editBaseUrl !== "") updates.baseUrl = editBaseUrl;
    if (editModel !== "") updates.model = editModel;
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
            setFetchedModels([]);
          } else {
            setEditBaseUrl(provider.baseUrl || "");
            setEditModel(provider.model || "");
          }
          setEditing(open);
        }}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Route className="h-5 w-5 text-blue-500" />
                Edit {provider.key}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Update connection settings for {provider.key}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 pt-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Enabled</Label>
                <Switch 
                  checked={provider.enabled} 
                  onCheckedChange={onToggle} 
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Name</Label>
                <Input 
                  value={provider.key} 
                  disabled
                  className="h-10 capitalize opacity-50" 
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Base URL</Label>
                <Input
                  placeholder="https://api.example.com/v1"
                  value={editBaseUrl !== "" ? editBaseUrl : (provider.baseUrl || "")}
                  onChange={(e) => setEditBaseUrl(e.target.value)}
                  className="h-10 font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">API Key</Label>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Input
                      type={showKey ? 'text' : 'password'}
                      placeholder="Leave blank to keep current key"
                      value={editKey}
                      onChange={(e) => setEditKey(e.target.value)}
                      className="font-mono text-sm h-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button 
                    variant="secondary" 
                    onClick={fetchModels}
                    disabled={fetchingModels}
                  >
                    {fetchingModels ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Load Models
                  </Button>
                </div>
                <p className="text-[12px] text-muted-foreground italic mt-2">Click "Load Models" to fetch available models from the API.</p>
              </div>

              {/* Manual Model Entry */}
              <div className="pt-5 border-t space-y-3">
                <Label className="text-sm font-medium">Manual Model Entry</Label>
                <p className="text-[12px] text-muted-foreground mb-3">If the API doesn't list models, enter the exact model ID here or select from loaded models.</p>
                <div className="flex items-center gap-3">
                  {fetchedModels.length > 0 ? (
                    <Select
                      value={editModel || provider.model || ''}
                      onValueChange={setEditModel}
                    >
                      <SelectTrigger className="font-mono text-sm h-10 flex-1">
                        <SelectValue placeholder="Select model…" />
                      </SelectTrigger>
                      <SelectContent>
                        {fetchedModels.map(m => (
                          <SelectItem key={m.id} value={m.id} className="font-mono text-sm">
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      placeholder="e.g. gpt-4o, claude-3-5-sonnet"
                      value={editModel || provider.model || ''}
                      onChange={(e) => setEditModel(e.target.value)}
                      className="font-mono text-sm h-10 flex-1"
                    />
                  )}
                  <Button variant="outline" onClick={() => {
                     // The model is automatically bound to editModel
                     alert("Default model configured!");
                  }}>
                    Set Default
                  </Button>
                </div>
              </div>

              <Button onClick={handleSaveEdit} className="w-full mt-4">
                Save Changes
              </Button>
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

  // General & Compat state
  const [compatBaseUrl, setCompatBaseUrl] = useState("");
  const [compatModel, setCompatModel] = useState("");
  
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<{id: string, name: string}[]>([]);
  const [showKey, setShowKey] = useState(false);

  const availablePresets = presets.filter(
    (p) => !existingKeys.includes(p.type),
  );
  const isVertex = selectedType === "vertex";
  const isCompat = selectedType === "openai-compat";
  const isOllama = selectedType === "ollama";
  const isLmstudio = selectedType === "lmstudio";
  const isLocalFree = isOllama || isLmstudio;
  
  const needsApiKey = selectedType && !isVertex && !isLocalFree;

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

  const fetchModels = async () => {
    setFetchingModels(true);
    try {
      const bUrl = compatBaseUrl || "";
      const res = await fetch(`/api/integrations/models/models?provider=${selectedType}&providerKey=${selectedType}&baseUrl=${encodeURIComponent(bUrl)}&apiKey=${encodeURIComponent(apiKey)}`);
      const data = await res.json();
      if (data.models && data.models.length > 0) {
        setFetchedModels(data.models);
        if (!compatModel) {
          setCompatModel(data.models[0].id);
        }
      } else {
        alert(data.error || "No models found or failed to load");
      }
    } catch (e) {
      alert("Failed to fetch models");
    } finally {
      setFetchingModels(false);
    }
  };

  async function handleAdd() {
    if (!selectedType) return;
    setSaving(true);

    try {
      if (isVertex) {
        if (!serviceAccountJson || !projectId) return;
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
        onAdd("vertex", "__vertex_sa__", "", {
          projectId,
          region,
          serviceAccountJson,
        });
      } else if (isLocalFree) {
        onAdd(selectedType, "", "");
      } else if (isCompat) {
        if (!apiKey || !compatBaseUrl.trim() || !compatModel.trim()) return;
        onAdd(selectedType, apiKey, compatModel.trim(), {
          baseUrl: compatBaseUrl.trim().replace(/\/+$/, ""),
          modelOverride: compatModel.trim(),
        });
      } else {
        if (!apiKey) return;
        // Also pass compatModel if selected for standard providers
        onAdd(selectedType, apiKey, compatModel.trim());
      }

      setOpen(false);
      resetState();
    } finally {
      setSaving(false);
    }
  }

  function resetState() {
    setSelectedType("");
    setApiKey("");
    setServiceAccountJson("");
    setProjectId("");
    setRegion("us-central1");
    setCompatBaseUrl("");
    setCompatModel("");
    setFetchedModels([]);
  }

  const canSubmit = isVertex
    ? !!serviceAccountJson && !!projectId
    : isLocalFree
      ? true
      : isCompat
        ? !!selectedType && !!apiKey && !!compatBaseUrl && !!compatModel
        : !!selectedType && !!apiKey;

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!val) resetState();
      setOpen(val);
    }}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={availablePresets.length === 0}>
          <Plus className="size-3.5 mr-1.5" />
          Add Provider
        </Button>
      </DialogTrigger>
      <DialogContent className={isVertex ? "max-w-lg" : "sm:max-w-[480px]"}>
        <DialogHeader>
          <DialogTitle>Add AI Provider</DialogTitle>
          <DialogDescription>
            {isVertex
              ? "Upload your Google Cloud service account JSON key"
              : isCompat
                ? "Connect any OpenAI-compatible API"
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
                  onClick={() => {
                    setSelectedType(preset.type);
                    setFetchedModels([]);
                  }}
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

          {isOllama && (
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
          )}

          {needsApiKey && (
            <div className="space-y-2">
              <Label>API Key <span className="text-red-500">*</span></Label>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Input
                    type={showKey ? 'text' : 'password'}
                    placeholder={`Enter your ${presets.find((p) => p.type === selectedType)?.label || ""} API key`}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="font-mono text-sm h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button 
                  variant="secondary" 
                  onClick={fetchModels}
                  disabled={fetchingModels || !apiKey || (isCompat && !compatBaseUrl)}
                >
                  {fetchingModels ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Load Models
                </Button>
              </div>
              <p className="text-[12px] text-muted-foreground italic mt-2">Click "Load Models" to fetch available models from the API.</p>
            </div>
          )}

          {needsApiKey && (
            <div className="pt-5 border-t space-y-3">
              <Label className="text-sm font-medium">Manual Model Entry</Label>
              <p className="text-[12px] text-muted-foreground mb-3">If the API doesn't list models, enter the exact model ID here or select from loaded models.</p>
              <div className="flex items-center gap-3">
                {fetchedModels.length > 0 ? (
                  <Select
                    value={compatModel}
                    onValueChange={setCompatModel}
                  >
                    <SelectTrigger className="font-mono text-sm h-10 flex-1">
                      <SelectValue placeholder="Select model…" />
                    </SelectTrigger>
                    <SelectContent>
                      {fetchedModels.map(m => (
                        <SelectItem key={m.id} value={m.id} className="font-mono text-sm">
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder="e.g. gpt-4o, claude-3-5-sonnet"
                    value={compatModel}
                    onChange={(e) => setCompatModel(e.target.value)}
                    className="font-mono text-sm h-10 flex-1"
                  />
                )}
                <Button variant="outline" onClick={() => {
                   alert("Default model configured!");
                }}>
                  Set Default
                </Button>
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

          <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
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
