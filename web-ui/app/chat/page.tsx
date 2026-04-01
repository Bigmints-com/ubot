"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Send, Trash2, Bot, User, Wrench, Sparkles, Loader2,
  Paperclip, X, FileText, Image as ImageIcon, File as FileIcon,
  ArrowDown, Globe, Smartphone, MessageCircle,
  Send as SendIcon, Mic, MicOff, AudioLines,
} from "lucide-react";
import { api } from "@/lib/api";
import { ThreadSidebar } from "@/components/thread-sidebar";
import { toast } from "sonner";

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

const CHANNEL_META: Record<string, { icon: typeof Globe; label: string; color: string }> = {
  web: { icon: Globe, label: "Web", color: "text-blue-500" },
  whatsapp: { icon: Smartphone, label: "WhatsApp", color: "text-green-500" },
  telegram: { icon: SendIcon, label: "Telegram", color: "text-sky-500" },
};

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
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string>("");
  const [activeThreadType, setActiveThreadType] = useState<string>("web");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const voiceInitiatedRef = useRef(false);
  const [speaking, setSpeaking] = useState(false);
  const [activeThreadName, setActiveThreadName] = useState<string>("");
  const [threadReady, setThreadReady] = useState(false);
  const [processingThreads, setProcessingThreads] = useState<string[]>([]);
  const [imagePreview, setImagePreview] = useState<{ file: File; preview: string; base64: string } | null>(null);
  const [imageCaption, setImageCaption] = useState("");
  const captionInputRef = useRef<HTMLInputElement>(null);

  const isReadOnly = activeThreadType !== "web";
  // Show typing indicator if: web thread is loading locally, OR backend reports this thread is processing
  const isProcessing = loading || processingThreads.includes(activeThreadId);

  // Initialize: fetch threads and select or create one
  useEffect(() => {
    const init = async () => {
      try {
        const data = await api<{ sessions: Array<{ id: string; type: string; name: string }> }>("/api/chat/sessions");
        if (data.sessions && data.sessions.length > 0) {
          const first = data.sessions[0];
          setActiveThreadId(first.id);
          setActiveThreadType(first.type || "web");
          setActiveThreadName(first.name || "");
        } else {
          // Create first thread
          const res = await api<{ session: { id: string } }>("/api/chat/sessions", {
            method: "POST",
            body: { name: "General" },
          });
          setActiveThreadId(res.session.id);
          setActiveThreadType("web");
          setActiveThreadName("General");
        }
      } catch {
        // Fallback to legacy
        setActiveThreadId("web-console");
        setActiveThreadType("web");
      }
      setThreadReady(true);
    };
    init();
    loadStatus();
  }, []);

  // Load history when thread changes
  useEffect(() => {
    if (!activeThreadId) return;
    loadHistory();
  }, [activeThreadId]);

  // Listen for clear chat event from breadcrumb
  useEffect(() => {
    const handler = () => clearHistory();
    window.addEventListener("ubot:clear-chat", handler);
    return () => window.removeEventListener("ubot:clear-chat", handler);
  }, [activeThreadId]);

  // Poll for server-injected messages
  const pollForNewMessages = useCallback(async () => {
    if (!activeThreadId) return;
    try {
      const data = await api<{ messages: Record<string, unknown>[] }>(
        `/api/chat/history?sessionId=${encodeURIComponent(activeThreadId)}&limit=50`
      );
      if (data.messages?.length && data.messages.length > messageCountRef.current) {
        const newMsgs = data.messages.slice(messageCountRef.current).map(normalizeMessage);
        messageCountRef.current = data.messages.length;
        setMessages(prev => [...prev, ...newMsgs]);
      }
    } catch { /* ignore */ }
  }, [activeThreadId]);

  useEffect(() => {
    if (loading) return;
    const interval = setInterval(pollForNewMessages, 3000);
    return () => clearInterval(interval);
  }, [loading, pollForNewMessages]);

  // Poll for backend processing status (shows typing indicator for Telegram/WhatsApp threads)
  useEffect(() => {
    const pollProcessing = async () => {
      try {
        const data = await api<{ sessions: string[] }>("/api/chat/processing");
        setProcessingThreads(data.sessions || []);
      } catch { /* ignore */ }
    };
    pollProcessing();
    const interval = setInterval(pollProcessing, 1500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 50);
  };

  // Track scroll position to show/hide the scroll-down button
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // ScrollArea renders a viewport div inside — find it
    const viewport = el.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
    if (!viewport) return;

    const handleScroll = () => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      setShowScrollDown(distanceFromBottom > 100);
    };
    viewport.addEventListener('scroll', handleScroll);
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, [messages]);

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
    if (!activeThreadId) return;
    try {
      const data = await api<{ messages: Record<string, unknown>[] }>(
        `/api/chat/history?sessionId=${encodeURIComponent(activeThreadId)}&limit=50`
      );
      if (data.messages?.length) {
        messageCountRef.current = data.messages.length;
        setMessages(data.messages.map(normalizeMessage));
      } else {
        messageCountRef.current = 0;
        setMessages([]);
      }
    } catch {
      messageCountRef.current = 0;
      setMessages([]);
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
        toast.warning(`${file.name} exceeds 10MB limit`);
        continue;
      }
      
      if (!ACCEPTED_TYPES.includes(file.type) && !file.name.match(/\.(txt|md|csv|json|html|xml|log)$/i)) {
        toast.warning(`${file.name}: unsupported file type (${file.type || "unknown"})`);
        continue;
      }

      const base64 = await fileToBase64(file);

      // For single image: show preview with caption
      if (file.type.startsWith("image/") && files.length === 1) {
        const preview = URL.createObjectURL(file);
        setImagePreview({ file, preview, base64 });
        setImageCaption("");
        setTimeout(() => captionInputRef.current?.focus(), 100);
        return;
      }

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

  const sendImageWithCaption = () => {
    if (!imagePreview) return;
    const att: PendingAttachment = {
      file: imagePreview.file,
      preview: imagePreview.preview,
      base64: imagePreview.base64,
    };
    setPendingAttachments([att]);
    setImagePreview(null);
    // Send immediately with caption
    const caption = imageCaption.trim();
    setTimeout(() => sendMessage(caption || undefined), 0);
  };

  const cancelImagePreview = () => {
    if (imagePreview?.preview) URL.revokeObjectURL(imagePreview.preview);
    setImagePreview(null);
    setImageCaption("");
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

  const sendMessage = async (textOverride?: string) => {
    const trimmed = (textOverride ?? input).trim();
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
        sessionId: activeThreadId,
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

      // Auto-speak response if voice-initiated and response is conversational
      if (voiceInitiatedRef.current && res.content) {
        voiceInitiatedRef.current = false;
        if (shouldSpeak(res.content)) {
          speakText(res.content);
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Send failed: ${errorMessage}`);
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
    if (!activeThreadId) return;
    try {
      await api("/api/chat/clear", {
        method: "POST",
        body: { sessionId: activeThreadId },
      });
      setMessages([]);
      messageCountRef.current = 0;
      toast.success("Chat history cleared");
    } catch {
      toast.error("Failed to clear history");
    }
  };

  const handleNewThread = async () => {
    try {
      const res = await api<{ session: { id: string } }>("/api/chat/sessions", {
        method: "POST",
        body: { name: `Thread ${Date.now().toString().slice(-4)}` },
      });
      setActiveThreadId(res.session.id);
    } catch { /* ignore */ }
  };

  const handleSelectThread = async (threadId: string) => {
    if (threadId === activeThreadId) return;
    setMessages([]);
    messageCountRef.current = 0;
    setActiveThreadId(threadId);
    // Look up thread type
    try {
      const data = await api<{ sessions: Array<{ id: string; type: string; name: string }> }>("/api/chat/sessions");
      const thread = data.sessions?.find((s: { id: string }) => s.id === threadId);
      setActiveThreadType(thread?.type || "web");
      setActiveThreadName(thread?.name || "");
    } catch {
      setActiveThreadType("web");
      setActiveThreadName("");
    }
  };

  // ── Voice Response Decision ─────────────────────────────
  /** Decide if a response should be spoken aloud or just shown as text */
  const shouldSpeak = (text: string): boolean => {
    // Too long — not conversational
    if (text.length > 800) return false;

    // Contains code blocks — technical response
    if (text.includes('```')) return false;

    // Heavy markdown (many headers, lists) — structured content
    const lineCount = text.split('\n').length;
    if (lineCount > 15) return false;

    // Dense with URLs — not suitable for voice
    const urlCount = (text.match(/https?:\/\//g) || []).length;
    if (urlCount > 2) return false;

    // Numbered steps (>5) — too structured for voice
    const numberedItems = (text.match(/^\d+\./gm) || []).length;
    if (numberedItems > 5) return false;

    // Error messages — don't speak
    if (text.startsWith('⚠️')) return false;

    return true;
  };

  // ── TTS Playback ───────────────────────────────────────
  const speakText = async (text: string) => {
    try {
      setSpeaking(true);
      const response = await fetch('/api/tts/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        // TTS not available, skip silently
        setSpeaking(false);
        return;
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        setSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
    } catch {
      setSpeaking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Voice Recording ────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach(t => t.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size < 100) {
          toast.warning('Recording too short');
          return;
        }

        // Send to transcription API
        setTranscribing(true);
        try {
          const response = await fetch('/api/transcription/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'audio/webm' },
            body: audioBlob,
          });
          const data = await response.json();

          if (data.text && data.text !== '(no speech detected)') {
            // Mark as voice-initiated so response gets spoken
            voiceInitiatedRef.current = true;
            sendMessage(data.text.trim());
          } else {
            toast.warning('No speech detected. Try speaking louder or longer.');
          }
        } catch (err: any) {
          toast.error(`Transcription failed: ${err.message}`);
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setRecording(true);
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        toast.error('Microphone access denied. Please allow it in browser settings.');
      } else {
        toast.error(`Mic error: ${err.message}`);
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  const toggleRecording = () => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
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

  if (!threadReady) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3rem)]">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      <ThreadSidebar
        activeThreadId={activeThreadId}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
      />
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden relative">

      {/* Channel header for non-web threads */}
      {isReadOnly && (() => {
        const meta = CHANNEL_META[activeThreadType];
        const Icon = meta?.icon || Globe;
        return (
          <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
            <Icon className={`size-4 ${meta?.color || "text-muted-foreground"}`} />
            <span className="text-sm font-medium">{activeThreadName || activeThreadId}</span>
            <Badge variant="outline" className="text-[10px] ml-auto">
              {meta?.label || activeThreadType} · Read-only
            </Badge>
          </div>
        );
      })()}

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0 px-4" ref={scrollRef}>
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

          {isProcessing && (
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

      {/* Floating scroll-to-bottom button */}
      {showScrollDown && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-20 z-10">
          <Button
            variant="secondary"
            size="icon"
            className="rounded-full size-8 shadow-lg border"
            onClick={() => {
              const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
              if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
            }}
          >
            <ArrowDown className="size-4" />
          </Button>
        </div>
      )}

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

      {/* Input — only for web threads */}
      {isReadOnly ? (
        <div className="px-4 py-3 bg-muted/20 border-t">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground max-w-3xl mx-auto">
            {(() => {
              const meta = CHANNEL_META[activeThreadType];
              const Icon = meta?.icon || Globe;
              return <Icon className={`size-4 ${meta?.color || ""}`} />;
            })()}
            <span>Viewing {CHANNEL_META[activeThreadType]?.label || activeThreadType} conversation · Messages handled by skills</span>
          </div>
        </div>
      ) : (
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
            <Button
              variant={recording ? "destructive" : "ghost"}
              size="icon"
              className={`shrink-0 relative ${recording ? 'animate-pulse' : ''}`}
              onClick={toggleRecording}
              disabled={loading || transcribing}
              title={recording ? 'Stop recording' : 'Voice input (transcribe speech)'}
            >
              {transcribing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : recording ? (
                <>
                  <MicOff className="size-4" />
                  <span className="absolute -top-0.5 -right-0.5 size-2 bg-red-500 rounded-full animate-ping" />
                </>
              ) : (
                <Mic className="size-4" />
              )}
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
              onClick={() => sendMessage()}
              disabled={(!input.trim() && pendingAttachments.length === 0) || loading}
              size="icon"
              className="shrink-0"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      )}
      </div>

      {/* Image Preview Modal */}
      {imagePreview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-sm font-medium text-white">Send Image</span>
            <Button
              variant="ghost"
              size="icon"
              className="text-white/60 hover:text-white hover:bg-white/10"
              onClick={cancelImagePreview}
            >
              <X className="size-5" />
            </Button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center p-6">
            <img
              src={imagePreview.preview}
              alt="Preview"
              className="max-w-full max-h-full object-contain rounded-xl"
            />
          </div>
          <div className="flex items-end gap-2 px-4 py-3 border-t border-white/10 bg-black/50">
            <Input
              ref={captionInputRef}
              value={imageCaption}
              onChange={(e) => setImageCaption(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendImageWithCaption();
                }
              }}
              placeholder="Add a caption..."
              className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/40 focus-visible:ring-primary"
            />
            <Button
              onClick={sendImageWithCaption}
              size="icon"
              className="shrink-0"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
