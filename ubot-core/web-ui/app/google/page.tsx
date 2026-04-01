"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Globe,
  Wifi,
  WifiOff,
  RefreshCw,
  Power,
  PowerOff,
  Mail,
  HardDrive,
  Sheet,
  FileText,
  Users,
  Calendar,
  MapPin,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/api";
import { CapabilityTools } from "@/components/capability-tools";

interface AuthStatus {
  hasCredentials: boolean;
  hasToken: boolean;
  isAuthenticated: boolean;
  credentialsPath: string;
  tokenPath: string;
}

interface ServicesConfig {
  gmail: boolean;
  drive: boolean;
  sheets: boolean;
  docs: boolean;
  contacts: boolean;
  calendar: boolean;
  places: boolean;
}

const SERVICES = [
  {
    key: "gmail" as keyof ServicesConfig,
    name: "Gmail",
    description: "Read, send, search, and manage emails",
    icon: Mail,
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
  },
  {
    key: "drive" as keyof ServicesConfig,
    name: "Google Drive",
    description: "Browse, upload, download, and share files",
    icon: HardDrive,
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/20",
  },
  {
    key: "sheets" as keyof ServicesConfig,
    name: "Google Sheets",
    description: "Read and write spreadsheet data",
    icon: Sheet,
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20",
  },
  {
    key: "docs" as keyof ServicesConfig,
    name: "Google Docs",
    description: "Read and create documents",
    icon: FileText,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
  },
  {
    key: "contacts" as keyof ServicesConfig,
    name: "Google Contacts",
    description: "List, search, and create contacts",
    icon: Users,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/20",
  },
  {
    key: "calendar" as keyof ServicesConfig,
    name: "Google Calendar",
    description: "View, create, and manage events",
    icon: Calendar,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
  },
  {
    key: "places" as keyof ServicesConfig,
    name: "Google Places",
    description: "Search places, get details, find nearby",
    icon: MapPin,
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/20",
  },
];

export default function GooglePage() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [services, setServices] = useState<ServicesConfig>({
    gmail: true,
    drive: true,
    sheets: true,
    docs: true,
    contacts: true,
    calendar: true,
    places: true,
  });
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api<AuthStatus>("/api/google/auth/status");
      setAuthStatus(data);
    } catch {}
  }, []);

  const fetchServicesConfig = useCallback(async () => {
    try {
      const data = await api<{ services: ServicesConfig }>(
        "/api/google/services/config"
      );
      setServices(data.services);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchServicesConfig();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchServicesConfig]);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await api("/api/google/auth/start", { method: "POST" });
      setSuccessMsg("Google account connected successfully!");
      fetchStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setError(null);
    setSuccessMsg(null);
    try {
      await api("/api/google/auth/clear", { method: "POST" });
      setSuccessMsg("Google account disconnected.");
      fetchStatus();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleService = async (key: keyof ServicesConfig) => {
    const updated = { ...services, [key]: !services[key] };
    setServices(updated);
    try {
      await api("/api/google/services/config", {
        method: "PUT",
        body: { services: { [key]: updated[key] } },
      });
    } catch (err: any) {
      // Revert on failure
      setServices(services);
      setError(err.message);
    }
  };

  const isConnected = authStatus?.hasToken || authStatus?.isAuthenticated;

  const statusColor = isConnected
    ? "bg-emerald-500"
    : connecting
      ? "bg-amber-500"
      : "bg-zinc-500";

  const statusText = isConnected
    ? "Connected"
    : connecting
      ? "Connecting..."
      : "Disconnected";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-green-500 shadow-lg shadow-blue-500/20">
          <Globe className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Google Apps</h1>
          <p className="text-sm text-muted-foreground">
            Connect your Google account to access Gmail, Drive, Calendar, and
            more
          </p>
        </div>
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
              {statusText}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status details */}
          {authStatus && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div
                className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${
                  authStatus.hasCredentials
                    ? "bg-emerald-500/5 border-emerald-500/20"
                    : "bg-zinc-500/5 border-zinc-500/20"
                }`}
              >
                {authStatus.hasCredentials ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-zinc-400 shrink-0" />
                )}
                <span>OAuth Credentials</span>
              </div>
              <div
                className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${
                  authStatus.hasToken
                    ? "bg-emerald-500/5 border-emerald-500/20"
                    : "bg-zinc-500/5 border-zinc-500/20"
                }`}
              >
                {authStatus.hasToken ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-zinc-400 shrink-0" />
                )}
                <span>Saved Token</span>
              </div>
              <div
                className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${
                  authStatus.isAuthenticated
                    ? "bg-emerald-500/5 border-emerald-500/20"
                    : "bg-zinc-500/5 border-zinc-500/20"
                }`}
              >
                {authStatus.isAuthenticated ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-zinc-400 shrink-0" />
                )}
                <span>Authenticated</span>
              </div>
            </div>
          )}

          {/* Not connected: show setup instructions */}
          {!isConnected && (
            <div className="space-y-4">
              {!authStatus?.hasCredentials && (
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm space-y-2">
                  <div className="flex items-center gap-2 font-medium text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                    Setup Required
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>
                      Go to{" "}
                      <a
                        href="https://console.cloud.google.com/apis/credentials"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline"
                      >
                        Google Cloud Console → Credentials
                      </a>
                    </li>
                    <li>Create an OAuth 2.0 Client ID (Desktop app type)</li>
                    <li>Download the JSON file</li>
                    <li>
                      Save it as{" "}
                      <code className="bg-muted px-1 py-0.5 rounded text-xs">
                        creds/google-oauth-credentials.json
                      </code>
                    </li>
                    <li>Enable the APIs you need (Gmail, Drive, Calendar, etc.)</li>
                  </ol>
                </div>
              )}

              <Button
                onClick={handleConnect}
                disabled={connecting || !authStatus?.hasCredentials}
                className="gap-2"
              >
                {connecting ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Power className="h-4 w-4" />
                )}
                {connecting
                  ? "Connecting... (check your browser)"
                  : "Connect Google Account"}
              </Button>
              {connecting && (
                <p className="text-xs text-muted-foreground">
                  A browser window should open for you to sign in with Google.
                  Complete the authorization to continue.
                </p>
              )}
            </div>
          )}

          {/* Connected: show disconnect */}
          {isConnected && (
            <div className="flex items-center gap-3">
              <Button
                variant="destructive"
                onClick={handleDisconnect}
                className="gap-2"
              >
                <PowerOff className="h-4 w-4" />
                Disconnect
              </Button>
              <Button variant="ghost" size="sm" onClick={fetchStatus}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Services */}
      <Card>
        <CardHeader>
          <CardTitle>Services</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enable or disable individual Google services. Disabled services
            won&apos;t be available to the agent.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SERVICES.map((service) => {
              const enabled = services[service.key];
              const Icon = service.icon;

              return (
                <div
                  key={service.key}
                  className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
                    !isConnected
                      ? "opacity-50 border-zinc-800"
                      : enabled
                        ? `${service.bgColor} ${service.borderColor}`
                        : "border-zinc-800 bg-zinc-900/50"
                  }`}
                >
                  <div
                    className={`flex items-center justify-center h-10 w-10 rounded-lg shrink-0 ${
                      enabled && isConnected
                        ? `${service.bgColor}`
                        : "bg-zinc-800"
                    }`}
                  >
                    <Icon
                      className={`h-5 w-5 ${
                        enabled && isConnected
                          ? service.color
                          : "text-zinc-500"
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{service.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {service.description}
                    </p>
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={() => toggleService(service.key)}
                    disabled={!isConnected}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <CapabilityTools capability="google" />
    </div>
  );
}
