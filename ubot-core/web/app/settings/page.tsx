"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
  Settings,
  Bot,
  Save,
  RefreshCw,
  Plus,
  Star,
  Pencil,
  Trash2,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";

interface LLMProvider {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  isDefault: boolean;
}

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

const PROVIDER_PRESETS: Record<
  string,
  { label: string; baseUrl: string }
> = {
  gemini: {
    label: "Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
  },
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1/",
  },
  ollama: {
    label: "Ollama",
    baseUrl: "http://localhost:11434/v1",
  },
  custom: {
    label: "Custom",
    baseUrl: "",
  },
};

const EMPTY_PROVIDER_FORM = {
  name: "",
  provider: "gemini" as string,
  baseUrl: PROVIDER_PRESETS.gemini.baseUrl,
  apiKey: "",
  model: "",
};

export default function SettingsPage() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [defaultId, setDefaultId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<LLMProvider | null>(
    null
  );
  const [formData, setFormData] = useState(EMPTY_PROVIDER_FORM);
  const [formSaving, setFormSaving] = useState(false);

  // Dynamic model discovery
  const [availableModels, setAvailableModels] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const data = await api<AgentConfig>("/api/chat/config");
      setConfig(data);
    } catch {
      /* ignore */
    }
  }, []);

  const loadProviders = useCallback(async () => {
    try {
      const data = await api<{ providers: LLMProvider[]; defaultId: string }>(
        "/api/llm-providers"
      );
      setProviders(data.providers || []);
      setDefaultId(data.defaultId || "");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadProviders();
  }, [loadConfig, loadProviders]);

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

  const updateField = (field: keyof AgentConfig, value: unknown) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  };

  // Provider CRUD
  const openAddDialog = () => {
    setEditingProvider(null);
    setFormData(EMPTY_PROVIDER_FORM);
    setAvailableModels([]);
    setModelsError(null);
    setDialogOpen(true);
    // Fetch models for the default provider type
    fetchModels(
      EMPTY_PROVIDER_FORM.provider,
      EMPTY_PROVIDER_FORM.baseUrl,
      ""
    );
  };

  const openEditDialog = (provider: LLMProvider) => {
    setEditingProvider(provider);
    setFormData({
      name: provider.name,
      provider: provider.provider,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: provider.model,
    });
    setAvailableModels([]);
    setModelsError(null);
    setDialogOpen(true);
    // Fetch models — pass providerId so the backend can use the stored API key
    fetchModels(provider.provider, provider.baseUrl, provider.apiKey, provider.id);
  };

  const fetchModels = useCallback(
    async (provider: string, baseUrl: string, apiKey: string, providerId?: string) => {
      if (!baseUrl) {
        setAvailableModels([]);
        return;
      }
      setModelsLoading(true);
      setModelsError(null);
      try {
        const params = new URLSearchParams({ baseUrl, provider });
        if (apiKey) params.set('apiKey', apiKey);
        if (providerId) params.set('providerId', providerId);
        const data = await api<{
          models: Array<{ id: string; name: string }>;
          error?: string;
        }>(`/api/llm-providers/models?${params}`);
        if (data.models && data.models.length > 0) {
          setAvailableModels(data.models);
        } else {
          setAvailableModels([]);
          if (data.error) setModelsError(data.error);
          else setModelsError('No models found. Check base URL and API key.');
        }
      } catch {
        setAvailableModels([]);
        setModelsError('Failed to fetch models. Check base URL and API key.');
      } finally {
        setModelsLoading(false);
      }
    },
    []
  );

  const handleProviderTypeChange = (type: string) => {
    const preset = PROVIDER_PRESETS[type];
    const newBaseUrl = preset?.baseUrl || formData.baseUrl;
    setFormData((prev) => ({
      ...prev,
      provider: type,
      baseUrl: newBaseUrl,
      model: "",
    }));
    // Fetch models for the new provider
    fetchModels(type, newBaseUrl, formData.apiKey);
  };

  // Re-fetch models when base URL changes (debounced)
  const handleBaseUrlChange = (newUrl: string) => {
    setFormData((prev) => ({ ...prev, baseUrl: newUrl, model: "" }));
  };

  const handleBaseUrlBlur = () => {
    if (formData.baseUrl) {
      fetchModels(formData.provider, formData.baseUrl, formData.apiKey);
    }
  };

  // Re-fetch models when API key changes (on blur)
  const handleApiKeyBlur = () => {
    if (formData.baseUrl && formData.apiKey) {
      fetchModels(formData.provider, formData.baseUrl, formData.apiKey);
    }
  };

  const handleSaveProvider = async () => {
    setFormSaving(true);
    try {
      if (editingProvider) {
        await api(`/api/llm-providers/${editingProvider.id}`, {
          method: "PUT",
          body: formData,
        });
      } else {
        await api("/api/llm-providers", {
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

  const handleDeleteProvider = async (id: string) => {
    try {
      await api(`/api/llm-providers/${id}`, { method: "DELETE" });
      await loadProviders();
    } catch {
      /* ignore */
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await api(`/api/llm-providers/${id}/default`, { method: "PUT" });
      await loadProviders();
    } catch {
      /* ignore */
    }
  };

  const preset = PROVIDER_PRESETS[formData.provider] || PROVIDER_PRESETS.custom;

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
          {/* Provider list */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">LLM Providers</h2>
              <p className="text-sm text-muted-foreground">
                Configure multiple LLM providers and select a default
              </p>
            </div>
            <Button onClick={openAddDialog} size="sm">
              <Plus className="size-4 mr-2" />
              Add Provider
            </Button>
          </div>

          {providers.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <Bot className="size-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No LLM providers configured</p>
                <p className="text-sm mt-1">
                  Add your first provider to get started
                </p>
                <Button onClick={openAddDialog} className="mt-4" size="sm">
                  <Plus className="size-4 mr-2" />
                  Add Provider
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {providers.map((provider) => (
                <Card
                  key={provider.id}
                  className={
                    provider.id === defaultId
                      ? "border-primary/50 bg-primary/[0.03]"
                      : ""
                  }
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
                            <span className="font-medium truncate">
                              {provider.name}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-xs shrink-0"
                            >
                              {(
                                PROVIDER_PRESETS[provider.provider]?.label ||
                                provider.provider
                              ).toUpperCase()}
                            </Badge>
                            {provider.id === defaultId && (
                              <Badge className="bg-primary/15 text-primary border-primary/25 text-xs shrink-0">
                                <Star className="size-3 mr-1 fill-current" />
                                Default
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5 truncate">
                            {provider.model}
                          </p>
                          <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">
                            {provider.baseUrl}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 ml-3">
                        {provider.id !== defaultId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => handleSetDefault(provider.id)}
                          >
                            <Star className="size-3.5 mr-1" />
                            Set Default
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
                          onClick={() => handleDeleteProvider(provider.id)}
                          disabled={
                            provider.id === defaultId && providers.length > 1
                          }
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

          <Separator />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">General</CardTitle>
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

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Telegram Auto-Reply</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically respond to incoming Telegram messages from
                    visitors
                  </p>
                </div>
                <Switch
                  checked={config?.autoReplyTelegram || false}
                  onCheckedChange={(v) =>
                    updateField("autoReplyTelegram", v)
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Owner Identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Your identity across messaging channels. Used to recognize you
                as the owner when you message the bot.
              </p>

              <div className="space-y-2">
                <Label htmlFor="ownerPhone">WhatsApp Number</Label>
                <Input
                  id="ownerPhone"
                  value={config?.ownerPhone || ""}
                  onChange={(e) =>
                    updateField("ownerPhone", e.target.value)
                  }
                  placeholder="+971569737344"
                />
                <p className="text-xs text-muted-foreground">
                  Your WhatsApp phone number — used to detect owner messages.
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="ownerTelegramUsername">
                  Telegram Username
                </Label>
                <Input
                  id="ownerTelegramUsername"
                  value={config?.ownerTelegramUsername || ""}
                  onChange={(e) =>
                    updateField("ownerTelegramUsername", e.target.value)
                  }
                  placeholder="singsungwong"
                />
                <p className="text-xs text-muted-foreground">
                  Your Telegram username (without @). This is the primary way
                  to detect you on Telegram.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ownerTelegramId">Telegram Chat ID</Label>
                <Input
                  id="ownerTelegramId"
                  value={config?.ownerTelegramId || ""}
                  onChange={(e) =>
                    updateField("ownerTelegramId", e.target.value)
                  }
                  placeholder="Auto-detected on first message"
                />
                <p className="text-xs text-muted-foreground">
                  Auto-saved after your first message to the bot. You can also
                  set it manually from @userinfobot.
                </p>
              </div>

              <Separator />

              <p className="text-xs text-muted-foreground">
                Approval requests from third parties will be forwarded to your
                configured channels.
              </p>
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

      {/* Add / Edit Provider Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {editingProvider ? "Edit Provider" : "Add LLM Provider"}
            </DialogTitle>
            <DialogDescription>
              {editingProvider
                ? "Update the provider configuration."
                : "Configure a new LLM provider for your agent."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="providerName">Name</Label>
              <Input
                id="providerName"
                placeholder="e.g. Gemini Flash"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>

            <div className="grid gap-2">
              <Label>Provider Type</Label>
              <Select
                value={formData.provider}
                onValueChange={handleProviderTypeChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">Gemini</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="ollama">Ollama (Local)</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="providerBaseUrl">Base URL</Label>
              <Input
                id="providerBaseUrl"
                placeholder="https://api.example.com/v1/"
                value={formData.baseUrl}
                onChange={(e) => handleBaseUrlChange(e.target.value)}
                onBlur={handleBaseUrlBlur}
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="providerModel">Model</Label>
                {modelsLoading && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <RefreshCw className="size-3 animate-spin" />
                    Loading models...
                  </span>
                )}
                {!modelsLoading && availableModels.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {availableModels.length} models available
                  </span>
                )}
              </div>
              {availableModels.length > 0 ? (
                <Select
                  value={formData.model}
                  onValueChange={(v) =>
                    setFormData({ ...formData, model: v })
                  }
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
                  onChange={(e) =>
                    setFormData({ ...formData, model: e.target.value })
                  }
                  disabled={modelsLoading}
                />
              )}
              {modelsError && (
                <p className="text-xs text-amber-500">
                  Could not fetch models. You can type a model name manually.
                </p>
              )}
            </div>

            {formData.provider !== "ollama" && (
              <div className="grid gap-2">
                <Label htmlFor="providerApiKey">API Key</Label>
                <Input
                  id="providerApiKey"
                  type="password"
                  placeholder={
                    editingProvider
                      ? "Leave blank to keep existing key"
                      : "Enter API key"
                  }
                  value={formData.apiKey}
                  onChange={(e) =>
                    setFormData({ ...formData, apiKey: e.target.value })
                  }
                  onBlur={handleApiKeyBlur}
                />
                <p className="text-xs text-muted-foreground">
                  {formData.provider === "gemini"
                    ? "Google AI Studio API key — enter to fetch available models"
                    : "Your provider's API key — enter to fetch available models"}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveProvider}
              disabled={formSaving || !formData.name || !formData.model || !formData.baseUrl}
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
    </div>
  );
}
