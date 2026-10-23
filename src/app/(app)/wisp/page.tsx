"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Send,
  RotateCcw,
  User,
  ExternalLink,
  ShieldCheck,
  Paperclip,
  Image as ImageIcon,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  WISP_PLACEHOLDERS,
  WISP_WELCOME_MESSAGES,
  WISP_LOADING_MESSAGES,
  getRandomWelcomeMessage,
} from "@/lib/wisp/constants";
import { formatLatexFormulas } from "@/lib/wisp/latex";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  image?: string;
  sources?: Array<{ title: string; url: string }>;
  timestamp: string;
}

export default function WispPage() {
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  const processImageFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        setSelectedImage(result);
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            processImageFile(file);
            break;
          }
        }
      }
    },
    [processImageFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        processImageFile(files[0]);
      }
    },
    [processImageFile]
  );

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    const imageToSend = selectedImage;
    if ((!query && !imageToSend) || loading) return;

    setInput("");
    setSelectedImage(null);

    const userMsg: ChatMessage = {
      id: "u-" + Date.now(),
      role: "user",
      content: query || (imageToSend ? "Please analyze this screenshot." : ""),
      image: imageToSend || undefined,
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
        body: JSON.stringify({
          message: query || (imageToSend ? "Please analyze this application screenshot." : ""),
          history,
          image: imageToSend || undefined,
        }),
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
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-6.5rem)] min-h-[460px] gap-3">
      {/* Header Banner */}
      <div className="bg-card border border-border rounded-xl px-4 py-3 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/wisp.png"
              alt="Wisp"
              className="w-10 h-10 object-contain"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-foreground font-mono">
                Wisp
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
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
      <div
        onPaste={handlePaste}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "bg-card border border-border rounded-xl shadow-xs overflow-hidden flex flex-col flex-1 min-h-0 relative transition-all",
          isDragging && "ring-2 ring-primary border-primary bg-primary/5"
        )}
      >
        {isDragging && (
          <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2 pointer-events-none">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <ImageIcon className="w-6 h-6 animate-bounce" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              Drop screenshot or image here to attach
            </p>
          </div>
        )}

        {/* Messages Container */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4 text-sm">
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
                  {/* Attached user screenshot image preview */}
                  {m.image && (
                    <div className="mb-2.5">
                      <a href={m.image} target="_blank" rel="noopener noreferrer" title="Click to view full image">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={m.image}
                          alt="Uploaded screenshot"
                          className="max-h-60 max-w-full rounded-lg object-contain border border-border/50 bg-background/40 hover:opacity-95 transition-opacity cursor-zoom-in"
                        />
                      </a>
                    </div>
                  )}

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
        <div className="p-3.5 sm:p-4 bg-card border-t border-border shrink-0">
          {/* Selected Image Preview Pill */}
          {selectedImage && (
            <div className="mb-2.5 flex items-center justify-between p-2 rounded-xl bg-muted/60 border border-border animate-fade-in">
              <div className="flex items-center gap-2.5 min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedImage}
                  alt="Selected preview"
                  className="w-11 h-11 object-cover rounded-lg border border-border shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">
                    Screenshot / Image Attached
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Ask questions like &quot;What is Purchase vs Sales by month?&quot; or press Send.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedImage(null)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 ml-2 cursor-pointer"
                title="Remove screenshot"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  processImageFile(file);
                }
                e.target.value = "";
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="p-2.5 rounded-xl border border-border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer disabled:opacity-50"
              title="Attach application screenshot or image (or paste with Ctrl+V)"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                selectedImage
                  ? "Ask about this screenshot (e.g. 'What is Purchase vs Sales by month in this page?')..."
                  : WISP_PLACEHOLDERS[placeholderIdx]
              }
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:bg-background text-foreground transition-all disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={(!input.trim() && !selectedImage) || loading}
              className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0 shadow-xs cursor-pointer flex items-center gap-1.5 font-medium text-xs"
            >
              <span>Send</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
          <div className="mt-2 text-[11px] text-center text-muted-foreground flex items-center justify-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              Wisp answers strictly from your FlowPilot database and features.
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

  // Pre-clean any LaTeX math or formatting artifacts
  const cleanContent = formatLatexFormulas(content);
  const lines = cleanContent.split("\n");

  return (
    <div className="space-y-2">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }

        // Distinctly format standalone mathematical formulas into clean readable formula cards
        const isFormulaLine =
          !trimmed.startsWith("- ") &&
          !trimmed.startsWith("* ") &&
          !trimmed.match(/^\d+\./) &&
          !trimmed.startsWith("### ") &&
          (trimmed.startsWith("Formula:") ||
            (trimmed.includes(" = ") && (trimmed.includes("×") || trimmed.includes("/") || trimmed.includes("+") || trimmed.includes("-"))) ||
            (trimmed.includes(" = ") && (trimmed.includes("₹") || trimmed.includes("kg") || trimmed.includes("Rate") || trimmed.includes("Stock") || trimmed.includes("Amount"))));

        if (isFormulaLine) {
          return (
            <div
              key={idx}
              className="my-1.5 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 text-foreground text-xs flex items-center gap-2.5 overflow-x-auto shadow-xs"
            >
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground shrink-0 font-sans">
                Formula
              </span>
              <span className="font-mono font-semibold text-foreground">
                {parseInline(trimmed.replace(/^Formula:\s*/i, ""))}
              </span>
            </div>
          );
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
