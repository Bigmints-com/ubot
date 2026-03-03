"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ShieldCheck, Clock, CheckCircle2, Send, User, MessageSquare } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Approval {
  id: string;
  question: string;
  context: string;
  requesterJid: string;
  sessionId: string;
  status: "pending" | "resolved";
  ownerResponse: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});

  const loadApprovals = useCallback(async () => {
    try {
      const data = await api<{ approvals: Approval[] }>("/api/approvals");
      setApprovals(data.approvals || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadApprovals();
    const interval = setInterval(loadApprovals, 5000);
    return () => clearInterval(interval);
  }, [loadApprovals]);

  const handleRespond = async (approvalId: string) => {
    const response = responses[approvalId]?.trim();
    if (!response) return;

    setSubmitting((s) => ({ ...s, [approvalId]: true }));
    try {
      await api(`/api/approvals/${approvalId}/respond`, {
        method: "POST",
        body: { response },
      });
      setResponses((r) => ({ ...r, [approvalId]: "" }));
      loadApprovals();
      toast.success("Response sent");
    } catch {
      toast.error("Failed to send response");
    } finally {
      setSubmitting((s) => ({ ...s, [approvalId]: false }));
    }
  };

  const pending = approvals.filter((a) => a.status === "pending");
  const resolved = approvals.filter((a) => a.status === "resolved");

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  const formatJid = (jid: string) => {
    if (!jid) return "Unknown";
    return jid.replace("@s.whatsapp.net", "").replace(/(\d{3})(\d+)(\d{4})/, "+$1...$3");
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Approvals</h1>
        <p className="text-muted-foreground">
          Review and respond to third-party requests that need your approval
        </p>
      </div>

      <Separator />

      {/* Pending Approvals */}
      {pending.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-yellow-500" />
            <h2 className="text-lg font-semibold">
              Pending
            </h2>
            <Badge variant="destructive">{pending.length}</Badge>
          </div>

          {pending.map((approval) => (
            <Card key={approval.id} className="border-yellow-500/30">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{approval.question}</CardTitle>
                    {approval.context && (
                      <CardDescription className="flex items-center gap-1">
                        <User className="size-3" />
                        {approval.context}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MessageSquare className="size-3" />
                    {formatJid(approval.requesterJid)}
                    <span>•</span>
                    {formatTime(approval.createdAt)}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  placeholder="Type your response..."
                  value={responses[approval.id] || ""}
                  onChange={(e) =>
                    setResponses((r) => ({ ...r, [approval.id]: e.target.value }))
                  }
                  rows={2}
                />
                <Button
                  onClick={() => handleRespond(approval.id)}
                  disabled={
                    submitting[approval.id] || !responses[approval.id]?.trim()
                  }
                  size="sm"
                >
                  <Send className="size-4 mr-2" />
                  {submitting[approval.id] ? "Sending..." : "Send Response"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <ShieldCheck className="size-12 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold">All clear</h3>
            <p className="text-sm text-muted-foreground mt-1">
              No pending approval requests. This page auto-refreshes every 5 seconds.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Resolved Approvals */}
      {resolved.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-green-500" />
            <h2 className="text-lg font-semibold">Resolved</h2>
            <Badge variant="secondary">{resolved.length}</Badge>
          </div>

          {resolved.map((approval) => (
            <Card key={approval.id} className="opacity-70">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-sm">{approval.question}</CardTitle>
                    {approval.context && (
                      <CardDescription className="text-xs">
                        {approval.context}
                      </CardDescription>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {approval.resolvedAt ? formatTime(approval.resolvedAt) : "resolved"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Your response: </span>
                  {approval.ownerResponse}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
