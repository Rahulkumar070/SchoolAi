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

  // Spring config — feels physical, no bounce overshoot
  const slideSpring = {
    type: "spring" as const,
    stiffness: 380,
    damping: 40,
    mass: 0.8,
  };

  const fadeSpring = {
    type: "spring" as const,
    stiffness: 300,
    damping: 35,
    mass: 0.6,
  };

  return (
    <div className="shell">
      {/* ── Sidebar — desktop ── */}
      <div className="hidden md:block" style={{ flexShrink: 0 }}>
        <Sidebar
          onNewSearch={handleNewSearch}
          activeConversationId={activeConversationId}
        />
      </div>

      {/* ── Mobile sidebar drawer ── */}
      <AnimatePresence mode="wait">
        {sidebarOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
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
            {/* Sidebar panel */}
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
            <BookOpen size={15} color="#c9b99a" />
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

        <div className="main-content">{children}</div>
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
                background: "#181818",
                borderTop: "1px solid #242424",
                borderRadius: "22px 22px 0 0",
                maxHeight: "80vh",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 -16px 60px rgba(0,0,0,0.55)",
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
  );
}
