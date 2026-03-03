"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Terminal,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Circle,
  Square,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  Activity,
  KeyRound,
  Download,
} from "lucide-react";
import { api } from "@/lib/api";
import { CapabilityTools } from "@/components/capability-tools";

interface CliStatus {
  enabled: boolean;
  provider: string;
  providerAvailable: boolean;
  providerAuthenticated: boolean;
  workDir: string;
  timeout: number;
}

interface CliSession {
  id: string;
  prompt: string;
  provider: string;
  status: "running" | "completed" | "failed" | "stopped";
  projectName: string;
  workDir: string;
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  outputLineCount: number;
}

interface SessionDetail {
  id: string;
  prompt: string;
  provider: string;
  status: string;
  projectName: string;
  workDir: string;
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  totalLines: number;
  output: string[];
}

const STATUS_CONFIG: Record<string, { icon: typeof Circle; color: string; bg: string; label: string }> = {
  running: { icon: RefreshCw, color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/20", label: "Running" },
  completed: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20", label: "Completed" },
  failed: { icon: XCircle, color: "text-red-400", bg: "bg-red-400/10 border-red-400/20", label: "Failed" },
  stopped: { icon: Square, color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20", label: "Stopped" },
};

const PROVIDERS = [
  { id: "gemini", name: "Gemini CLI", description: "Google's AI coding assistant", command: "gemini", authHint: "Run `gemini` in your terminal to authenticate via Google OAuth" },
  { id: "claude", name: "Claude CLI", description: "Anthropic's coding assistant", command: "claude", authHint: "Run `claude` in your terminal to log in" },
  { id: "codex", name: "Codex CLI", description: "OpenAI's coding assistant", command: "codex", authHint: "Set OPENAI_API_KEY in your environment" },
];

export default function CliPage() {
  const [status, setStatus] = useState<CliStatus | null>(null);
  const [sessions, setSessions] = useState<CliSession[]>([]);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [sessionOutputs, setSessionOutputs] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);

  const pollRef = useRef<number | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // ── Data loading ──────────────────────────────────────
  const loadStatus = useCallback(async () => {
    try {
      const data = await api<CliStatus>("/api/cli/status");
      setStatus(data);
    } catch { /* ignore */ }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const data = await api<{ sessions: CliSession[] }>("/api/cli/sessions");
      setSessions(data.sessions || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadStatus(), loadSessions()]).finally(() => setLoading(false));
  }, [loadStatus, loadSessions]);

  // Auto-refresh session list while any session is running
  useEffect(() => {
    if (!status?.enabled) return;
    const hasRunning = sessions.some(s => s.status === "running");
    if (!hasRunning) return;

    const interval = setInterval(() => {
      loadSessions();
    }, 3000);
    return () => clearInterval(interval);
  }, [status?.enabled, sessions, loadSessions]);

  // Poll running sessions for output
  useEffect(() => {
    if (!expandedSession || !status?.enabled) return;

    const session = sessions.find(s => s.id === expandedSession);
    if (!session) return;

    let lastLine = 0;

    const poll = async () => {
      try {
        const data = await api<SessionDetail>(
          `/api/cli/sessions/${expandedSession}?fromLine=${lastLine}`
        );
        if (data.output && data.output.length > 0) {
          setSessionOutputs(prev => ({
            ...prev,
            [expandedSession]: [...(prev[expandedSession] || []), ...data.output],
          }));
          lastLine = data.totalLines;
        }
        // Update session status in list
        if (data.status !== session.status) {
          loadSessions();
        }
        if (data.status !== "running") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch { /* ignore */ }
    };

    // Reset output for this session
    setSessionOutputs(prev => ({ ...prev, [expandedSession]: [] }));
    lastLine = 0;
    poll();
    pollRef.current = window.setInterval(poll, 1500);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [expandedSession, status?.enabled, sessions, loadSessions]);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessionOutputs, expandedSession]);

  // ── Actions ───────────────────────────────────────────
  const handleToggle = async (enabled: boolean) => {
    setToggling(true);
    try {
      await api("/api/cli/toggle", { method: "PUT", body: { enabled } });
      await loadStatus();
      if (enabled) await loadSessions();
    } catch { /* ignore */ }
    finally { setToggling(false); }
  };

  const handleProviderChange = async (provider: string) => {
    setSavingProvider(true);
    try {
      await api("/api/cli/toggle", {
        method: "PUT",
        body: { enabled: status?.enabled, provider },
      });
      await loadStatus();
    } catch { /* ignore */ }
    finally { setSavingProvider(false); }
  };

  const handleStopSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api(`/api/cli/sessions/${sessionId}/stop`, { method: "POST" });
      await loadSessions();
    } catch { /* ignore */ }
  };

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await api("/api/cli/install", { method: "POST" });
      await loadStatus();
    } catch { /* ignore */ }
    finally { setInstalling(false); }
  };

  const handleAuthenticate = async () => {
    setAuthenticating(true);
    try {
      await api("/api/cli/authenticate", { method: "POST" });
      await loadStatus();
    } catch { /* ignore */ }
    finally { setAuthenticating(false); }
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleString([], {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const formatDuration = (start: string, end?: string) => {
    const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    return `${mins}m ${secs % 60}s`;
  };

  const runningCount = sessions.filter(s => s.status === "running").length;
  const currentProvider = PROVIDERS.find(p => p.id === status?.provider);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <RefreshCw className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">CLI Agents</h1>
        <p className="text-muted-foreground">
          Configure external AI coding CLIs that UBOT can use to build and modify projects
        </p>
      </div>

      <Separator />

      {/* ── Configuration ─────────────────────────────── */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Configuration</CardTitle>
              <CardDescription>
                When enabled, the AI agent can delegate coding tasks to an external CLI
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Label htmlFor="cli-toggle" className="text-sm font-medium">
                {status?.enabled ? "Enabled" : "Disabled"}
              </Label>
              <Switch
                id="cli-toggle"
                checked={status?.enabled || false}
                onCheckedChange={handleToggle}
                disabled={toggling}
              />
            </div>
          </div>
        </CardHeader>

        {status?.enabled && (
          <CardContent className="space-y-5 pt-0">
            {/* Security notice */}
            <div className="flex items-start gap-2.5 rounded-md bg-amber-500/5 border border-amber-500/20 px-3 py-2.5">
              <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                CLI sessions execute commands on your machine. Only the owner can trigger them via the AI agent.
              </p>
            </div>

            {/* Provider selector */}
            <div className="grid gap-2">
              <Label>CLI Provider</Label>
              <Select
                value={status.provider}
                onValueChange={handleProviderChange}
                disabled={savingProvider}
              >
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex items-center gap-2">
                        <Terminal className="size-3.5 text-muted-foreground" />
                        <span>{p.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {currentProvider && (
                <p className="text-xs text-muted-foreground">
                  {currentProvider.description} — binary: <code className="bg-muted px-1 py-0.5 rounded text-[11px]">{currentProvider.command}</code>
                </p>
              )}
            </div>

            {/* Provider status */}
            <div className="rounded-md border divide-y">
              <div className="flex items-center gap-3 px-3 py-2.5">
                <Cpu className="size-4 text-muted-foreground" />
                <span className="text-sm flex-1">Installed</span>
                {status.providerAvailable ? (
                  <Badge variant="outline" className="text-emerald-400 border-emerald-400/30 bg-emerald-400/5 gap-1">
                    <CheckCircle2 className="size-3" />
                    Yes
                  </Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={handleInstall}
                    disabled={installing}
                  >
                    {installing ? (
                      <><RefreshCw className="size-3 animate-spin" /> Installing...</>
                    ) : (
                      <><Download className="size-3" /> Install</>
                    )}
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <KeyRound className="size-4 text-muted-foreground" />
                <span className="text-sm flex-1">Authenticated</span>
                {status.providerAuthenticated ? (
                  <Badge variant="outline" className="text-emerald-400 border-emerald-400/30 bg-emerald-400/5 gap-1">
                    <CheckCircle2 className="size-3" />
                    Yes
                  </Badge>
                ) : status.providerAvailable ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={handleAuthenticate}
                    disabled={authenticating}
                  >
                    {authenticating ? (
                      <><RefreshCw className="size-3 animate-spin" /> Authenticating...</>
                    ) : (
                      <><KeyRound className="size-3" /> Authenticate</>
                    )}
                  </Button>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground/50 gap-1 text-xs">
                    Install first
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Activity log ──────────────────────────────── */}
      {status?.enabled && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="size-4" />
                  Activity Log
                </CardTitle>
                <CardDescription>
                  Sessions triggered by the AI agent
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {runningCount > 0 && (
                  <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 gap-1">
                    <RefreshCw className="size-3 animate-spin" />
                    {runningCount} running
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => loadSessions()}
                >
                  <RefreshCw className="size-3.5" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Terminal className="size-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No sessions yet</p>
                <p className="text-xs mt-1">
                  Sessions will appear here when the AI agent uses the CLI to build or modify projects
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {sessions.map((session) => {
                  const cfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.running;
                  const Icon = cfg.icon;
                  const isExpanded = expandedSession === session.id;
                  const output = sessionOutputs[session.id] || [];

                  return (
                    <div key={session.id} className="rounded-lg border overflow-hidden">
                      {/* Session header — clickable to expand */}
                      <button
                        onClick={() => setExpandedSession(isExpanded ? null : session.id)}
                        className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-medium truncate">
                                {session.projectName}
                              </span>
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 gap-1 ${cfg.bg} ${cfg.color}`}>
                                <Icon className={`size-3 ${session.status === "running" ? "animate-spin" : ""}`} />
                                {cfg.label}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 uppercase">
                                {session.provider}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {session.prompt}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Clock className="size-3" />
                                {formatDuration(session.startedAt, session.endedAt)}
                              </div>
                              <p className="text-[11px] text-muted-foreground/60">
                                {formatTime(session.startedAt)}
                              </p>
                            </div>
                            {session.status === "running" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-red-400 hover:text-red-300 shrink-0"
                                onClick={(e) => handleStopSession(session.id, e)}
                              >
                                <Square className="size-3 mr-1" />
                                Stop
                              </Button>
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Expanded log view */}
                      {isExpanded && (
                        <div className="border-t">
                          <div className="bg-[#0d1117] px-4 py-3 font-mono text-xs leading-relaxed max-h-[350px] overflow-y-auto">
                            {output.length === 0 ? (
                              <span className="text-muted-foreground/50">
                                {session.status === "running"
                                  ? "Waiting for output..."
                                  : "No output recorded for this session."}
                              </span>
                            ) : (
                              output.map((line, i) => (
                                <div
                                  key={i}
                                  className={
                                    line.startsWith("[stderr]")
                                      ? "text-red-400/80"
                                      : line.startsWith("[error]")
                                      ? "text-red-500"
                                      : line.startsWith("[system]")
                                      ? "text-amber-400/80 italic"
                                      : "text-slate-300"
                                  }
                                >
                                  {line}
                                </div>
                              ))
                            )}
                            <div ref={logEndRef} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <CapabilityTools capability="cli" />
    </div>
  );
}
