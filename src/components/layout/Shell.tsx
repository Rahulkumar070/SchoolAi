"use client";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import { Menu, BookOpen, Plus } from "lucide-react";
import Link from "next/link";

export default function Shell({
  children,
  rightPanel,
}: {
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Close sidebar on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Prevent body scroll when sidebar open on mobile
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const handleNewSearch = () => {
    setOpen(false);
    // Use a timestamp param to force a full remount every time
    // This clears all previous search state completely
    router.push(`/search?new=${Date.now()}`);
  };

  return (
    <div className="shell">
      {/* ── Sidebar ── */}
      <aside className={`sidebar${open ? " open" : ""}`}>
        <Sidebar onClose={() => setOpen(false)} onNewSearch={handleNewSearch} />
      </aside>

      {/* Backdrop */}
      {open && (
        <div
          className="sidebar-backdrop"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Main ── */}
      <div className="main">
        {/* Mobile top bar */}
        <header className="mobile-bar">
          <button
            className="icon-btn"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>

          <Link href="/" className="mobile-logo" aria-label="ScholarAI home">
            <div
              className="logo-mark"
              style={{ width: 24, height: 24, borderRadius: 6 }}
            >
              <BookOpen size={11} color="#000" strokeWidth={2.5} />
            </div>
            <span>ScholarAI</span>
          </Link>

          <button
            className="icon-btn"
            onClick={handleNewSearch}
            aria-label="New search"
            title="New search"
          >
            <Plus size={18} />
          </button>
        </header>

        {/* Page content */}
        <div className="main-content">{children}</div>
      </div>

      {/* ── Right panel ── */}
      {rightPanel && <aside className="right-panel">{rightPanel}</aside>}
    </div>
  );
}
