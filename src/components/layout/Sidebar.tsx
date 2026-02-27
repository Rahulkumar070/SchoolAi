"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import {
  Search,
  BookOpen,
  FileText,
  LayoutDashboard,
  PlusCircle,
  LogOut,
  LogIn,
  X,
  Tag,
  History,
  Crown,
  Sparkles,
  Zap,
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

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const path = usePathname();
  const { data: session } = useSession();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [searchCount, setSearchCount] = useState(0);
  const [loadingH, setLoadingH] = useState(false);
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
    setLoadingH(true);
    fetch("/api/user/history")
      .then((r) => r.json())
      .then((d: { history?: HistoryItem[]; searchesToday?: number }) => {
        setHistory(d.history ?? []);
        setSearchCount(d.searchesToday ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoadingH(false));
  }, [session]);

  return (
    <>
      {/* Logo */}
      <div
        className="sidebar-logo"
        style={{ borderBottom: "1px solid var(--border)", paddingBottom: 14 }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            flex: 1,
            textDecoration: "none",
          }}
        >
          <div className="logo-mark">
            <BookOpen size={13} color="#000" strokeWidth={2.5} />
          </div>
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontWeight: 700,
              fontSize: 14,
              color: "var(--text-primary)",
              letterSpacing: "-0.01em",
            }}
          >
            ScholarAI
          </span>
        </Link>
        {onClose && (
          <button className="icon-btn" onClick={onClose}>
            <X size={15} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="sidebar-body">
        <Link
          href="/search"
          className="new-chat-btn"
          style={{ textDecoration: "none" }}
          onClick={onClose}
        >
          <PlusCircle size={14} style={{ color: "var(--brand)" }} /> New
          Research
        </Link>

        {/* Search counter for free users */}
        {session && isFree && (
          <div
            style={{
              margin: "8px 2px",
              padding: "10px 12px",
              background: "var(--bg-overlay)",
              border: "1px solid var(--border-mid)",
              borderRadius: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontSize: 10.5,
                  color: "var(--text-muted)",
                  fontWeight: 600,
                }}
              >
                Daily Searches
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color:
                    searchCount >= 10
                      ? "var(--red)"
                      : searchCount >= 7
                        ? "var(--brand)"
                        : "var(--green)",
                }}
              >
                {searchCount} / 10
              </span>
            </div>
            <div
              style={{
                height: 4,
                background: "var(--surface-3)",
                borderRadius: 99,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.min((searchCount / 10) * 100, 100)}%`,
                  background:
                    searchCount >= 10
                      ? "var(--red)"
                      : searchCount >= 7
                        ? "var(--brand)"
                        : "var(--green)",
                  borderRadius: 99,
                  transition: "width .3s",
                }}
              />
            </div>
            {searchCount >= 10 && (
              <p style={{ fontSize: 10, color: "var(--red)", marginTop: 5 }}>
                Limit reached ·{" "}
                <Link
                  href="/pricing"
                  style={{ color: "var(--brand)", textDecoration: "none" }}
                  onClick={onClose}
                >
                  Upgrade ↗
                </Link>
              </p>
            )}
            {searchCount < 10 && (
              <p
                style={{
                  fontSize: 10,
                  color: "var(--text-faint)",
                  marginTop: 5,
                }}
              >
                {10 - searchCount} searches left today
              </p>
            )}
          </div>
        )}

        {/* Paid badge */}
        {session && !isFree && (
          <div
            style={{
              margin: "8px 2px",
              padding: "8px 12px",
              background: "var(--brand-dim)",
              border: "1px solid var(--brand-border)",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <PlanIcon size={12} style={{ color: planColor }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: planColor }}>
              {planLabel} — Unlimited searches ✨
            </span>
          </div>
        )}

        <p className="sidebar-section-label">Tools</p>
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`nav-link${path === href ? " active" : ""}`}
            onClick={onClose}
            style={{ textDecoration: "none" }}
          >
            <Icon size={14} className="nav-icon" /> {label}
          </Link>
        ))}

        {/* Search History */}
        {session && history.length > 0 && (
          <>
            <button
              onClick={() => setShowHistory((h) => !h)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                padding: "7px 9px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                borderRadius: 7,
                marginTop: 4,
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--surface)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  fontSize: 11.5,
                  color: "var(--text-muted)",
                  fontWeight: 600,
                }}
              >
                <History size={12} /> Recent Searches
              </span>
              <span
                style={{
                  fontSize: 9,
                  color: "var(--text-faint)",
                  transform: showHistory ? "rotate(180deg)" : "rotate(0deg)",
                  transition: ".15s",
                }}
              >
                ▼
              </span>
            </button>

            {showHistory && (
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {loadingH ? (
                  <div style={{ padding: "8px 10px" }}>
                    <span
                      className="spinner"
                      style={{ width: 12, height: 12 }}
                    />
                  </div>
                ) : (
                  history.slice(0, 15).map((h, i) => (
                    <Link
                      key={i}
                      href={`/search?q=${encodeURIComponent(h.query)}`}
                      onClick={onClose}
                      title={h.query}
                      style={{
                        display: "block",
                        padding: "5px 10px 5px 28px",
                        borderRadius: 7,
                        fontSize: 11.5,
                        color: "var(--text-muted)",
                        textDecoration: "none",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      onMouseEnter={(e) => {
                        (
                          e.currentTarget as HTMLAnchorElement
                        ).style.background = "var(--surface)";
                        (e.currentTarget as HTMLAnchorElement).style.color =
                          "var(--text-secondary)";
                      }}
                      onMouseLeave={(e) => {
                        (
                          e.currentTarget as HTMLAnchorElement
                        ).style.background = "transparent";
                        (e.currentTarget as HTMLAnchorElement).style.color =
                          "var(--text-muted)";
                      }}
                    >
                      {h.query}
                    </Link>
                  ))
                )}
                <Link
                  href="/dashboard"
                  onClick={onClose}
                  style={{
                    padding: "5px 10px 5px 28px",
                    fontSize: 10.5,
                    color: "var(--text-faint)",
                    textDecoration: "none",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLAnchorElement).style.color =
                      "var(--brand)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLAnchorElement).style.color =
                      "var(--text-faint)")
                  }
                >
                  View all history →
                </Link>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        {session ? (
          <>
            <div className="user-row" style={{ marginBottom: 4 }}>
              {session.user?.image ? (
                <Image
                  src={session.user.image}
                  alt="avatar"
                  width={28}
                  height={28}
                  style={{ borderRadius: "50%" }}
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
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  {session.user?.name ?? "Researcher"}
                </p>
                <p
                  className="truncate-1"
                  style={{ fontSize: 10, color: "var(--text-faint)" }}
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
                }}
              >
                {planLabel}
              </span>
            </div>
            <button
              className="nav-link"
              onClick={() => void signOut()}
              style={{ color: "var(--text-muted)", marginTop: 2 }}
            >
              <LogOut size={13} className="nav-icon" /> Sign out
            </button>
          </>
        ) : (
          <button
            className="nav-link"
            onClick={() => void signIn()}
            style={{ color: "var(--brand)" }}
          >
            <LogIn size={13} className="nav-icon" /> Sign in to save history
          </button>
        )}
      </div>
    </>
  );
}
