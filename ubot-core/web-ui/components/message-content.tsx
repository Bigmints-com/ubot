"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState, useCallback } from "react";
import { Copy, Check, ExternalLink, Download, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MessageContentProps {
  content: string;
  role: "user" | "assistant";
}

/**
 * Rich markdown renderer for chat messages.
 * Renders: images, code blocks with copy, tables, links,
 * headings, lists, blockquotes — similar to Claude/ChatGPT.
 */
export function MessageContent({ content, role }: MessageContentProps) {
  if (!content) return null;

  // For user messages, keep simple text rendering
  if (role === "user") {
    return (
      <div className="text-sm leading-relaxed whitespace-pre-wrap">
        {content}
      </div>
    );
  }

  return (
    <div className="text-sm leading-relaxed prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ── Code blocks with syntax highlight + copy button ──
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !match && !String(children).includes("\n");

            if (isInline) {
              return (
                <code
                  className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <CodeBlock language={match?.[1] || ""}>
                {String(children).replace(/\n$/, "")}
              </CodeBlock>
            );
          },

          // ── Images — inline with lightbox effect ──
          img({ src, alt }) {
            return (
              <ImageBlock src={String(src || "")} alt={String(alt || "image")} />
            );
          },

          // ── Links — open in new tab with icon ──
          a({ href, children, ...props }) {
            const isExternal = href?.startsWith("http");
            return (
              <a
                href={href}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noopener noreferrer" : undefined}
                className="text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary inline-flex items-center gap-0.5"
                {...props}
              >
                {children}
                {isExternal && <ExternalLink className="size-3 shrink-0" />}
              </a>
            );
          },

          // ── Tables — styled with borders ──
          table({ children, ...props }) {
            return (
              <div className="overflow-x-auto my-2 rounded-lg border border-border">
                <table className="w-full text-xs" {...props}>
                  {children}
                </table>
              </div>
            );
          },
          thead({ children, ...props }) {
            return (
              <thead className="bg-muted/50" {...props}>
                {children}
              </thead>
            );
          },
          th({ children, ...props }) {
            return (
              <th className="px-3 py-1.5 text-left font-medium border-b border-border" {...props}>
                {children}
              </th>
            );
          },
          td({ children, ...props }) {
            return (
              <td className="px-3 py-1.5 border-b border-border/50" {...props}>
                {children}
              </td>
            );
          },

          // ── Headings — scaled for chat context ──
          h1({ children, ...props }) {
            return <h3 className="text-base font-semibold mt-3 mb-1" {...props}>{children}</h3>;
          },
          h2({ children, ...props }) {
            return <h4 className="text-sm font-semibold mt-3 mb-1" {...props}>{children}</h4>;
          },
          h3({ children, ...props }) {
            return <h5 className="text-sm font-medium mt-2 mb-1" {...props}>{children}</h5>;
          },

          // ── Lists ──
          ul({ children, ...props }) {
            return <ul className="list-disc pl-4 my-1 space-y-0.5" {...props}>{children}</ul>;
          },
          ol({ children, ...props }) {
            return <ol className="list-decimal pl-4 my-1 space-y-0.5" {...props}>{children}</ol>;
          },
          li({ children, ...props }) {
            return <li className="text-sm" {...props}>{children}</li>;
          },

          // ── Blockquotes ──
          blockquote({ children, ...props }) {
            return (
              <blockquote
                className="border-l-2 border-primary/40 pl-3 my-2 text-muted-foreground italic"
                {...props}
              >
                {children}
              </blockquote>
            );
          },

          // ── Horizontal rules ──
          hr({ ...props }) {
            return <hr className="my-3 border-border/50" {...props} />;
          },

          // ── Paragraphs ──
          p({ children, ...props }) {
            return <p className="my-1" {...props}>{children}</p>;
          },

          // ── Strong / emphasis ──
          strong({ children, ...props }) {
            return <strong className="font-semibold" {...props}>{children}</strong>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ── Code Block with Copy Button ──────────────────────────
function CodeBlock({ children, language }: { children: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-border bg-[hsl(var(--muted))]">
      {/* Header with language label + copy */}
      <div className="flex items-center justify-between px-3 py-1 bg-muted/80 border-b border-border/50 text-[10px] text-muted-foreground">
        <span className="font-mono uppercase tracking-wider">{language || "text"}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="size-3 text-green-500" />
          ) : (
            <Copy className="size-3" />
          )}
        </Button>
      </div>
      {/* Code content */}
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code className={`language-${language} font-mono`}>{children}</code>
      </pre>
    </div>
  );
}

// ── Image Block with lightbox ────────────────────────────
function ImageBlock({ src, alt }: { src: string; alt: string }) {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="flex items-center gap-2 my-2 px-3 py-2 rounded-lg border border-border bg-muted/30 text-xs text-muted-foreground">
        <ExternalLink className="size-3" />
        <a href={src} target="_blank" rel="noopener noreferrer" className="underline">
          {alt || "Image"}
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="my-2 inline-block max-w-full">
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-[400px] rounded-lg border border-border cursor-pointer hover:opacity-90 transition-opacity object-contain"
          onClick={() => setExpanded(true)}
          onError={() => setError(true)}
        />
        {alt && alt !== "image" && (
          <p className="text-[10px] text-muted-foreground mt-0.5 text-center">{alt}</p>
        )}
      </div>

      {/* Lightbox overlay */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm cursor-pointer"
          onClick={() => setExpanded(false)}
        >
          <img
            src={src}
            alt={alt}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
          />
          <div className="absolute top-4 right-4 flex gap-2">
            <a
              href={src}
              download
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <Download className="size-4" />
            </a>
          </div>
        </div>
      )}
    </>
  );
}

// ── Audio Player ─────────────────────────────────────────
export function AudioPlayer({ src }: { src: string }) {
  const [playing, setPlaying] = useState(false);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  const toggle = useCallback(() => {
    if (!audioEl) {
      const audio = new Audio(src);
      audio.onended = () => setPlaying(false);
      audio.onerror = () => setPlaying(false);
      setAudioEl(audio);
      audio.play();
      setPlaying(true);
    } else if (playing) {
      audioEl.pause();
      setPlaying(false);
    } else {
      audioEl.play();
      setPlaying(true);
    }
  }, [audioEl, playing, src]);

  return (
    <div className="flex items-center gap-2 my-1 px-3 py-2 rounded-lg border border-border bg-muted/30">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={toggle}
      >
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
      </Button>
      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
        <div className={`h-full bg-primary rounded-full ${playing ? "animate-pulse w-1/2" : "w-0"} transition-all`} />
      </div>
    </div>
  );
}
