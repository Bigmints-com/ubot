"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Send, Wifi, WifiOff, RefreshCw, Power, PowerOff, Bot } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function TelegramPage() {
  const [status, setStatus] = useState("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [botToken, setBotToken] = useState("");
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [botName, setBotName] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [messages, setMessages] = useState<
    Array<{ from: string; body: string; timestamp: string; isFromMe: boolean }>
  >([]);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api<{ status: string; error: string | null; botUsername: string | null; botName: string | null }>("/api/telegram/status");
      setStatus(data.status);
      setError(data.error);
      setBotUsername(data.botUsername);
      setBotName(data.botName);
    } catch {}
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const data = await api<{ messages: Array<{ from: string; body: string; timestamp: string; isFromMe: boolean }> }>("/api/telegram/messages");
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
    if (!botToken.trim()) return;
    setConnecting(true);
    setError(null);
    try {
      const data = await api<{ status: string; botUsername?: string; botName?: string }>("/api/telegram/connect", {
        method: "POST",
        body: { botToken: botToken.trim() },
      });
      setStatus(data.status);
      setBotUsername(data.botUsername ?? null);
      setBotName(data.botName ?? null);
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await api("/api/telegram/disconnect", { method: "POST" });
      setStatus("disconnected");
      setBotUsername(null);
      setBotName(null);
      toast.success("Telegram disconnected");
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
        <Send className="h-8 w-8 text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold">Telegram</h1>
          <p className="text-sm text-muted-foreground">
            Connect a Telegram bot to receive and send messages
          </p>
        </div>
      </div>

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
          {status === "connected" && botUsername && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Bot className="h-8 w-8 text-emerald-400" />
              <div>
                <p className="font-medium text-emerald-300">
                  @{botUsername}
                </p>
                <p className="text-sm text-muted-foreground">{botName}</p>
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
                <label className="text-sm font-medium">Bot Token</label>
                <Input
                  type="password"
                  placeholder="Paste your bot token from @BotFather"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                />
                <p className="text-xs text-muted-foreground">
                  Get a token from{" "}
                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    @BotFather
                  </a>{" "}
                  on Telegram
                </p>
              </div>
              <Button
                onClick={handleConnect}
                disabled={connecting || !botToken.trim()}
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
              No messages yet. Send a message to your bot on Telegram.
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
                      {msg.isFromMe ? "Bot" : msg.from}
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
