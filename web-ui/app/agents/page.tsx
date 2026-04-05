"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bot, RefreshCw, Settings, ShieldAlert, Cpu, ArrowLeft, Save, Check, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ModelSelector } from "@/components/model-selector";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";

interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt?: string;
  allowedTools?: string[];
  model?: string;
  temperature?: number;
  autonomyTier?: "T1" | "T2" | "T3";
  capabilities?: string[];
}

const TIER_META: Record<string, { label: string; color: string }> = {
  T1: { label: "T1 Standard", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  T2: { label: "T2 Co-pilot", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  T3: { label: "T3 Autonomous", color: "bg-red-500/10 text-red-500 border-red-500/20" },
};

function getTierMeta(tier?: string) {
  return TIER_META[tier || "T1"] || TIER_META.T1;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor State
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [agentForm, setAgentForm] = useState<AgentDefinition | null>(null);
  const [originalForm, setOriginalForm] = useState<AgentDefinition | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [newTool, setNewTool] = useState("");

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ agents: AgentDefinition[] }>("/api/agents");
      setAgents(data.agents || []);
    } catch {
      toast.error("Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      loadAgents();
    }
  }, [selectedId, loadAgents]);

  const loadAgentDetails = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const data = await api<{ agent: AgentDefinition }>(`/api/agents/${encodeURIComponent(id)}`);
      setAgentForm(data.agent);
      setOriginalForm(JSON.parse(JSON.stringify(data.agent)));
      setSelectedId(id);
    } catch {
      toast.error("Failed to load agent details");
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSave = async () => {
    if (!agentForm || !selectedId) return;
    setSaving(true);
    try {
      const data = await api<{ agent: AgentDefinition }>(`/api/agents/${encodeURIComponent(selectedId)}`, {
        method: "PUT",
        body: agentForm,
      });
      setAgentForm(data.agent);
      setOriginalForm(JSON.parse(JSON.stringify(data.agent)));
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
      toast.success("Agent configuration saved");
    } catch {
      toast.error("Failed to save agent configuration");
    } finally {
      setSaving(false);
    }
  };

  const addTool = () => {
    if (!agentForm || !newTool.trim()) return;
    const tools = agentForm.allowedTools || [];
    if (tools.includes(newTool.trim())) {
      toast.error("Tool already exists");
      return;
    }
    setAgentForm({ ...agentForm, allowedTools: [...tools, newTool.trim()] });
    setNewTool("");
  };

  const removeTool = (tool: string) => {
    if (!agentForm) return;
    setAgentForm({ ...agentForm, allowedTools: (agentForm.allowedTools || []).filter(t => t !== tool) });
  };

  const hasChanges = JSON.stringify(agentForm) !== JSON.stringify(originalForm);

  // ── Editor View ────────────────────────────────────────────
  if (selectedId && agentForm) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => { setSelectedId(null); setNewTool(""); }}>
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{originalForm?.name}</h1>
              <p className="text-muted-foreground text-sm">Adjust autonomy boundaries and persona instructions</p>
            </div>
          </div>
          <div className="flex gap-2">
            {hasChanges && (
              <Badge variant="outline" className="text-amber-500 border-amber-500/50 bg-amber-500/10 self-center h-8">
                Unsaved Changes
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => loadAgentDetails(selectedId)} disabled={loading}>
              <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Discard
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !hasChanges}>
              {justSaved ? (
                <><Check className="size-4 mr-2" /> Saved</>
              ) : (
                <><Save className="size-4 mr-2" /> Save Changes</>
              )}
            </Button>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="size-4" /> Identity
                </CardTitle>
                <CardDescription>Core details of the agent</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="w-16 h-16 rounded-lg overflow-hidden border bg-muted flex items-center justify-center">
                   <img
                    src={`/avatars/${agentForm.id}.png`}
                    alt={agentForm.name}
                    className="object-cover w-full h-full"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/avatars/nexus.png'; }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Display Name</Label>
                  <Input 
                    value={agentForm.name} 
                    onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input 
                    value={agentForm.description} 
                    onChange={(e) => setAgentForm({ ...agentForm, description: e.target.value })} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Model Override</Label>
                  <ModelSelector
                    value={agentForm.model}
                    onChange={(model) => setAgentForm({ ...agentForm, model })}
                  />
                  <p className="text-xs text-muted-foreground">
                    {agentForm.model
                      ? `This agent uses ${agentForm.model} instead of the global model.`
                      : "Uses the global model routing. Set a model to override."}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldAlert className="size-4" /> Governance
                </CardTitle>
                <CardDescription>Autonomy boundaries and capabilities</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Autonomy Tier</Label>
                  <Select 
                    value={agentForm.autonomyTier || "T1"} 
                    onValueChange={(val) => setAgentForm({ ...agentForm, autonomyTier: val as AgentDefinition["autonomyTier"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="T1">T1 — Standard / Safe</SelectItem>
                      <SelectItem value="T2">T2 — Co-pilot (Requires Approval)</SelectItem>
                      <SelectItem value="T3">T3 — Fully Autonomous</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    T2/T3 tasks are routed to the approval board for human-in-the-loop governance.
                  </p>
                </div>
                
                <Separator />
                
                <div className="space-y-2 pt-1">
                  <Label>Allowed Tools</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {(agentForm.allowedTools || []).map((t) => (
                      <Badge key={t} variant="secondary" className="font-mono text-xs gap-1 pr-1">
                        {t}
                        <button
                          type="button"
                          onClick={() => removeTool(t)}
                          className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 transition-colors"
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                    {(!agentForm.allowedTools || agentForm.allowedTools.length === 0) && (
                      <span className="text-sm text-muted-foreground">All tools (no restrictions)</span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Input
                      value={newTool}
                      onChange={(e) => setNewTool(e.target.value)}
                      placeholder="tool_name"
                      className="font-mono text-xs"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTool(); } }}
                    />
                    <Button variant="outline" size="sm" onClick={addTool} disabled={!newTool.trim()}>
                      <Plus className="size-4 mr-1" /> Add
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card className="flex flex-col h-full min-h-[600px]">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="size-4" /> System Persona
                </CardTitle>
                <CardDescription>
                  Instructions and operational boundaries injected into context
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 p-0 relative border-t">
                <div className="absolute inset-0">
                  <CodeMirror
                    value={agentForm.systemPrompt || ""}
                    onChange={(val) => setAgentForm({ ...agentForm, systemPrompt: val })}
                    extensions={[markdown({ codeLanguages: languages }), EditorView.lineWrapping]}
                    theme={oneDark}
                    height="100%"
                    className="h-full text-sm font-mono"
                    basicSetup={{
                      lineNumbers: true,
                      foldGutter: true,
                      highlightActiveLine: true,
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // ── List View ──────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-lg">
            <Bot className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Specialized Agents</h1>
            <p className="text-muted-foreground text-sm">Manage autonomous crew capabilities and governance tiers</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadAgents} disabled={loading}>
            <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} /> 
            Refresh
          </Button>
        </div>
      </div>

      <Separator />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map((i) => (
            <Card key={i} className="h-48 animate-pulse bg-muted" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center text-muted-foreground py-16 border rounded-lg border-dashed">
          <Bot className="size-12 mx-auto mb-4 opacity-40" />
          <p className="font-medium text-lg">No specialized agents</p>
          <p className="text-sm mt-1 mb-4">Create agent definitions in the workspace agents directory.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent) => {
            const tier = getTierMeta(agent.autonomyTier);
            return (
              <Card key={agent.id} className="flex flex-col overflow-hidden bg-card transition-colors hover:bg-muted/50 group">
                <CardHeader className="flex flex-row items-start gap-4 pb-4">
                  <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 border bg-muted flex items-center justify-center">
                    <img
                      src={`/avatars/${agent.id}.png`}
                      alt={agent.name}
                      className="object-cover w-full h-full opacity-90 group-hover:opacity-100 transition-opacity"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/avatars/nexus.png';
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <CardTitle className="text-lg truncate">
                      {agent.name}
                    </CardTitle>
                    <CardDescription className="text-sm mt-1 line-clamp-2">
                      {agent.description}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 py-0">
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="outline" className={tier.color}>
                      {tier.label}
                    </Badge>
                    <Badge variant="secondary">
                      <Cpu className="size-3 mr-1 opacity-70" />
                      {agent.allowedTools?.length || 0} Tools
                    </Badge>
                    {agent.model && (
                      <Badge variant="outline" className="font-mono text-xs bg-primary/5 text-primary border-primary/20">
                        {agent.model.length > 25 ? agent.model.slice(0, 22) + "…" : agent.model}
                      </Badge>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="pt-6 pb-4">
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="w-full justify-between"
                    onClick={() => loadAgentDetails(agent.id)}
                  >
                    Configure
                    <Settings className="size-4 text-muted-foreground" />
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
