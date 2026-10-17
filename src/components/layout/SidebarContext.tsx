"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";

interface SidebarContextType {
  isOpen: boolean;
  isPinned: boolean;
  setIsOpen: (open: boolean) => void;
  togglePinned: () => void;
  handleMouseEnter: () => void;
  handleMouseLeave: () => void;
  closeSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const leaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize pinned state from localStorage (default to false / unpinned / auto-collapse)
  useEffect(() => {
    try {
      const stored = localStorage.getItem("indobest_sidebar_pinned");
      if (stored !== null) {
        setIsPinned(stored === "true");
      }
    } catch {
      // ignore
    }
  }, []);

  const togglePinned = () => {
    setIsPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("indobest_sidebar_pinned", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleMouseEnter = () => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    if (isPinned) return;
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
    }
    leaveTimerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 180);
  };

  const closeSidebar = () => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    if (!isPinned) {
      setIsOpen(false);
    }
  };

  // Close unpinned sidebar on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isPinned) {
        closeSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isPinned]);

  return (
    <SidebarContext.Provider
      value={{
        isOpen,
        isPinned,
        setIsOpen,
        togglePinned,
        handleMouseEnter,
        handleMouseLeave,
        closeSidebar,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
