"use client";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import { Menu, BookOpen, Plus, X, Layers } from "lucide-react";
import Link from "next/link";

export default function Shell({
  children,
  rightPanel,
  activeConversationId,
  rightPanelTitle,
}: {
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
  activeConversationId?: string;
  rightPanelTitle?: string;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Close sidebar on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Lock body scroll when sidebar OR drawer is open on mobile
  useEffect(() => {
    if (sidebarOpen || drawerOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen, drawerOpen]);

  const handleNewSearch = () => {
    setSidebarOpen(false);
    setDrawerOpen(false);
    router.push(`/search?new=${Date.now()}`);
  };

  return (
    <div className="shell">
      {/* ── Left sidebar ─────────────────────────────────── */}
      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <Sidebar
          onClose={() => setSidebarOpen(false)}
          onNewSearch={handleNewSearch}
          activeConversationId={activeConversationId}
        />
      </aside>

      {/* Sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Main content ─────────────────────────────────── */}
      <div className="main">
        <header className="mobile-bar">
          <button
            className="icon-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <Link href="/" className="mobile-logo" aria-label="Researchly home">
            <div
              className="logo-mark"
              style={{ width: 24, height: 24, borderRadius: 6 }}
            >
              <BookOpen size={11} color="#000" strokeWidth={2.5} />
            </div>
            <span>Researchly</span>
          </Link>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {/* Sources button — only shown on mobile when panel has content */}
            {rightPanel && (
              <button
                className={`icon-btn mobile-sources-btn${drawerOpen ? " active" : ""}`}
                onClick={() => setDrawerOpen((o) => !o)}
                aria-label="View sources"
                title="Sources"
              >
                <Layers size={16} />
              </button>
            )}
            <button
              className="icon-btn"
              onClick={handleNewSearch}
              aria-label="New search"
              title="New search"
            >
              <Plus size={18} />
            </button>
          </div>
        </header>
        <div className="main-content">{children}</div>
      </div>

      {/* ── Right panel — desktop only ────────────────────── */}
      {rightPanel && <aside className="right-panel">{rightPanel}</aside>}

      {/* ── Bottom drawer — mobile only ───────────────────── */}
      {rightPanel && (
        <>
          {/* Drawer backdrop */}
          <div
            className={`drawer-backdrop${drawerOpen ? " open" : ""}`}
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div
            className={`mobile-drawer${drawerOpen ? " open" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label="Sources panel"
          >
            {/* Drag handle + header */}
            <div className="mobile-drawer-header">
              <div className="drawer-handle" />
              <span className="drawer-title">
                {rightPanelTitle ?? "Sources"}
              </span>
              <button
                className="icon-btn"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close"
                style={{ marginLeft: "auto" }}
              >
                <X size={16} />
              </button>
            </div>
            {/* Drawer content */}
            <div className="mobile-drawer-body">{rightPanel}</div>
          </div>
        </>
      )}
    </div>
  );
}
