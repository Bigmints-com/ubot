"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  MessageSquare,
  Wifi,
  WifiOff,
  RefreshCw,
  Power,
  PowerOff,
  ExternalLink,
  Apple,
  Info,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function IMessagePage() {
  const [status, setStatus] = useState("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState("");
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [messages, setMessages] = useState<
    Array<{ from: string; body: string; timestamp: string; isFromMe: boolean }>
  >([]);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api<{
        status: string;
        error: string | null;
        serverUrl: string | null;
      }>("/api/imessage/status");
      setStatus(data.status);
      setError(data.error);
    } catch {}
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const data = await api<{
        messages: Array<{
          from: string;
          body: string;
          timestamp: string;
          isFromMe: boolean;
        }>;
      }>("/api/imessage/messages");
      setMessages(data.messages || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchMessages();
    const interval = setInterval(() => {
      fetchStatus();
      fetchMessages();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchMessages]);

  const handleConnect = async () => {
    if (!serverUrl.trim() || !password.trim()) return;
    setConnecting(true);
    setError(null);
    try {
      const data = await api<{ status: string; message?: string }>(
        "/api/imessage/connect",
        {
          method: "POST",
          body: { serverUrl: serverUrl.trim(), password: password.trim() },
        }
      );
      setStatus(data.status);
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await api("/api/imessage/disconnect", { method: "POST" });
      setStatus("disconnected");
      toast.success("iMessage disconnected");
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    }
  };

  const statusColor =
    status === "connected"
      ? "bg-emerald-500"
      : status === "connecting"
        ? "bg-amber-500"
        : "bg-zinc-500";

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Apple className="h-8 w-8 text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold">iMessage</h1>
          <p className="text-sm text-muted-foreground">
            Connect to iMessage via BlueBubbles — no Full Disk Access required
          </p>
        </div>
      </div>

      {/* How It Works */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Info className="h-4 w-4 text-blue-400" />
            How It Works
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <a
              href="https://bluebubbles.app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              BlueBubbles
              <ExternalLink className="h-3 w-3" />
            </a>{" "}
            is a free macOS app that bridges iMessage to an HTTP API. It handles
            macOS permissions itself — Ubot never accesses your Messages database
            directly.
          </p>
          <ol className="list-decimal list-inside space-y-1 pl-1">
            <li>Install BlueBubbles on your Mac</li>
            <li>Note the server URL and password from BlueBubbles settings</li>
            <li>Enter them below and click Connect</li>
            <li>
              Configure the webhook URL in BlueBubbles:{" "}
              <code className="px-1.5 py-0.5 rounded bg-muted text-xs">
                http://YOUR_UBOT_HOST:11490/api/imessage/webhook
              </code>
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              {status === "connected" ? (
                <Wifi className="h-5 w-5 text-emerald-400" />
              ) : (
                <WifiOff className="h-5 w-5 text-zinc-400" />
              )}
              Connection Status
            </span>
            <Badge variant="outline" className="gap-1.5">
              <span className={`h-2 w-2 rounded-full ${statusColor}`} />
              {status}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "connected" && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <MessageSquare className="h-8 w-8 text-emerald-400" />
              <div>
                <p className="font-medium text-emerald-300">
                  Connected to BlueBubbles
                </p>
                <p className="text-sm text-muted-foreground">
                  iMessage messages will be received via webhook
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {status !== "connected" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  BlueBubbles Server URL
                </label>
                <Input
                  type="url"
                  placeholder="http://localhost:1234 or https://your-server.ngrok.io"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Server Password</label>
                <Input
                  type="password"
                  placeholder="Your BlueBubbles server password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                />
                <p className="text-xs text-muted-foreground">
                  Found in BlueBubbles → Settings → Server
                </p>
              </div>
              <Button
                onClick={handleConnect}
                disabled={
                  connecting || !serverUrl.trim() || !password.trim()
                }
                className="gap-2"
              >
                {connecting ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Power className="h-4 w-4" />
                )}
                {connecting ? "Connecting..." : "Connect"}
              </Button>
            </div>
          )}

          {status === "connected" && (
            <Button
              variant="destructive"
              onClick={handleDisconnect}
              className="gap-2"
            >
              <PowerOff className="h-4 w-4" />
              Disconnect
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Recent Messages */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Recent Messages
            <Button variant="ghost" size="sm" onClick={fetchMessages}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No messages yet. Send an iMessage to start seeing activity here.
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex flex-col gap-0.5 p-3 rounded-lg text-sm ${
                    msg.isFromMe
                      ? "bg-blue-500/10 border border-blue-500/20 ml-8"
                      : "bg-muted/50 border border-border mr-8"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-xs">
                      {msg.isFromMe ? "You" : msg.from}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-foreground">{msg.body}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
