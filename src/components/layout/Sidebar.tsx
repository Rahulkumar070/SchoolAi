"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import {
  Search,
  BookOpen,
  FileText,
  LayoutDashboard,
  LogOut,
  LogIn,
  X,
  Tag,
  History,
  Crown,
  Sparkles,
  Zap,
  Plus,
  ChevronDown,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/search", label: "Research Search", icon: Search },
  { href: "/review", label: "Literature Review", icon: BookOpen },
  { href: "/upload", label: "PDF Chat", icon: FileText },
  { href: "/dashboard", label: "My Library", icon: LayoutDashboard },
  { href: "/pricing", label: "Plans & Billing", icon: Tag },
];

interface HistoryItem {
  query: string;
  searchedAt: string;
}

export default function Sidebar({
  onClose,
  onNewSearch,
}: {
  onClose?: () => void;
  onNewSearch?: () => void;
}) {
  const path = usePathname();
  const { data: session } = useSession();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [searchCount, setSearchCount] = useState(0);
  const [showHistory, setShowHistory] = useState(false);

  const plan = session?.user?.plan ?? "free";
  const isFree = plan === "free";
  const planLabel =
    plan === "pro" ? "Pro" : plan === "student" ? "Student" : "Free";
  const PlanIcon = plan === "pro" ? Crown : plan === "student" ? Sparkles : Zap;
  const planColor =
    plan === "pro"
      ? "#5c9ae0"
      : plan === "student"
        ? "var(--brand)"
        : "var(--text-muted)";

  useEffect(() => {
    if (!session?.user?.email) return;
    fetch("/api/user/history")
      .then((r) => r.json())
      .then((d: { history?: HistoryItem[]; searchesToday?: number }) => {
        setHistory(d.history ?? []);
        setSearchCount(d.searchesToday ?? 0);
      })
      .catch(() => {});
  }, [session]);

  const handleNavClick = () => {
    onClose?.();
  };

  const handleHistoryClick = (query: string) => {
    onClose?.();
    window.location.href = `/search?q=${encodeURIComponent(query)}`;
  };

  return (
    <div className="sidebar-inner">
      {/* ── Logo row ── */}
      <div className="sidebar-logo">
        <Link href="/" onClick={handleNavClick} className="sidebar-brand">
          <div className="logo-mark">
            <BookOpen size={13} color="#000" strokeWidth={2.5} />
          </div>
          <span className="sidebar-brand-text">ScholarAI</span>
        </Link>
        {onClose && (
          <button
            className="icon-btn sidebar-close-btn"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* ── Scrollable body ── */}
      <div className="sidebar-body">
        {/* New Research button */}
        <button
          className="new-chat-btn"
          onClick={onNewSearch ?? handleNavClick}
        >
          <Plus size={14} style={{ color: "var(--brand)" }} /> New Research
        </button>

        {/* Search counter — free users */}
        {session && isFree && (
          <div className="sidebar-counter">
            <div className="sidebar-counter-top">
              <span className="sidebar-counter-label">Daily Searches</span>
              <span
                className="sidebar-counter-num"
                data-warn={searchCount >= 7 ? "true" : undefined}
                data-limit={searchCount >= 10 ? "true" : undefined}
              >
                {searchCount} / 10
              </span>
            </div>
            <div className="sidebar-counter-track">
              <div
                className="sidebar-counter-fill"
                style={{ width: `${Math.min((searchCount / 10) * 100, 100)}%` }}
                data-warn={searchCount >= 7 ? "true" : undefined}
                data-limit={searchCount >= 10 ? "true" : undefined}
              />
            </div>
            <p className="sidebar-counter-hint">
              {searchCount >= 10 ? (
                <>
                  <span style={{ color: "var(--red)" }}>Limit reached</span> ·{" "}
                  <Link
                    href="/pricing"
                    onClick={handleNavClick}
                    style={{ color: "var(--brand)" }}
                  >
                    Upgrade →
                  </Link>
                </>
              ) : (
                <>
                  {10 - searchCount} left today ·{" "}
                  <Link
                    href="/pricing"
                    onClick={handleNavClick}
                    style={{ color: "var(--text-faint)" }}
                  >
                    Upgrade
                  </Link>
                </>
              )}
            </p>
          </div>
        )}

        {/* Paid plan badge */}
        {session && !isFree && (
          <div className="sidebar-plan-badge">
            <PlanIcon size={11} style={{ color: planColor, flexShrink: 0 }} />
            <span style={{ color: planColor }}>{planLabel} — Unlimited ✨</span>
          </div>
        )}

        {/* Nav links */}
        <p className="sidebar-section-label">Tools</p>
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`nav-link${path === href ? " active" : ""}`}
            onClick={handleNavClick}
          >
            <Icon size={14} className="nav-icon" /> {label}
          </Link>
        ))}

        {/* Recent searches */}
        {session && history.length > 0 && (
          <div className="sidebar-history">
            <button
              className="sidebar-history-toggle"
              onClick={() => setShowHistory((h) => !h)}
              aria-expanded={showHistory}
            >
              <span className="sidebar-history-toggle-label">
                <History size={12} /> Recent Searches
              </span>
              <ChevronDown
                size={12}
                style={{
                  transform: showHistory ? "rotate(180deg)" : "rotate(0deg)",
                  transition: ".15s",
                  color: "var(--text-faint)",
                }}
              />
            </button>

            {showHistory && (
              <div className="sidebar-history-list">
                {history.slice(0, 12).map((h, i) => (
                  <button
                    key={i}
                    className="sidebar-history-item"
                    onClick={() => handleHistoryClick(h.query)}
                    title={h.query}
                  >
                    <Search size={9} style={{ flexShrink: 0, opacity: 0.4 }} />
                    <span className="sidebar-history-text">{h.query}</span>
                  </button>
                ))}
                <Link
                  href="/dashboard"
                  onClick={handleNavClick}
                  className="sidebar-history-more"
                >
                  View all history →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="sidebar-footer">
        {session ? (
          <>
            <div className="user-row">
              {session.user?.image ? (
                <Image
                  src={session.user.image}
                  alt="avatar"
                  width={30}
                  height={30}
                  style={{ borderRadius: "50%", flexShrink: 0 }}
                />
              ) : (
                <div className="avatar">
                  {(session.user?.name?.[0] ?? "U").toUpperCase()}
                </div>
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <p
                  className="truncate-1"
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  {session.user?.name ?? "Researcher"}
                </p>
                <p
                  className="truncate-1"
                  style={{ fontSize: 10.5, color: "var(--text-faint)" }}
                >
                  {session.user?.email}
                </p>
              </div>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: planColor,
                  background: `${planColor}1a`,
                  padding: "2px 7px",
                  borderRadius: 99,
                  flexShrink: 0,
                  border: `1px solid ${planColor}30`,
                }}
              >
                {planLabel}
              </span>
            </div>
            <button
              className="nav-link signout-btn"
              onClick={() => void signOut()}
            >
              <LogOut size={13} className="nav-icon" /> Sign out
            </button>
          </>
        ) : (
          <button className="nav-link signin-btn" onClick={() => void signIn()}>
            <LogIn size={13} className="nav-icon" /> Sign in to save history
          </button>
        )}
      </div>
    </div>
  );
}
