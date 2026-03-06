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

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  useEffect(() => {
    if (sidebarOpen || drawerOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen, drawerOpen]);

  const handleNewSearch = () => {
    setSidebarOpen(false);
    setDrawerOpen(false);
    router.push(`/search?new=${Date.now()}`);
  };

  return (
    <div className="shell">
      {/* ── Sidebar — desktop (framer-motion animated) ── */}
      <div className="hidden md:block" style={{ flexShrink: 0 }}>
        <Sidebar
          onNewSearch={handleNewSearch}
          activeConversationId={activeConversationId}
        />
      </div>

      {/* ── Mobile sidebar drawer ── */}
      {sidebarOpen && (
        <>
          <div
            className="sidebar-backdrop"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
            style={{
              position: "fixed", inset: 0, zIndex: 99,
              background: "rgba(0,0,0,0.65)",
            }}
          />
          <div
            style={{
              position: "fixed", top: 0, left: 0, bottom: 0,
              zIndex: 100, width: "min(260px, 85vw)",
            }}
          >
            <Sidebar
              onClose={() => setSidebarOpen(false)}
              onNewSearch={handleNewSearch}
              activeConversationId={activeConversationId}
            />
          </div>
        </>
      )}

      {/* ── Main content ── */}
      <div className="main">
        {/* Mobile top bar */}
        <header className="mobile-bar md:hidden">
          <button className="icon-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu size={18} />
          </button>
          <Link href="/" className="mobile-logo">
            <BookOpen size={15} color="#c9b99a" />
            <span style={{ fontFamily: "Georgia, serif" }}>Researchly</span>
          </Link>
          <div style={{ display: "flex", gap: 4 }}>
            {rightPanel && (
              <button
                className={`icon-btn${drawerOpen ? " mobile-sources-btn active" : ""}`}
                onClick={() => setDrawerOpen(o => !o)}
                aria-label="Sources"
              >
                <Layers size={16} />
              </button>
            )}
            <button className="icon-btn" onClick={handleNewSearch} aria-label="New search">
              <Plus size={18} />
            </button>
          </div>
        </header>

        <div className="main-content">{children}</div>
      </div>

      {/* ── Right panel — desktop ── */}
      {rightPanel && <aside className="right-panel">{rightPanel}</aside>}

      {/* ── Bottom drawer — mobile ── */}
      {rightPanel && (
        <>
          <div
            className={`drawer-backdrop${drawerOpen ? " open" : ""}`}
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div
            className={`mobile-drawer${drawerOpen ? " open" : ""}`}
            role="dialog"
            aria-modal
            aria-label="Sources"
          >
            <div className="mobile-drawer-header" style={{ position: "relative" }}>
              <div className="drawer-handle" />
              <span className="drawer-title">{rightPanelTitle ?? "Sources"}</span>
              <button className="icon-btn" onClick={() => setDrawerOpen(false)} style={{ marginLeft: "auto" }}>
                <X size={15} />
              </button>
            </div>
            <div className="mobile-drawer-body">{rightPanel}</div>
          </div>
        </>
      )}
    </div>
  );
}
