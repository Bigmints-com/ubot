"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bot, User, Users, Save, RefreshCw, Brain, Trash2, Check, Plus, Database, Zap } from "lucide-react";
import { api } from "@/lib/api";

const BOT_SOUL_ID = "__bot__";
const OWNER_SOUL_ID = "__owner__";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PersonaSummary {
  id: string;
  label: string;
  updatedAt: string;
  contentLength: number;
  type?: 'core' | 'agent';
}

interface MemoryEntry {
  id: string;
  contactId: string;
  category: string;
  key: string;
  value: string;
  source: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Document Editor (persona YAML)                                     */
/* ------------------------------------------------------------------ */

function DocumentEditor({
  personaId,
  label,
  description,
  readOnly = false,
}: {
  personaId: string;
  label: string;
  description: string;
  readOnly?: boolean;
}) {
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ content: string }>(
        `/api/personas/${encodeURIComponent(personaId)}`
      );
      setContent(data.content || "");
      setSavedContent(data.content || "");
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [personaId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api(`/api/personas/${encodeURIComponent(personaId)}`, {
        method: "PUT",
        body: { content },
      });
      setSavedContent(content);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = content !== savedContent;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{label}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          <div className="flex gap-2 items-center">
            {hasChanges && (
              <Badge variant="outline" className="text-yellow-500 border-yellow-500/50">
                Unsaved changes
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`size-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {!readOnly && (
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || !hasChanges}
              >
                {justSaved ? (
                  <><Check className="size-4 mr-1" /> Saved</>
                ) : (
                  <><Save className="size-4 mr-1" /> Save</>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center text-muted-foreground py-8">Loading...</div>
        ) : (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            readOnly={readOnly}
            className="font-mono text-sm min-h-[300px] resize-y leading-relaxed"
            placeholder={readOnly ? "No data yet." : "Write your persona document here using Markdown format..."}
          />
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Profile Details (structured key-value data from agent_memories)    */
/* ------------------------------------------------------------------ */

const CATEGORIES = [
  { value: "identity", label: "Identity" },
  { value: "preference", label: "Preference" },
  { value: "fact", label: "Fact" },
  { value: "relationship", label: "Relationship" },
  { value: "note", label: "Note" },
];

function ProfileDetails({ contactId, title }: { contactId: string; title?: string }) {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newCategory, setNewCategory] = useState("identity");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ memories: MemoryEntry[] }>(
        `/api/memories/${encodeURIComponent(contactId)}`
      );
      // Filter out summary entries — those are internal
      setMemories((data.memories || []).filter(m => m.category !== "summary"));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if (!newKey.trim() || !newValue.trim()) return;
    setAdding(true);
    try {
      await api("/api/memories", {
        method: "POST",
        body: {
          contactId,
          category: newCategory,
          key: newKey.trim(),
          value: newValue.trim(),
          source: "manual",
        },
      });
      setNewKey("");
      setNewValue("");
      await load();
    } catch {
      /* ignore */
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/api/memories/${encodeURIComponent(id)}`, { method: "DELETE" });
      setMemories(prev => prev.filter(m => m.id !== id));
    } catch {
      /* ignore */
    }
  };

