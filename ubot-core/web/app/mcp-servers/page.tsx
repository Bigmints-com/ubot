"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plug,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Wrench,
  Loader2,
  Zap,
  Search,
} from "lucide-react";
import { api } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────

interface McpToolInfo {
  name: string;
  description: string;
}

interface McpServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabledTools: string[];
  discoveredTools: McpToolInfo[];
  status: "connected" | "disconnected" | "error";
  error?: string;
  registeredToolCount: number;
}

// ─── Page ────────────────────────────────────────────────

export default function McpServersPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addCommand, setAddCommand] = useState("");
  const [addArgs, setAddArgs] = useState("");
  const [addEnv, setAddEnv] = useState("");
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [discoveredTools, setDiscoveredTools] = useState<McpToolInfo[]>([]);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [validateError, setValidateError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const fetchServers = useCallback(async () => {
    try {
      const data = await api<{ servers: McpServer[] }>("/api/mcp/servers");
      setServers(data.servers);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServers();
    const interval = setInterval(fetchServers, 10000);
    return () => clearInterval(interval);
  }, [fetchServers]);

  // ── Helpers ──────────────────────────────────────────────

  const parseArgs = (s: string): string[] =>
    s
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  const parseEnv = (s: string): Record<string, string> => {
    const env: Record<string, string> = {};
    for (const line of s.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
      }
    }
    return env;
  };

  const clearMessages = () => {
    setError(null);
    setSuccessMsg(null);
  };

  // ── Validate ────────────────────────────────────────────

  const handleValidate = async () => {
    clearMessages();
    setValidating(true);
    setValidateError(null);
    setValidated(false);
    setDiscoveredTools([]);
    setSelectedTools(new Set());

    try {
      const data = await api<{
        valid: boolean;
        tools: McpToolInfo[];
        error?: string;
      }>("/api/mcp/servers/validate", {
        method: "POST",
        body: {
          command: addCommand.trim(),
          args: parseArgs(addArgs),
          env: parseEnv(addEnv),
        },
      });

      if (data.valid) {
        setValidated(true);
        setDiscoveredTools(data.tools);
        // Select all tools by default
        setSelectedTools(new Set(data.tools.map((t) => t.name)));
      } else {
        setValidateError(data.error || "Validation failed");
      }
    } catch (err: any) {
      setValidateError(err.message);
    } finally {
      setValidating(false);
    }
  };

  // ── Add Server ──────────────────────────────────────────

  const handleAdd = async () => {
    clearMessages();
    setAdding(true);
    try {
      await api("/api/mcp/servers", {
        method: "POST",
        body: {
          name: addName.trim(),
          command: addCommand.trim(),
          args: parseArgs(addArgs),
          env: parseEnv(addEnv),
          enabledTools: [...selectedTools],
          discoveredTools,
          autoConnect: true,
        },
      });
      setSuccessMsg(`MCP server "${addName}" added and connected!`);
      resetAddDialog();
      setAddOpen(false);
      fetchServers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const resetAddDialog = () => {
    setAddName("");
    setAddCommand("");
    setAddArgs("");
    setAddEnv("");
    setValidated(false);
    setValidating(false);
    setDiscoveredTools([]);
    setSelectedTools(new Set());
    setValidateError(null);
  };

  // ── Delete ──────────────────────────────────────────────

  const handleDelete = async (id: string, name: string) => {
    clearMessages();
    try {
      await api(`/api/mcp/servers/${id}`, { method: "DELETE" });
      setSuccessMsg(`Removed "${name}".`);
      fetchServers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ── Reconnect ───────────────────────────────────────────

  const handleReconnect = async (id: string) => {
    clearMessages();
    try {
      await api(`/api/mcp/servers/${id}/reconnect`, { method: "POST" });
      fetchServers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ── Toggle Tool ─────────────────────────────────────────

  const handleToggleTool = async (
    server: McpServer,
    toolName: string,
    enabled: boolean
  ) => {
    clearMessages();
    const updated = enabled
      ? [...server.enabledTools, toolName]
      : server.enabledTools.filter((t) => t !== toolName);

    // Optimistic update
    setServers((prev) =>
      prev.map((s) => (s.id === server.id ? { ...s, enabledTools: updated } : s))
    );

    try {
      await api(`/api/mcp/servers/${server.id}`, {
        method: "PUT",
        body: { enabledTools: updated },
      });
      fetchServers();
    } catch (err: any) {
      setError(err.message);
      fetchServers(); // revert
    }
  };

  // ── Status helpers ──────────────────────────────────────

  const statusColor = (s: McpServer["status"]) =>
    s === "connected"
      ? "bg-emerald-500"
      : s === "error"
        ? "bg-red-500"
        : "bg-zinc-500";

  const statusText = (s: McpServer["status"]) =>
    s === "connected"
      ? "Connected"
      : s === "error"
        ? "Error"
        : "Disconnected";

  // ── Render ──────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/20">
            <Plug className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">MCP Servers</h1>
            <p className="text-sm text-muted-foreground">
              Connect Model Context Protocol servers to extend the agent with
              external tools
            </p>
          </div>
        </div>

        <Dialog
          open={addOpen}
          onOpenChange={(open) => {
            setAddOpen(open);
            if (!open) resetAddDialog();
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Server
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add MCP Server</DialogTitle>
              <DialogDescription>
                Configure an MCP server to discover and enable tools for the
                agent.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="mcp-name">Server Name</Label>
                <Input
                  id="mcp-name"
                  placeholder="e.g. Filesystem, GitHub, Slack"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                />
              </div>

              {/* Command */}
              <div className="space-y-2">
                <Label htmlFor="mcp-command">Command</Label>
                <Input
                  id="mcp-command"
                  placeholder="e.g. npx, node, python"
                  value={addCommand}
                  onChange={(e) => {
                    setAddCommand(e.target.value);
                    setValidated(false);
                  }}
                  className="font-mono text-sm"
                />
              </div>

              {/* Args */}
              <div className="space-y-2">
                <Label htmlFor="mcp-args">Arguments (space-separated)</Label>
                <Input
                  id="mcp-args"
                  placeholder="e.g. -y @modelcontextprotocol/server-filesystem /tmp"
                  value={addArgs}
                  onChange={(e) => {
                    setAddArgs(e.target.value);
                    setValidated(false);
                  }}
                  className="font-mono text-sm"
                />
              </div>

              {/* Env */}
              <div className="space-y-2">
                <Label htmlFor="mcp-env">
                  Environment Variables (KEY=VALUE, one per line)
                </Label>
                <Textarea
                  id="mcp-env"
                  placeholder={"API_KEY=sk-...\nDEBUG=true"}
                  value={addEnv}
                  onChange={(e) => {
                    setAddEnv(e.target.value);
                    setValidated(false);
                  }}
                  className="font-mono text-sm"
                  rows={3}
                />
              </div>

              {/* Validate Button */}
              <Button
                onClick={handleValidate}
                disabled={!addCommand.trim() || validating}
                variant="outline"
                className="w-full gap-2"
              >
                {validating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : validated ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {validating
                  ? "Connecting & Discovering Tools..."
                  : validated
                    ? `${discoveredTools.length} Tools Discovered`
                    : "Validate & Discover Tools"}
              </Button>

              {/* Validate Error */}
              {validateError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                  <XCircle className="h-4 w-4 shrink-0" />
                  {validateError}
                </div>
              )}

              {/* Discovered Tools */}
              {validated && discoveredTools.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Select Tools to Enable</Label>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() =>
                          setSelectedTools(
                            new Set(discoveredTools.map((t) => t.name))
                          )
                        }
                      >
                        All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => setSelectedTools(new Set())}
                      >
                        None
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto rounded-lg border border-zinc-800 p-3">
                    {discoveredTools.map((tool) => (
                      <div
                        key={tool.name}
                        className={`flex items-start gap-3 p-2.5 rounded-lg transition-all cursor-pointer ${
                          selectedTools.has(tool.name)
                            ? "bg-violet-500/10 border border-violet-500/20"
                            : "border border-transparent hover:bg-zinc-800/50"
                        }`}
                        onClick={() => {
                          const next = new Set(selectedTools);
                          next.has(tool.name)
                            ? next.delete(tool.name)
                            : next.add(tool.name);
                          setSelectedTools(next);
                        }}
                      >
                        <Switch
                          checked={selectedTools.has(tool.name)}
                          onCheckedChange={(checked) => {
                            const next = new Set(selectedTools);
                            checked
                              ? next.add(tool.name)
                              : next.delete(tool.name);
                            setSelectedTools(next);
                          }}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-sm font-medium">
                            {tool.name}
                          </p>
                          {tool.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {tool.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedTools.size} of {discoveredTools.length} tools
                    selected
                  </p>
                </div>
              )}

              {validated && discoveredTools.length === 0 && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Server connected but no tools were discovered.
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  setAddOpen(false);
                  resetAddDialog();
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAdd}
                disabled={
                  !addName.trim() ||
                  !addCommand.trim() ||
                  !validated ||
                  adding
                }
                className="gap-2"
              >
                {adding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                {adding ? "Adding..." : "Add & Connect"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {successMsg && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!loading && servers.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-3">
              <Plug className="h-12 w-12 mx-auto text-muted-foreground/30" />
              <h3 className="text-lg font-medium">No MCP Servers</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Add an MCP server to extend the agent with external tools.
                Popular options include filesystem, GitHub, databases, and more.
              </p>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Add Your First Server
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Server Cards */}
      {servers.map((server) => (
        <Card key={server.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Plug className="h-5 w-5 text-violet-400" />
                {server.name}
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1.5 font-mono text-xs">
                  <Wrench className="h-3 w-3" />
                  {server.registeredToolCount} tools
                </Badge>
                <Badge variant="outline" className="gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${statusColor(server.status)}`}
                  />
                  {statusText(server.status)}
                </Badge>
              </div>
            </CardTitle>
            <p className="text-xs font-mono text-muted-foreground">
              {server.command} {server.args.join(" ")}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Error */}
            {server.error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {server.error}
              </div>
            )}

            {/* Tools Grid */}
            {server.discoveredTools.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Tools ({server.discoveredTools.length})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {server.discoveredTools.map((tool) => {
                    const enabled =
                      server.enabledTools.length === 0 ||
                      server.enabledTools.includes(tool.name);
                    return (
                      <div
                        key={tool.name}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                          server.status !== "connected"
                            ? "opacity-50 border-zinc-800"
                            : enabled
                              ? "bg-violet-500/10 border-violet-500/20"
                              : "border-zinc-800 bg-zinc-900/50"
                        }`}
                      >
                        <div
                          className={`flex items-center justify-center h-8 w-8 rounded-lg shrink-0 ${
                            enabled && server.status === "connected"
                              ? "bg-violet-500/10"
                              : "bg-zinc-800"
                          }`}
                        >
                          <Wrench
                            className={`h-4 w-4 ${
                              enabled && server.status === "connected"
                                ? "text-violet-400"
                                : "text-zinc-500"
                            }`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-xs font-medium truncate">
                            {tool.name}
                          </p>
                          {tool.description && (
                            <p className="text-xs text-muted-foreground truncate">
                              {tool.description}
                            </p>
                          )}
                        </div>
                        <Switch
                          checked={enabled}
                          onCheckedChange={(checked) =>
                            handleToggleTool(server, tool.name, checked)
                          }
                          disabled={server.status !== "connected"}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => handleReconnect(server.id)}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reconnect
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5"
                onClick={() => handleDelete(server.id, server.name)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
