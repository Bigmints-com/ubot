"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Wifi, WifiOff, QrCode, RefreshCw, Power, PowerOff } from "lucide-react";
import { api } from "@/lib/api";
import QRCode from "qrcode";

export default function WhatsAppPage() {
  const [status, setStatus] = useState("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
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

  const poll = async () => {
    try {
      const data = await api<{
        status: string;
        qr: string | null;
        error: string | null;
      }>("/api/whatsapp/status");
      setStatus(data.status);
      setQrCode(data.qr);
      setError(data.error);
    } catch {
      /* ignore */
    }
  };

  const loadMessages = async () => {
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
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    poll();
    loadMessages();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await api("/api/whatsapp/connect", { method: "POST" });
      await poll();
    } catch {
      /* ignore */
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await api("/api/whatsapp/disconnect", { method: "POST" });
      await poll();
    } catch {
      /* ignore */
    }
  };

  const isConnected = status === "connected";
  const isConnecting = status === "connecting" || connecting;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">WhatsApp</h1>
        <p className="text-muted-foreground">
          Manage your WhatsApp connection
        </p>
      </div>

      <Separator />

      <div className="grid gap-4 md:grid-cols-2">
        {/* Connection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {isConnected ? (
                <Wifi className="size-5 text-green-500" />
              ) : (
                <WifiOff className="size-5" />
              )}
              Connection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Status</span>
              <Badge variant={isConnected ? "default" : "secondary"}>
                {status}
              </Badge>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex gap-2">
              {!isConnected ? (
                <Button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="w-full"
                >
                  {isConnecting ? (
                    <RefreshCw className="size-4 mr-2 animate-spin" />
                  ) : (
                    <Power className="size-4 mr-2" />
                  )}
                  {isConnecting ? "Connecting..." : "Connect"}
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  onClick={handleDisconnect}
                  className="w-full"
                >
                  <PowerOff className="size-4 mr-2" />
                  Disconnect
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* QR Code */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="size-5" />
              QR Code
            </CardTitle>
          </CardHeader>
          <CardContent>
            {qrImage ? (
              <div className="bg-white p-4 rounded-lg inline-block">
                <img
                  src={qrImage}
                  alt="WhatsApp QR"
                  className="w-48 h-48"
                />
              </div>
            ) : isConnected ? (
              <p className="text-sm text-muted-foreground">
                Connected — no QR code needed.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Click Connect to generate a QR code for linking your WhatsApp.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Messages */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Messages</CardTitle>
          <Button variant="ghost" size="sm" onClick={loadMessages}>
            <RefreshCw className="size-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent messages.</p>
          ) : (
            <div className="space-y-2">
              {messages.slice(-10).map((msg, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-sm border-b pb-2 last:border-0"
                >
                  <Badge
                    variant={msg.isFromMe ? "default" : "outline"}
                    className="shrink-0 text-xs"
                  >
                    {msg.isFromMe ? "Sent" : "Received"}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">
                      {msg.from}
                    </p>
                    <p className="truncate">{msg.body}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
