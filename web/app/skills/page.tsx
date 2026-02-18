"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";

interface Skill {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: {
    events: string[];
    condition?: string;
    filters?: { contacts?: string[] };
  };
  processor: { instructions: string };
  outcome: { action: string };
  createdAt: string;
  updatedAt: string;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [editSkill, setEditSkill] = useState<Skill | null>(null);
  const [saving, setSaving] = useState(false);

  const loadSkills = async () => {
    setLoading(true);
    try {
      const data = await api<{ skills: Skill[] }>("/api/skills");
      setSkills(data.skills || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSkills();
  }, []);

  const toggleSkill = async (id: string, enabled: boolean) => {
    try {
      await api(`/api/skills/${id}`, { method: "PUT", body: { enabled } });
      setSkills((prev) =>
        prev.map((s) => (s.id === id ? { ...s, enabled } : s))
      );
    } catch {
      /* ignore */
    }
  };

  const saveSkill = async () => {
    if (!editSkill) return;
    setSaving(true);
    try {
      await api(`/api/skills/${editSkill.id}`, {
        method: "PUT",
        body: {
          name: editSkill.name,
          description: editSkill.description,
          enabled: editSkill.enabled,
          trigger: editSkill.trigger,
          processor: editSkill.processor,
          outcome: editSkill.outcome,
        },
      });
      setEditSkill(null);
      loadSkills();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const deleteSkill = async (id: string) => {
    if (!confirm("Delete this skill?")) return;
    try {
      await api(`/api/skills/${id}`, { method: "DELETE" });
      loadSkills();
    } catch {
      /* ignore */
    }
  };

  const triggerLabel = (t: Skill["trigger"]) => {
    const events = t.events?.join(", ") || "";
    const contacts = t.filters?.contacts?.join(", ") || "";
    return contacts && contacts !== "all"
      ? `${events} → ${contacts}`
      : events;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Skills</h1>
          <p className="text-muted-foreground">Manage agent capabilities</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadSkills}>
          <RefreshCw className="size-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Separator />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {skills.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-8"
                  >
                    {loading ? "Loading skills..." : "No skills configured"}
                  </TableCell>
                </TableRow>
              ) : (
                skills.map((skill) => (
                  <TableRow key={skill.id}>
                    <TableCell className="font-medium">{skill.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {skill.description}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs font-mono">
                        {triggerLabel(skill.trigger)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={skill.enabled}
                        onCheckedChange={(v) => toggleSkill(skill.id, v)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => setEditSkill({ ...skill })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive"
                          onClick={() => deleteSkill(skill.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Skill Dialog */}
      <Dialog open={!!editSkill} onOpenChange={(o) => !o && setEditSkill(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Skill</DialogTitle>
          </DialogHeader>
          {editSkill && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={editSkill.name}
                  onChange={(e) =>
                    setEditSkill({ ...editSkill, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={editSkill.description}
                  onChange={(e) =>
                    setEditSkill({ ...editSkill, description: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Instructions</Label>
                <Textarea
                  rows={4}
                  value={editSkill.processor.instructions}
                  onChange={(e) =>
                    setEditSkill({
                      ...editSkill,
                      processor: { instructions: e.target.value },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Trigger Events</Label>
                <Input
                  value={editSkill.trigger.events?.join(", ") || ""}
                  onChange={(e) =>
                    setEditSkill({
                      ...editSkill,
                      trigger: {
                        ...editSkill.trigger,
                        events: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                  placeholder="whatsapp:message"
                />
              </div>
              <div className="space-y-2">
                <Label>Condition</Label>
                <Input
                  value={editSkill.trigger.condition || ""}
                  onChange={(e) =>
                    setEditSkill({
                      ...editSkill,
                      trigger: {
                        ...editSkill.trigger,
                        condition: e.target.value,
                      },
                    })
                  }
                  placeholder="Optional condition"
                />
              </div>
              <div className="space-y-2">
                <Label>Contact Filters</Label>
                <Input
                  value={
                    editSkill.trigger.filters?.contacts?.join(", ") || "all"
                  }
                  onChange={(e) =>
                    setEditSkill({
                      ...editSkill,
                      trigger: {
                        ...editSkill.trigger,
                        filters: {
                          contacts: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        },
                      },
                    })
                  }
                  placeholder="all, or comma-separated numbers"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editSkill.enabled}
                  onCheckedChange={(v) =>
                    setEditSkill({ ...editSkill, enabled: v })
                  }
                />
                <Label>Enabled</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSkill(null)}>
              Cancel
            </Button>
            <Button onClick={saveSkill} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
