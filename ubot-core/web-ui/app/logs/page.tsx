"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import {
  ScrollText,
  Pause,
  Play,
  Trash2,
  Filter,
} from "lucide-react";
import { api } from "@/lib/api";

interface LogEntry {
  id: number;
  ts: string;
  level: "info" | "warn" | "error";
  tag: string;
  message: string;
}

interface LogsResponse {
  entries: LogEntry[];
  cursor: number;
}

const LEVEL_COLORS: Record<string, string> = {
  info: "text-emerald-400",
  warn: "text-amber-400",
  error: "text-red-400",
};

const TAG_COLORS: Record<string, string> = {
  Browser: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  Agent: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  WhatsApp: "bg-green-500/20 text-green-300 border-green-500/30",
  Telegram: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  Approvals: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  Config: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
  Server: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
};

function getTagStyle(tag: string): string {
  return TAG_COLORS[tag] || "bg-zinc-500/20 text-zinc-300 border-zinc-500/30";
}

export default function LogsPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [cursor, setCursor] = useState(-1);
  const [paused, setPaused] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [filterLevel, setFilterLevel] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const data = await api<LogsResponse>(
        `/api/logs?since=${cursor}`
      );
      if (data.entries.length > 0) {
        setEntries((prev) => {
          const combined = [...prev, ...data.entries];
          // Keep last 500
          return combined.slice(-500);
        });
      }
      setCursor(data.cursor);
    } catch {}
  }, [cursor]);

  useEffect(() => {
    // Initial full fetch
    api<LogsResponse>("/api/logs").then((data) => {
      setEntries(data.entries);
      setCursor(data.cursor);
    });
  }, []);

  useEffect(() => {
    if (paused) return;
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, [paused, fetchLogs]);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (!paused) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries, paused]);

  const filtered = entries.filter((e) => {
    if (filterTag && e.tag !== filterTag) return false;
    if (filterLevel && e.level !== filterLevel) return false;
    return true;
  });

  // Unique tags for filter
  const allTags = [...new Set(entries.map((e) => e.tag))].sort();

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2">
          <ScrollText className="size-5 text-sky-400" />
          <h1 className="text-sm font-semibold">Live Logs</h1>
          <Badge variant="outline" className="text-xs tabular-nums">
            {filtered.length} entries
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Tag filter */}
          <div className="flex items-center gap-1">
            <Filter className="size-3.5 text-muted-foreground" />
            <select
              className="bg-transparent text-xs border rounded px-1.5 py-0.5 text-muted-foreground"
              value={filterTag || ""}
              onChange={(e) =>
                setFilterTag(e.target.value || null)
              }
            >
              <option value="">All tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Level filter */}
          <select
            className="bg-transparent text-xs border rounded px-1.5 py-0.5 text-muted-foreground"
            value={filterLevel || ""}
            onChange={(e) =>
              setFilterLevel(e.target.value || null)
            }
          >
            <option value="">All levels</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>

          {/* Pause */}
          <button
            onClick={() => setPaused(!paused)}
            className="p-1 rounded hover:bg-muted transition-colors"
            title={paused ? "Resume" : "Pause"}
          >
            {paused ? (
              <Play className="size-4 text-emerald-400" />
            ) : (
              <Pause className="size-4 text-amber-400" />
            )}
          </button>

          {/* Clear */}
          <button
            onClick={() => {
              setEntries([]);
              setCursor(-1);
            }}
            className="p-1 rounded hover:bg-muted transition-colors"
            title="Clear"
          >
            <Trash2 className="size-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Log output */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-zinc-950 font-mono text-[13px] leading-6 p-2"
      >
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            {entries.length === 0
              ? "Waiting for log entries..."
              : "No entries match the current filters"}
          </div>
        ) : (
          filtered.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-2 hover:bg-zinc-900/50 px-2 rounded group"
            >
              {/* Timestamp */}
              <span className="text-zinc-500 shrink-0 tabular-nums select-none">
                {formatTime(entry.ts)}
              </span>

              {/* Level */}
              <span
                className={`shrink-0 w-11 text-right uppercase text-[11px] font-bold ${
                  LEVEL_COLORS[entry.level]
                }`}
              >
                {entry.level}
              </span>

              {/* Tag badge */}
              <span
                className={`shrink-0 inline-flex items-center rounded px-1.5 py-0 text-[10px] font-medium border ${getTagStyle(
                  entry.tag
                )}`}
              >
                {entry.tag}
              </span>

              {/* Message */}
              <span
                className={`break-all ${
                  entry.level === "error"
                    ? "text-red-300"
                    : entry.level === "warn"
                    ? "text-amber-200"
                    : "text-zinc-200"
                }`}
              >
                {entry.message}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Status bar */}
      {paused && (
        <div className="px-4 py-1 border-t bg-amber-500/10 text-amber-400 text-xs flex items-center gap-2">
          <Pause className="size-3" />
          Paused — new entries won&apos;t appear until you resume
        </div>
      )}
    </div>
  );
}
