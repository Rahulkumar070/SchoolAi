"use client";
import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import toast from "react-hot-toast";
import {
  Users,
  TrendingUp,
  DollarSign,
  Database,
  MessageSquare,
  ThumbsDown,
  ThumbsUp,
  Search,
  Trash2,
  Edit2,
  Send,
  RefreshCw,
  Shield,
  Bell,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  AlertTriangle,
  Info,
  Zap,
  Crown,
  Sparkles,
  Activity,
  BookOpen,
} from "lucide-react";

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "rk035199@gmail.com";

// ── Types ─────────────────────────────────────────────────────
interface Stats {
  users: {
    total: number;
    free: number;
    student: number;
    pro: number;
    newToday: number;
    newThisWeek: number;
    activeToday: number;
    activeThisMonth: number;
  };
  revenue: { estimated: number; student: number; pro: number };
  feedback: { thumbsUp: number; thumbsDown: number; satisfactionRate: number };
  cache: {
    count: number;
    topQueries: { originalQuery: string; usageCount: number }[];
  };
  subscriptions: { cancelled: number; halted: number };
  recentComplaints: { query: string; userId: string; createdAt: string }[];
}
interface User {
  _id: string;
  email: string;
  name?: string;
  image?: string;
  plan: string;
  subscriptionStatus?: string;
  planExpiresAt?: string;
  searchesToday?: number;
  searchesThisMonth?: number;
  lastActiveAt?: string;
  createdAt?: string;
}

