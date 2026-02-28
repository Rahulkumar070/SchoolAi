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
  const [searchesToday, setSearchesToday] = useState(0);
  const [searchesThisMonth, setSearchesThisMonth] = useState(0);
  const [showHistory, setShowHistory] = useState(false);

  const plan = session?.user?.plan ?? "free";
  const isFree = plan === "free";
  const isStudent = plan === "student";
  const isPro = plan === "pro";
  const planLabel = isPro ? "Pro" : isStudent ? "Student" : "Free";
  const PlanIcon = isPro ? Crown : isStudent ? Sparkles : Zap;
  const planColor = isPro
    ? "#5c9ae0"
    : isStudent
      ? "var(--brand)"
      : "var(--text-muted)";

  useEffect(() => {
    if (!session?.user?.email) return;
    fetch("/api/user/history")
      .then((r) => r.json())
      .then(
        (d: {
          history?: HistoryItem[];
          searchesToday?: number;
          searchesThisMonth?: number;
        }) => {
          setHistory(d.history ?? []);
          setSearchesToday(d.searchesToday ?? 0);
          setSearchesThisMonth(d.searchesThisMonth ?? 0);
        },
      )
      .catch(() => {});
  }, [session]);

  const handleNavClick = () => {
    onClose?.();
  };
  const handleHistoryClick = (query: string) => {
    onClose?.();
    // No autorun=1 — just pre-fills the input box, user presses Enter themselves
    // This prevents accidental credit consumption
    window.location.href = `/search?q=${encodeURIComponent(query)}`;
  };

  // Counter config per plan
  const counter = isFree
    ? { used: searchesToday, max: 5, label: "Daily", warn: 4, period: "today" }
    : isStudent
      ? {
          used: searchesThisMonth,
          max: 500,
          label: "Monthly",
          warn: 450,
          period: "this month",
        }
      : null;

  return (
    <div className="sidebar-inner">
      {/* Logo */}
      <div className="sidebar-logo">
        <Link href="/" onClick={handleNavClick} className="sidebar-brand">
          <div className="logo-mark">
            <BookOpen size={13} color="#000" strokeWidth={2.5} />
          </div>
          <span className="sidebar-brand-text">ScholarAI</span>
        </Link>
        {onClose && (
          <button className="icon-btn sidebar-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="sidebar-body">
        <button
          className="new-chat-btn"
          onClick={onNewSearch ?? handleNavClick}
        >
          <Plus size={14} style={{ color: "var(--brand)" }} /> New Research
        </button>

        {/* Search counter */}
        {session && counter && (
          <div className="sidebar-counter">
            <div className="sidebar-counter-top">
              <span className="sidebar-counter-label">
                {counter.label} Searches
              </span>
              <span
                className="sidebar-counter-num"
                data-warn={counter.used >= counter.warn ? "true" : undefined}
                data-limit={counter.used >= counter.max ? "true" : undefined}
              >
                {counter.used} / {counter.max}
              </span>
            </div>
            <div className="sidebar-counter-track">
              <div
                className="sidebar-counter-fill"
                style={{
                  width: `${Math.min((counter.used / counter.max) * 100, 100)}%`,
                }}
                data-warn={counter.used >= counter.warn ? "true" : undefined}
                data-limit={counter.used >= counter.max ? "true" : undefined}
              />
            </div>
            <p className="sidebar-counter-hint">
              {counter.used >= counter.max ? (
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
                  {counter.max - counter.used} left {counter.period} ·{" "}
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

        {/* Pro badge — unlimited */}
        {session && isPro && (
          <div className="sidebar-plan-badge">
            <Crown size={11} style={{ color: "#5c9ae0", flexShrink: 0 }} />
            <span style={{ color: "#5c9ae0" }}>
              Pro — Unlimited searches ✨
            </span>
          </div>
        )}

        {/* Nav */}
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

      {/* Footer */}
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
