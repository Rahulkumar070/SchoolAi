"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import Image from "next/image";
import {
  Plus,
  Search,
  BookOpen,
  FileText,
  Library,
  CreditCard,
  LogOut,
  LogIn,
  ChevronUp,
  ChevronDown,
  Crown,
  Sparkles,
  Bell,
  HelpCircle,
  Settings2,
  Moon,
  Sun,
  AlignLeft,
  Shield,
} from "lucide-react";
import { useEffect, useState, useCallback } from "react";

const NAV = [
  { href: "/search", label: "Research Search", icon: Search },
  { href: "/review", label: "Literature Review", icon: BookOpen },
  { href: "/upload", label: "PDF Chat", icon: FileText },
  { href: "/dashboard", label: "My Library", icon: Library },
  { href: "/pricing", label: "Pricing", icon: CreditCard },
];

export interface Conversation {
  _id: string;
  title: string;
  updatedAt: string;
}

function groupConversations(items: Conversation[]) {
  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const yest = today - 86_400_000;
  const week = today - 6 * 86_400_000;
  const groups = [
    { label: "Today", items: [] as Conversation[] },
    { label: "Yesterday", items: [] as Conversation[] },
    { label: "Previous 7 Days", items: [] as Conversation[] },
    { label: "Older", items: [] as Conversation[] },
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
  const [chatsOpen, setChatsOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [dark, setDark] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  // ── Broadcasts / notifications ──
  const [broadcasts, setBroadcasts] = useState<
    { _id: string; title: string; message: string; type: string }[]
  >([]);
  const [bellOpen, setBellOpen] = useState(false);

  const plan = session?.user?.plan ?? "free";
  const isFree = plan === "free";
  const isStudent = plan === "student";
  const isPro = plan === "pro";
  const planLabel = isPro
    ? "Pro Account"
    : isStudent
      ? "Student Account"
      : "Free Account";

  /* ── fetch sidebar data ── */
  const fetchSidebar = useCallback(() => {
    if (!session?.user?.email) return;
    fetch("/api/sidebar")
      .then((r) => r.json())
      .then((d: { conversations?: Conversation[] }) => {
        setConversations(d.conversations ?? []);
      })
      .catch(() => {});
  }, [session?.user?.email]);

  useEffect(() => {
    fetchSidebar();
  }, [fetchSidebar]);

  useEffect(() => {
    const h = () => fetchSidebar();
    window.addEventListener("researchly:conversation-updated", h);
    window.addEventListener("researchly:history-updated", h);
    return () => {
      window.removeEventListener("researchly:conversation-updated", h);
      window.removeEventListener("researchly:history-updated", h);
    };
  }, [fetchSidebar]);

  const grouped = groupConversations(conversations);

  /* ── Fetch broadcasts ── */
  useEffect(() => {
    if (!session?.user?.email) return;
    fetch("/api/admin/broadcast")
      .then((r) => r.json())
      .then(
        (d: {
          broadcasts?: {
            _id: string;
            title: string;
            message: string;
            type: string;
          }[];
        }) => {
          setBroadcasts(d.broadcasts ?? []);
        },
      )
      .catch(() => {});
  }, [session?.user?.email]);

  const dismissBroadcast = (id: string) => {
    setBroadcasts((prev) => prev.filter((b) => b._id !== id));
    fetch("/api/admin/broadcast", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  };

  /* ── Propagate theme to <html> so Shell + all pages respond ── */
  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      dark ? "dark" : "light",
    );
    // Also set body bg so no flash
    document.body.style.background = dark ? "#0f0f0f" : "#e8e8e8";
  }, [dark]);

  /* ── On mount, read saved preference ── */
  useEffect(() => {
    const saved = localStorage.getItem("rly-theme");
    if (saved === "light") setDark(false);
    else {
      document.documentElement.setAttribute("data-theme", "dark");
      document.body.style.background = "#0f0f0f";
    }
  }, []);

  /* ── Save preference ── */
  useEffect(() => {
    localStorage.setItem("rly-theme", dark ? "dark" : "light");
  }, [dark]);

  /* ── theme tokens ── */
  const t = {
    bg: dark ? "#1a1a1a" : "#f5f5f5",
    border: dark ? "#242424" : "#e4e4e4",
    brand: dark ? "#e8e3dc" : "#111",
    navHover: dark ? "#222" : "#ebebeb",
    navActive: dark ? "#282828" : "#e4e4e4",
    navText: dark ? "#888" : "#555",
    navTextAct: dark ? "#e8e3dc" : "#111",
    sectionLabel: dark ? "#3a3a3a" : "#bbb",
    histBtn: dark ? "#1a1a1a" : "#f5f5f5",
    histBtnHov: dark ? "#222" : "#ebebeb",
    histBtnAct: dark ? "#282828" : "#e4e4e4",
    histText: dark ? "#777" : "#666",
    histTextAct: dark ? "#e8e3dc" : "#111",
    footerBg: dark ? "#1a1a1a" : "#f5f5f5",
    footerBorder: dark ? "#222" : "#e4e4e4",
    footerText: dark ? "#ccc" : "#222",
    footerSub: dark ? "#555" : "#888",
    iconBtn: dark ? "#444" : "#888",
    iconBtnHov: dark ? "#bbb" : "#222",
  };

  // On mobile (onClose present), never use collapsed icon-rail — always full width
  const isMobile = !!onClose;
  const effectiveCollapsed = isMobile ? false : collapsed;
  const W = effectiveCollapsed ? 60 : 256;

  return (
    <>
      {/* ── Injected CSS ── */}
      <style>{`
        .sb-root {
          display: flex; flex-direction: column;
          height: 100%; overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          transition: width 0.28s cubic-bezier(0.4,0,0.2,1),
                      background 0.25s, border-color 0.25s;
          border-right: 1px solid ${t.border};
        }

        /* ── Top ── */
        .sb-top {
          display: flex; align-items: center;
          padding: 12px 10px 10px;
          gap: 10px; flex-shrink: 0;
          min-height: 54px;
        }
        .sb-logo-circle {
          width: 30px; height: 30px; border-radius: 50%;
          background: ${dark ? "#222" : "#e0e0e0"}; border: 1px solid ${dark ? "#333" : "#ccc"};
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; flex-shrink: 0;
          color: ${t.brand};
        }
        .sb-brand {
          font-size: 14px; font-weight: 600;
          color: ${t.brand}; flex: 1;
          white-space: nowrap; overflow: hidden;
          letter-spacing: -0.01em;
          transition: opacity 0.18s;
        }
        .sb-collapse-btn {
          width: 34px; height: 34px; border-radius: 9px;
          background: ${dark ? "#1e1e1e" : "#e8e8e8"};
          border: 1px solid ${dark ? "#2a2a2a" : "#d8d8d8"};
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: ${dark ? "#888" : "#666"};
          flex-shrink: 0;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .sb-collapse-btn:hover {
          background: ${dark ? "#252525" : "#ddd"};
          color: ${t.iconBtnHov};
          border-color: ${dark ? "#333" : "#ccc"};
        }

        /* ── Nav ── */
        .sb-nav { padding: 4px 8px 0; flex-shrink: 0; }

        /* New Research btn */
        .sb-new-btn {
          width: 100%; display: flex; align-items: center;
          gap: 10px; padding: 9px 10px;
          background: ${dark ? "#1e1e1e" : "#e8e8e8"};
          border: 1px solid ${dark ? "#2a2a2a" : "#d8d8d8"};
          border-radius: 9px;
          cursor: pointer; font-family: inherit;
          font-size: 13.5px; font-weight: 500;
          color: ${t.navTextAct};
          text-align: left; margin-bottom: 6px;
          transition: background 0.15s, border-color 0.15s;
          overflow: hidden;
        }
        .sb-new-btn:hover { background: ${dark ? "#252525" : "#ddd"}; }
        .sb-new-icon {
          width: 24px; height: 24px; border-radius: 7px;
          background: ${dark ? "#2a2a2a" : "#d8d8d8"};
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }

        /* Nav items */
        .sb-nav-item {
          display: flex; align-items: center;
          gap: 10px; padding: 8px 10px;
          border-radius: 8px; cursor: pointer;
          font-size: 13.5px; color: ${t.navText};
          text-decoration: none; width: 100%;
          margin-bottom: 2px; overflow: hidden;
          transition: background 0.13s, color 0.13s;
          white-space: nowrap;
        }
        .sb-nav-item:hover { background: ${t.navHover}; color: ${t.navTextAct}; }
        .sb-nav-item.active { background: ${t.navActive}; color: ${t.navTextAct}; }
        .sb-nav-icon {
          width: 22px; height: 22px; border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }

        /* ── Divider ── */
        .sb-divider {
          height: 1px; background: ${t.border};
          margin: 8px 8px;
        }

        /* ── Chats section ── */
        .sb-section {
          flex: 1; overflow-y: auto; padding: 0 8px;
          min-height: 0;
        }
        .sb-section-header {
          display: flex; align-items: center;
          justify-content: space-between;
          padding: 8px 4px 4px;
          cursor: pointer;
        }
        .sb-section-label {
          font-size: 11px; font-weight: 600;
          color: ${t.sectionLabel};
          letter-spacing: 0.06em; text-transform: uppercase;
        }
        .sb-section-toggle {
          color: ${t.sectionLabel};
          transition: color 0.15s;
        }
        .sb-group-label {
          font-size: 10px; font-weight: 600;
          color: ${t.sectionLabel};
          letter-spacing: 0.06em; text-transform: uppercase;
          padding: 6px 4px 2px;
        }
        .sb-hist-btn {
          display: block; width: 100%;
          padding: 7px 8px; border-radius: 7px;
          background: transparent; border: none;
          text-align: left; cursor: pointer;
          font-family: inherit; font-size: 13px;
          color: ${t.histText};
          white-space: nowrap; overflow: hidden;
          text-overflow: ellipsis;
          transition: background 0.13s, color 0.13s;
          margin-bottom: 1px;
        }
        .sb-hist-btn:hover  { background: ${t.histBtnHov}; color: ${t.histTextAct}; }
        .sb-hist-btn.active { background: ${t.histBtnAct}; color: ${t.histTextAct}; font-weight: 500; }

        /* Sign in promo */
        .sb-signin-promo {
          margin: 8px; padding: 12px 14px;
          background: ${dark ? "#1a1a1a" : "#eee"};
          border: 1px solid ${dark ? "#252525" : "#ddd"};
          border-radius: 10px;
        }
        .sb-signin-promo p {
          font-size: 12px; color: ${dark ? "#555" : "#888"};
          line-height: 1.6; margin-bottom: 10px;
        }
        .sb-signin-btn {
          width: 100%; padding: 8px;
          border-radius: 7px; border: none;
          background: ${dark ? "#222" : "#ddd"};
          color: ${dark ? "#ccc" : "#333"};
          font-family: inherit; font-size: 13px; font-weight: 500;
          cursor: pointer; transition: background 0.15s;
        }
        .sb-signin-btn:hover { background: ${dark ? "#2a2a2a" : "#ccc"}; }

        /* ── User menu popup ── */
        .sb-user-menu {
          position: absolute; bottom: 100%; left: 8px; right: 8px;
          background: ${dark ? "#1c1c1c" : "#f0f0f0"};
          border: 1px solid ${dark ? "#2a2a2a" : "#ddd"};
          border-radius: 10px; overflow: hidden;
          box-shadow: 0 -8px 24px rgba(0,0,0,0.4);
          margin-bottom: 4px; z-index: 10;
        }
        .sb-user-menu-item {
          display: flex; align-items: center; gap: 10px;
          width: 100%; padding: 10px 14px;
          background: transparent; border: none;
          font-family: inherit; font-size: 13px;
          color: ${dark ? "#aaa" : "#555"};
          cursor: pointer; text-align: left;
          transition: background 0.12s, color 0.12s;
        }
        .sb-user-menu-item:hover {
          background: ${dark ? "#252525" : "#e8e8e8"};
          color: ${dark ? "#eee" : "#111"};
        }
        .sb-user-menu-item.danger:hover { color: #e06060; }
        .sb-user-menu-divider { height: 1px; background: ${dark ? "#232323" : "#ddd"}; }

        /* ── Footer ── */
        .sb-footer {
          flex-shrink: 0;
          border-top: 1px solid ${t.footerBorder};
          position: relative;
        }
        .sb-footer-user {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 12px 8px;
          cursor: pointer;
          transition: background 0.13s;
          border-radius: 8px;
          margin: 4px 4px 0;
          overflow: hidden;
        }
        .sb-footer-user:hover { background: ${t.navHover}; }
        .sb-avatar {
          width: 32px; height: 32px; border-radius: 50%;
          background: ${dark ? "#252525" : "#ddd"};
          border: 1px solid ${dark ? "#333" : "#ccc"};
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 600;
          color: ${dark ? "#bbb" : "#555"};
          flex-shrink: 0; overflow: hidden;
        }
        .sb-footer-name {
          font-size: 13px; font-weight: 500;
          color: ${t.footerText};
          white-space: nowrap; overflow: hidden;
          text-overflow: ellipsis; flex: 1;
          min-width: 0;
        }
        .sb-footer-plan {
          font-size: 11px; color: ${t.footerSub};
          white-space: nowrap;
        }
        .sb-footer-chevron { color: ${t.iconBtn}; flex-shrink: 0; }

        /* Bottom icon row */
        .sb-footer-icons {
          display: flex; align-items: center;
          padding: 4px 8px 10px; gap: 2px;
        }
        .sb-icon-btn {
          width: 32px; height: 32px; border-radius: 8px;
          background: transparent; border: none;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: ${t.iconBtn};
          transition: background 0.13s, color 0.13s;
        }
        .sb-icon-btn:hover {
          background: ${t.navHover}; color: ${t.iconBtnHov};
        }
        /* mode toggle */
        .sb-mode-toggle {
          margin-left: auto;
          display: flex; align-items: center; gap: 2px;
          background: ${dark ? "#1e1e1e" : "#e8e8e8"};
          border: 1px solid ${dark ? "#2a2a2a" : "#ddd"};
          border-radius: 99px; padding: 2px;
        }
        .sb-mode-btn {
          width: 26px; height: 26px; border-radius: 99px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; border: none;
          transition: background 0.15s, color 0.15s;
        }
        .sb-mode-btn.active {
          background: ${dark ? "#333" : "#fff"};
          color: ${dark ? "#e8e3dc" : "#111"};
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
        .sb-mode-btn:not(.active) {
          background: transparent; color: ${t.iconBtn};
        }
      `}</style>

      <aside
        className="sb-root"
        style={{
          width: W,
          background: t.bg,
          borderColor: t.border,
        }}
      >
        {/* ── TOP: Logo + Brand + Collapse toggle ── */}
        <div className="sb-top">
          {effectiveCollapsed ? (
            /* When collapsed — single prominent open button */
            <button
              className="sb-collapse-btn"
              onClick={() => setCollapsed(false)}
              title="Open sidebar"
              style={{ margin: "0 auto" }}
            >
              <AlignLeft size={16} />
            </button>
          ) : (
            /* When expanded — logo + brand + close button */
            <>
              <img
                src={dark ? "/researchly-logo-full.svg" : "/researchly-logo-light.svg"}
                alt="Researchly"
                height="28"
                style={{ flex: 1, minWidth: 0, objectFit: "contain", objectPosition: "left" }}
              />
              <button
                className="sb-collapse-btn"
                onClick={() => {
                  if (isMobile) onClose?.();
                  else setCollapsed(true);
                }}
                title={isMobile ? "Close sidebar" : "Collapse sidebar"}
              >
                <AlignLeft size={15} />
              </button>
            </>
          )}
        </div>

        {/* ── NAV ── */}
        <div className="sb-nav">
          {/* New Research */}
          <button
            className="sb-new-btn"
            onClick={() => {
              onNewSearch?.();
              onClose?.();
            }}
          >
            <span className="sb-new-icon">
              <Plus size={13} color={dark ? "#aaa" : "#666"} />
            </span>
            {!effectiveCollapsed && "New Research"}
          </button>

          {/* Nav links */}
          {NAV.map(({ href, label, icon: Icon }) => {
            const isActive = path === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={`sb-nav-item${isActive ? " active" : ""}`}
                title={effectiveCollapsed ? label : undefined}
              >
                <span className="sb-nav-icon">
                  <Icon size={15} color={isActive ? t.navTextAct : t.navText} />
                </span>
                {!effectiveCollapsed && label}
              </Link>
            );
          })}
        </div>

        <div className="sb-divider" />

        {/* ── CHATS SECTION ── */}
        {!effectiveCollapsed && (
          <>
            {session && grouped.length > 0 ? (
              <div className="sb-section">
                {/* Section header */}
                <div
                  className="sb-section-header"
                  onClick={() => setChatsOpen((o) => !o)}
                >
                  <span className="sb-section-label">Chats</span>
                  <span className="sb-section-toggle">
                    {chatsOpen ? (
                      <ChevronUp size={13} />
                    ) : (
                      <ChevronDown size={13} />
                    )}
                  </span>
                </div>

                {chatsOpen &&
                  grouped.map((group) => (
                    <div key={group.label}>
                      <p className="sb-group-label">{group.label}</p>
                      {group.items.map((conv) => {
                        const isActive =
                          activeConversationId === conv._id ||
                          path === `/chat/${conv._id}`;
                        return (
                          <button
                            key={conv._id}
                            className={`sb-hist-btn${isActive ? " active" : ""}`}
                            title={conv.title}
                            onClick={() => {
                              router.push(`/chat/${conv._id}`);
                              onClose?.();
                            }}
                          >
                            {conv.title}
                          </button>
                        );
                      })}
                    </div>
                  ))}
              </div>
            ) : !session ? (
              <div className="sb-signin-promo">
                <p>
                  Sign in free to save your research history and access it from
                  any device.
                </p>
                <button className="sb-signin-btn" onClick={() => void signIn()}>
                  Sign In Free
                </button>
              </div>
            ) : (
              <div style={{ flex: 1 }} />
            )}
          </>
        )}

        {effectiveCollapsed && <div style={{ flex: 1 }} />}

        {/* ── FOOTER ── */}
        <div className="sb-footer">
          {/* User menu popup */}
          {userMenuOpen && !effectiveCollapsed && (
            <div className="sb-user-menu">
              {session ? (
                <>
                  <Link
                    href="/pricing"
                    className="sb-user-menu-item"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    {isPro ? <Crown size={14} /> : <Sparkles size={14} />}
                    {planLabel}
                  </Link>
                  <div className="sb-user-menu-divider" />
                  <button
                    className="sb-user-menu-item danger"
                    onClick={() => {
                      void signOut();
                      setUserMenuOpen(false);
                    }}
                  >
                    <LogOut size={14} /> Sign out
                  </button>
                </>
              ) : (
                <button
                  className="sb-user-menu-item"
                  onClick={() => {
                    void signIn();
                    setUserMenuOpen(false);
                  }}
                >
                  <LogIn size={14} /> Sign in
                </button>
              )}
            </div>
          )}

          {/* User row */}
          <div
            className="sb-footer-user"
            onClick={() => !effectiveCollapsed && setUserMenuOpen((o) => !o)}
            title={
              effectiveCollapsed
                ? (session?.user?.name ?? "Account")
                : undefined
            }
          >
            <div className="sb-avatar">
              {session?.user?.image ? (
                <Image
                  src={session.user.image}
                  alt="avatar"
                  width={32}
                  height={32}
                  style={{ borderRadius: "50%", display: "block" }}
                />
              ) : (
                <span>
                  {session ? (
                    (session.user?.name?.[0] ?? "U").toUpperCase()
                  ) : (
                    <LogIn size={14} color={dark ? "#666" : "#999"} />
                  )}
                </span>
              )}
            </div>

            {!effectiveCollapsed && (
              <>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="sb-footer-name">
                    {session?.user?.name ?? "Guest"}
                  </div>
                  <div className="sb-footer-plan">
                    {session ? planLabel : "Not signed in"}
                  </div>
                </div>
                <ChevronUp
                  size={13}
                  className="sb-footer-chevron"
                  style={{
                    transform: userMenuOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s",
                  }}
                />
              </>
            )}
          </div>

          {/* Bottom icon row: bell, settings, help, dark/light toggle */}
          {!effectiveCollapsed && (
            <div className="sb-footer-icons">
              {/* ── Bell / Notifications ── */}
              <div style={{ position: "relative" }}>
                <button
                  className="sb-icon-btn"
                  title="Notifications"
                  onClick={() => setBellOpen((o) => !o)}
                  style={{ position: "relative" }}
                >
                  <Bell size={14} />
                  {broadcasts.length > 0 && (
                    <span
                      style={{
                        position: "absolute",
                        top: 2,
                        right: 2,
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "#e05c5c",
                        border: "1.5px solid " + t.bg,
                        pointerEvents: "none",
                      }}
                    />
                  )}
                </button>

                {/* Dropdown */}
                {bellOpen && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "calc(100% + 8px)",
                      left: 0,
                      width: 280,
                      background: t.bg,
                      border: `1px solid ${t.border}`,
                      borderRadius: 12,
                      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                      zIndex: 200,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "10px 14px 8px",
                        borderBottom: `1px solid ${t.border}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: t.navTextAct,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase" as const,
                        }}
                      >
                        Notifications{" "}
                        {broadcasts.length > 0 && `(${broadcasts.length})`}
                      </span>
                      <button
                        onClick={() => setBellOpen(false)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: t.navText,
                          padding: 2,
                          display: "flex",
                        }}
                      >
                        ✕
                      </button>
                    </div>

                    {broadcasts.length === 0 ? (
                      <div
                        style={{ padding: "24px 14px", textAlign: "center" }}
                      >
                        <Bell
                          size={20}
                          style={{
                            color: t.sectionLabel,
                            display: "block",
                            margin: "0 auto 8px",
                            opacity: 0.4,
                          }}
                        />
                        <p
                          style={{ fontSize: 12, color: t.navText, margin: 0 }}
                        >
                          No new notifications
                        </p>
                      </div>
                    ) : (
                      broadcasts.map((b) => {
                        const typeColor: Record<string, string> = {
                          info: "#5c9ae0",
                          success: "#5db87a",
                          warning: "#e8a045",
                        };
                        const col = typeColor[b.type] ?? "#5c9ae0";
                        return (
                          <div
                            key={b._id}
                            style={{
                              padding: "12px 14px",
                              borderBottom: `1px solid ${t.border}`,
                              position: "relative",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 7,
                                marginBottom: 5,
                              }}
                            >
                              <span
                                style={{
                                  width: 7,
                                  height: 7,
                                  borderRadius: "50%",
                                  background: col,
                                  flexShrink: 0,
                                }}
                              />
                              <span
                                style={{
                                  fontSize: 12.5,
                                  fontWeight: 600,
                                  color: t.navTextAct,
                                  flex: 1,
                                }}
                              >
                                {b.title}
                              </span>
                              <button
                                onClick={() => dismissBroadcast(b._id)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  color: t.navText,
                                  padding: 2,
                                  display: "flex",
                                  flexShrink: 0,
                                }}
                              >
                                ✕
                              </button>
                            </div>
                            <p
                              style={{
                                fontSize: 12,
                                color: t.navText,
                                margin: 0,
                                lineHeight: 1.5,
                                paddingLeft: 14,
                              }}
                            >
                              {b.message}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
              <button
                className="sb-icon-btn"
                title="Settings"
                onClick={() => router.push("/dashboard")}
              >
                <Settings2 size={14} />
              </button>
              <button
                className="sb-icon-btn"
                title="Help"
                onClick={() => window.open("mailto:hello.researchly@gmail.com")}
              >
                <HelpCircle size={14} />
              </button>

              {/* Admin panel — only visible to admin */}
              {session?.user?.email ===
                (process.env.NEXT_PUBLIC_ADMIN_EMAIL ??
                  "rk035199@gmail.com") && (
                <button
                  className="sb-icon-btn"
                  title="Admin Panel"
                  onClick={() => router.push("/admin")}
                  style={{ color: "var(--brand)" }}
                >
                  <Shield size={14} />
                </button>
              )}

              {/* Dark / Light toggle */}
              <div className="sb-mode-toggle">
                <button
                  className={`sb-mode-btn${dark ? " active" : ""}`}
                  onClick={() => setDark(true)}
                  title="Dark mode"
                >
                  <Moon size={12} />
                </button>
                <button
                  className={`sb-mode-btn${!dark ? " active" : ""}`}
                  onClick={() => setDark(false)}
                  title="Light mode"
                >
                  <Sun size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
