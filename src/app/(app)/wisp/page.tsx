"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Send,
  RotateCcw,
  User,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  WISP_PLACEHOLDERS,
  WISP_WELCOME_MESSAGES,
  WISP_LOADING_MESSAGES,
  getRandomWelcomeMessage,
} from "@/lib/wisp/constants";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ title: string; url: string }>;
  timestamp: string;
}

export default function WispPage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: WISP_WELCOME_MESSAGES[0],
      timestamp: "",
    },
  ]);

  // Client-side initialization to eliminate SSR hydration mismatches
  useEffect(() => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: getRandomWelcomeMessage(),
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  }, []);

  // Rotate loading messages while query is in-flight
  useEffect(() => {
    if (!loading) return;
    setLoadingMsgIdx(Math.floor(Math.random() * WISP_LOADING_MESSAGES.length));
    const interval = setInterval(() => {
      setLoadingMsgIdx((prev) => (prev + 1) % WISP_LOADING_MESSAGES.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [loading]);

  // Rotate input placeholder every 4.5s
  useEffect(() => {
    setPlaceholderIdx(Math.floor(Math.random() * WISP_PLACEHOLDERS.length));
    const interval = setInterval(() => {
      setPlaceholderIdx((prev) => (prev + 1) % WISP_PLACEHOLDERS.length);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    setInput("");
    const userMsg: ChatMessage = {
      id: "u-" + Date.now(),
      role: "user",
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = messages
        .filter((m) => m.id !== "welcome")
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/wisp/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: query, history }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        const assistantMsg: ChatMessage = {
          id: "a-" + Date.now(),
          role: "assistant",
          content: json.data.reply,
          sources: json.data.sources,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        throw new Error(json.error?.message || "Failed to get reply");
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: "err-" + Date.now(),
        role: "assistant",
        content:
          "I apologize, but I encountered an issue retrieving data from the database. Please try again or rephrase your question.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([
      {
        id: "welcome-" + Date.now(),
        role: "assistant",
        content: getRandomWelcomeMessage(),
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header Banner */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 flex items-center justify-center shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/wisp.png"
              alt="Wisp"
              className="w-12 h-12 object-contain"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground font-mono">
                Wisp Assistant
              </h1>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Online
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Natural language queries & task guidance grounded in Indobest’s database.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Chat</span>
          </button>
        </div>
      </div>

      {/* Main Chat Box */}
      <div className="bg-card border border-border rounded-xl shadow-xs overflow-hidden flex flex-col h-[650px]">
        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-sm">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex gap-3 max-w-[85%]",
                m.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
              )}
            >
              {m.role === "user" ? (
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5 bg-primary text-primary-foreground">
                  <User className="w-4 h-4" />
                </div>
              ) : (
                <div className="w-8 h-8 shrink-0 mt-0.5 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/wisp.png"
                    alt="Wisp"
                    className="w-8 h-8 object-contain"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1 max-w-full">
                <div
                  className={cn(
                    "p-4 rounded-2xl shadow-xs leading-relaxed break-words",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-none text-sm"
                      : "bg-muted/50 border border-border text-foreground rounded-tl-none text-sm"
                  )}
                >
                  <FormattedMessage content={m.content} isUser={m.role === "user"} />

                  {/* Sources / Deep links */}
                  {m.sources && m.sources.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-border/50 flex flex-wrap gap-2">
                      <span className="text-xs text-muted-foreground font-semibold flex items-center gap-1">
                        Direct Links:
                      </span>
                      {m.sources.map((s, idx) => (
                        <Link
                          key={idx}
                          href={s.url}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-background border border-border text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                        >
                          <span>{s.title}</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
                {m.timestamp ? (
                  <span
                    suppressHydrationWarning
                    className={cn(
                      "text-[10px] text-muted-foreground px-1",
                      m.role === "user" ? "text-right" : "text-left"
                    )}
                  >
                    {m.timestamp}
                  </span>
                ) : null}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 mr-auto max-w-[80%]">
              <div className="w-8 h-8 shrink-0 mt-0.5 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/wisp.png"
                  alt="Wisp"
                  className="w-8 h-8 object-contain animate-pulse"
                />
              </div>
              <div className="p-4 rounded-2xl rounded-tl-none bg-muted/50 border border-border text-muted-foreground flex items-center gap-2 transition-all">
                <span className="w-2 h-2 rounded-full bg-primary/70 animate-bounce" />
                <span
                  className="w-2 h-2 rounded-full bg-primary/70 animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="w-2 h-2 rounded-full bg-primary/70 animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
                <span className="text-xs ml-1 font-medium text-foreground/85 animate-fade-in">
                  {WISP_LOADING_MESSAGES[loadingMsgIdx]}
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <div className="p-4 bg-card border-t border-border">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={WISP_PLACEHOLDERS[placeholderIdx]}
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:bg-background text-foreground transition-all disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0 shadow-xs cursor-pointer flex items-center gap-1.5 font-medium text-xs"
            >
              <span>Send</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
          <div className="mt-2 text-[11px] text-center text-muted-foreground flex items-center justify-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              Wisp answers strictly from your Indobest database.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormattedMessage({ content, isUser }: { content: string; isUser: boolean }) {
  if (isUser) {
    return <span className="whitespace-pre-wrap">{content}</span>;
  }

  const lines = content.split("\n");

  return (
    <div className="space-y-2">
      {lines.map((line, idx) => {
        if (!line.trim()) {
          return <div key={idx} className="h-1" />;
        }

        if (line.startsWith("- ") || line.startsWith("* ")) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="text-primary font-bold">•</span>
              <span className="flex-1">{parseInline(line.slice(2))}</span>
            </div>
          );
        }

        const numMatch = line.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="font-semibold text-muted-foreground text-xs w-4 shrink-0">
                {numMatch[1]}.
              </span>
              <span className="flex-1">{parseInline(numMatch[2])}</span>
            </div>
          );
        }

        if (line.startsWith("### ")) {
          return (
            <h4 key={idx} className="font-bold text-foreground text-sm pt-1">
              {parseInline(line.slice(4))}
            </h4>
          );
        }

        return (
          <p key={idx} className="leading-relaxed">
            {parseInline(line)}
          </p>
        );
      })}
    </div>
  );
}

function parseInline(text: string): React.ReactNode {
  const regex = /(\[[^\]]+\]\([^\)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts = text.split(regex);

  return parts.map((part, i) => {
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, label, href] = linkMatch;
      const isInternal = href.startsWith("/");
      if (isInternal) {
        return (
          <Link
            key={i}
            href={href}
            className="text-primary font-semibold underline underline-offset-2 hover:text-primary/80 transition-colors inline-flex items-center gap-0.5 mx-0.5"
          >
            <span>{label}</span>
          </Link>
        );
      }
      return (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary font-semibold underline underline-offset-2 hover:text-primary/80 transition-colors inline-flex items-center gap-0.5 mx-0.5"
        >
          <span>{label}</span>
          <ExternalLink className="w-3 h-3 inline" />
        </a>
      );
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-bold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs text-foreground border border-border"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    return part;
  });
}
