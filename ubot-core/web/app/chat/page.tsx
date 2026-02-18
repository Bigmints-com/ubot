"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, Trash2, Bot, User, Wrench, Sparkles, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
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

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ wa: "unknown", model: "—" });
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadHistory();
    loadStatus();
  }, []);

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
      // Backend returns usage.totalTokens; frontend expects tokenUsage.total
      const usage = meta.usage as Record<string, number> | undefined;
      if (usage) {
        tokenUsage = {
          prompt: usage.promptTokens ?? 0,
          completion: usage.completionTokens ?? 0,
          total: usage.totalTokens ?? 0,
        };
      }

      // Backend returns toolCall (singular object); frontend expects toolCalls (array)
      const tc = meta.toolCall as Record<string, unknown> | undefined;
      if (tc?.toolName) {
        const names = String(tc.toolName).split(", ").filter(Boolean);
        toolCalls = names.map((n) => ({ name: n }));
      }
    }

    return {
      role: msg.role as "user" | "assistant",
      content: (msg.content as string) ?? "",
      timestamp: msg.timestamp as string | undefined,
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
        setMessages(data.messages.map(normalizeMessage));
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

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await api<{
        content: string;
        toolCalls?: Array<{ toolName: string }>;
        usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
        model?: string;
        duration?: number;
      }>("/api/chat", {
        method: "POST",
        body: { message: trimmed, sessionId: "web-console" },
      });

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
                manage skills, or schedule tasks.
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

      {/* Input */}
      <div className="px-4 py-3">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="min-h-[40px] max-h-[120px] resize-none"
            rows={1}
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
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
