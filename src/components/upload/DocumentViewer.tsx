"use client";

import { useState } from "react";
import { ZoomIn, ZoomOut, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";

interface DocumentViewerProps {
  pages: Array<{ pageNumber: number; pngBase64: string }>;
}

export function DocumentViewer({ pages }: DocumentViewerProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [zoom, setZoom] = useState(1);

  if (!pages || pages.length === 0) {
    return (
      <div className="h-full min-h-[500px] flex items-center justify-center bg-surface-2/30 border border-border rounded-sm text-xs text-ink-3">
        No document preview available
      </div>
    );
  }

  const activePage = pages[currentPage];

  return (
    <div className="flex flex-col h-full bg-surface border border-border rounded-sm overflow-hidden">
      {/* Viewer Toolbar */}
      <div className="h-10 px-3 bg-surface-2 border-b border-border flex items-center justify-between text-xs text-ink-2">
        <div className="flex items-center gap-2">
          {pages.length > 1 && (
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
                {currentPage + 1} / {pages.length}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(pages.length - 1, p + 1))}
                disabled={currentPage === pages.length - 1}
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
            onClick={() => setZoom(1)}
            className="p-1 rounded-sm hover:bg-border text-ink-2 transition"
            title="Reset zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Document Image Canvas */}
      <div className="flex-1 overflow-auto p-4 bg-bg flex justify-center items-start select-none">
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
          />
        </div>
      </div>
    </div>
  );
}
