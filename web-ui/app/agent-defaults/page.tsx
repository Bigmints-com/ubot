"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Zap,
  Bot,
  Search,
  Terminal,
  Mail,
  Calendar,
  MapPin,
  FileText,
  Sheet,
  HardDrive,
  Users,
  StickyNote,
  Globe,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

// ── Purpose metadata ──

const PURPOSE_META: Record<string, { label: string; description: string; icon: any }> = {
  chat:         { label: "Chat Model",    description: "LLM used for conversations",      icon: Bot },
  search:       { label: "Web Search",    description: "Search engine for web queries",    icon: Search },
  browser:      { label: "Browser",       description: "Web browsing and page interaction", icon: Globe },
  cli:          { label: "CLI Agent",     description: "Coding CLI for project tasks",     icon: Terminal },
  email:        { label: "Email",         description: "Send and read emails",             icon: Mail },
  calendar:     { label: "Calendar",      description: "Manage events and schedules",       icon: Calendar },
  maps:         { label: "Maps & Places", description: "Location search and details",       icon: MapPin },
  documents:    { label: "Documents",     description: "Create and read documents",          icon: FileText },
  spreadsheets: { label: "Spreadsheets",  description: "Read and write spreadsheet data",   icon: Sheet },
  storage:      { label: "Cloud Storage", description: "File storage and sharing",          icon: HardDrive },
  contacts:     { label: "Contacts",      description: "Manage contact information",        icon: Users },
  notes:        { label: "Notes",         description: "Create and read notes",              icon: StickyNote },
};

const PURPOSE_ORDER = [
  "chat", "search", "browser", "cli", "email", "calendar", "notes", "maps",
  "documents", "spreadsheets", "storage", "contacts",
];

interface DefaultOption {
  value: string;
  label: string;
}

export default function AgentDefaultsPage() {
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<Record<string, DefaultOption[]>>({});
  const [saving, setSaving] = useState(false);

  const loadDefaults = useCallback(async () => {
    try {
      const [dData, oData] = await Promise.all([
        api<{ defaults: Record<string, string> }>("/api/config/defaults"),
        api<{ options: Record<string, DefaultOption[]> }>("/api/config/defaults/options"),
      ]);
      setDefaults(dData.defaults || {});
      setOptions(oData.options || {});
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadDefaults();
  }, [loadDefaults]);

  const handleDefaultChange = async (purpose: string, value: string) => {
    const updated = { ...defaults, [purpose]: value };
    setDefaults(updated);
    setSaving(true);
    try {
      await api("/api/config/defaults", {
        method: "PUT",
        body: { defaults: { [purpose]: value } },
      });
      toast.success("Default updated");
    } catch {
      toast.error("Failed to update default");
    }
    finally { setSaving(false); }
  };

  const activePurposes = PURPOSE_ORDER.filter(
    (p) => options[p] && options[p].length > 0
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Zap className="size-6" />
          Agent Defaults
        </h1>
        <p className="text-muted-foreground mt-1">
          Choose the default provider for each purpose. When multiple providers can handle
          the same task, the agent uses these preferences.
        </p>
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Provider Routing</CardTitle>
          <CardDescription>
            Select which capability-provider pair handles each purpose
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {activePurposes.map((purpose) => {
              const meta = PURPOSE_META[purpose];
              if (!meta) return null;
              const Icon = meta.icon;
              const purposeOptions = options[purpose] || [];
              const currentValue = defaults[purpose] || "";

              return (
                <div
                  key={purpose}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center justify-center size-9 rounded-lg bg-muted shrink-0">
                    <Icon className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Label className="text-sm font-medium">{meta.label}</Label>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {meta.description}
                    </p>
                  </div>
                  <Select
                    value={currentValue}
                    onValueChange={(v) => handleDefaultChange(purpose, v)}
                    disabled={saving}
                  >
                    <SelectTrigger className="w-[160px] shrink-0 h-8 text-xs">
                      <SelectValue placeholder="Not set" />
                    </SelectTrigger>
                    <SelectContent>
                      {purposeOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
            {activePurposes.length === 0 && (
              <p className="text-sm text-muted-foreground col-span-2 py-4 text-center">
                No providers configured yet. Add providers in the Capabilities pages to set defaults.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
