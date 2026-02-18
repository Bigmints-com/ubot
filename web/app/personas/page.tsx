"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Bot, User, Users, Save, RefreshCw, Brain, Trash2, Check } from "lucide-react";
import { api } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PersonaSummary {
  id: string;
  label: string;
  updatedAt: string;
  contentLength: number;
}

/* ------------------------------------------------------------------ */
/*  Document Editor                                                    */
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
            className="font-mono text-sm min-h-[400px] resize-y leading-relaxed"
            placeholder={readOnly ? "No data yet." : "Write your persona document here using YAML format..."}
          />
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Contacts List                                                      */
/* ------------------------------------------------------------------ */

function ContactsList() {
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ personas: PersonaSummary[] }>("/api/personas");
      setPersonas(
        (data.personas || []).filter((p) => p.id !== "__bot__" && p.id !== "__owner__")
      );
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

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
    return <div className="text-center text-muted-foreground py-8">Loading contacts...</div>;
  }

  if (personas.length === 0 && !selected) {
    return (
      <div className="text-center text-muted-foreground py-12">
        <Users className="size-10 mx-auto mb-3 opacity-40" />
        <p className="font-medium">No contact profiles yet</p>
        <p className="text-sm mt-1">
          Contact profiles are automatically created and updated from conversations.
        </p>
      </div>
    );
  }

  if (selected) {
    const persona = personas.find((p) => p.id === selected);
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
          ← Back to contacts
        </Button>
        <DocumentEditor
          personaId={selected}
          label={persona?.label || selected}
          description={`Profile learned from conversations with ${persona?.label || selected}`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {personas.length} contact{personas.length !== 1 ? "s" : ""} with stored profiles
        </p>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="size-4 mr-1" />
          Refresh
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {personas.map((p) => (
          <Card
            key={p.id}
            className="cursor-pointer hover:border-primary/50 transition-colors group"
            onClick={() => setSelected(p.id)}
          >
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="bg-muted rounded-full size-10 flex items-center justify-center">
                  <User className="size-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.contentLength} chars · updated{" "}
                    {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : "—"}
                  </p>
                </div>
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
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
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
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="bot" className="flex items-center gap-1.5">
            <Bot className="size-4" />
            Bot Persona
          </TabsTrigger>
          <TabsTrigger value="owner" className="flex items-center gap-1.5">
            <User className="size-4" />
            Owner
          </TabsTrigger>
          <TabsTrigger value="contacts" className="flex items-center gap-1.5">
            <Users className="size-4" />
            Contacts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bot" className="mt-6">
          <DocumentEditor
            personaId="__bot__"
            label="Bot Persona"
            description="Define Ubot's identity, personality, and communication style. This document shapes every response."
          />
        </TabsContent>

        <TabsContent value="owner" className="mt-6">
          <DocumentEditor
            personaId="__owner__"
            label="Owner Profile"
            description="Your personal profile — automatically enriched from your conversations in the Command Center."
          />
        </TabsContent>

        <TabsContent value="contacts" className="mt-6">
          <ContactsList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
