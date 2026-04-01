"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  MessageCircle,
  Wifi,
  WifiOff,
  QrCode,
  RefreshCw,
  Power,
  PowerOff,
  Smartphone,
  Phone,
  User,
  BotMessageSquare,
} from "lucide-react";
import { api } from "@/lib/api";
import QRCode from "qrcode";
import { toast } from "sonner";

interface WhatsAppUser {
  id: string;
  name: string | undefined;
  phone: string;
}

export default function WhatsAppPage() {
  const [status, setStatus] = useState("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [user, setUser] = useState<WhatsAppUser | null>(null);
  const [autoReply, setAutoReply] = useState(false);
  const [togglingAutoReply, setTogglingAutoReply] = useState(false);
  const [messages, setMessages] = useState<
    Array<{ from: string; body: string; timestamp: string; isFromMe: boolean }>
  >([]);

  // Generate QR image locally whenever qrCode data changes
  useEffect(() => {
    if (!qrCode) {
      setQrImage(null);
      return;
    }
    QRCode.toDataURL(qrCode, { width: 256, margin: 2 })
      .then((url: string) => setQrImage(url))
      .catch(() => setQrImage(null));
  }, [qrCode]);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api<{
        status: string;
        qr: string | null;
        error: string | null;
        user: WhatsAppUser | null;
        autoReply: boolean;
      }>("/api/whatsapp/status");
      setStatus(data.status);
      setQrCode(data.qr);
      setError(data.error);
      setUser(data.user);
      setAutoReply(data.autoReply);
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
      }>("/api/whatsapp/messages");
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
    setConnecting(true);
    setError(null);
    try {
      await api("/api/whatsapp/connect", { method: "POST" });
      await fetchStatus();
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await api("/api/whatsapp/disconnect", { method: "POST" });
      toast.success("WhatsApp disconnected");
      setUser(null);
      await fetchStatus();
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    }
  };

  const handleToggleAutoReply = async (enabled: boolean) => {
    setTogglingAutoReply(true);
    try {
      await api("/api/whatsapp/auto-reply", {
        method: "PUT",
        body: { enabled },
      });
      setAutoReply(enabled);
      toast.success(`Auto-reply ${enabled ? "enabled" : "disabled"}`);
    } catch {
      toast.error("Failed to toggle auto-reply");
    } finally {
      setTogglingAutoReply(false);
    }
  };

  const isConnected = status === "connected";
  const isConnecting = status === "connecting" || connecting;

  const statusColor = isConnected
    ? "bg-emerald-500"
    : isConnecting
      ? "bg-amber-500"
      : "bg-zinc-500";

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header — matches Telegram / Google */}
      <div className="flex items-center gap-3">
        <MessageCircle className="h-8 w-8 text-green-400" />
        <div>
          <h1 className="text-2xl font-bold">WhatsApp</h1>
          <p className="text-sm text-muted-foreground">
            Connect your WhatsApp account to receive and send messages
          </p>
        </div>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              {isConnected ? (
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
          {isConnected && (
            <div className="flex items-center gap-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Smartphone className="h-10 w-10 text-emerald-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-emerald-300">
                  WhatsApp Connected
                </p>
                {user ? (
                  <div className="mt-1.5 space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-mono">{user.phone}</span>
                    </div>
                    {user.name && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <User className="h-3.5 w-3.5" />
                        <span>{user.name}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Linked via QR pairing
                  </p>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* QR Code — shown when connecting */}
          {!isConnected && qrImage && (
            <div className="flex flex-col items-center gap-3 p-4 rounded-lg bg-muted/30 border border-border">
              <div className="flex items-center gap-2 text-sm font-medium">
                <QrCode className="h-4 w-4" />
                Scan this QR code with WhatsApp
              </div>
              <div className="bg-white p-4 rounded-lg">
                <img
                  src={qrImage}
                  alt="WhatsApp QR"
                  className="w-52 h-52"
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
              </p>
            </div>
          )}

          {!isConnected && !qrImage && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Click Connect to generate a QR code for linking your WhatsApp.
              </p>
              <Button
                onClick={handleConnect}
                disabled={isConnecting}
                className="gap-2"
              >
                {isConnecting ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Power className="h-4 w-4" />
                )}
                {isConnecting ? "Connecting..." : "Connect"}
              </Button>
            </div>
          )}

          {isConnected && (
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

      {/* Auto-Reply */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BotMessageSquare className="h-5 w-5" />
            Auto-Reply
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="wa-auto-reply">WhatsApp Auto-Reply</Label>
              <p className="text-xs text-muted-foreground">
                Automatically respond to incoming WhatsApp messages using skills
              </p>
            </div>
            <Switch
              id="wa-auto-reply"
              checked={autoReply}
              disabled={togglingAutoReply}
              onCheckedChange={handleToggleAutoReply}
            />
          </div>
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
              No messages yet. Send a message to your WhatsApp number.
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {messages.slice(-10).map((msg, i) => (
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
