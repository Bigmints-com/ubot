"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FolderOpen, Plus, Trash2, Save, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

export default function FilesystemPage() {
  const [allowedPaths, setAllowedPaths] = useState<string[]>([]);
  const [newPath, setNewPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadPaths = useCallback(async () => {
    try {
      const data = await api<{ filesystem: { allowed_paths: string[] } }>("/api/config/integrations");
      setAllowedPaths(data.filesystem?.allowed_paths || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadPaths(); }, [loadPaths]);

  const savePaths = async () => {
    setSaving(true);
    try {
      await api("/api/config/integrations", {
        method: "PUT",
        body: { filesystem: { allowed_paths: allowedPaths } },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FolderOpen className="size-6" />
          Filesystem Access
        </h1>
        <p className="text-muted-foreground">
          Manage directories the agent is allowed to read and write
        </p>
      </div>

      <Separator />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Allowed Paths</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Directories the agent is allowed to read/write. Leave empty to restrict to workspace only.
          </p>
          <div className="space-y-2">
            {allowedPaths.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={p} readOnly className="font-mono text-sm" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive"
                  onClick={() => {
                    const paths = [...allowedPaths];
                    paths.splice(i, 1);
                    setAllowedPaths(paths);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="/path/to/directory"
                className="font-mono text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newPath.trim()) {
                    setAllowedPaths([...allowedPaths, newPath.trim()]);
                    setNewPath("");
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={!newPath.trim()}
                onClick={() => {
                  setAllowedPaths([...allowedPaths, newPath.trim()]);
                  setNewPath("");
                }}
              >
                <Plus className="size-4 mr-1" /> Add
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={savePaths} disabled={saving} size="sm">
              {saving ? (
                <RefreshCw className="size-4 mr-2 animate-spin" />
              ) : (
                <Save className="size-4 mr-2" />
              )}
              {saving ? "Saving..." : "Save Paths"}
            </Button>
            {saved && (
              <Badge variant="default" className="bg-green-600">
                Saved
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