// ── Helpers ───────────────────────────────────────────────────
function timeAgo(d?: string) {
  if (!d) return "—";
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function fmt(n: number) {
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n}`;
}

// ── Stat Card ─────────────────────────────────────────────────
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: any;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div
      style={{
        padding: "18px 20px",
        borderRadius: 14,
        background: "var(--bg-raised)",
        border: "1px solid var(--border)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -10,
          right: -10,
          width: 60,
          height: 60,
          borderRadius: "50%",
          background: `${color}12`,
          filter: "blur(12px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: `${color}15`,
            border: `1px solid ${color}25`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={15} style={{ color }} />
        </div>
        {sub && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#5db87a",
              background: "rgba(93,184,122,.1)",
              border: "1px solid rgba(93,184,122,.2)",
              padding: "2px 8px",
              borderRadius: 99,
            }}
          >
            {sub}
          </span>
        )}
      </div>
      <p
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: "var(--text-primary)",
          letterSpacing: "-1.5px",
          lineHeight: 1,
          marginBottom: 4,
        }}
      >
        {value}
      </p>
      <p style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{label}</p>
    </div>
  );
}

// ── Plan Badge ────────────────────────────────────────────────
function PlanBadge({ plan }: { plan: string }) {
  const cfg: Record<string, { color: string; bg: string; icon: any }> = {
    free: { color: "var(--text-muted)", bg: "var(--surface)", icon: Zap },
    student: { color: "#c9b99a", bg: "rgba(201,185,154,.1)", icon: Sparkles },
    pro: { color: "#7ea8c9", bg: "rgba(126,168,201,.1)", icon: Crown },
  };
  const c = cfg[plan] ?? cfg.free;
  const Icon = c.icon;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10.5,
        fontWeight: 700,
        color: c.color,
        background: c.bg,
        padding: "2px 8px",
        borderRadius: 99,
        border: `1px solid ${c.color}25`,
      }}
    >
      <Icon size={9} /> {plan}
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [tab, setTab] = useState<
    "overview" | "users" | "broadcast" | "cache" | "feedback"
  >("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Users state
  const [users, setUsers] = useState<User[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [userPages, setUserPages] = useState(1);
  const [userSearch, setUserSearch] = useState("");
  const [userPlanFilter, setUserPlanFilter] = useState("all");
  const [usersLoading, setUsersLoading] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editPlan, setEditPlan] = useState("free");

  // Broadcast state
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [bTitle, setBTitle] = useState("");
  const [bMessage, setBMessage] = useState("");
  const [bTarget, setBTarget] = useState("all");
  const [bType, setBType] = useState("info");
  const [bDays, setBDays] = useState(7);
  const [bSending, setBSending] = useState(false);
  const [bHistory, setBHistory] = useState<any[]>([]);

  // ── Auth guard ─────────────────────────────────────────────
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
      return;
    }
    if (status === "authenticated" && session?.user?.email !== ADMIN_EMAIL)
      router.push("/search");
  }, [status, session]);

  // ── Load stats ─────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const r = await fetch("/api/admin/stats");
      const d = await r.json();
      setStats(d);
    } catch {
      toast.error("Failed to load stats");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.email === ADMIN_EMAIL)
      loadStats();
  }, [status]);

  // ── Load users ─────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams({
        search: userSearch,
        plan: userPlanFilter,
        page: String(userPage),
      });
      const r = await fetch(`/api/admin/users?${params}`);
      const d = await r.json();
      setUsers(d.users ?? []);
      setUserTotal(d.total ?? 0);
      setUserPages(d.pages ?? 1);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }, [userSearch, userPlanFilter, userPage]);

  useEffect(() => {
    if (tab === "users") loadUsers();
  }, [tab, userPage, userPlanFilter]);

  // ── Load broadcasts ────────────────────────────────────────
  const loadBroadcasts = useCallback(async () => {
    const r = await fetch("/api/admin/broadcast");
    const d = await r.json();
    setBHistory(d.broadcasts ?? []);
  }, []);

  useEffect(() => {
    if (tab === "broadcast") loadBroadcasts();
  }, [tab]);

  // ── Actions ───────────────────────────────────────────────
  const updatePlan = async () => {
    if (!editingUser) return;
    const r = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: editingUser.email, plan: editPlan }),
    });
    if ((await r.json()).ok) {
      toast.success("Plan updated!");
      setEditingUser(null);
      loadUsers();
    } else toast.error("Failed to update");
  };

  const deleteUser = async (email: string) => {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    const r = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if ((await r.json()).ok) {
      toast.success("User deleted");
      loadUsers();
    } else toast.error("Failed to delete");
  };

  const sendBroadcast = async () => {
    if (!bTitle.trim() || !bMessage.trim()) {
      toast.error("Title and message required");
      return;
    }
    setBSending(true);
    try {
      const r = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: bTitle,
          message: bMessage,
          targetPlan: bTarget,
          type: bType,
          expiresInDays: bDays,
        }),
      });
      if ((await r.json()).ok) {
        toast.success("Broadcast sent!");
        setBTitle("");
        setBMessage("");
        loadBroadcasts();
      } else toast.error("Failed to send");
    } finally {
      setBSending(false);
    }
  };

  const deleteBroadcast = async (id: string) => {
    await fetch("/api/admin/broadcast", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    toast.success("Broadcast deactivated");
    loadBroadcasts();
  };

  const clearCache = async () => {
    if (!confirm("Clear all cached search results?")) return;
    toast.success(
      "Cache clear would run here — implement DELETE /api/admin/cache",
    );
  };

  if (status === "loading" || status === "unauthenticated") return null;
  if (session?.user?.email !== ADMIN_EMAIL) return null;

  const TABS = [
    { id: "overview", label: "Overview", icon: BarChart2 },
    { id: "users", label: "Users", icon: Users },
    { id: "broadcast", label: "Broadcast", icon: Bell },
    { id: "feedback", label: "Feedback", icon: MessageSquare },
    { id: "cache", label: "Cache", icon: Database },
  ] as const;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg, #0f0f0f)",
        color: "var(--text-primary)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          padding: "14px 28px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-raised)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: "var(--brand)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Shield size={15} style={{ color: "var(--brand-fg, #000)" }} />
          </div>
          <div>
            <h1
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              Admin Panel
            </h1>
            <p
              style={{ fontSize: 10.5, color: "var(--text-faint)", margin: 0 }}
            >
              Researchly Control Center
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={loadStats}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 8,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <RefreshCw size={12} /> Refresh
          </button>
          <a
            href="/search"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 8,
              background: "var(--brand)",
              color: "var(--brand-fg, #000)",
              fontSize: 12,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            <BookOpen size={12} /> Back to App
          </a>
        </div>
      </header>

      <div
        style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 24px 60px" }}
      >
        {/* ── Tab bar ── */}
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 28,
            borderBottom: "1px solid var(--border)",
            paddingBottom: 0,
          }}
        >
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id as any)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "10px 16px",
                background: "transparent",
                border: "none",
                borderBottom:
                  tab === id
                    ? "2px solid var(--brand)"
                    : "2px solid transparent",
                color: tab === id ? "var(--text-primary)" : "var(--text-muted)",
                fontSize: 13,
                fontWeight: tab === id ? 600 : 400,
                cursor: "pointer",
                fontFamily: "inherit",
                marginBottom: -1,
                transition: "color .14s",
              }}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════
            TAB: OVERVIEW
        ══════════════════════════════════════════ */}
        {tab === "overview" && (
          <div>
            {statsLoading ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "60px 0",
                  color: "var(--text-faint)",
                }}
              >
                Loading stats…
              </div>
            ) : stats ? (
              <>
                {/* Stats grid */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: 14,
                    marginBottom: 28,
                  }}
                >
                  <StatCard
                    icon={Users}
                    label="Total Users"
                    value={stats.users.total}
                    sub={`+${stats.users.newToday} today`}
                    color="#5c9ae0"
                  />
                  <StatCard
                    icon={Activity}
                    label="Active Today"
                    value={stats.users.activeToday}
                    sub={`${stats.users.activeThisMonth} this month`}
                    color="#5db87a"
                  />
                  <StatCard
                    icon={DollarSign}
                    label="Est. Revenue / mo"
                    value={fmt(stats.revenue.estimated)}
                    color="#e8a045"
                  />
                  <StatCard
                    icon={Database}
                    label="Cached Queries"
                    value={stats.cache.count}
                    color="#ad73e0"
                  />
                  <StatCard
                    icon={ThumbsUp}
                    label="Satisfaction Rate"
                    value={`${stats.feedback.satisfactionRate}%`}
                    color="#5db87a"
                  />
                  <StatCard
                    icon={TrendingUp}
                    label="New This Week"
                    value={stats.users.newThisWeek}
                    color="#5c9ae0"
                  />
                </div>

                {/* Plan breakdown */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 16,
                    marginBottom: 24,
                  }}
                >
                  {/* Plan distribution */}
                  <div
                    style={{
                      padding: "20px 22px",
                      borderRadius: 14,
                      background: "var(--bg-raised)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <h3
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        marginBottom: 16,
                        letterSpacing: "-.01em",
                      }}
                    >
                      Plan Distribution
                    </h3>
                    {[
                      {
                        plan: "Free",
                        count: stats.users.free,
                        color: "var(--text-muted)",
                        pct: Math.round(
                          (stats.users.free / stats.users.total) * 100,
                        ),
                      },
                      {
                        plan: "Student",
                        count: stats.users.student,
                        color: "#c9b99a",
                        pct: Math.round(
                          (stats.users.student / stats.users.total) * 100,
                        ),
                      },
                      {
                        plan: "Pro",
                        count: stats.users.pro,
                        color: "#7ea8c9",
                        pct: Math.round(
                          (stats.users.pro / stats.users.total) * 100,
                        ),
                      },
                    ].map((r) => (
                      <div key={r.plan} style={{ marginBottom: 12 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 5,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12.5,
                              color: "var(--text-secondary)",
                            }}
                          >
                            {r.plan}
                          </span>
                          <span
                            style={{
                              fontSize: 12.5,
                              fontWeight: 600,
                              color: "var(--text-primary)",
                            }}
                          >
                            {r.count}{" "}
                            <span
                              style={{
                                color: "var(--text-faint)",
                                fontWeight: 400,
                              }}
                            >
                              ({r.pct}%)
                            </span>
                          </span>
                        </div>
                        <div
                          style={{
                            height: 5,
                            background: "var(--surface)",
                            borderRadius: 99,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${r.pct}%`,
                              background: r.color,
                              borderRadius: 99,
                              transition: "width .6s ease",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Revenue breakdown */}
                  <div
                    style={{
                      padding: "20px 22px",
                      borderRadius: 14,
                      background: "var(--bg-raised)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <h3
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        marginBottom: 16,
                        letterSpacing: "-.01em",
                      }}
                    >
                      Revenue Estimate
                    </h3>
                    {[
                      {
                        label: "Student (₹199 × " + stats.users.student + ")",
                        value: fmt(stats.revenue.student),
                        color: "#c9b99a",
                      },
                      {
                        label: "Pro (₹499 × " + stats.users.pro + ")",
                        value: fmt(stats.revenue.pro),
                        color: "#7ea8c9",
                      },
                      {
                        label: "Total Monthly",
                        value: fmt(stats.revenue.estimated),
                        color: "#e8a045",
                      },
                    ].map((r) => (
                      <div
                        key={r.label}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 0",
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12.5,
                            color: "var(--text-secondary)",
                          }}
                        >
                          {r.label}
                        </span>
                        <span
                          style={{
                            fontSize: 15,
                            fontWeight: 700,
                            color: r.color,
                            letterSpacing: "-0.5px",
                          }}
                        >
                          {r.value}
                        </span>
                      </div>
                    ))}
                    <div
                      style={{
                        marginTop: 12,
                        fontSize: 10.5,
                        color: "var(--text-faint)",
                      }}
                    >
                      * Based on active paid users count
                    </div>
                  </div>
                </div>

                {/* Top queries + recent complaints */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 16,
                  }}
                >
                  <div
                    style={{
                      padding: "20px 22px",
                      borderRadius: 14,
                      background: "var(--bg-raised)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <h3
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        marginBottom: 14,
                      }}
                    >
                      🔥 Top Cached Queries
                    </h3>
                    {stats.cache.topQueries.map((q, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 0",
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "var(--brand)",
                            width: 18,
                          }}
                        >
                          #{i + 1}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            fontSize: 12,
                            color: "var(--text-secondary)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {q.originalQuery}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "var(--text-muted)",
                            flexShrink: 0,
                          }}
                        >
                          {q.usageCount}×
                        </span>
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      padding: "20px 22px",
                      borderRadius: 14,
                      background: "var(--bg-raised)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <h3
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        marginBottom: 14,
                      }}
                    >
                      👎 Recent Complaints
                    </h3>
                    {stats.recentComplaints.length === 0 ? (
                      <p
                        style={{
                          fontSize: 12,
                          color: "var(--text-faint)",
                          textAlign: "center",
                          padding: "20px 0",
                        }}
                      >
                        No complaints 🎉
                      </p>
                    ) : (
                      stats.recentComplaints.slice(0, 8).map((c, i) => (
                        <div
                          key={i}
                          style={{
                            padding: "8px 0",
                            borderBottom: "1px solid var(--border)",
                          }}
                        >
                          <p
                            style={{
                              fontSize: 12,
                              color: "var(--text-secondary)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              marginBottom: 2,
                            }}
                          >
                            {c.query}
                          </p>
                          <p
                            style={{
                              fontSize: 10.5,
                              color: "var(--text-faint)",
                            }}
                          >
                            {c.userId} · {timeAgo(c.createdAt)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ══════════════════════════════════════════
            TAB: USERS
        ══════════════════════════════════════════ */}
        {tab === "users" && (
          <div>
            {/* Filters */}
            <div
              style={{
                display: "flex",
                gap: 10,
                marginBottom: 18,
                flexWrap: "wrap",
              }}
            >
              <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
                <Search
                  size={13}
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-faint)",
                    pointerEvents: "none",
                  }}
                />
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadUsers()}
                  placeholder="Search by email…"
                  style={{
                    width: "100%",
                    paddingLeft: 32,
                    paddingRight: 12,
                    paddingTop: 9,
                    paddingBottom: 9,
                    background: "var(--bg-raised)",
                    border: "1px solid var(--border)",
                    borderRadius: 9,
                    fontSize: 13,
                    color: "var(--text-primary)",
                    fontFamily: "inherit",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              {["all", "free", "student", "pro"].map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setUserPlanFilter(p);
                    setUserPage(1);
                  }}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    background:
                      userPlanFilter === p ? "var(--brand)" : "var(--surface)",
                    color:
                      userPlanFilter === p
                        ? "var(--brand-fg, #000)"
                        : "var(--text-muted)",
                    border:
                      userPlanFilter === p
                        ? "1px solid var(--brand)"
                        : "1px solid var(--border)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textTransform: "capitalize",
                  }}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={loadUsers}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Search size={12} /> Search
              </button>
            </div>

            <p
              style={{
                fontSize: 12,
                color: "var(--text-faint)",
                marginBottom: 12,
              }}
            >
              {userTotal} users found
            </p>

            {/* User table */}
            <div
              style={{
                borderRadius: 12,
                border: "1px solid var(--border)",
                overflow: "hidden",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "var(--surface)",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    {[
                      "User",
                      "Plan",
                      "Searches",
                      "Last Active",
                      "Joined",
                      "Actions",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "10px 14px",
                          textAlign: "left",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "var(--text-muted)",
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usersLoading ? (
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          padding: "40px",
                          textAlign: "center",
                          color: "var(--text-faint)",
                        }}
                      >
                        Loading…
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr
                        key={u._id}
                        style={{ borderBottom: "1px solid var(--border)" }}
                        onMouseEnter={(e) =>
                          ((e.currentTarget as HTMLElement).style.background =
                            "var(--surface)")
                        }
                        onMouseLeave={(e) =>
                          ((e.currentTarget as HTMLElement).style.background =
                            "transparent")
                        }
                      >
                        <td style={{ padding: "12px 14px" }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            {u.image ? (
                              <Image
                                src={u.image}
                                alt=""
                                width={28}
                                height={28}
                                style={{ borderRadius: "50%" }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: "50%",
                                  background: "var(--surface-2)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: "var(--text-muted)",
                                }}
                              >
                                {(u.name?.[0] ?? u.email[0]).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <p
                                style={{
                                  fontSize: 12.5,
                                  fontWeight: 600,
                                  color: "var(--text-primary)",
                                  margin: 0,
                                }}
                              >
                                {u.name ?? "—"}
                              </p>
                              <p
                                style={{
                                  fontSize: 11,
                                  color: "var(--text-faint)",
                                  margin: 0,
                                }}
                              >
                                {u.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <PlanBadge plan={u.plan} />
                        </td>
                        <td
                          style={{
                            padding: "12px 14px",
                            color: "var(--text-secondary)",
                            fontSize: 12,
                          }}
                        >
                          {u.plan === "free"
                            ? `${u.searchesToday ?? 0}/day`
                            : `${u.searchesThisMonth ?? 0}/mo`}
                        </td>
                        <td
                          style={{
                            padding: "12px 14px",
                            color: "var(--text-muted)",
                            fontSize: 12,
                          }}
                        >
                          {timeAgo(u.lastActiveAt)}
                        </td>
                        <td
                          style={{
                            padding: "12px 14px",
                            color: "var(--text-muted)",
                            fontSize: 12,
                          }}
                        >
                          {u.createdAt
                            ? new Date(u.createdAt).toLocaleDateString("en-IN")
                            : "—"}
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              onClick={() => {
                                setEditingUser(u);
                                setEditPlan(u.plan);
                              }}
                              style={{
                                padding: "5px 10px",
                                borderRadius: 7,
                                background: "var(--surface)",
                                border: "1px solid var(--border)",
                                color: "var(--text-muted)",
                                fontSize: 11,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                fontFamily: "inherit",
                              }}
                            >
                              <Edit2 size={10} /> Edit
                            </button>
                            <button
                              onClick={() => deleteUser(u.email)}
                              style={{
                                padding: "5px 10px",
                                borderRadius: 7,
                                background: "rgba(224,92,92,.08)",
                                border: "1px solid rgba(224,92,92,.2)",
                                color: "var(--red, #e05c5c)",
                                fontSize: 11,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                fontFamily: "inherit",
                              }}
                            >
                              <Trash2 size={10} /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                marginTop: 16,
              }}
            >
              <button
                onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                disabled={userPage === 1}
                style={{
                  padding: "7px 12px",
                  borderRadius: 8,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                  cursor: userPage === 1 ? "not-allowed" : "pointer",
                  opacity: userPage === 1 ? 0.4 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  fontFamily: "inherit",
                }}
              >
                <ChevronLeft size={13} /> Prev
              </button>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Page {userPage} of {userPages}
              </span>
              <button
                onClick={() => setUserPage((p) => Math.min(userPages, p + 1))}
                disabled={userPage === userPages}
                style={{
                  padding: "7px 12px",
                  borderRadius: 8,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                  cursor: userPage === userPages ? "not-allowed" : "pointer",
                  opacity: userPage === userPages ? 0.4 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  fontFamily: "inherit",
                }}
              >
                Next <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            TAB: BROADCAST
        ══════════════════════════════════════════ */}
        {tab === "broadcast" && (
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}
          >
            {/* Compose */}
            <div
              style={{
                padding: "22px 24px",
                borderRadius: 14,
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
              }}
            >
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  marginBottom: 18,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Send size={14} style={{ color: "var(--brand)" }} /> Compose
                Broadcast
              </h3>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  display: "block",
                  marginBottom: 6,
                }}
              >
                Title
              </label>
              <input
                value={bTitle}
                onChange={(e) => setBTitle(e.target.value)}
                placeholder="e.g. New feature: Research Gaps!"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "var(--text-primary)",
                  fontFamily: "inherit",
                  outline: "none",
                  marginBottom: 14,
                  boxSizing: "border-box",
                }}
              />

              <label
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  display: "block",
                  marginBottom: 6,
                }}
              >
                Message
              </label>
              <textarea
                value={bMessage}
                onChange={(e) => setBMessage(e.target.value)}
                placeholder="Write your message to users…"
                rows={4}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "var(--text-primary)",
                  fontFamily: "inherit",
                  outline: "none",
                  resize: "vertical",
                  marginBottom: 14,
                  boxSizing: "border-box",
                }}
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    Target Plan
                  </label>
                  <select
                    value={bTarget}
                    onChange={(e) => setBTarget(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--text-primary)",
                      fontFamily: "inherit",
                      outline: "none",
                    }}
                  >
                    <option value="all">All Users</option>
                    <option value="free">Free Only</option>
                    <option value="student">Student Only</option>
                    <option value="pro">Pro Only</option>
                  </select>
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    Type
                  </label>
                  <select
                    value={bType}
                    onChange={(e) => setBType(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--text-primary)",
                      fontFamily: "inherit",
                      outline: "none",
                    }}
                  >
                    <option value="info">ℹ️ Info</option>
                    <option value="success">✅ Success</option>
                    <option value="warning">⚠️ Warning</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Expires in (days)
                </label>
                <input
                  type="number"
                  value={bDays}
                  onChange={(e) => setBDays(Number(e.target.value))}
                  min={1}
                  max={30}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--text-primary)",
                    fontFamily: "inherit",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <button
                onClick={sendBroadcast}
                disabled={bSending}
                style={{
                  width: "100%",
                  padding: "11px",
                  borderRadius: 10,
                  background: "var(--brand)",
                  color: "var(--brand-fg, #000)",
                  border: "none",
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: bSending ? "not-allowed" : "pointer",
                  opacity: bSending ? 0.6 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  fontFamily: "inherit",
                }}
              >
                <Send size={13} /> {bSending ? "Sending…" : "Send Broadcast"}
              </button>
            </div>

            {/* History */}
            <div
              style={{
                padding: "22px 24px",
                borderRadius: 14,
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
              }}
            >
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  marginBottom: 18,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Bell size={14} style={{ color: "var(--brand)" }} /> Active
                Broadcasts
              </h3>
              {bHistory.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <Bell
                    size={28}
                    style={{
                      color: "var(--text-faint)",
                      display: "block",
                      margin: "0 auto 12px",
                      opacity: 0.4,
                    }}
                  />
                  <p style={{ fontSize: 13, color: "var(--text-faint)" }}>
                    No active broadcasts
                  </p>
                </div>
              ) : (
                bHistory.map((b: any) => {
                  const typeColor: Record<string, string> = {
                    info: "#5c9ae0",
                    success: "#5db87a",
                    warning: "#e8a045",
                  };
                  return (
                    <div
                      key={b._id}
                      style={{
                        padding: "14px",
                        borderRadius: 10,
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        marginBottom: 10,
                        position: "relative",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 6,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: typeColor[b.type] ?? "#5c9ae0",
                            background: `${typeColor[b.type] ?? "#5c9ae0"}15`,
                            padding: "2px 8px",
                            borderRadius: 99,
                          }}
                        >
                          {b.type?.toUpperCase()}
                        </span>
                        <span
                          style={{
                            fontSize: 11.5,
                            fontWeight: 600,
                            color: "var(--text-primary)",
                          }}
                        >
                          {b.title}
                        </span>
                      </div>
                      <p
                        style={{
                          fontSize: 12,
                          color: "var(--text-secondary)",
                          margin: "0 0 8px",
                          lineHeight: 1.5,
                        }}
                      >
                        {b.message}
                      </p>
                      <button
                        onClick={() => deleteBroadcast(b._id)}
                        style={{
                          position: "absolute",
                          top: 10,
                          right: 10,
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--text-faint)",
                          padding: 4,
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            TAB: FEEDBACK
        ══════════════════════════════════════════ */}
        {tab === "feedback" && (
          <div>
            {statsLoading ? (
              <p
                style={{
                  color: "var(--text-faint)",
                  textAlign: "center",
                  padding: "40px 0",
                }}
              >
                Loading…
              </p>
            ) : stats ? (
              <>
                {/* Summary */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3,1fr)",
                    gap: 14,
                    marginBottom: 24,
                  }}
                >
                  <StatCard
                    icon={ThumbsUp}
                    label="Positive Feedback"
                    value={stats.feedback.thumbsUp}
                    color="#5db87a"
                  />
                  <StatCard
                    icon={ThumbsDown}
                    label="Negative Feedback"
                    value={stats.feedback.thumbsDown}
                    color="#e05c5c"
                  />
                  <StatCard
                    icon={Activity}
                    label="Satisfaction Rate"
                    value={`${stats.feedback.satisfactionRate}%`}
                    color="#5c9ae0"
                    sub={
                      stats.feedback.satisfactionRate >= 80
                        ? "Good"
                        : "Needs work"
                    }
                  />
                </div>

                {/* Complaints list */}
                <div
                  style={{
                    padding: "20px 22px",
                    borderRadius: 14,
                    background: "var(--bg-raised)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <h3
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      marginBottom: 16,
                    }}
                  >
                    👎 All Negative Feedback
                  </h3>
                  {stats.recentComplaints.length === 0 ? (
                    <p
                      style={{
                        fontSize: 13,
                        color: "var(--text-faint)",
                        textAlign: "center",
                        padding: "20px 0",
                      }}
                    >
                      No complaints — you're doing great! 🎉
                    </p>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      {stats.recentComplaints.map((c, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            gap: 12,
                            padding: "12px 14px",
                            background: "var(--surface)",
                            borderRadius: 10,
                            border: "1px solid var(--border)",
                          }}
                        >
                          <ThumbsDown
                            size={13}
                            style={{
                              color: "#e05c5c",
                              flexShrink: 0,
                              marginTop: 2,
                            }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p
                              style={{
                                fontSize: 13,
                                color: "var(--text-primary)",
                                margin: "0 0 3px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {c.query}
                            </p>
                            <p
                              style={{
                                fontSize: 10.5,
                                color: "var(--text-faint)",
                                margin: 0,
                              }}
                            >
                              {c.userId} · {timeAgo(c.createdAt)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ══════════════════════════════════════════
            TAB: CACHE
        ══════════════════════════════════════════ */}
        {tab === "cache" && (
          <div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              {/* Cache stats */}
              <div
                style={{
                  padding: "22px 24px",
                  borderRadius: 14,
                  background: "var(--bg-raised)",
                  border: "1px solid var(--border)",
                }}
              >
                <h3
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    marginBottom: 18,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Database size={14} style={{ color: "var(--brand)" }} /> Cache
                  Status
                </h3>
                <div
                  style={{
                    padding: "14px 16px",
                    background: "var(--surface)",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    marginBottom: 14,
                  }}
                >
                  <p
                    style={{
                      fontSize: 28,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      letterSpacing: "-1.5px",
                      margin: "0 0 4px",
                    }}
                  >
                    {stats?.cache.count ?? "—"}
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      margin: 0,
                    }}
                  >
                    Cached queries (60-day TTL)
                  </p>
                </div>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--text-secondary)",
                    lineHeight: 1.6,
                    marginBottom: 18,
                  }}
                >
                  Cache stores AI answers for 60 days (7 days for time-sensitive
                  queries). Clearing it forces fresh AI generation for all
                  queries.
                </p>
                <button
                  onClick={clearCache}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "10px 18px",
                    borderRadius: 9,
                    background: "rgba(224,92,92,.1)",
                    border: "1px solid rgba(224,92,92,.25)",
                    color: "#e05c5c",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <Trash2 size={13} /> Clear All Cache
                </button>
              </div>

              {/* Top queries */}
              <div
                style={{
                  padding: "22px 24px",
                  borderRadius: 14,
                  background: "var(--bg-raised)",
                  border: "1px solid var(--border)",
                }}
              >
                <h3
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    marginBottom: 18,
                  }}
                >
                  🔥 Top Queries by Usage
                </h3>
                {(stats?.cache.topQueries ?? []).map((q, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "9px 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--brand)",
                        width: 22,
                        flexShrink: 0,
                      }}
                    >
                      #{i + 1}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        fontSize: 12.5,
                        color: "var(--text-secondary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {q.originalQuery}
                    </span>
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        color: "#5db87a",
                        flexShrink: 0,
                        background: "rgba(93,184,122,.1)",
                        padding: "2px 7px",
                        borderRadius: 99,
                      }}
                    >
                      {q.usageCount}×
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Edit User Modal ── */}
      {editingUser && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.75)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setEditingUser(null)}
        >
          <div
            style={{
              maxWidth: 380,
              width: "100%",
              padding: 28,
              background: "var(--bg-raised)",
              border: "1px solid var(--border-mid)",
              borderRadius: 18,
              boxShadow: "0 32px 80px rgba(0,0,0,.6)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "var(--text-primary)",
                marginBottom: 6,
              }}
            >
              Edit User Plan
            </h3>
            <p
              style={{
                fontSize: 12.5,
                color: "var(--text-muted)",
                marginBottom: 20,
              }}
            >
              {editingUser.email}
            </p>

            <label
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                display: "block",
                marginBottom: 8,
              }}
            >
              New Plan
            </label>
            <select
              value={editPlan}
              onChange={(e) => setEditPlan(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 9,
                fontSize: 13,
                color: "var(--text-primary)",
                fontFamily: "inherit",
                outline: "none",
                marginBottom: 20,
              }}
            >
              <option value="free">Free</option>
              <option value="student">Student</option>
              <option value="pro">Pro</option>
            </select>

            <div
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <button
                onClick={() => setEditingUser(null)}
                style={{
                  padding: "9px 18px",
                  borderRadius: 9,
                  border: "1px solid var(--border-mid)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Cancel
              </button>
              <button
                onClick={updatePlan}
                style={{
                  padding: "9px 18px",
                  borderRadius: 9,
                  background: "var(--brand)",
                  color: "var(--brand-fg, #000)",
                  border: "none",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Check size={13} /> Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
