"use client";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import { Menu, BookOpen, Plus } from "lucide-react";
import Link from "next/link";

export default function Shell({
  children,
  rightPanel,
  activeConversationId,
}: {
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
  activeConversationId?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const handleNewSearch = () => {
    setOpen(false);
    router.push(`/search?new=${Date.now()}`);
  };

  return (
    <div className="shell">
      <aside className={`sidebar${open ? " open" : ""}`}>
        <Sidebar
          onClose={() => setOpen(false)}
          onNewSearch={handleNewSearch}
          activeConversationId={activeConversationId}
        />
      </aside>

      {open && (
        <div
          className="sidebar-backdrop"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="main">
        <header className="mobile-bar">
          <button
            className="icon-btn"
            onClick={() => setOpen(true)}
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
          <button
            className="icon-btn"
            onClick={handleNewSearch}
            aria-label="New search"
            title="New search"
          >
            <Plus size={18} />
          </button>
        </header>
        <div className="main-content">{children}</div>
      </div>

      {rightPanel && <aside className="right-panel">{rightPanel}</aside>}
    </div>
  );
}
