"use client";
import { useEffect, useState, useCallback, useRef } from "react";
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
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  Activity,
  BookOpen,
  ArrowUpRight,
  ArrowDownRight,
  Menu,
  Home,
  BarChart2,
} from "lucide-react";

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "rk035199@gmail.com";

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
  searchesToday?: number;
  searchesThisMonth?: number;
  lastActiveAt?: string;
  createdAt?: string;
}

function timeAgo(d?: string) {
  if (!d) return "—";
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function fmtINR(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n}`;
}

function MiniBar({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return (
    <div
      style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 32 }}
    >
      {values.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            background: i === values.length - 1 ? color : `${color}35`,
            borderRadius: 3,
            height: `${Math.max(8, (v / max) * 100)}%`,
          }}
        />
      ))}
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const cfg: Record<string, { color: string; bg: string }> = {
    free: { color: "#6b7280", bg: "#f3f4f6" },
    student: { color: "#92400e", bg: "#fef3c7" },
    pro: { color: "#1e40af", bg: "#dbeafe" },
  };
  const c = cfg[plan] ?? cfg.free;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: c.color,
        background: c.bg,
        padding: "3px 9px",
        borderRadius: 99,
        textTransform: "capitalize",
        whiteSpace: "nowrap",
      }}
    >
      {plan}
    </span>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const ok = !status || status === "active";
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: ok ? "#065f46" : "#991b1b",
        background: ok ? "#d1fae5" : "#fee2e2",
        padding: "3px 9px",
        borderRadius: 99,
        whiteSpace: "nowrap",
      }}
    >
      {ok ? "Active" : (status ?? "—")}
    </span>
  );
}

// ── Mobile User Card ─────────────────────────────────────────
function UserCard({
  u,
  onEdit,
  onDelete,
}: {
  u: User;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 14,
        border: "1px solid #f3f4f6",
        padding: "14px 16px",
        marginBottom: 10,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: "linear-gradient(135deg,#ea580c,#f97316)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 700,
            color: "#fff",
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          {u.image ? (
            <Image
              src={u.image}
              alt=""
              width={38}
              height={38}
              style={{ borderRadius: "50%" }}
            />
          ) : (
            (u.name?.[0] ?? u.email[0]).toUpperCase()
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              color: "#111827",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {u.name ?? "—"}
          </p>
          <p
            style={{
              fontSize: 11.5,
              color: "#9ca3af",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {u.email}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={onEdit}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#374151",
            }}
          >
            <Edit2 size={13} />
          </button>
          <button
            onClick={onDelete}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid #fecaca",
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#dc2626",
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <PlanBadge plan={u.plan} />
        <StatusBadge status={u.subscriptionStatus} />
        <span
          style={{
            fontSize: 11,
            color: "#9ca3af",
            background: "#f9fafb",
            padding: "3px 9px",
            borderRadius: 99,
          }}
        >
          {u.plan === "free"
            ? `${u.searchesToday ?? 0}/day`
            : `${u.searchesThisMonth ?? 0}/mo`}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "#9ca3af",
            background: "#f9fafb",
            padding: "3px 9px",
            borderRadius: 99,
          }}
        >
          Active {timeAgo(u.lastActiveAt)}
        </span>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const [tab, setTab] = useState<
    "overview" | "users" | "broadcast" | "feedback" | "cache"
  >("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [users, setUsers] = useState<User[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [userPages, setUserPages] = useState(1);
  const [userSearch, setUserSearch] = useState("");
  const [userPlanFilter, setUserPlanFilter] = useState("all");
  const [usersLoading, setUsersLoading] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editPlan, setEditPlan] = useState("free");

  const [bHistory, setBHistory] = useState<any[]>([]);
  const [bTitle, setBTitle] = useState("");
  const [bMessage, setBMessage] = useState("");
  const [bTarget, setBTarget] = useState("all");
  const [bType, setBType] = useState("info");
  const [bDays, setBDays] = useState(7);
  const [bSending, setBSending] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
      return;
    }
    if (status === "authenticated" && session?.user?.email !== ADMIN_EMAIL)
      router.push("/search");
  }, [status, session]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const r = await fetch("/api/admin/stats");
      setStats(await r.json());
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

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const p = new URLSearchParams({
        search: userSearch,
        plan: userPlanFilter,
        page: String(userPage),
      });
      const r = await fetch(`/api/admin/users?${p}`);
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

  const loadBroadcasts = useCallback(async () => {
    const r = await fetch("/api/admin/broadcast");
    const d = await r.json();
    setBHistory(d.broadcasts ?? []);
  }, []);
  useEffect(() => {
    if (tab === "broadcast") loadBroadcasts();
  }, [tab]);

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
    } else toast.error("Failed");
  };

  const deleteUser = async (email: string) => {
    if (!confirm(`Delete ${email}?`)) return;
    const r = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if ((await r.json()).ok) {
      toast.success("Deleted");
      loadUsers();
    }
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
      const d = await r.json();
      if (d.ok) {
        toast.success("Broadcast sent!");
        setBTitle("");
        setBMessage("");
        loadBroadcasts();
      } else toast.error(d.error ?? "Failed");
    } catch {
      toast.error("Network error");
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
    toast.success("Removed");
    loadBroadcasts();
  };

  if (status === "loading" || status === "unauthenticated") return null;
  if (session?.user?.email !== ADMIN_EMAIL) return null;

  const NAV_ITEMS = [
    { id: "overview", label: "Overview", icon: Home },
    { id: "users", label: "Users", icon: Users },
    { id: "broadcast", label: "Broadcast", icon: Bell },
    { id: "feedback", label: "Feedback", icon: MessageSquare },
    { id: "cache", label: "Cache", icon: Database },
  ] as const;

  const barData = [3, 7, 5, 12, 8, 15, stats?.users.newToday ?? 1];

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .adm-root {
          display: flex; min-height: 100vh;
          background: #f1f3f6;
          font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
          color: #111827;
        }

        /* ── SIDEBAR ── */
        .adm-sidebar {
          width: 230px; flex-shrink: 0;
          background: #fff; border-right: 1px solid #e5e7eb;
          display: flex; flex-direction: column;
          position: fixed; top: 0; left: 0; bottom: 0; z-index: 60;
          transition: transform 0.26s cubic-bezier(0.4,0,0.2,1);
          overflow-y: auto;
        }
        .adm-sidebar-backdrop {
          display: none; position: fixed; inset: 0;
          background: rgba(0,0,0,0.45); z-index: 59;
          backdrop-filter: blur(2px);
        }
        .adm-sidebar-logo {
          display: flex; align-items: center; gap: 10px;
          padding: 18px 18px 14px; border-bottom: 1px solid #f3f4f6; flex-shrink: 0;
        }
        .adm-logo-icon {
          width: 34px; height: 34px; border-radius: 9px;
          background: linear-gradient(135deg,#f97316,#ef4444);
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .adm-logo-text { font-size: 14.5px; font-weight: 700; color: #111827; letter-spacing: -0.02em; }
        .adm-logo-sub  { font-size: 10px; color: #9ca3af; }
        .adm-nav { flex: 1; padding: 10px 8px; }
        .adm-nav-section { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #9ca3af; padding: 8px 10px 4px; }
        .adm-nav-btn {
          display: flex; align-items: center; gap: 10px;
          width: 100%; padding: 9px 12px; border-radius: 9px;
          cursor: pointer; font-size: 13.5px; font-weight: 500;
          color: #6b7280; background: transparent; border: none;
          font-family: inherit; margin-bottom: 2px;
          transition: background 0.13s, color 0.13s;
          text-decoration: none;
        }
        .adm-nav-btn:hover { background: #f9fafb; color: #111827; }
        .adm-nav-btn.active { background: #fff7ed; color: #ea580c; font-weight: 600; }
        .adm-nav-icon { width: 30px; height: 30px; border-radius: 7px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .adm-nav-btn.active .adm-nav-icon { background: #ffedd5; }
        .adm-sidebar-foot {
          padding: 10px 14px 16px; border-top: 1px solid #f3f4f6; flex-shrink: 0;
        }
        .adm-foot-user {
          display: flex; align-items: center; gap: 9px; padding: 8px 8px;
          border-radius: 10px; cursor: default;
        }
        .adm-foot-user:hover { background: #f9fafb; }
        .adm-avatar {
          width: 32px; height: 32px; border-radius: "50%"; overflow: hidden;
          background: linear-gradient(135deg,#f97316,#ef4444);
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 700; color: #fff; flex-shrink: 0;
          border-radius: 50%;
        }

        /* ── MAIN ── */
        .adm-main { flex: 1; margin-left: 230px; display: flex; flex-direction: column; min-height: 100vh; }

        /* ── TOPBAR ── */
        .adm-topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 24px; background: #fff; border-bottom: 1px solid #e5e7eb;
          position: sticky; top: 0; z-index: 40; gap: 12px;
        }
        .adm-topbar-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .adm-hamburger {
          display: none; width: 34px; height: 34px; border-radius: 8px;
          border: 1px solid #e5e7eb; background: #fff;
          align-items: center; justify-content: center;
          cursor: pointer; color: #6b7280; flex-shrink: 0;
        }
        .adm-page-title { font-size: 17px; font-weight: 700; color: #111827; letter-spacing: -0.02em; white-space: nowrap; }
        .adm-topbar-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .adm-tb-btn {
          display: flex; align-items: center; gap: 5px;
          padding: 7px 13px; border-radius: 8px;
          border: 1px solid #e5e7eb; background: #fff;
          color: #6b7280; font-size: 12.5px; cursor: pointer;
          font-family: inherit; white-space: nowrap;
          transition: background 0.13s;
        }
        .adm-tb-btn:hover { background: #f9fafb; color: #111827; }
        .adm-tb-btn.primary { background: #ea580c; color: #fff; border-color: #ea580c; }
        .adm-tb-btn.primary:hover { background: #c2410c; }
        .adm-tb-icon {
          display: none; width: 34px; height: 34px; border-radius: 8px;
          border: 1px solid #e5e7eb; background: #fff;
          align-items: center; justify-content: center;
          cursor: pointer; color: #6b7280;
        }

        /* ── CONTENT ── */
        .adm-content { padding: 22px 24px 80px; flex: 1; }

        /* ── STAT GRID ── */
        .adm-stats-grid {
          display: grid; grid-template-columns: repeat(4,1fr);
          gap: 14px; margin-bottom: 20px;
        }
        .adm-stat-card {
          background: #fff; border-radius: 14px; padding: 18px 20px;
          border: 1px solid #f3f4f6; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .adm-stat-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .adm-stat-icon { width: 38px; height: 38px; border-radius: 11px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .adm-stat-trend { display: inline-flex; align-items: center; gap: 3px; font-size: 10.5px; font-weight: 600; padding: 3px 8px; border-radius: 99px; }
        .adm-stat-trend.up   { color: #065f46; background: #d1fae5; }
        .adm-stat-trend.down { color: #991b1b; background: #fee2e2; }
        .adm-stat-value { font-size: 28px; font-weight: 700; color: #111827; letter-spacing: -1.5px; line-height: 1; margin-bottom: 3px; }
        .adm-stat-label { font-size: 11.5px; color: #9ca3af; font-weight: 500; margin-bottom: 12px; }

        /* ── GRID LAYOUTS ── */
        .adm-two-col   { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px; }
        .adm-three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-bottom: 20px; }

        /* ── CARD ── */
        .adm-card {
          background: #fff; border-radius: 14px; padding: 18px 20px;
          border: 1px solid #f3f4f6; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .adm-card-title {
          font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 14px;
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
        }
        .adm-card-sub { font-size: 11px; font-weight: 600; color: #9ca3af; letter-spacing: 0.06em; text-transform: uppercase; }

        /* ── TABLE ── */
        .adm-table-wrap { border-radius: 14px; background: #fff; border: 1px solid #f3f4f6; box-shadow: 0 1px 3px rgba(0,0,0,0.04); overflow: hidden; margin-bottom: 14px; }
        .adm-table-scroll { overflow-x: auto; }
        .adm-table { width: 100%; border-collapse: collapse; min-width: 680px; }
        .adm-table thead tr { background: #f9fafb; border-bottom: 1px solid #f3f4f6; }
        .adm-table th { padding: 10px 14px; text-align: left; font-size: 10.5px; font-weight: 700; color: #6b7280; letter-spacing: 0.05em; text-transform: uppercase; white-space: nowrap; }
        .adm-table td { padding: 12px 14px; border-bottom: 1px solid #f9fafb; font-size: 13px; color: #374151; vertical-align: middle; }
        .adm-table tbody tr:last-child td { border-bottom: none; }
        .adm-table tbody tr { transition: background 0.1s; }
        .adm-table tbody tr:hover td { background: #fafafa; }

        /* mobile table hidden, cards shown */
        .adm-user-cards { display: none; }

        /* ── INPUTS ── */
        .adm-input {
          width: 100%; padding: 9px 12px; border: 1px solid #e5e7eb; border-radius: 9px;
          font-size: 13px; color: #111827; font-family: inherit;
          background: #fff; outline: none; transition: border-color 0.14s;
        }
        .adm-input:focus { border-color: #ea580c; box-shadow: 0 0 0 3px rgba(234,88,12,0.1); }
        .adm-label { display: block; font-size: 11.5px; font-weight: 600; color: #374151; margin-bottom: 5px; }
        .adm-field { margin-bottom: 14px; }

        /* ── BUTTONS ── */
        .adm-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: inherit; border: 1px solid transparent;
          transition: background 0.13s, border-color 0.13s;
        }
        .adm-btn-primary { background: #ea580c; color: #fff; }
        .adm-btn-primary:hover:not(:disabled) { background: #c2410c; }
        .adm-btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
        .adm-btn-outline { background: #fff; color: #374151; border-color: #e5e7eb; }
        .adm-btn-outline:hover { background: #f9fafb; }
        .adm-btn-outline:disabled { opacity: 0.45; cursor: not-allowed; }
        .adm-btn-danger  { background: #fff; color: #dc2626; border-color: #fecaca; }
        .adm-btn-danger:hover { background: #fef2f2; }
        .adm-btn-sm { padding: 6px 12px; font-size: 12px; }
        .adm-btn-full { width: 100%; justify-content: center; }

        /* ── PAGINATION ── */
        .adm-pagination {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 16px; background: #fff;
          border-top: 1px solid #f3f4f6; border-radius: 0 0 14px 14px;
          flex-wrap: wrap; gap: 10px;
        }

        /* ── BARS ── */
        .adm-bar-wrap { height: 6px; background: #f3f4f6; border-radius: 99px; overflow: hidden; margin-top: 5px; }
        .adm-bar-fill { height: 100%; border-radius: 99px; transition: width .5s ease; }

        /* ── USER TOOLBAR ── */
        .adm-user-toolbar {
          display: flex; gap: 10px; margin-bottom: 16px;
          flex-wrap: wrap; align-items: center;
        }
        .adm-search-wrap {
          display: flex; align-items: center; gap: 8px;
          padding: 0 12px; background: #f9fafb;
          border: 1px solid #e5e7eb; border-radius: 9px;
          flex: 1; min-width: 180px;
        }
        .adm-search-wrap input {
          flex: 1; padding: 9px 0; background: transparent;
          border: none; outline: none; font-size: 13px;
          color: #111827; font-family: inherit;
        }
        .adm-search-wrap input::placeholder { color: #9ca3af; }
        .adm-pill-row { display: flex; gap: 6px; flex-wrap: wrap; }
        .adm-pill {
          padding: 6px 12px; border-radius: 99px; font-size: 12px;
          font-weight: 500; cursor: pointer; border: 1px solid #e5e7eb;
          background: #fff; color: #6b7280; font-family: inherit;
          transition: all 0.12s; white-space: nowrap;
        }
        .adm-pill.active { background: #ea580c; color: #fff; border-color: #ea580c; }

        /* ── BROADCAST ── */
        .adm-broadcast-item {
          padding: 14px 16px; border-radius: 12px; border: 1px solid #f3f4f6;
          background: #fafafa; margin-bottom: 10px; position: relative;
        }
        .adm-type-chip { display: inline-flex; align-items: center; font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 99px; letter-spacing: 0.04em; }

        /* ── COMPLAINT ── */
        .adm-complaint-row { display: flex; gap: 10px; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid #f9fafb; }
        .adm-complaint-row:last-child { border-bottom: none; }

        /* ── EMPTY ── */
        .adm-empty { text-align: center; padding: 36px 20px; }
        .adm-empty p { font-size: 13px; color: #9ca3af; margin-top: 10px; }

        /* ── MODAL ── */
        .adm-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.45);
          backdrop-filter: blur(4px); z-index: 200;
          display: flex; align-items: center; justify-content: center; padding: 20px;
        }
        .adm-modal {
          background: #fff; border-radius: 18px; padding: 26px;
          max-width: 400px; width: 100%;
          box-shadow: 0 24px 64px rgba(0,0,0,0.14);
        }
        .adm-modal h3 { font-size: 16px; font-weight: 700; color: #111827; margin-bottom: 4px; }
        .adm-modal p  { font-size: 13px; color: #6b7280; margin-bottom: 20px; }

        /* ── MOBILE BOTTOM NAV ── */
        .adm-bottom-nav {
          display: none; position: fixed; bottom: 0; left: 0; right: 0;
          background: #fff; border-top: 1px solid #e5e7eb;
          padding: 8px 0 12px; z-index: 50;
        }
        .adm-bottom-nav-inner { display: flex; justify-content: space-around; align-items: center; }
        .adm-bnav-btn {
          display: flex; flex-direction: column; align-items: center; gap: 3px;
          background: none; border: none; cursor: pointer; font-family: inherit;
          padding: 4px 10px; border-radius: 10px; min-width: 52px;
          transition: background 0.12s;
        }
        .adm-bnav-btn span { font-size: 10px; font-weight: 500; color: #9ca3af; }
        .adm-bnav-btn.active span { color: #ea580c; }
        .adm-bnav-btn.active svg { color: #ea580c; }
        .adm-bnav-btn svg { color: #9ca3af; }

        @keyframes adm-spin { to { transform: rotate(360deg); } }
        .adm-spin { animation: adm-spin 0.8s linear infinite; }

        /* ══════════════════════════════════
           RESPONSIVE BREAKPOINTS
        ══════════════════════════════════ */

        /* Tablet: 768–1024px */
        @media (max-width: 1024px) {
          .adm-stats-grid { grid-template-columns: repeat(2,1fr); }
          .adm-three-col  { grid-template-columns: 1fr 1fr; }
          .adm-content    { padding: 18px 18px 80px; }
        }

        /* Mobile: <768px */
        @media (max-width: 768px) {
          /* Sidebar slides in */
          .adm-sidebar { transform: translateX(-100%); }
          .adm-sidebar.open { transform: translateX(0); box-shadow: 4px 0 24px rgba(0,0,0,0.15); }
          .adm-sidebar-backdrop.open { display: block; }

          /* Main takes full width */
          .adm-main { margin-left: 0; }

          /* Topbar */
          .adm-hamburger { display: flex; }
          .adm-topbar    { padding: 11px 14px; }
          .adm-tb-btn    { display: none; }
          .adm-tb-icon   { display: flex; }

          /* Content */
          .adm-content   { padding: 14px 12px 80px; }

          /* Grids */
          .adm-stats-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
          .adm-two-col, .adm-three-col { grid-template-columns: 1fr; }

          /* Table → cards */
          .adm-table-wrap thead,
          .adm-table-wrap .adm-table-scroll { display: none; }
          .adm-user-cards { display: block; }
          .adm-table-wrap { background: transparent; border: none; box-shadow: none; }

          /* Pagination */
          .adm-pagination { border-radius: 14px; }

          /* User toolbar stacks */
          .adm-user-toolbar { flex-direction: column; align-items: stretch; }
          .adm-search-wrap  { min-width: unset; }

          /* Bottom nav */
          .adm-bottom-nav { display: block; }
        }

        /* Small mobile: <480px */
        @media (max-width: 480px) {
          .adm-stats-grid { grid-template-columns: 1fr; }
          .adm-stat-value { font-size: 26px; }
          .adm-page-title { font-size: 15px; }
          .adm-card, .adm-stat-card { padding: 14px 15px; border-radius: 12px; }
          .adm-modal { padding: 20px; }
        }
      `}</style>

      <div className="adm-root">
        {/* ── Sidebar backdrop ── */}
        <div
          className={`adm-sidebar-backdrop${sidebarOpen ? " open" : ""}`}
          onClick={() => setSidebarOpen(false)}
        />

        {/* ── Sidebar ── */}
        <aside className={`adm-sidebar${sidebarOpen ? " open" : ""}`}>
          <div className="adm-sidebar-logo">
            <div className="adm-logo-icon">
              <Shield size={16} color="#fff" />
            </div>
            <div>
              <div className="adm-logo-text">Researchly</div>
              <div className="adm-logo-sub">Admin Panel</div>
            </div>
          </div>

          <nav className="adm-nav">
            <div className="adm-nav-section">Main Menu</div>
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`adm-nav-btn${tab === id ? " active" : ""}`}
                onClick={() => {
                  setTab(id as any);
                  setSidebarOpen(false);
                }}
              >
                <span className="adm-nav-icon">
                  <Icon size={14} />
                </span>
                {label}
              </button>
            ))}
            <div className="adm-nav-section" style={{ marginTop: 10 }}>
              Links
            </div>
            <a href="/search" className="adm-nav-btn">
              <span className="adm-nav-icon">
                <BookOpen size={14} />
              </span>
              Back to App
            </a>
          </nav>

          <div className="adm-sidebar-foot">
            <div className="adm-foot-user">
              <div className="adm-avatar">
                {session?.user?.image ? (
                  <Image
                    src={session.user.image}
                    alt=""
                    width={32}
                    height={32}
                    style={{ borderRadius: "50%", objectFit: "cover" }}
                  />
                ) : (
                  (session?.user?.name?.[0] ?? "A").toUpperCase()
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "#111827",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {session?.user?.name ?? "Admin"}
                </p>
                <p
                  style={{
                    fontSize: 10.5,
                    color: "#9ca3af",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {session?.user?.email}
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <div className="adm-main">
          {/* ── Topbar ── */}
          <header className="adm-topbar">
            <div className="adm-topbar-left">
              <button
                className="adm-hamburger"
                onClick={() => setSidebarOpen((o) => !o)}
              >
                <Menu size={16} />
              </button>
              <h1 className="adm-page-title">
                {NAV_ITEMS.find((n) => n.id === tab)?.label ?? "Overview"}
              </h1>
            </div>
            <div className="adm-topbar-right">
              {/* Desktop buttons */}
              <button className="adm-tb-btn" onClick={loadStats}>
                <RefreshCw size={12} /> Refresh
              </button>
              <a
                href="/search"
                className="adm-tb-btn primary"
                style={{ textDecoration: "none" }}
              >
                <BookOpen size={12} /> Back to App
              </a>
              {/* Mobile icon-only buttons */}
              <button
                className="adm-tb-icon"
                onClick={loadStats}
                title="Refresh"
              >
                <RefreshCw size={15} />
              </button>
              <a
                href="/search"
                className="adm-tb-icon primary"
                style={{
                  textDecoration: "none",
                  background: "#ea580c",
                  color: "#fff",
                  borderColor: "#ea580c",
                  borderRadius: 8,
                  border: "1px solid",
                  width: 34,
                  height: 34,
                  display: "none",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Back to App"
              >
                <BookOpen size={15} />
              </a>
            </div>
          </header>

          {/* ── Content ── */}
          <main className="adm-content">
            {/* ══ OVERVIEW ══ */}
            {tab === "overview" && (
              <>
                {statsLoading ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "60px 0",
                      color: "#9ca3af",
                    }}
                  >
                    Loading stats…
                  </div>
                ) : stats ? (
                  <>
                    <div className="adm-stats-grid">
                      {[
                        {
                          icon: Users,
                          label: "Total Users",
                          value: stats.users.total,
                          trend: `+${stats.users.newToday} today`,
                          up: true,
                          color: "#3b82f6",
                          bg: "#eff6ff",
                        },
                        {
                          icon: Activity,
                          label: "Active Today",
                          value: stats.users.activeToday,
                          trend: `${stats.users.activeThisMonth}/mo`,
                          up: true,
                          color: "#10b981",
                          bg: "#ecfdf5",
                        },
                        {
                          icon: DollarSign,
                          label: "Monthly Revenue",
                          value: fmtINR(stats.revenue.estimated),
                          trend: `${stats.users.pro} pro`,
                          up: true,
                          color: "#f59e0b",
                          bg: "#fffbeb",
                        },
                        {
                          icon: TrendingUp,
                          label: "New This Week",
                          value: stats.users.newThisWeek,
                          trend: `${stats.users.newToday} today`,
                          up: stats.users.newToday > 0,
                          color: "#8b5cf6",
                          bg: "#f5f3ff",
                        },
                      ].map((s) => (
                        <div key={s.label} className="adm-stat-card">
                          <div className="adm-stat-top">
                            <div
                              className="adm-stat-icon"
                              style={{ background: s.bg }}
                            >
                              <s.icon size={17} style={{ color: s.color }} />
                            </div>
                            <span
                              className={`adm-stat-trend ${s.up ? "up" : "down"}`}
                            >
                              {s.up ? (
                                <ArrowUpRight size={10} />
                              ) : (
                                <ArrowDownRight size={10} />
                              )}{" "}
                              {s.trend}
                            </span>
                          </div>
                          <div className="adm-stat-value">{s.value}</div>
                          <div className="adm-stat-label">{s.label}</div>
                          <MiniBar values={barData} color={s.color} />
                        </div>
                      ))}
                    </div>

                    <div className="adm-two-col">
                      {/* Plan distribution */}
                      <div className="adm-card">
                        <div className="adm-card-title">
                          Plan Distribution{" "}
                          <span className="adm-card-sub">
                            {stats.users.total} total
                          </span>
                        </div>
                        {[
                          {
                            label: "Free",
                            count: stats.users.free,
                            color: "#6b7280",
                            pct: Math.round(
                              (stats.users.free /
                                Math.max(stats.users.total, 1)) *
                                100,
                            ),
                          },
                          {
                            label: "Student",
                            count: stats.users.student,
                            color: "#f59e0b",
                            pct: Math.round(
                              (stats.users.student /
                                Math.max(stats.users.total, 1)) *
                                100,
                            ),
                          },
                          {
                            label: "Pro",
                            count: stats.users.pro,
                            color: "#3b82f6",
                            pct: Math.round(
                              (stats.users.pro /
                                Math.max(stats.users.total, 1)) *
                                100,
                            ),
                          },
                        ].map((r) => (
                          <div key={r.label} style={{ marginBottom: 14 }}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginBottom: 5,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 13,
                                  color: "#374151",
                                  fontWeight: 500,
                                }}
                              >
                                {r.label}
                              </span>
                              <span
                                style={{
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: "#111827",
                                }}
                              >
                                {r.count}{" "}
                                <span
                                  style={{
                                    color: "#9ca3af",
                                    fontWeight: 400,
                                    fontSize: 11,
                                  }}
                                >
                                  ({r.pct}%)
                                </span>
                              </span>
                            </div>
                            <div className="adm-bar-wrap">
                              <div
                                className="adm-bar-fill"
                                style={{
                                  width: `${r.pct}%`,
                                  background: r.color,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Revenue */}
                      <div className="adm-card">
                        <div className="adm-card-title">Revenue Estimate</div>
                        {[
                          {
                            label: `Student ×${stats.users.student}`,
                            value: fmtINR(stats.revenue.student),
                            color: "#f59e0b",
                          },
                          {
                            label: `Pro ×${stats.users.pro}`,
                            value: fmtINR(stats.revenue.pro),
                            color: "#3b82f6",
                          },
                        ].map((r) => (
                          <div
                            key={r.label}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "12px 0",
                              borderBottom: "1px solid #f9fafb",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <div
                                style={{
                                  width: 9,
                                  height: 9,
                                  borderRadius: 2,
                                  background: r.color,
                                }}
                              />
                              <span style={{ fontSize: 13, color: "#374151" }}>
                                {r.label}
                              </span>
                            </div>
                            <span
                              style={{
                                fontSize: 15,
                                fontWeight: 700,
                                color: "#111827",
                              }}
                            >
                              {r.value}
                            </span>
                          </div>
                        ))}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            paddingTop: 14,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: "#374151",
                            }}
                          >
                            Total / month
                          </span>
                          <span
                            style={{
                              fontSize: 22,
                              fontWeight: 800,
                              color: "#ea580c",
                              letterSpacing: "-1px",
                            }}
                          >
                            {fmtINR(stats.revenue.estimated)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="adm-two-col">
                      {/* Top queries */}
                      <div className="adm-card">
                        <div className="adm-card-title">
                          🔥 Top Cached Queries
                        </div>
                        {stats.cache.topQueries.slice(0, 8).map((q, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              padding: "8px 0",
                              borderBottom: "1px solid #f9fafb",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#ea580c",
                                width: 20,
                                flexShrink: 0,
                              }}
                            >
                              #{i + 1}
                            </span>
                            <span
                              style={{
                                flex: 1,
                                fontSize: 12.5,
                                color: "#374151",
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
                                fontWeight: 700,
                                color: "#059669",
                                background: "#ecfdf5",
                                padding: "2px 7px",
                                borderRadius: 99,
                                flexShrink: 0,
                              }}
                            >
                              {q.usageCount}×
                            </span>
                          </div>
                        ))}
                        {stats.cache.topQueries.length === 0 && (
                          <p
                            style={{
                              fontSize: 12.5,
                              color: "#9ca3af",
                              textAlign: "center",
                              padding: "16px 0",
                            }}
                          >
                            No cached queries yet
                          </p>
                        )}
                      </div>

                      {/* Feedback */}
                      <div className="adm-card">
                        <div className="adm-card-title">📊 Feedback</div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr",
                            gap: 8,
                            marginBottom: 16,
                          }}
                        >
                          {[
                            {
                              label: "👍 Pos",
                              value: stats.feedback.thumbsUp,
                              color: "#059669",
                              bg: "#ecfdf5",
                            },
                            {
                              label: "👎 Neg",
                              value: stats.feedback.thumbsDown,
                              color: "#dc2626",
                              bg: "#fef2f2",
                            },
                            {
                              label: "⭐ Rate",
                              value: `${stats.feedback.satisfactionRate}%`,
                              color: "#2563eb",
                              bg: "#eff6ff",
                            },
                          ].map((f) => (
                            <div
                              key={f.label}
                              style={{
                                background: f.bg,
                                borderRadius: 10,
                                padding: "10px",
                                textAlign: "center",
                              }}
                            >
                              <p
                                style={{
                                  fontSize: 19,
                                  fontWeight: 800,
                                  color: f.color,
                                  letterSpacing: "-0.5px",
                                }}
                              >
                                {f.value}
                              </p>
                              <p
                                style={{
                                  fontSize: 10.5,
                                  color: f.color,
                                  opacity: 0.75,
                                  marginTop: 2,
                                }}
                              >
                                {f.label}
                              </p>
                            </div>
                          ))}
                        </div>
                        <p
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#9ca3af",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            marginBottom: 8,
                          }}
                        >
                          Recent Complaints
                        </p>
                        {stats.recentComplaints.slice(0, 4).map((c, i) => (
                          <div key={i} className="adm-complaint-row">
                            <ThumbsDown
                              size={11}
                              style={{
                                color: "#dc2626",
                                flexShrink: 0,
                                marginTop: 2,
                              }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p
                                style={{
                                  fontSize: 12.5,
                                  color: "#374151",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {c.query}
                              </p>
                              <p style={{ fontSize: 11, color: "#9ca3af" }}>
                                {c.userId} · {timeAgo(c.createdAt)}
                              </p>
                            </div>
                          </div>
                        ))}
                        {stats.recentComplaints.length === 0 && (
                          <p
                            style={{
                              fontSize: 12.5,
                              color: "#9ca3af",
                              textAlign: "center",
                              padding: "10px 0",
                            }}
                          >
                            No complaints 🎉
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                ) : null}
              </>
            )}

            {/* ══ USERS ══ */}
            {tab === "users" && (
              <>
                <div className="adm-user-toolbar">
                  <div className="adm-search-wrap">
                    <Search
                      size={13}
                      style={{ color: "#9ca3af", flexShrink: 0 }}
                    />
                    <input
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && loadUsers()}
                      placeholder="Search by email or name…"
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div className="adm-pill-row">
                      {["all", "free", "student", "pro"].map((p) => (
                        <button
                          key={p}
                          onClick={() => {
                            setUserPlanFilter(p);
                            setUserPage(1);
                          }}
                          className={`adm-pill${userPlanFilter === p ? " active" : ""}`}
                        >
                          {p === "all"
                            ? "All"
                            : p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                      ))}
                    </div>
                    <button
                      className="adm-btn adm-btn-outline adm-btn-sm"
                      onClick={loadUsers}
                    >
                      <Search size={12} /> Go
                    </button>
                  </div>
                </div>

                <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 10 }}>
                  {userTotal} users found
                </p>

                {/* Desktop table */}
                <div className="adm-table-wrap">
                  <div className="adm-table-scroll">
                    <table className="adm-table">
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Plan</th>
                          <th>Status</th>
                          <th>Searches</th>
                          <th>Last Active</th>
                          <th>Joined</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usersLoading ? (
                          <tr>
                            <td
                              colSpan={7}
                              style={{
                                textAlign: "center",
                                padding: 40,
                                color: "#9ca3af",
                              }}
                            >
                              Loading…
                            </td>
                          </tr>
                        ) : (
                          users.map((u) => (
                            <tr key={u._id}>
                              <td>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 9,
                                  }}
                                >
                                  <div
                                    style={{
                                      width: 30,
                                      height: 30,
                                      borderRadius: "50%",
                                      background:
                                        "linear-gradient(135deg,#ea580c,#f97316)",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: 11,
                                      fontWeight: 700,
                                      color: "#fff",
                                      flexShrink: 0,
                                      overflow: "hidden",
                                    }}
                                  >
                                    {u.image ? (
                                      <Image
                                        src={u.image}
                                        alt=""
                                        width={30}
                                        height={30}
                                        style={{ borderRadius: "50%" }}
                                      />
                                    ) : (
                                      (u.name?.[0] ?? u.email[0]).toUpperCase()
                                    )}
                                  </div>
                                  <div>
                                    <p
                                      style={{
                                        fontSize: 12.5,
                                        fontWeight: 600,
                                        color: "#111827",
                                      }}
                                    >
                                      {u.name ?? "—"}
                                    </p>
                                    <p
                                      style={{ fontSize: 11, color: "#9ca3af" }}
                                    >
                                      {u.email}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <PlanBadge plan={u.plan} />
                              </td>
                              <td>
                                <StatusBadge status={u.subscriptionStatus} />
                              </td>
                              <td style={{ color: "#6b7280" }}>
                                {u.plan === "free"
                                  ? `${u.searchesToday ?? 0}/day`
                                  : `${u.searchesThisMonth ?? 0}/mo`}
                              </td>
                              <td style={{ color: "#6b7280" }}>
                                {timeAgo(u.lastActiveAt)}
                              </td>
                              <td
                                style={{
                                  color: "#6b7280",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {u.createdAt
                                  ? new Date(u.createdAt).toLocaleDateString(
                                      "en-IN",
                                      {
                                        day: "2-digit",
                                        month: "short",
                                        year: "2-digit",
                                      },
                                    )
                                  : "—"}
                              </td>
                              <td>
                                <div style={{ display: "flex", gap: 5 }}>
                                  <button
                                    onClick={() => {
                                      setEditingUser(u);
                                      setEditPlan(u.plan);
                                    }}
                                    className="adm-btn adm-btn-outline adm-btn-sm"
                                  >
                                    <Edit2 size={11} /> Edit
                                  </button>
                                  <button
                                    onClick={() => deleteUser(u.email)}
                                    className="adm-btn adm-btn-danger adm-btn-sm"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="adm-user-cards" style={{ padding: "0" }}>
                    {usersLoading ? (
                      <p
                        style={{
                          textAlign: "center",
                          padding: 30,
                          color: "#9ca3af",
                        }}
                      >
                        Loading…
                      </p>
                    ) : (
                      users.map((u) => (
                        <UserCard
                          key={u._id}
                          u={u}
                          onEdit={() => {
                            setEditingUser(u);
                            setEditPlan(u.plan);
                          }}
                          onDelete={() => deleteUser(u.email)}
                        />
                      ))
                    )}
                  </div>

                  <div className="adm-pagination">
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>
                      Page {userPage} of {userPages} · {userTotal} total
                    </span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                        disabled={userPage === 1}
                        className="adm-btn adm-btn-outline adm-btn-sm"
                      >
                        <ChevronLeft size={12} /> Prev
                      </button>
                      <button
                        onClick={() =>
                          setUserPage((p) => Math.min(userPages, p + 1))
                        }
                        disabled={userPage === userPages}
                        className="adm-btn adm-btn-outline adm-btn-sm"
                      >
                        Next <ChevronRight size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ══ BROADCAST ══ */}
            {tab === "broadcast" && (
              <div className="adm-two-col">
                <div className="adm-card">
                  <div className="adm-card-title">
                    <Send size={14} style={{ color: "#ea580c" }} /> Compose
                  </div>
                  <div className="adm-field">
                    <label className="adm-label">Title</label>
                    <input
                      className="adm-input"
                      value={bTitle}
                      onChange={(e) => setBTitle(e.target.value)}
                      placeholder="e.g. New feature released!"
                    />
                  </div>
                  <div className="adm-field">
                    <label className="adm-label">Message</label>
                    <textarea
                      className="adm-input"
                      value={bMessage}
                      onChange={(e) => setBMessage(e.target.value)}
                      placeholder="Write your message…"
                      rows={4}
                      style={{ resize: "vertical" }}
                    />
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                      marginBottom: 14,
                    }}
                  >
                    <div>
                      <label className="adm-label">Target</label>
                      <select
                        className="adm-input"
                        value={bTarget}
                        onChange={(e) => setBTarget(e.target.value)}
                      >
                        <option value="all">All Users</option>
                        <option value="free">Free Only</option>
                        <option value="student">Student Only</option>
                        <option value="pro">Pro Only</option>
                      </select>
                    </div>
                    <div>
                      <label className="adm-label">Type</label>
                      <select
                        className="adm-input"
                        value={bType}
                        onChange={(e) => setBType(e.target.value)}
                      >
                        <option value="info">ℹ️ Info</option>
                        <option value="success">✅ Success</option>
                        <option value="warning">⚠️ Warning</option>
                      </select>
                    </div>
                  </div>
                  <div className="adm-field">
                    <label className="adm-label">Expires in (days)</label>
                    <input
                      className="adm-input"
                      type="number"
                      value={bDays}
                      onChange={(e) => setBDays(Number(e.target.value))}
                      min={1}
                      max={30}
                    />
                  </div>
                  <button
                    className="adm-btn adm-btn-primary adm-btn-full"
                    onClick={sendBroadcast}
                    disabled={bSending}
                  >
                    {bSending ? (
                      <>
                        <RefreshCw size={12} className="adm-spin" /> Sending…
                      </>
                    ) : (
                      <>
                        <Send size={12} /> Send Broadcast
                      </>
                    )}
                  </button>
                </div>

                <div className="adm-card">
                  <div className="adm-card-title">
                    <Bell size={14} style={{ color: "#ea580c" }} /> Active
                    Broadcasts
                  </div>
                  {bHistory.length === 0 ? (
                    <div className="adm-empty">
                      <Bell
                        size={28}
                        style={{
                          color: "#d1d5db",
                          display: "block",
                          margin: "0 auto",
                        }}
                      />
                      <p>No active broadcasts</p>
                    </div>
                  ) : (
                    bHistory.map((b: any) => {
                      const tc: Record<string, { c: string; bg: string }> = {
                        info: { c: "#2563eb", bg: "#eff6ff" },
                        success: { c: "#059669", bg: "#ecfdf5" },
                        warning: { c: "#d97706", bg: "#fffbeb" },
                      };
                      const t = tc[b.type] ?? tc.info;
                      return (
                        <div key={b._id} className="adm-broadcast-item">
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              gap: 8,
                              marginBottom: 6,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 7,
                                flexWrap: "wrap",
                              }}
                            >
                              <span
                                className="adm-type-chip"
                                style={{ color: t.c, background: t.bg }}
                              >
                                {b.type?.toUpperCase()}
                              </span>
                              <span
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: "#111827",
                                }}
                              >
                                {b.title}
                              </span>
                            </div>
                            <button
                              onClick={() => deleteBroadcast(b._id)}
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                color: "#9ca3af",
                                padding: 2,
                                flexShrink: 0,
                              }}
                            >
                              <X size={12} />
                            </button>
                          </div>
                          <p
                            style={{
                              fontSize: 12.5,
                              color: "#6b7280",
                              lineHeight: 1.5,
                              marginBottom: 6,
                            }}
                          >
                            {b.message}
                          </p>
                          <span style={{ fontSize: 11, color: "#9ca3af" }}>
                            →{" "}
                            {b.targetPlan === "all"
                              ? "All users"
                              : `${b.targetPlan} plan`}{" "}
                            · {b.readCount ?? 0} read
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ══ FEEDBACK ══ */}
            {tab === "feedback" && (
              <>
                {statsLoading ? (
                  <p
                    style={{
                      color: "#9ca3af",
                      textAlign: "center",
                      padding: "40px 0",
                    }}
                  >
                    Loading…
                  </p>
                ) : stats ? (
                  <>
                    <div className="adm-three-col">
                      {[
                        {
                          icon: ThumbsUp,
                          label: "Positive",
                          value: stats.feedback.thumbsUp,
                          color: "#059669",
                          bg: "#ecfdf5",
                        },
                        {
                          icon: ThumbsDown,
                          label: "Negative",
                          value: stats.feedback.thumbsDown,
                          color: "#dc2626",
                          bg: "#fef2f2",
                        },
                        {
                          icon: Activity,
                          label: "Satisfaction",
                          value: `${stats.feedback.satisfactionRate}%`,
                          color: "#2563eb",
                          bg: "#eff6ff",
                        },
                      ].map((s) => (
                        <div key={s.label} className="adm-stat-card">
                          <div className="adm-stat-top">
                            <div
                              className="adm-stat-icon"
                              style={{ background: s.bg }}
                            >
                              <s.icon size={17} style={{ color: s.color }} />
                            </div>
                          </div>
                          <div
                            className="adm-stat-value"
                            style={{ color: s.color }}
                          >
                            {s.value}
                          </div>
                          <div className="adm-stat-label">
                            {s.label} feedback
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="adm-card">
                      <div className="adm-card-title">
                        👎 All Negative Feedback
                      </div>
                      {stats.recentComplaints.length === 0 ? (
                        <div className="adm-empty">
                          <ThumbsUp
                            size={28}
                            style={{
                              color: "#d1d5db",
                              display: "block",
                              margin: "0 auto",
                            }}
                          />
                          <p>No complaints! 🎉</p>
                        </div>
                      ) : (
                        stats.recentComplaints.map((c, i) => (
                          <div key={i} className="adm-complaint-row">
                            <div
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: 7,
                                background: "#fef2f2",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              <ThumbsDown
                                size={11}
                                style={{ color: "#dc2626" }}
                              />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p
                                style={{
                                  fontSize: 13,
                                  color: "#111827",
                                  fontWeight: 500,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {c.query}
                              </p>
                              <p style={{ fontSize: 11, color: "#9ca3af" }}>
                                {c.userId} · {timeAgo(c.createdAt)}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                ) : null}
              </>
            )}

            {/* ══ CACHE ══ */}
            {tab === "cache" && (
              <div className="adm-two-col">
                <div className="adm-card">
                  <div className="adm-card-title">
                    <Database size={14} style={{ color: "#ea580c" }} /> Cache
                    Status
                  </div>
                  <div
                    style={{
                      background: "#fff7ed",
                      borderRadius: 12,
                      padding: "18px 20px",
                      marginBottom: 16,
                      border: "1px solid #fed7aa",
                    }}
                  >
                    <p
                      style={{
                        fontSize: 36,
                        fontWeight: 800,
                        color: "#ea580c",
                        letterSpacing: "-2px",
                        lineHeight: 1,
                      }}
                    >
                      {stats?.cache.count ?? "—"}
                    </p>
                    <p
                      style={{ fontSize: 12.5, color: "#9a3412", marginTop: 4 }}
                    >
                      Cached queries · 60-day TTL
                    </p>
                  </div>
                  <p
                    style={{
                      fontSize: 13,
                      color: "#6b7280",
                      lineHeight: 1.7,
                      marginBottom: 18,
                    }}
                  >
                    Cache stores AI answers to speed up repeated queries.
                    Clearing forces fresh AI generation for all queries.
                  </p>
                  <button
                    className="adm-btn adm-btn-danger"
                    onClick={() => toast("Implement DELETE /api/admin/cache")}
                  >
                    <Trash2 size={13} /> Clear All Cache
                  </button>
                </div>
                <div className="adm-card">
                  <div className="adm-card-title">🔥 Top by Usage</div>
                  {(stats?.cache.topQueries ?? []).map((q, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "9px 0",
                        borderBottom: "1px solid #f9fafb",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#ea580c",
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
                          color: "#374151",
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
                          fontWeight: 700,
                          color: "#059669",
                          background: "#ecfdf5",
                          padding: "2px 8px",
                          borderRadius: 99,
                          flexShrink: 0,
                        }}
                      >
                        {q.usageCount}×
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </main>
        </div>

        {/* ── Mobile bottom nav ── */}
        <nav className="adm-bottom-nav">
          <div className="adm-bottom-nav-inner">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`adm-bnav-btn${tab === id ? " active" : ""}`}
                onClick={() => setTab(id as any)}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>

      {/* ── Edit User Modal ── */}
      {editingUser && (
        <div className="adm-overlay" onClick={() => setEditingUser(null)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit User Plan</h3>
            <p>{editingUser.email}</p>
            <div className="adm-field">
              <label className="adm-label">New Plan</label>
              <select
                className="adm-input"
                value={editPlan}
                onChange={(e) => setEditPlan(e.target.value)}
              >
                <option value="free">Free</option>
                <option value="student">Student</option>
                <option value="pro">Pro</option>
              </select>
            </div>
            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                marginTop: 8,
              }}
            >
              <button
                className="adm-btn adm-btn-outline"
                onClick={() => setEditingUser(null)}
              >
                Cancel
              </button>
              <button className="adm-btn adm-btn-primary" onClick={updatePlan}>
                <Check size={12} /> Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
