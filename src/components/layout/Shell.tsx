"use client";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import { Menu, BookOpen, Plus, X, Layers } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

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

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

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

  const slideSpring = {
    type: "spring" as const,
    stiffness: 380,
    damping: 40,
    mass: 0.8,
  };

  return (
    <>
      {/* ── Global theme CSS — responds to data-theme on <html> ── */}
      <style>{`
        /* ════════════════════════════════════════
           DARK MODE  (default — image 2 colors)
        ════════════════════════════════════════ */
        :root, [data-theme="dark"] {
          --shell-bg:        #0d0d0d;
          --shell-border:    #1e1e1e;
          --main-bg:         #141414;

          /* override globals.css vars */
          --bg:              #141414;
          --bg-raised:       #1a1a1a;
          --bg-overlay:      #1e1e1e;
          --bg-input:        #1a1a1a;
          --surface:         #222222;
          --surface-2:       #242424;
          --surface-3:       #2a2a2a;
          --border:          rgba(255,255,255,0.06);
          --border-mid:      rgba(255,255,255,0.09);
          --border-hi:       rgba(255,255,255,0.14);
          --text-primary:    #e8e3dc;
          --text-secondary:  #b0aa9e;
          --text-muted:      #666;
          --text-faint:      #3a3a3a;
          --brand:           #c9b99a;
          --brand-dim:       rgba(201,185,154,0.07);
          --brand-border:    rgba(201,185,154,0.18);
          --brand-fg:        #000;
          --brand-hover:     #b8a589;
        }

        /* ════════════════════════════════════════
           LIGHT MODE  (image 1 colors)
        ════════════════════════════════════════ */
        [data-theme="light"] {
          --shell-bg:        #e8e8e8;
          --shell-border:    #d4d4d4;
          --main-bg:         #ffffff;

          /* override globals.css vars */
          --bg:              #ffffff;
          --bg-raised:       #f5f5f5;
          --bg-overlay:      #efefef;
          --bg-input:        #f2f2f2;
          --surface:         #ebebeb;
          --surface-2:       #e8e8e8;
          --surface-3:       #e4e4e4;
          --border:          rgba(0,0,0,0.07);
          --border-mid:      rgba(0,0,0,0.1);
          --border-hi:       rgba(0,0,0,0.16);
          --text-primary:    #111111;
          --text-secondary:  #444444;
          --text-muted:      #777777;
          --text-faint:      #aaaaaa;
          --brand:           #8a7355;
          --brand-dim:       rgba(138,115,85,0.08);
          --brand-border:    rgba(138,115,85,0.2);
          --brand-fg:        #fff;
          --brand-hover:     #70593f;
        }

        /* ── Brand button — always uses brand-fg for text ── */
        .btn-brand { color: var(--brand-fg) !important; background: var(--brand) !important; }
        .btn-brand:hover { background: var(--brand-hover) !important; }

        /* ── Base ── */
        html, body { background: var(--shell-bg); transition: background 0.22s; }
        .shell { background: var(--shell-bg) !important; }

        /* ── Main content card ── */
        .main-content { background: var(--main-bg) !important; border-color: var(--shell-border) !important; }

        /* ── Right panel (Sources) ── */
        .right-panel {
          background: var(--bg-raised) !important;
          border-left: 1px solid var(--border) !important;
        }
        .panel-header { background: var(--bg-raised) !important; border-bottom-color: var(--border) !important; }
        .tab-btn { color: var(--text-muted) !important; background: transparent !important; }
        .tab-btn.active { color: var(--text-primary) !important; border-bottom-color: var(--brand) !important; }
        .panel-body { background: var(--bg-raised) !important; }

        /* ── Paper cards in panel ── */
        .paper-item {
          border-bottom: 1px solid var(--border) !important;
        }
        [data-theme="light"] .paper-item { background: transparent !important; }
        [data-theme="light"] .paper-item p { color: var(--text-secondary) !important; }

        /* ── Search page ── */
        .sr-chat-wrap  { background: var(--main-bg) !important; }
        .sr-input-wrap { background: var(--main-bg) !important; border-top-color: var(--border) !important; }
        .sr-messages-wrap { background: var(--main-bg) !important; }

        /* Pill input */
        .sr-pill {
          background: var(--bg-raised) !important;
          border-color: var(--border-mid) !important;
        }
        .sr-pill:focus-within { border-color: var(--border-hi) !important; }
        .sr-pill-input { color: var(--text-primary) !important; }
        .sr-pill-input::placeholder { color: var(--text-faint) !important; }

        /* Send button — dark in light, white in dark */
        .sr-pill-send { background: var(--text-primary) !important; }
        [data-theme="light"] .sr-pill-send svg { stroke: #ffffff !important; }
        [data-theme="dark"]  .sr-pill-send { background: #ffffff !important; }
        [data-theme="dark"]  .sr-pill-send svg { stroke: #111 !important; }
        .sr-pill-send:disabled { background: var(--surface) !important; }

        /* Attach button */
        .sr-pill-attach { border-color: var(--border-mid) !important; color: var(--text-muted) !important; }
        .sr-pill-attach:hover { background: var(--surface) !important; color: var(--text-primary) !important; }

        /* Heading + plan badge */
        .sr-heading { color: var(--text-primary) !important; }
        .sr-plan-label { background: var(--bg-raised) !important; border-color: var(--border-mid) !important; }
        .sr-plan-label-text { color: var(--text-muted) !important; }
        .sr-plan-label-btn {
          background: var(--text-primary) !important;
          color: var(--bg) !important;
          border-color: var(--text-primary) !important;
        }

        /* User bubble — light gray in light mode, dark in dark */
        .sr-user-bubble {
          background: var(--bg-overlay) !important;
          border: 1px solid var(--border-mid) !important;
          color: var(--text-primary) !important;
        }

        /* AI avatar */
        .sr-ai-avatar { background: var(--bg-raised) !important; border-color: var(--border-mid) !important; color: var(--text-muted) !important; }

        /* Action bar chips */
        .sr-action-bar { border-top-color: var(--border) !important; }
        .sr-chip { background: transparent !important; border-color: var(--border-mid) !important; color: var(--text-muted) !important; }
        .sr-chip:hover { background: var(--surface) !important; color: var(--text-primary) !important; border-color: var(--border-hi) !important; }
        .sr-chip-accent { color: var(--brand) !important; border-color: var(--brand-border) !important; }

        /* Quick chips */
        .sr-qchip { border-color: var(--border-mid) !important; color: var(--text-muted) !important; }
        .sr-qchip:hover { border-color: var(--border-hi) !important; color: var(--text-primary) !important; }

        /* Status / typing / related */
        .sr-status { background: var(--bg-raised) !important; border-color: var(--border-mid) !important; color: var(--text-muted) !important; }
        .sr-dot { background: var(--border-hi) !important; }
        .sr-related-btn { color: var(--text-muted) !important; border-bottom-color: var(--border) !important; }
        .sr-related-btn:hover { color: var(--text-primary) !important; }

        /* Limit / error cards */
        .sr-limit-card { background: var(--bg-raised) !important; border-color: var(--border-mid) !important; }
        .sr-limit-card h3 { color: var(--text-primary) !important; }
        .sr-limit-card p  { color: var(--text-muted) !important; }
        .sr-btn-solid { background: var(--text-primary) !important; color: var(--bg) !important; }
        .sr-btn-outline { border-color: var(--border-mid) !important; color: var(--text-muted) !important; }
        .sr-btn-outline:hover { color: var(--text-primary) !important; border-color: var(--border-hi) !important; }

        /* Counter bar */
        .sr-counter-bar { color: var(--text-faint) !important; border-bottom-color: var(--border) !important; background: var(--main-bg) !important; }
        .sr-counter-track { background: var(--surface) !important; }
        .sr-counter-fill { background: var(--border-hi) !important; }
        .sr-hint { color: var(--text-faint) !important; }
        .sr-hint a { color: var(--text-faint) !important; }

        /* Suggestions popup */
        .sr-suggestions-popup { background: var(--bg-raised) !important; border-color: var(--border-mid) !important; }
        .sr-sugg-item { color: var(--text-muted) !important; border-bottom-color: var(--border) !important; }
        .sr-sugg-item:hover { background: var(--surface) !important; color: var(--text-primary) !important; }

        /* ── Answer prose (AnswerRenderer) ── */
        .answer-prose { color: var(--text-secondary) !important; }
        .answer-prose h1, .answer-prose h2, .answer-prose h3 { color: var(--text-primary) !important; }
        .answer-prose strong { color: var(--text-primary) !important; }
        .answer-prose a { color: var(--brand) !important; }
        .answer-prose blockquote { border-left-color: var(--border-mid) !important; color: var(--text-muted) !important; }
        [data-theme="light"] .answer-prose code {
          background: var(--surface) !important;
          color: #8a5030 !important;
          border-color: var(--border-mid) !important;
        }
        [data-theme="light"] .answer-prose th { background: var(--surface) !important; color: var(--text-primary) !important; }
        [data-theme="light"] .answer-prose td { color: var(--text-secondary) !important; border-color: var(--border) !important; }

        /* Code blocks in AnswerRenderer */
        [data-theme="light"] .answer-prose pre { background: #f6f6f6 !important; border-color: var(--border-mid) !important; }
        [data-theme="light"] .answer-prose pre code { color: #1a1a1a !important; background: transparent !important; }

        /* Section cards / citation cards in AnswerRenderer */
        [data-theme="light"] [style*="rgba(255,255,255,0.03)"] {
          background: rgba(0,0,0,0.03) !important;
        }
        [data-theme="light"] [style*="rgba(255,255,255,0.06)"] {
          background: rgba(0,0,0,0.04) !important;
        }
        [data-theme="light"] [style*="rgba(255,255,255,0.07)"] {
          border-color: rgba(0,0,0,0.08) !important;
        }
        [data-theme="light"] [style*="rgba(255,255,255,0.08)"] {
          border-color: rgba(0,0,0,0.09) !important;
        }
        [data-theme="light"] [style*="rgba(255,255,255,0.85)"] {
          color: #222 !important;
        }
        [data-theme="light"] [style*="rgba(255,255,255,0.45)"],
        [data-theme="light"] [style*="rgba(255,255,255,0.55)"],
        [data-theme="light"] [style*="rgba(255,255,255,0.38)"] {
          color: #666 !important;
        }
        [data-theme="light"] [style*="rgba(255,255,255,0.2)"] {
          color: #aaa !important;
        }
        /* Code block dark bg in AnswerRenderer */
        [data-theme="light"] [style*="background: \"#0a0a0a\""],
        [data-theme="light"] [style*="background: \"#0d1117\""] {
          background: #f4f4f4 !important;
        }
        [data-theme="light"] [style*="color: \"#c9d1d9\""],
        [data-theme="light"] [style*="color: \"#e6edf3\""] {
          color: #1a1a1a !important;
        }

        /* Status pill in search page */
        .status-pill { background: var(--bg-raised) !important; border-color: var(--border-mid) !important; color: var(--text-muted) !important; }

        /* Mobile bar */
        .mobile-bar { background: var(--bg-raised) !important; border-bottom-color: var(--border) !important; }
        .mobile-logo span { color: var(--text-primary) !important; }
        .icon-btn { color: var(--text-muted) !important; }
        .icon-btn:hover { background: var(--surface) !important; color: var(--text-primary) !important; }

        /* Counter bar (old classes from globals) */
        .counter-bar { background: var(--bg-raised) !important; border-bottom-color: var(--border) !important; color: var(--text-muted) !important; }
      `}</style>

      <div className="shell">
        {/* ── Sidebar — desktop ── */}
        <div
          className="hidden md:flex sidebar-desktop-wrapper"
          style={{ flexShrink: 0, height: "100%" }}
        >
          <Sidebar
            onNewSearch={handleNewSearch}
            activeConversationId={activeConversationId}
          />
        </div>

        {/* ── Mobile sidebar drawer ── */}
        <AnimatePresence mode="wait">
          {sidebarOpen && (
            <>
              <motion.div
                key="sidebar-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                onClick={() => setSidebarOpen(false)}
                aria-hidden
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 99,
                  background: "rgba(0,0,0,0.72)",
                  backdropFilter: "blur(3px)",
                  WebkitBackdropFilter: "blur(3px)",
                }}
              />
              <motion.div
                key="sidebar-panel"
                initial={{ x: "-100%", opacity: 0.6 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: "-100%", opacity: 0.6 }}
                transition={slideSpring}
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  bottom: 0,
                  zIndex: 100,
                  width: "min(260px, 85vw)",
                  willChange: "transform",
                }}
              >
                <Sidebar
                  onClose={() => setSidebarOpen(false)}
                  onNewSearch={handleNewSearch}
                  activeConversationId={activeConversationId}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ── Main content ── */}
        <div className="main">
          {/* Mobile top bar */}
          <header className="mobile-bar md:hidden">
            <motion.button
              className="icon-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              whileTap={{ scale: 0.88 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            >
              <Menu size={18} />
            </motion.button>
            <Link href="/" className="mobile-logo">
              <BookOpen size={15} style={{ color: "var(--brand)" }} />
              <span style={{ fontFamily: "Georgia, serif" }}>Researchly</span>
            </Link>
            <div style={{ display: "flex", gap: 4 }}>
              {rightPanel && (
                <motion.button
                  className={`icon-btn${drawerOpen ? " mobile-sources-btn active" : ""}`}
                  onClick={() => setDrawerOpen((o) => !o)}
                  aria-label="Sources"
                  whileTap={{ scale: 0.88 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                >
                  <Layers size={16} />
                </motion.button>
              )}
              <motion.button
                className="icon-btn"
                onClick={handleNewSearch}
                aria-label="New search"
                whileTap={{ scale: 0.88 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              >
                <Plus size={18} />
              </motion.button>
            </div>
          </header>

          <div
            className="main-content"
            style={{
              margin: "8px 8px 8px 8px",
              borderRadius: 14,
              border: "1px solid var(--shell-border)",
              overflow: "hidden",
              height: "calc(100% - 16px)",
              background: "var(--main-bg)",
            }}
          >
            {children}
          </div>
        </div>

        {/* ── Right panel — desktop ── */}
        {rightPanel && <aside className="right-panel">{rightPanel}</aside>}

        {/* ── Bottom drawer — mobile (Framer Motion) ── */}
        <AnimatePresence>
          {rightPanel && (
            <>
              {/* Backdrop */}
              <motion.div
                key="drawer-backdrop"
                initial={false}
                animate={{
                  opacity: drawerOpen ? 1 : 0,
                  pointerEvents: drawerOpen ? "auto" : "none",
                }}
                transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                onClick={() => setDrawerOpen(false)}
                aria-hidden
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 79,
                  background: "rgba(0,0,0,0.68)",
                  backdropFilter: "blur(3px)",
                  WebkitBackdropFilter: "blur(3px)",
                }}
              />
              {/* Bottom sheet */}
              <motion.div
                key="drawer-panel"
                initial={false}
                animate={{ y: drawerOpen ? 0 : "105%" }}
                transition={slideSpring}
                role="dialog"
                aria-modal
                aria-label="Sources"
                style={{
                  position: "fixed",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  zIndex: 80,
                  background: "var(--bg-raised)",
                  borderTop: "1px solid var(--border-mid)",
                  borderRadius: "22px 22px 0 0",
                  maxHeight: "80vh",
                  display: "flex",
                  flexDirection: "column",
                  boxShadow: "0 -16px 60px rgba(0,0,0,0.18)",
                  willChange: "transform",
                }}
              >
                <div
                  className="mobile-drawer-header"
                  style={{ position: "relative" }}
                >
                  <div className="drawer-handle" />
                  <span className="drawer-title">
                    {rightPanelTitle ?? "Sources"}
                  </span>
                  <motion.button
                    className="icon-btn"
                    onClick={() => setDrawerOpen(false)}
                    style={{ marginLeft: "auto" }}
                    whileTap={{ scale: 0.88 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  >
                    <X size={15} />
                  </motion.button>
                </div>
                <div className="mobile-drawer-body">{rightPanel}</div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