  // Group memories by category
  const grouped = memories.reduce<Record<string, MemoryEntry[]>>((acc, m) => {
    if (!acc[m.category]) acc[m.category] = [];
    acc[m.category].push(m);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="size-4" />
              {title || "Profile Details"}
            </CardTitle>
            <CardDescription className="mt-1">
              Structured data — name, phone, email, etc. Automatically extracted + manually editable.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`size-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="text-center text-muted-foreground py-6">Loading...</div>
        ) : (
          <>
            {/* Existing memories grouped by category */}
            {Object.keys(grouped).length === 0 && (
              <div className="text-center text-muted-foreground py-6">
                <Database className="size-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No profile details yet. Add some below or they&apos;ll be extracted from conversations.</p>
              </div>
            )}

            {Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {category}
                </h4>
                <div className="space-y-1">
                  {items.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between py-1.5 px-3 rounded-md hover:bg-muted/50 group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm font-medium text-muted-foreground w-28 shrink-0 truncate">
                          {m.key}
                        </span>
                        <span className="text-sm truncate">{m.value}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="outline"
                          className="text-[10px] opacity-60"
                        >
                          {m.source}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(m.id)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Add new entry */}
            <Separator />
            <div className="flex items-end gap-2">
              <div className="w-32">
                <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Key</label>
                <Input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="e.g. name, email, company"
                  className="h-9"
                />
              </div>
              <div className="flex-[2]">
                <label className="text-xs text-muted-foreground mb-1 block">Value</label>
                <Input
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="h-9"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdd();
                  }}
                />
              </div>
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={adding || !newKey.trim() || !newValue.trim()}
                className="h-9"
              >
                <Plus className="size-4 mr-1" />
                Add
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Personas Table                                                     */
/* ------------------------------------------------------------------ */

function PersonasTable({ 
  filter, 
  emptyTitle, 
  emptyDescription, 
  icon: Icon,
  showTypeBadge = false,
}: { 
  filter: (p: PersonaSummary) => boolean;
  emptyTitle: string;
  emptyDescription: string;
  icon: any;
  showTypeBadge?: boolean;
}) {
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ personas: PersonaSummary[] }>("/api/personas");
      setPersonas((data.personas || []).filter(filter));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (personaId: string) => {
    try {
      await api(`/api/personas/${encodeURIComponent(personaId)}`, {
        method: "DELETE",
      });
      setPersonas((prev) => prev.filter((p) => p.id !== personaId));
      if (selected === personaId) setSelected(null);
    } catch {
      /* ignore */
    }
  };

  if (loading) {
    return <div className="text-center text-muted-foreground py-8">Loading...</div>;
  }

  if (personas.length === 0 && !selected) {
    return (
      <div className="text-center text-muted-foreground py-12 border rounded-lg border-dashed">
        <Icon className="size-10 mx-auto mb-3 opacity-40" />
        <p className="font-medium">{emptyTitle}</p>
        <p className="text-sm mt-1">{emptyDescription}</p>
      </div>
    );
  }

  if (selected) {
    const persona = personas.find((p) => p.id === selected);
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
          ← Back to list
        </Button>
        <DocumentEditor
          personaId={selected}
          label={`${persona?.label || selected} — Persona`}
          description="Personality traits, communication style, and relationship context"
        />
        {persona?.type !== 'agent' && (
          <ProfileDetails
            contactId={selected}
            title={`${persona?.label || selected} — Details`}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {personas.length} item{personas.length !== 1 ? "s" : ""} found
        </p>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="size-4 mr-1" />
          Refresh
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                {showTypeBadge && <TableHead>Type</TableHead>}
                <TableHead>Size</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {personas.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer group"
                  onClick={() => setSelected(p.id)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="bg-muted rounded-full size-8 flex items-center justify-center shrink-0">
                        <Icon className="size-4" />
                      </div>
                      <span className="font-medium truncate">{p.label}</span>
                    </div>
                  </TableCell>
                  {showTypeBadge && (
                    <TableCell>
                      {p.type === 'agent' && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1">AGENT</Badge>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="text-muted-foreground">
                    {p.contentLength > 0 ? `${p.contentLength} chars` : 'File-based'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(p.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ContactsList() {
  return (
    <PersonasTable 
      filter={(p) => p.type === 'core' && p.id !== BOT_SOUL_ID && p.id !== OWNER_SOUL_ID}
      icon={User}
      emptyTitle="No contact profiles yet"
      emptyDescription="Contact profiles are automatically created and updated from conversations."
    />
  );
}

function SpecializedAgentsList() {
  return (
    <PersonasTable 
      filter={(p) => p.type === 'agent'}
      icon={Zap}
      showTypeBadge
      emptyTitle="No specialized agents yet"
      emptyDescription="Create .agent.md files in your agents/ directory to see them here."
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function PersonasPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Brain className="size-6" />
          Personas
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage the bot&apos;s identity, your owner profile, and contact knowledge.
          Documents are automatically updated from conversations.
        </p>
      </div>

      <Separator />

      <Tabs defaultValue="bot" className="w-full">
        <TabsList className="grid w-full max-w-xl grid-cols-4">
          <TabsTrigger value="bot" className="flex items-center gap-1.5">
            <Bot className="size-4" />
            Bot Identity
          </TabsTrigger>
          <TabsTrigger value="owner" className="flex items-center gap-1.5">
            <User className="size-4" />
            Owner Profile
          </TabsTrigger>
          <TabsTrigger value="agents" className="flex items-center gap-1.5">
            <Zap className="size-4" />
            Specialized Agents
          </TabsTrigger>
          <TabsTrigger value="contacts" className="flex items-center gap-1.5">
            <Users className="size-4" />
            Contacts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bot" className="mt-6">
          <DocumentEditor
            personaId={BOT_SOUL_ID}
            label="Bot Identity (IDENTITY.md)"
            description="Ubot's core persona and communication style. Stored as Markdown in your workspace."
          />
        </TabsContent>

        <TabsContent value="owner" className="mt-6 space-y-4">
          <DocumentEditor
            personaId={OWNER_SOUL_ID}
            label="Owner Profile (SOUL.md)"
            description="Your personality and preferences. Auto-enriched and stored as Markdown."
          />
          <ProfileDetails
            contactId={OWNER_SOUL_ID}
            title="Owner Profile Details"
          />
        </TabsContent>

        <TabsContent value="agents" className="mt-6">
          <SpecializedAgentsList />
        </TabsContent>

        <TabsContent value="contacts" className="mt-6">
          <ContactsList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
