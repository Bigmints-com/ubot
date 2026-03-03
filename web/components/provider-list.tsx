"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Star,
  Pencil,
  Trash2,
  Zap,
  RefreshCw,
  Save,
  Eye,
  EyeOff,
} from "lucide-react";
import { api } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────

export interface IntegrationProvider {
  id: string;
  name: string;
  type: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  enabled: boolean;
  isDefault: boolean;
  config?: Record<string, unknown>;
}

export interface ProviderTypePreset {
  type: string;
  label: string;
  baseUrl: string;
  requiresApiKey: boolean;
  supportsModelDiscovery: boolean;
}

interface ProviderListProps {
  /** Integration category, e.g. 'llm-chat', 'search' */
  category: string;
  /** Available provider types for the add dialog */
  providerTypes: ProviderTypePreset[];
  /** Whether to show model selector (LLMs yes, search no) */
  showModel?: boolean;
  /** Whether to show base URL (LLMs yes, some search no) */
  showBaseUrl?: boolean;
  /** Empty state text */
  emptyText?: string;
}

// ─── Component ───────────────────────────────────────────

export function ProviderList({
  category,
  providerTypes,
  showModel = true,
  showBaseUrl = true,
  emptyText = "No providers configured",
}: ProviderListProps) {
  const [providers, setProviders] = useState<IntegrationProvider[]>([]);
  const [defaultId, setDefaultId] = useState("");
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<IntegrationProvider | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    type: providerTypes[0]?.type || "",
    baseUrl: providerTypes[0]?.baseUrl || "",
    apiKey: "",
    model: "",
  });
  const [formSaving, setFormSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Model discovery
  const [availableModels, setAvailableModels] = useState<{ id: string; name: string }[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // ── Data Loading ──

  const loadProviders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ providers: IntegrationProvider[]; defaultId: string }>(
        `/api/integrations/${category}`
      );
      setProviders(data.providers || []);
      setDefaultId(data.defaultId || "");
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  // ── Model Discovery ──

  const fetchModels = useCallback(
    async (type: string, baseUrl: string, apiKey: string, providerId?: string) => {
      if (!baseUrl || !showModel) return;
      setModelsLoading(true);
      setModelsError(null);
      try {
        const params = new URLSearchParams({ baseUrl, provider: type });
        if (apiKey) params.set("apiKey", apiKey);
        if (providerId) params.set("providerId", providerId);
        const data = await api<{ models: { id: string; name: string }[]; error?: string }>(
          `/api/integrations/${category}/models?${params}`
        );
        if (data.models?.length > 0) {
          setAvailableModels(data.models);
        } else {
          setAvailableModels([]);
          setModelsError(data.error || "No models found");
        }
      } catch {
        setAvailableModels([]);
        setModelsError("Failed to fetch models");
      } finally {
        setModelsLoading(false);
      }
    },
    [category, showModel]
  );

  // ── Dialog ──

  const openAddDialog = () => {
    const preset = providerTypes[0];
    setEditingProvider(null);
    setFormData({
      name: "",
      type: preset?.type || "",
      baseUrl: preset?.baseUrl || "",
      apiKey: "",
      model: "",
    });
    setAvailableModels([]);
    setModelsError(null);
    setShowApiKey(false);
    setDialogOpen(true);
    if (preset?.supportsModelDiscovery && preset.baseUrl) {
      fetchModels(preset.type, preset.baseUrl, "");
    }
  };

  const openEditDialog = (provider: IntegrationProvider) => {
    setEditingProvider(provider);
    setFormData({
      name: provider.name,
      type: provider.type,
      baseUrl: provider.baseUrl || "",
      apiKey: provider.apiKey || "",
      model: provider.model || "",
    });
    setAvailableModels([]);
    setModelsError(null);
    setShowApiKey(false);
    setDialogOpen(true);
    const preset = providerTypes.find((p) => p.type === provider.type);
    if (preset?.supportsModelDiscovery && provider.baseUrl) {
      fetchModels(provider.type, provider.baseUrl, provider.apiKey || "", provider.id);
    }
  };

  const handleTypeChange = (type: string) => {
    const preset = providerTypes.find((p) => p.type === type);
    const newBaseUrl = preset?.baseUrl || formData.baseUrl;
    setFormData((prev) => ({ ...prev, type, baseUrl: newBaseUrl, model: "" }));
    if (preset?.supportsModelDiscovery && newBaseUrl) {
      fetchModels(type, newBaseUrl, formData.apiKey);
    }
  };

  const handleSave = async () => {
    setFormSaving(true);
    try {
      if (editingProvider) {
        await api(`/api/integrations/${category}/${editingProvider.id}`, {
          method: "PUT",
          body: formData,
        });
      } else {
        await api(`/api/integrations/${category}`, {
          method: "POST",
          body: formData,
        });
      }
      setDialogOpen(false);
      await loadProviders();
    } catch {
      /* ignore */
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/api/integrations/${category}/${id}`, { method: "DELETE" });
      await loadProviders();
    } catch {
      /* ignore */
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await api(`/api/integrations/${category}/${id}/default`, { method: "PUT" });
      await loadProviders();
    } catch {
      /* ignore */
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await api(`/api/integrations/${category}/${id}/toggle`, { method: "PUT" });
      await loadProviders();
    } catch {
      /* ignore */
    }
  };

  // ── Render ──

  const currentPreset = providerTypes.find((p) => p.type === formData.type);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <RefreshCw className="size-4 mr-2 animate-spin" /> Loading providers...
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {providers.length} provider{providers.length !== 1 ? "s" : ""} configured
        </p>
        <Button onClick={openAddDialog} size="sm">
          <Plus className="size-4 mr-2" /> Add Provider
        </Button>
      </div>

      {providers.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Zap className="size-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">{emptyText}</p>
            <Button onClick={openAddDialog} className="mt-4" size="sm">
              <Plus className="size-4 mr-2" /> Add Provider
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {providers.map((provider) => (
            <Card
              key={provider.id}
              className={`${
                provider.id === defaultId ? "border-primary/50 bg-primary/[0.03]" : ""
              } ${!provider.enabled ? "opacity-60" : ""}`}
            >
              <CardContent className="py-4 px-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div
                      className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${
                        provider.id === defaultId
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Zap className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{provider.name}</span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {(
                            providerTypes.find((p) => p.type === provider.type)?.label ||
                            provider.type
                          ).toUpperCase()}
                        </Badge>
                        {provider.id === defaultId && (
                          <Badge className="bg-primary/15 text-primary border-primary/25 text-xs shrink-0">
                            <Star className="size-3 mr-1 fill-current" /> Default
                          </Badge>
                        )}
                        {!provider.enabled && (
                          <Badge variant="secondary" className="text-xs shrink-0">
                            Disabled
                          </Badge>
                        )}
                      </div>
                      {provider.model && (
                        <p className="text-sm text-muted-foreground mt-0.5 truncate">
                          {provider.model}
                        </p>
                      )}
                      {provider.baseUrl && (
                        <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">
                          {provider.baseUrl}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-3">
                    <Switch
                      checked={provider.enabled}
                      onCheckedChange={() => handleToggle(provider.id)}
                      className="mr-1"
                    />
                    {provider.id !== defaultId && provider.enabled && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => handleSetDefault(provider.id)}
                      >
                        <Star className="size-3.5 mr-1" /> Default
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => openEditDialog(provider)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(provider.id)}
                      disabled={provider.id === defaultId && providers.length > 1}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Add / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {editingProvider ? "Edit Provider" : "Add Provider"}
            </DialogTitle>
            <DialogDescription>
              {editingProvider
                ? "Update the provider configuration."
                : "Configure a new provider."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="providerName">Name</Label>
              <Input
                id="providerName"
                placeholder="e.g. Gemini Flash"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label>Provider Type</Label>
              <Select value={formData.type} onValueChange={handleTypeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {providerTypes.map((p) => (
                    <SelectItem key={p.type} value={p.type}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {showBaseUrl && (
              <div className="grid gap-2">
                <Label htmlFor="providerBaseUrl">Base URL</Label>
                <Input
                  id="providerBaseUrl"
                  placeholder="https://api.example.com/v1/"
                  value={formData.baseUrl}
                  onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value, model: "" })}
                  onBlur={() => {
                    if (formData.baseUrl && currentPreset?.supportsModelDiscovery) {
                      fetchModels(formData.type, formData.baseUrl, formData.apiKey);
                    }
                  }}
                />
              </div>
            )}

            {showModel && (
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="providerModel">Model</Label>
                  {modelsLoading && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <RefreshCw className="size-3 animate-spin" /> Loading...
                    </span>
                  )}
                  {!modelsLoading && availableModels.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {availableModels.length} models
                    </span>
                  )}
                </div>
                {availableModels.length > 0 ? (
                  <Select
                    value={formData.model}
                    onValueChange={(v) => setFormData({ ...formData, model: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={modelsLoading ? "Loading..." : "Select a model"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableModels.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="providerModel"
                    placeholder={modelsLoading ? "Loading models..." : "Enter model name"}
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    disabled={modelsLoading}
                  />
                )}
                {modelsError && (
                  <p className="text-xs text-amber-500">
                    Could not fetch models. You can type a model name manually.
                  </p>
                )}
              </div>
            )}

            {currentPreset?.requiresApiKey !== false && (
              <div className="grid gap-2">
                <Label htmlFor="providerApiKey">API Key</Label>
                <div className="relative">
                  <Input
                    id="providerApiKey"
                    type={showApiKey ? "text" : "password"}
                    placeholder={
                      editingProvider ? "Leave blank to keep existing key" : "Enter API key"
                    }
                    value={formData.apiKey}
                    onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                    onBlur={() => {
                      if (formData.baseUrl && formData.apiKey && currentPreset?.supportsModelDiscovery) {
                        fetchModels(formData.type, formData.baseUrl, formData.apiKey);
                      }
                    }}
                    className="pr-10"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 size-7"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={formSaving || !formData.name || !formData.type}
            >
              {formSaving ? (
                <RefreshCw className="size-4 mr-2 animate-spin" />
              ) : (
                <Save className="size-4 mr-2" />
              )}
              {editingProvider ? "Update" : "Add Provider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
