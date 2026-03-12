"use client";
import { motion, Variants } from "framer-motion";
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
  AlignLeft,
  LogOut,
  LogIn,
  ChevronUp,
  Crown,
  Sparkles,
} from "lucide-react";
import { useEffect, useState, useCallback } from "react";

const NAV = [
  { href: "/search", label: "Research Search", icon: Search, color: "#5c9ae0" },
  { href: "/review", label: "Literature Review", icon: BookOpen, color: "#5db87a" },
  { href: "/upload", label: "PDF Chat", icon: FileText, color: "#e8a045" },
  { href: "/dashboard", label: "My Library", icon: Library, color: "#ad73e0" },
  { href: "/pricing", label: "Plans & Billing", icon: CreditCard, color: "#e05c7a" },
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
const itemVariants: Variants = {
  hidden: { opacity: 0, x: -10 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.04, duration: 0.28, ease: "easeOut" },
  }),
};

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
  const [collapsed, setCollapsed] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchesToday, setSearchesToday] = useState(0);
  const [searchesThisMonth, setSearchesThisMonth] = useState(0);

  const plan = session?.user?.plan ?? "free";
  const isFree = plan === "free";
  const isStudent = plan === "student";
  const isPro = plan === "pro";
  const planLabel = isPro ? "Pro" : isStudent ? "Student" : "Free";

  const fetchSidebar = useCallback(() => {
    if (!session?.user?.email) return;
    fetch("/api/sidebar")
      .then((r) => r.json())
      .then(
        (d: {
          conversations?: Conversation[];
          searchesToday?: number;
          searchesThisMonth?: number;
        }) => {
          setConversations(d.conversations ?? []);
          setSearchesToday(d.searchesToday ?? 0);
          setSearchesThisMonth(d.searchesThisMonth ?? 0);
        },
      )
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

  const counter = isFree
    ? { used: searchesToday, max: 5, warn: 4, period: "today" }
    : isStudent
      ? { used: searchesThisMonth, max: 500, warn: 450, period: "this month" }
      : null;

  const grouped = groupConversations(conversations);

  return (
    <motion.aside
      initial={{ width: 260 }}
      animate={{ width: collapsed ? 60 : 260 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="sidebar-inner"
      style={{ height: "100%", minHeight: "100vh", overflowX: "hidden" }}
    >
      {/* Header */}
      <div className="sidebar-header">
        <motion.span
          animate={{
            opacity: collapsed ? 0 : 1,
            width: collapsed ? 0 : "auto",
          }}
          transition={{ duration: 0.2 }}
          className="sidebar-brand"
          style={{ overflow: "hidden", whiteSpace: "nowrap" }}
        >
          Researchly
        </motion.span>
        <button
          onClick={() => {
            setCollapsed((c) => !c);
            onClose?.();
          }}
          className="icon-btn"
          style={{ flexShrink: 0 }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <AlignLeft size={15} />
        </button>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {/* New chat */}
        <motion.button
          custom={0}
          initial="hidden"
          animate="visible"
          variants={itemVariants}
          onClick={() => {
            onNewSearch?.();
            onClose?.();
          }}
          className="sidebar-nav-btn"
          style={{ color: "#8a8a8a" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "#1f1f1f";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "";
          }}
        >
          <span className="sidebar-new-circle" style={{ flexShrink: 0 }}>
            <Plus size={10} />
          </span>
          <motion.span
            animate={{
              opacity: collapsed ? 0 : 1,
              width: collapsed ? 0 : "auto",
            }}
            transition={{ duration: 0.18 }}
            style={{
              overflow: "hidden",
              whiteSpace: "nowrap",
              fontSize: 13.5,
              fontWeight: 300,
            }}
          >
            New Research
          </motion.span>
        </motion.button>

        {NAV.map(({ href, label, icon: Icon, color }, i) => {
          const isActive = path === href;
          return (
            <motion.div
              key={href}
              custom={i + 1}
              initial="hidden"
              animate="visible"
              variants={itemVariants}
            >
              <Link
                href={href}
                onClick={onClose}
                className={`sidebar-nav-btn${isActive ? " active" : ""}`}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 24,
                    height: 24,
                    borderRadius: 7,
                    background: isActive
                      ? `${color}20`
                      : `${color}10`,
                    flexShrink: 0,
                    transition: "all 0.2s",
                  }}
                >
                  <Icon
                    size={13}
                    style={{
                      color: isActive ? color : `${color}bb`,
                      transition: "color 0.2s",
                    }}
                  />
                </span>
                <motion.span
                  animate={{
                    opacity: collapsed ? 0 : 1,
                    width: collapsed ? 0 : "auto",
                  }}
                  transition={{ duration: 0.18 }}
                  style={{ overflow: "hidden", whiteSpace: "nowrap" }}
                >
                  {label}
                </motion.span>
              </Link>
            </motion.div>
          );
        })}
      </nav>

      {/* Usage counter */}
      {!collapsed && session && counter && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="usage-counter"
        >
          <div className="usage-counter-top">
            <span className="usage-counter-label">
              {isFree ? "Daily" : "Monthly"} Searches
            </span>
            <span
              className={`usage-counter-num${counter.used >= counter.max ? " limit" : counter.used >= counter.warn ? " warn" : ""}`}
            >
              {counter.used} / {counter.max}
            </span>
          </div>
          <div className="usage-bar">
            <div
              className={`usage-bar-fill${counter.used >= counter.max ? " limit" : counter.used >= counter.warn ? " warn" : ""}`}
              style={{
                width: `${Math.min((counter.used / counter.max) * 100, 100)}%`,
              }}
            />
          </div>
          <p className="usage-hint">
            {counter.used >= counter.max ? (
              <>
                <span style={{ color: "#e06060" }}>Limit reached</span> ·{" "}
                <Link
                  href="/pricing"
                  onClick={onClose}
                  style={{ color: "#c9b99a" }}
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
                  style={{ color: "#555" }}
                >
                  Upgrade
                </Link>
              </>
            )}
          </p>
        </motion.div>
      )}

      {/* Sign-in promo for guests */}
      {!collapsed && !session && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="sidebar-signin-promo"
        >
          <p>
            Sign in free to save your research history and access it from any
            device.
          </p>
          <button onClick={() => void signIn()} className="signin-promo-btn">
            Sign In Free
          </button>
        </motion.div>
      )}

      {/* Conversation history */}
      {!collapsed && session && grouped.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.3 }}
          style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}
        >
          <p className="sidebar-section-label">Recents</p>
          {grouped.map((group) => (
            <div key={group.label} style={{ marginBottom: 12 }}>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#444",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "0 4px",
                  marginBottom: 2,
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
                    onClick={() => {
                      router.push(`/chat/${conv._id}`);
                      onClose?.();
                    }}
                    title={conv.title}
                    className={`sidebar-history-btn${isActive ? " active" : ""}`}
                  >
                    {conv.title}
                  </button>
                );
              })}
            </div>
          ))}
        </motion.div>
      )}

      {/* Footer */}
      <div className="sidebar-footer">
        {session ? (
          <>
            <div className="sidebar-avatar" style={{ flexShrink: 0 }}>
              {session.user?.image ? (
                <Image
                  src={session.user.image}
                  alt="avatar"
                  width={32}
                  height={32}
                  style={{ borderRadius: "50%" }}
                />
              ) : (
                <span>{(session.user?.name?.[0] ?? "U").toUpperCase()}</span>
              )}
            </div>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                style={{ flex: 1, minWidth: 0 }}
              >
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#e8e3dc",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {session.user?.name ?? "Researcher"}
                </p>
                <p style={{ fontSize: 11, color: "#555", fontWeight: 300 }}>
                  {planLabel} plan
                </p>
              </motion.div>
            )}
            {!collapsed && (
              <div style={{ display: "flex", gap: 2 }}>
                {isPro && <Crown size={13} color="#c9b99a" />}
                {isStudent && <Sparkles size={13} color="#c9b99a" />}
                <button
                  onClick={() => void signOut()}
                  className="icon-btn"
                  title="Sign out"
                >
                  <LogOut size={13} />
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="sidebar-avatar" style={{ flexShrink: 0 }}>
              <LogIn size={14} color="#6b6b6b" />
            </div>
            {!collapsed && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => void signIn()}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "#6b6b6b",
                  fontWeight: 300,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  textAlign: "left",
                }}
              >
                Sign in to save history
              </motion.button>
            )}
          </>
        )}
      </div>
    </motion.aside>
  );
}
