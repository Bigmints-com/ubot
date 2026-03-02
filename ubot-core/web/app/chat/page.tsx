"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Send, Trash2, Bot, User, Wrench, Sparkles, Loader2,
  Paperclip, X, FileText, Image as ImageIcon, File as FileIcon,
} from "lucide-react";
import { api } from "@/lib/api";

interface PendingAttachment {
  file: File;
  preview?: string; // data URL for image preview
  base64: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  attachments?: Array<{ id: string; filename: string; mimeType: string }>;
  metadata?: {
    model?: string;
    toolCalls?: Array<{ name: string; args?: unknown }>;
    tokenUsage?: { prompt: number; completion: number; total: number };
    duration?: number;
  };
}

const suggestions = [
  "What can you do?",
  "Send a WhatsApp message",
  "Show my WhatsApp status",
  "Schedule a message for tomorrow",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = [
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/pdf",
  "text/plain", "text/markdown", "text/csv", "text/html",
  "application/json", "application/xml",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ wa: "unknown", model: "—" });
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageCountRef = useRef(0);

  useEffect(() => {
    loadHistory();
    loadStatus();
  }, []);

  // Poll for server-injected messages (e.g. CLI completion notifications)
  const pollForNewMessages = useCallback(async () => {
    try {
      const data = await api<{ messages: Record<string, unknown>[] }>(
        "/api/chat/history?sessionId=web-console&limit=50"
      );
      if (data.messages?.length && data.messages.length > messageCountRef.current) {
        const newMsgs = data.messages.slice(messageCountRef.current).map(normalizeMessage);
        messageCountRef.current = data.messages.length;
        setMessages(prev => [...prev, ...newMsgs]);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (loading) return;
    const interval = setInterval(pollForNewMessages, 3000);
    return () => clearInterval(interval);
  }, [loading, pollForNewMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 50);
  };

  /** Normalize history messages from backend shape to frontend shape */
  const normalizeMessage = (msg: Record<string, unknown>): ChatMessage => {
    const meta = msg.metadata as Record<string, unknown> | undefined;
    let tokenUsage = undefined;
    let toolCalls = undefined;

    if (meta) {
      const usage = meta.usage as Record<string, number> | undefined;
      if (usage) {
        tokenUsage = {
          prompt: usage.promptTokens ?? 0,
          completion: usage.completionTokens ?? 0,
          total: usage.totalTokens ?? 0,
        };
      }

      const tc = meta.toolCall as Record<string, unknown> | undefined;
      if (tc?.toolName) {
        const names = String(tc.toolName).split(", ").filter(Boolean);
        toolCalls = names.map((n) => ({ name: n }));
      }
    }

    // Extract attachments from metadata
    const attachments = (meta?.attachments as Array<{ id: string; filename: string; mimeType: string }>) || undefined;

    return {
      role: msg.role as "user" | "assistant",
      content: (msg.content as string) ?? "",
      timestamp: msg.timestamp as string | undefined,
      attachments,
      metadata: meta
        ? {
            model: meta.model as string | undefined,
            tokenUsage,
            toolCalls,
            duration: meta.duration as number | undefined,
          }
        : undefined,
    };
  };

  const loadHistory = async () => {
    try {
      const data = await api<{ messages: Record<string, unknown>[] }>(
        "/api/chat/history?sessionId=web-console&limit=50"
      );
      if (data.messages?.length) {
        messageCountRef.current = data.messages.length;
        setMessages(data.messages.map(normalizeMessage));
      } else {
        messageCountRef.current = 0;
      }
    } catch {
      /* empty history */
    }
  };

  const loadStatus = async () => {
    try {
      const [wa, config] = await Promise.all([
        api<{ status: string }>("/api/whatsapp/status"),
        api<{ model: string }>("/api/chat/config"),
      ]);
      setStatus({ wa: wa.status, model: config.model });
    } catch {
      /* ignore */
    }
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return;
    
    const newAttachments: PendingAttachment[] = [];
    
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        alert(`${file.name} exceeds 10MB limit`);
        continue;
      }
      
      if (!ACCEPTED_TYPES.includes(file.type) && !file.name.match(/\.(txt|md|csv|json|html|xml|log)$/i)) {
        alert(`${file.name}: unsupported file type (${file.type || "unknown"})`);
        continue;
      }

      const base64 = await fileToBase64(file);
      const preview = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined;
      
      newAttachments.push({ file, preview, base64 });
    }

    if (newAttachments.length > 0) {
      setPendingAttachments(prev => [...prev, ...newAttachments]);
      textareaRef.current?.focus();
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // Extract base64 data from data URL
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (index: number) => {
    setPendingAttachments(prev => {
      const copy = [...prev];
      if (copy[index]?.preview) URL.revokeObjectURL(copy[index].preview!);
      copy.splice(index, 1);
      return copy;
    });
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if ((!trimmed && pendingAttachments.length === 0) || loading) return;

    messageCountRef.current += 1;
    const userMsg: ChatMessage = {
      role: "user",
      content: trimmed || (pendingAttachments.length > 0 ? "[Attachment]" : ""),
      timestamp: new Date().toISOString(),
      attachments: pendingAttachments.map((att, i) => ({
        id: `pending-${i}`,
        filename: att.file.name,
        mimeType: att.file.type,
      })),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    const attachmentsToSend = [...pendingAttachments];
    setPendingAttachments([]);
    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        message: trimmed || `Please analyze the attached file(s): ${attachmentsToSend.map(a => a.file.name).join(", ")}`,
        sessionId: "web-console",
      };

      if (attachmentsToSend.length > 0) {
        body.attachments = attachmentsToSend.map((att) => ({
          filename: att.file.name,
          mimeType: att.file.type,
          base64: att.base64,
        }));
      }

      const res = await api<{
        content: string;
        toolCalls?: Array<{ toolName: string }>;
        usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
        model?: string;
        duration?: number;
        attachments?: Array<{ id: string; filename: string; mimeType: string }>;
      }>("/api/chat", {
        method: "POST",
        body,
      });

      messageCountRef.current += 1;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.content ?? "",
          timestamp: new Date().toISOString(),
          metadata: {
            model: res.model,
            tokenUsage: res.usage
              ? {
                  prompt: res.usage.promptTokens,
                  completion: res.usage.completionTokens,
                  total: res.usage.totalTokens,
                }
              : undefined,
            toolCalls: res.toolCalls?.map((tc) => ({ name: tc.toolName })),
            duration: res.duration,
          },
        },
      ]);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `⚠️ Error: ${errorMessage}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
      // Clean up preview URLs
      attachmentsToSend.forEach(a => { if (a.preview) URL.revokeObjectURL(a.preview); });
    }
  };

  const clearHistory = async () => {
    try {
      await api("/api/chat/clear", {
        method: "POST",
        body: { sessionId: "web-console" },
      });
      setMessages([]);
    } catch {
      /* ignore */
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatContent = (text: string) => {
    if (!text) return "";
    return text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`(.+?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs">$1</code>')
      .replace(/\n/g, "<br />");
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return <ImageIcon className="size-3" />;
    if (mimeType === "application/pdf") return <FileText className="size-3" />;
    return <FileIcon className="size-3" />;
  };

  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size}B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)}KB`;
    return `${(size / (1024 * 1024)).toFixed(1)}MB`;
  };

  const waConnected = status.wa === "connected";

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-3">
          <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">Command Center</h2>
            <p className="text-xs text-muted-foreground">
              AI Agent — {status.model}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={waConnected ? "default" : "secondary"}
            className="text-xs"
          >
            WA: {status.wa}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            onClick={clearHistory}
            title="Clear history"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4" ref={scrollRef}>
        <div className="py-4 space-y-4 max-w-3xl mx-auto">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <div className="bg-primary/10 rounded-full p-4">
                <Sparkles className="size-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">
                Welcome to Ubot Command Center
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                I&apos;m your AI assistant. Ask me to send WhatsApp messages,
                manage skills, schedule tasks, or <strong>attach images & documents</strong> for analysis.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {suggestions.map((s) => (
                  <Button
                    key={s}
                    variant="outline"
                    size="sm"
                    onClick={() => setInput(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <Avatar className="size-8 shrink-0">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    <Bot className="size-4" />
                  </AvatarFallback>
                </Avatar>
              )}
              <div
                className={`max-w-[80%] space-y-1 ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                {/* Attachment badges (for user messages) */}
                {msg.attachments && msg.attachments.length > 0 && msg.role === "user" && (
                  <div className="flex flex-wrap gap-1 justify-end mb-1">
                    {msg.attachments.map((att, j) => (
                      <Badge key={j} variant="outline" className="text-xs gap-1">
                        {getFileIcon(att.mimeType)}
                        {att.filename}
                      </Badge>
                    ))}
                  </div>
                )}

                <Card
                  className={`px-3 py-2 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <div
                    className="text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: formatContent(msg.content),
                    }}
                  />
                </Card>
                {msg.metadata?.toolCalls && msg.metadata.toolCalls.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {msg.metadata.toolCalls.map((tc, j) => (
                      <Badge key={j} variant="outline" className="text-xs">
                        <Wrench className="size-3 mr-1" />
                        {tc.name}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {msg.timestamp && (
                    <span>
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                  {msg.metadata?.tokenUsage && (
                    <span>
                      {msg.metadata.tokenUsage.total} tokens
                    </span>
                  )}
                  {msg.metadata?.duration && (
                    <span>{(msg.metadata.duration / 1000).toFixed(1)}s</span>
                  )}
                </div>
              </div>
              {msg.role === "user" && (
                <Avatar className="size-8 shrink-0">
                  <AvatarFallback className="text-xs">
                    <User className="size-4" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 items-start">
              <Avatar className="size-8 shrink-0">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  <Bot className="size-4" />
                </AvatarFallback>
              </Avatar>
              <Card className="px-4 py-3 bg-muted">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  <span>Thinking</span>
                  <span className="inline-flex gap-0.5">
                    <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                  </span>
                </div>
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>

      <Separator />

      {/* Pending Attachments Preview */}
      {pendingAttachments.length > 0 && (
        <div className="px-4 pt-2">
          <div className="flex flex-wrap gap-2 max-w-3xl mx-auto">
            {pendingAttachments.map((att, i) => (
              <div
                key={i}
                className="relative group flex items-center gap-2 bg-muted rounded-lg px-2 py-1.5 text-xs border"
              >
                {att.preview ? (
                  <img
                    src={att.preview}
                    alt={att.file.name}
                    className="h-8 w-8 rounded object-cover"
                  />
                ) : (
                  <div className="h-8 w-8 rounded bg-muted-foreground/10 flex items-center justify-center">
                    {getFileIcon(att.file.type)}
                  </div>
                )}
                <div className="flex flex-col max-w-[120px]">
                  <span className="truncate font-medium">{att.file.name}</span>
                  <span className="text-muted-foreground">{formatFileSize(att.file.size)}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full"
                  onClick={() => removeAttachment(i)}
                >
                  <X className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3">
        <div className="flex gap-2 max-w-3xl mx-auto">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept={ACCEPTED_TYPES.join(",")}
            onChange={(e) => {
              handleFileSelect(e.target.files);
              e.target.value = ""; // Reset so same file can be selected again
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            title="Attach files (images, PDFs, documents)"
          >
            <Paperclip className="size-4" />
          </Button>
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={pendingAttachments.length > 0 ? "Add a message about the attachment(s)..." : "Type a message..."}
            className="min-h-[40px] max-h-[120px] resize-none"
            rows={1}
          />
          <Button
            onClick={sendMessage}
            disabled={(!input.trim() && pendingAttachments.length === 0) || loading}
            size="icon"
            className="shrink-0"
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
