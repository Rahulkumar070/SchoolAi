"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  Crown,
  Sparkles,
  Zap,
  Plus,
  Pencil,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState, useCallback } from "react";

const NAV = [
  { href: "/search", label: "Research Search", icon: Search },
  { href: "/review", label: "Literature Review", icon: BookOpen },
  { href: "/upload", label: "PDF Chat", icon: FileText },
  { href: "/dashboard", label: "My Library", icon: LayoutDashboard },
  { href: "/pricing", label: "Plans & Billing", icon: Tag },
];

// ── Public types ─────────────────────────────────────────────
export interface Conversation {
  _id: string;
  title: string;
  updatedAt: string;
}

// Legacy type kept for any component still importing it
export interface SidebarHistoryItem {
  query: string;
  searchedAt: string;
  answer?: string;
  papers?: unknown[];
}

// ── Date grouping ─────────────────────────────────────────────
function groupConversations(items: Conversation[]) {
  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const yest = today - 86_400_000;
  const week = today - 6 * 86_400_000;

  const groups: { label: string; items: Conversation[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 Days", items: [] },
    { label: "Older", items: [] },
  ];

  for (const c of items) {
    const t = new Date(c.updatedAt).getTime();
    if (t >= today) groups[0].items.push(c);
    else if (t >= yest) groups[1].items.push(c);
    else if (t >= week) groups[2].items.push(c);
    else groups[3].items.push(c);
  }

  return groups.filter((g) => g.items.length > 0);
}

// ── Component ─────────────────────────────────────────────────
export default function Sidebar({
  onClose,
  onNewSearch,
  activeConversationId,
}: {
  onClose?: () => void;
  onNewSearch?: () => void;
  activeConversationId?: string;
}) {
  const path = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchesToday, setSearchesToday] = useState(0);
  const [searchesThisMonth, setSearchesThisMonth] = useState(0);

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

  // ── Fetch conversations ──────────────────────────────────────
  const fetchConversations = useCallback(() => {
    if (!session?.user?.email) return;
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((d: { conversations?: Conversation[] }) => {
        setConversations(d.conversations ?? []);
      })
      .catch(() => {});
  }, [session?.user?.email]);

  // Fetch counters separately (keep existing logic)
  const fetchCounters = useCallback(() => {
    if (!session?.user?.email) return;
    fetch("/api/user/history")
      .then((r) => r.json())
      .then((d: { searchesToday?: number; searchesThisMonth?: number }) => {
        setSearchesToday(d.searchesToday ?? 0);
        setSearchesThisMonth(d.searchesThisMonth ?? 0);
      })
      .catch(() => {});
  }, [session?.user?.email]);

  useEffect(() => {
    fetchConversations();
    fetchCounters();
  }, [fetchConversations, fetchCounters]);

  // Auto-refresh sidebar when a new message is sent
  useEffect(() => {
    const handler = () => {
      fetchConversations();
      fetchCounters();
    };
    window.addEventListener("researchly:conversation-updated", handler);
    // Keep legacy event name working too
    window.addEventListener("researchly:history-updated", handler);
    return () => {
      window.removeEventListener("researchly:conversation-updated", handler);
      window.removeEventListener("researchly:history-updated", handler);
    };
  }, [fetchConversations, fetchCounters]);

  const counter = isFree
    ? { used: searchesToday, max: 5, warn: 4, period: "today" }
    : isStudent
      ? { used: searchesThisMonth, max: 500, warn: 450, period: "this month" }
      : null;

  const handleConversationClick = (conv: Conversation) => {
    router.push(`/chat/${conv._id}`);
    onClose?.();
  };

  const grouped = groupConversations(conversations);

  return (
    <div className="sidebar-inner">
      {/* ── Header ── */}
      <div className="sidebar-logo">
        <Link href="/" onClick={onClose} className="sidebar-brand">
          <div className="logo-mark">
            <BookOpen size={13} color="#000" strokeWidth={2.5} />
          </div>
          <span className="sidebar-brand-text">Researchly</span>
        </Link>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={onNewSearch}
            title="New search"
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "transparent",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--text-faint)",
              transition: "all .14s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--surface)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-faint)";
            }}
          >
            <Pencil size={12} />
          </button>
          {onClose && (
            <button className="icon-btn sidebar-close-btn" onClick={onClose}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="sidebar-body">
        <button className="new-chat-btn" onClick={onNewSearch}>
          <Plus size={14} style={{ color: "var(--brand)" }} /> New Research
        </button>

        {/* Usage counter — unchanged */}
        {session && counter && (
          <div className="sidebar-counter">
            <div className="sidebar-counter-top">
              <span className="sidebar-counter-label">
                {isFree ? "Daily" : "Monthly"} Searches
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
                    onClick={onClose}
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
                    onClick={onClose}
                    style={{ color: "var(--text-faint)" }}
                  >
                    Upgrade
                  </Link>
                </>
              )}
            </p>
          </div>
        )}

        {session && isPro && (
          <div className="sidebar-plan-badge">
            <Crown size={11} style={{ color: "#5c9ae0", flexShrink: 0 }} />
            <span style={{ color: "#5c9ae0" }}>
              Pro — Unlimited searches ✨
            </span>
          </div>
        )}

        {/* Nav — unchanged */}
        <p className="sidebar-section-label">Tools</p>
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`nav-link${path === href ? " active" : ""}`}
            onClick={onClose}
          >
            <Icon size={14} className="nav-icon" /> {label}
          </Link>
        ))}

        {/* ── Conversations grouped by date ── */}
        {session && conversations.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p className="sidebar-section-label">History</p>
            {grouped.map((group) => (
              <div key={group.label} style={{ marginBottom: 14 }}>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--text-faint)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    padding: "0 10px",
                    marginBottom: 4,
                  }}
                >
                  {group.label}
                </p>
                {group.items.map((conv) => {
                  const isActive =
                    activeConversationId === conv._id ||
                    path === `/chat/${conv._id}`;
                  return (
                    <button
                      key={conv._id}
                      onClick={() => handleConversationClick(conv)}
                      title={conv.title}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        width: "100%",
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background .12s, color .12s",
                        background: isActive
                          ? "var(--surface-2)"
                          : "transparent",
                        color: isActive
                          ? "var(--text-primary)"
                          : "var(--text-secondary)",
                        fontFamily: "var(--font-ui)",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive)
                          e.currentTarget.style.background = "var(--surface)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive)
                          e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <Search
                        size={11}
                        style={{
                          flexShrink: 0,
                          opacity: isActive ? 0.8 : 0.35,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 12.5,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: 1,
                          fontWeight: isActive ? 600 : 400,
                        }}
                      >
                        {conv.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {!session && (
          <div
            style={{
              margin: "14px 8px 0",
              padding: "12px 13px",
              background: "var(--brand-dim)",
              border: "1px solid var(--brand-border)",
              borderRadius: 10,
            }}
          >
            <p
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                lineHeight: 1.55,
                marginBottom: 10,
              }}
            >
              Sign in free to save your research history and access it from any
              device.
            </p>
            <button
              onClick={() => void signIn()}
              style={{
                width: "100%",
                padding: "7px",
                borderRadius: 8,
                background: "var(--brand)",
                border: "none",
                color: "#000",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
              }}
            >
              Sign In Free
            </button>
          </div>
        )}
      </div>

      {/* ── Footer — unchanged ── */}
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

      <span style={{ display: "none" }}>
        <PlanIcon size={0} />
      </span>
    </div>
  );
}
