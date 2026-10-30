"use client";

import { useState } from "react";
import { ZoomIn, ZoomOut, RotateCcw, ChevronLeft, ChevronRight, FileText, ExternalLink } from "lucide-react";

interface DocumentViewerProps {
  pages?: Array<{ pageNumber: number; pngBase64: string }> | null;
  fileToken?: string | null;
}

export function DocumentViewer({ pages, fileToken }: DocumentViewerProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [zoom, setZoom] = useState(0.8);
  const [imageError, setImageError] = useState(false);

  const validPages = (pages || []).filter((p) => p && typeof p.pngBase64 === "string" && p.pngBase64.trim().length > 100);
  const hasPages = validPages.length > 0;
  const activePage = hasPages ? validPages[Math.min(currentPage, validPages.length - 1)] : null;
  const showIframeFallback = (!hasPages || imageError) && Boolean(fileToken);

  if (!hasPages && !fileToken) {
    return (
      <div className="h-full min-h-[500px] flex flex-col items-center justify-center bg-surface-2/30 border border-border rounded-sm text-xs text-ink-3 gap-2">
        <FileText className="w-8 h-8 text-ink-3/40" />
        <span>No document preview available</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface border border-border rounded-sm overflow-hidden">
      {/* Viewer Toolbar */}
      <div className="h-10 px-3 bg-surface-2 border-b border-border flex items-center justify-between text-xs text-ink-2 shrink-0">
        <div className="flex items-center gap-2">
          {validPages.length > 1 && (
            <div className="flex items-center gap-1 font-mono">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="p-1 rounded-sm hover:bg-border text-ink-2 disabled:opacity-30"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span>
                {currentPage + 1} / {validPages.length}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(validPages.length - 1, p + 1))}
                disabled={currentPage === validPages.length - 1}
                className="p-1 rounded-sm hover:bg-border text-ink-2 disabled:opacity-30"
                aria-label="Next page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <span className="font-mono text-[11px] text-ink-3">Original Invoice Document</span>
        </div>

        <div className="flex items-center gap-1">
          {fileToken && (
            <a
              href={`/api/upload/file?token=${encodeURIComponent(fileToken)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded-sm hover:bg-border text-ink-2 transition flex items-center gap-1 text-[11px] font-mono mr-2"
              title="Open full document in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Open File</span>
            </a>
          )}
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
            className="p-1 rounded-sm hover:bg-border text-ink-2 transition"
            title="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[11px] w-12 text-center text-ink-3">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
            className="p-1 rounded-sm hover:bg-border text-ink-2 transition"
            title="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(0.8)}
            className="p-1 rounded-sm hover:bg-border text-ink-2 transition"
            title="Reset zoom (80%)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Document Image Canvas or Embedded Frame */}
      <div className="flex-1 overflow-auto p-4 bg-bg flex justify-center items-start select-none">
        {activePage && !imageError ? (
          <div
            style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
            className="transition-transform duration-100 shadow-md bg-white border border-border"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/png;base64,${activePage.pngBase64}`}
              alt={`Page ${activePage.pageNumber}`}
              className="max-w-none block"
              style={{ width: "650px", height: "auto" }}
              onError={() => setImageError(true)}
            />
          </div>
        ) : showIframeFallback && fileToken ? (
          <div
            style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
            className="transition-transform duration-100 shadow-md bg-white border border-border w-[650px] min-h-[850px] flex flex-col"
          >
            <iframe
              src={`/api/upload/file?token=${encodeURIComponent(fileToken)}#toolbar=0`}
              title="Original Invoice Document"
              className="w-full flex-1 min-h-[850px] border-0"
            />
          </div>
        ) : (
          <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-xs text-ink-3 gap-2">
            <FileText className="w-8 h-8 text-ink-3/40" />
            <span>Document preview unavailable</span>
          </div>
        )}
      </div>
    </div>
  );
}
