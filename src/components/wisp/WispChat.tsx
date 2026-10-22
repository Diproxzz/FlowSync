"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  X,
  Send,
  RotateCcw,
  Minus,
  Maximize2,
  ExternalLink,
  User,
  Paperclip,
  Image as ImageIcon,
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

export function WispChat() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
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
    if (isOpen && !isMinimized) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, isMinimized, messages]);

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
      // Build history for API
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
          "I apologize, but I encountered an issue retrieving the data. Please verify your connection or try asking your question again.",
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

  if (pathname === "/wisp") {
    return null;
  }

  return (
    <>
      {/* Floating Launcher Button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 group border border-primary/20 print:hidden cursor-pointer"
          title="Ask Wisp - AI Indobest Assistant"
        >
          <div className="relative flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/wisp.png"
              alt="Wisp"
              className="w-6 h-6 object-contain"
            />
          </div>
          <span className="font-semibold text-xs tracking-wide">Ask Wisp</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping absolute -top-0.5 -right-0.5" />
          <span className="w-2 h-2 rounded-full bg-emerald-400 absolute -top-0.5 -right-0.5" />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div
          onPaste={handlePaste}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "fixed z-50 bg-card border border-border shadow-2xl transition-all duration-200 flex flex-col print:hidden",
            isDragging && "ring-2 ring-primary border-primary",
            isMinimized
              ? "bottom-5 right-5 w-72 h-14 rounded-2xl"
              : "bottom-5 right-5 w-[92vw] sm:w-[420px] h-[580px] max-h-[85vh] rounded-2xl overflow-hidden"
          )}
        >
          {isDragging && !isMinimized && (
            <div className="absolute inset-0 z-50 bg-background/85 backdrop-blur-xs flex flex-col items-center justify-center gap-2 pointer-events-none">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <ImageIcon className="w-5 h-5 animate-bounce" />
              </div>
              <p className="text-xs font-semibold text-foreground">
                Drop screenshot here to attach
              </p>
            </div>
          )}

          {/* Header */}
          <div className="bg-muted/70 backdrop-blur-xs border-b border-border px-4 py-2.5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 flex items-center justify-center shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/wisp.png"
                  alt="Wisp"
                  className="w-8 h-8 object-contain"
                />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-xs tracking-tight text-foreground font-mono">
                    Wisp
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Online
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 text-muted-foreground">
              {!isMinimized && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-1.5 rounded-md hover:bg-muted hover:text-foreground transition-colors"
                  title="Clear conversation"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1.5 rounded-md hover:bg-muted hover:text-foreground transition-colors"
                title={isMinimized ? "Expand" : "Minimize"}
              >
                {isMinimized ? (
                  <Maximize2 className="w-3.5 h-3.5" />
                ) : (
                  <Minus className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setIsMinimized(false);
                }}
                className="p-1.5 rounded-md hover:bg-muted hover:text-foreground transition-colors"
                title="Close Wisp"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Body (when not minimized) */}
          {!isMinimized && (
            <>
              {/* Message History */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "flex gap-2.5 max-w-[90%]",
                      m.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                    )}
                  >
                    {/* Avatar */}
                    {m.role === "user" ? (
                      <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5 bg-primary text-primary-foreground">
                        <User className="w-3.5 h-3.5" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 shrink-0 mt-0.5 flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/wisp.png"
                          alt="Wisp"
                          className="w-6 h-6 object-contain"
                        />
                      </div>
                    )}

                    {/* Bubble */}
                    <div className="flex flex-col gap-1 max-w-full">
                      <div
                        className={cn(
                          "p-3 rounded-2xl shadow-xs leading-relaxed break-words",
                          m.role === "user"
                            ? "bg-primary text-primary-foreground rounded-tr-none"
                            : "bg-muted/60 border border-border text-foreground rounded-tl-none"
                        )}
                      >
                        {m.image && (
                          <div className="mb-2">
                            <a href={m.image} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={m.image}
                                alt="Uploaded screenshot"
                                className="max-h-48 max-w-full rounded-md object-contain border border-border/50 bg-background/40 hover:opacity-95 transition-opacity cursor-zoom-in"
                              />
                            </a>
                          </div>
                        )}

                        <FormattedMessage content={m.content} isUser={m.role === "user"} />

                        {/* Clickable Source Pills */}
                        {m.sources && m.sources.length > 0 && (
                          <div className="mt-2.5 pt-2 border-t border-border/50 flex flex-wrap gap-1.5">
                            <span className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
                              Related:
                            </span>
                            {m.sources.map((s, idx) => (
                              <Link
                                key={idx}
                                href={s.url}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-background border border-border text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors"
                              >
                                <span>{s.title}</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                      {m.timestamp ? (
                        <span
                          suppressHydrationWarning
                          className={cn(
                            "text-[9px] text-muted-foreground px-1",
                            m.role === "user" ? "text-right" : "text-left"
                          )}
                        >
                          {m.timestamp}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}

                {/* Loading typing indicator */}
                {loading && (
                  <div className="flex gap-2.5 mr-auto max-w-[85%]">
                    <div className="w-6 h-6 shrink-0 mt-0.5 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/wisp.png"
                        alt="Wisp"
                        className="w-6 h-6 object-contain animate-pulse"
                      />
                    </div>
                    <div className="p-3 rounded-2xl rounded-tl-none bg-muted/60 border border-border text-muted-foreground flex items-center gap-1.5 transition-all">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" />
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                      <span className="text-[11px] ml-1 font-medium text-foreground/85 animate-fade-in">
                        {WISP_LOADING_MESSAGES[loadingMsgIdx]}
                      </span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-3 bg-card border-t border-border">
                {selectedImage && (
                  <div className="mb-2 flex items-center justify-between p-1.5 rounded-lg bg-muted/60 border border-border animate-fade-in">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selectedImage}
                        alt="Preview"
                        className="w-9 h-9 object-cover rounded border border-border shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-foreground truncate">
                          Screenshot Attached
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          Ask a question or click Send.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedImage(null)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 ml-1 cursor-pointer"
                      title="Remove screenshot"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="flex items-center gap-1.5"
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
                    className="p-2 rounded-lg border border-border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                    title="Attach screenshot or image (or paste with Ctrl+V)"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                  </button>

                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                      selectedImage
                        ? "Ask about this screenshot..."
                        : WISP_PLACEHOLDERS[placeholderIdx]
                    }
                    disabled={loading}
                    className="flex-1 px-3 py-2 rounded-lg bg-muted/50 border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary focus:bg-background text-foreground transition-all disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={(!input.trim() && !selectedImage) || loading}
                    className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0 shadow-xs cursor-pointer"
                    title="Send message"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
                <div className="mt-1 text-[9px] text-center text-muted-foreground">
                  Wisp answers strictly about FlowSync records and features.
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Lightweight formatting renderer for Wisp markdown messages.
 * Supports bold, italics, inline code, list items, and clickable Next.js links.
 */
function FormattedMessage({ content, isUser }: { content: string; isUser: boolean }) {
  if (isUser) {
    return <span className="whitespace-pre-wrap">{content}</span>;
  }

  // Pre-clean any LaTeX math or formatting artifacts
  const cleanContent = formatLatexFormulas(content);
  const lines = cleanContent.split("\n");

  return (
    <div className="space-y-1.5">
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
              className="my-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-foreground text-[11px] flex items-center gap-2 overflow-x-auto shadow-xs"
            >
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-primary text-primary-foreground shrink-0 font-sans">
                Formula
              </span>
              <span className="font-mono font-semibold text-foreground">
                {parseInline(trimmed.replace(/^Formula:\s*/i, ""))}
              </span>
            </div>
          );
        }

        // Bullet point
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-1">
              <span className="text-primary font-bold">•</span>
              <span className="flex-1">{parseInline(line.slice(2))}</span>
            </div>
          );
        }

        // Numbered list
        const numMatch = line.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-1">
              <span className="font-semibold text-muted-foreground text-[10px] w-4 shrink-0">
                {numMatch[1]}.
              </span>
              <span className="flex-1">{parseInline(numMatch[2])}</span>
            </div>
          );
        }

        // Headers
        if (line.startsWith("### ")) {
          return (
            <h4 key={idx} className="font-bold text-foreground text-xs pt-1">
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

/**
 * Parses inline bold (**text**), code (`code`), and links ([label](url)).
 */
function parseInline(text: string): React.ReactNode {
  // Regex for links: [label](url), bold: **bold**, code: `code`
  const regex = /(\[[^\]]+\]\([^\)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts = text.split(regex);

  return parts.map((part, i) => {
    // Markdown link: [label](url)
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
          <ExternalLink className="w-2.5 h-2.5 inline" />
        </a>
      );
    }

    // Bold: **text**
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-bold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Code: `text`
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="px-1 py-0.5 rounded bg-muted font-mono text-[11px] text-foreground border border-border"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    return part;
  });
}
