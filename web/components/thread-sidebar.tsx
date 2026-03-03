"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  MessageSquare,
  Pencil,
  Trash2,
  Check,
  X,
  MoreVertical,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Thread {
  id: string;
  type: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

interface ThreadSidebarProps {
  activeThreadId: string;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ThreadSidebar({
  activeThreadId,
  onSelectThread,
  onNewThread,
}: ThreadSidebarProps) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const loadThreads = async () => {
    try {
      const data = await api<{ sessions: Thread[] }>("/api/chat/sessions");
      setThreads(data.sessions || []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadThreads();
  }, [activeThreadId]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const handleRename = async (threadId: string) => {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      await api("/api/chat/sessions", {
        method: "PUT",
        body: { sessionId: threadId, name: renameValue.trim() },
      });
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId ? { ...t, name: renameValue.trim() } : t
        )
      );
    } catch {
      /* ignore */
    }
    setRenamingId(null);
  };

  const handleDelete = async (threadId: string) => {
    try {
      await api("/api/chat/sessions/delete", {
        method: "POST",
        body: { sessionId: threadId },
      });
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      // If we deleted the active thread, select another or create new
      if (threadId === activeThreadId) {
        const remaining = threads.filter((t) => t.id !== threadId);
        if (remaining.length > 0) {
          onSelectThread(remaining[0].id);
        } else {
          onNewThread();
        }
      }
    } catch {
      /* ignore */
    }
  };

  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-2 px-1 border-r gap-1 bg-sidebar">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => setCollapsed(false)}
          title="Expand threads"
        >
          <PanelLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onNewThread}
          title="New thread"
        >
          <Plus className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-56 h-full border-r bg-sidebar shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Threads
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={onNewThread}
            title="New thread"
          >
            <Plus className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={() => setCollapsed(true)}
            title="Collapse"
          >
            <PanelLeftClose className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Thread list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="py-1">
          {threads.map((thread) => (
            <div
              key={thread.id}
              className={cn(
                "group flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent/50 transition-colors",
                thread.id === activeThreadId && "bg-accent"
              )}
              onClick={() => {
                if (renamingId !== thread.id) onSelectThread(thread.id);
              }}
            >
              <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />

              <div className="flex-1 min-w-0">
                {renamingId === thread.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleRename(thread.id);
                    }}
                    className="flex items-center gap-1"
                  >
                    <Input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="h-5 text-xs px-1"
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      onBlur={() => handleRename(thread.id)}
                    />
                  </form>
                ) : (
                  <>
                    <p className="text-xs font-medium truncate">
                      {thread.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {thread.messageCount} msgs · {timeAgo(thread.updatedAt)}
                    </p>
                  </>
                )}
              </div>

              {renamingId !== thread.id && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-32">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(thread.id);
                        setRenameValue(thread.name);
                      }}
                    >
                      <Pencil className="size-3 mr-2" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(thread.id);
                      }}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="size-3 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}

          {threads.length === 0 && (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-muted-foreground">No threads yet</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-xs"
                onClick={onNewThread}
              >
                <Plus className="size-3 mr-1" />
                Start a thread
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
