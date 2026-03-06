"use client";
import { useEffect, useState, Suspense } from "react";
import Shell from "@/components/layout/Shell";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookmarkCheck,
  Search,
  ExternalLink,
  Trash2,
  Zap,
  Crown,
  Sparkles,
  CheckCircle,
  AlertTriangle,
  History,
  Clock,
  ArrowRight,
  Lock,
  ChevronLeft,
  FileText,
  BookOpen,
  Download,
  Activity,
  ChevronRight,
  Plus,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { downloadResearchPDF } from "@/lib/downloadPDF";
import remarkGfm from "remark-gfm";
import Image from "next/image";
import toast from "react-hot-toast";
import { SavedPaper } from "@/types";

interface Paper {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  journal?: string;
  abstract?: string;
  doi?: string;
  url?: string;
}
interface ReviewItem {
  topic: string;
  review?: string;
  papers?: Paper[];
  reviewedAt: string;
}
interface HistoryItem {
  query: string;
  answer?: string;
  papers?: Paper[];
  searchedAt: string;
}

function useIsMobile() {
  const [w, setW] = useState(0);
  useEffect(() => {
    const update = () => setW(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return { isMobile: w > 0 && w < 640, isTablet: w >= 640 && w < 900, w };
}

const mdComponents = {
  h2: ({ children }: any) => (
    <h2
      style={{
        fontFamily: "var(--font-display)",
        fontSize: "1rem",
        color: "var(--text-primary)",
        margin: "1.3em 0 .45em",
        fontWeight: 600,
      }}
    >
      {children}
    </h2>
  ),
  h3: ({ children }: any) => (
    <h3
      style={{
        fontSize: ".92rem",
        color: "var(--text-primary)",
        fontWeight: 600,
        margin: ".9em 0 .3em",
      }}
    >
      {children}
    </h3>
  ),
  p: ({ children }: any) => (
    <p
      style={{
        marginBottom: ".75em",
        lineHeight: 1.78,
        fontSize: 14,
        color: "var(--text-secondary)",
      }}
    >
      {children}
    </p>
  ),
  strong: ({ children }: any) => (
    <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>
      {children}
    </strong>
  ),
  ul: ({ children }: any) => (
    <ul style={{ paddingLeft: "1.4em", marginBottom: ".75em" }}>{children}</ul>
  ),
  li: ({ children }: any) => (
    <li
      style={{
        marginBottom: ".3em",
        fontSize: 14,
        color: "var(--text-secondary)",
      }}
    >
      {children}
    </li>
  ),
  a: ({ href, children }: any) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: "var(--brand)",
        textDecoration: "underline",
        textUnderlineOffset: 3,
      }}
    >
      {children}
    </a>
  ),
  code: ({ children }: any) => (
    <code
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        background: "var(--surface-2)",
        color: "var(--brand)",
        padding: "2px 5px",
        borderRadius: 4,
      }}
    >
      {children}
    </code>
  ),
};

function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/* ── Stat Card ──────────────────────────────────────────────── */
function StatCard({
  value,
  label,
  icon: Icon,
  color,
  sub,
}: {
  value: string | number;
  label: string;
  icon: any;
  color: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        padding: "20px",
        borderRadius: 16,
        background: "var(--bg-raised)",
        border: "1px solid var(--border)",
        position: "relative",
        overflow: "hidden",
        transition: "border-color .18s, transform .18s",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor =
          "var(--border-mid)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
        (e.currentTarget as HTMLElement).style.transform = "";
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -20,
          right: -20,
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: `${color}14`,
          filter: "blur(18px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: `${color}14`,
            border: `1px solid ${color}28`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={16} style={{ color }} />
        </div>
        {sub && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--green)",
              background: "rgba(93,184,122,.12)",
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
          fontSize: 28,
          fontWeight: 700,
          color: "var(--text-primary)",
          lineHeight: 1,
          marginBottom: 5,
          letterSpacing: "-1.5px",
          fontFamily: "var(--font-ui)",
        }}
      >
        {value}
      </p>
      <p style={{ fontSize: 12, color: "var(--text-faint)", fontWeight: 500 }}>
        {label}
      </p>
    </div>
  );
}

/* ── Action Card ─────────────────────────────────────────────── */
function ActionCard({
  label,
  desc,
  cta,
  href,
  color,
  Icon,
}: {
  label: string;
  desc: string;
  cta: string;
  href: string;
  color: string;
  Icon: any;
}) {
  return (
    <Link
      href={href}
      style={{
        padding: "20px",
        borderRadius: 16,
        background: "var(--bg-raised)",
        border: "1px solid var(--border)",
        textDecoration: "none",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        transition: "border-color .18s, transform .18s, box-shadow .18s",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = `${color}40`;
        el.style.transform = "translateY(-3px)";
        el.style.boxShadow = `0 16px 48px rgba(0,0,0,.3)`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = "var(--border)";
        el.style.transform = "";
        el.style.boxShadow = "";
      }}
    >
      <div
        style={{
          position: "absolute",
          bottom: -20,
          right: -20,
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: `${color}10`,
          filter: "blur(20px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: `${color}14`,
          border: `1px solid ${color}28`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14,
        }}
      >
        <Icon size={18} style={{ color }} />
      </div>
      <p
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "var(--text-primary)",
          marginBottom: 6,
          letterSpacing: "-.015em",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 12.5,
          color: "var(--text-faint)",
          lineHeight: 1.55,
          marginBottom: 16,
          flex: 1,
        }}
      >
        {desc}
      </p>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color,
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        {cta} <ArrowRight size={11} />
      </span>
    </Link>
  );
}

/* ── List Row ─────────────────────────────────────────────────── */
function ListRow({ iconEl, iconColor, title, meta, badge, onClick }: any) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        background: "var(--bg-raised)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        transition: "border-color .14s, background .14s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor =
          "var(--border-mid)";
        (e.currentTarget as HTMLElement).style.background = "var(--surface)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
        (e.currentTarget as HTMLElement).style.background = "var(--bg-raised)";
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          background: `${iconColor}12`,
          border: `1px solid ${iconColor}28`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {iconEl}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-primary)",
            fontWeight: 500,
            marginBottom: 3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {meta}
          {badge && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--text-faint)",
                background: "var(--surface-2)",
                padding: "1px 7px",
                borderRadius: 99,
              }}
            >
              {badge}
            </span>
          )}
        </div>
      </div>
      <ChevronRight
        size={12}
        style={{ color: "var(--text-faint)", flexShrink: 0 }}
      />
    </button>
  );
}

function Shimmer({ h = 66 }: { h?: number }) {
  return (
    <div
      className="shimmer-line"
      style={{ height: h, borderRadius: 12, marginBottom: 8 }}
    />
  );
}

function Empty({
  icon: Icon,
  title,
  desc,
  href,
  cta,
}: {
  icon: any;
  title: string;
  desc: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div
      style={{
        padding: "52px 24px",
        textAlign: "center",
        background: "var(--bg-raised)",
        border: "1px dashed var(--border-mid)",
        borderRadius: 16,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: "var(--surface)",
          border: "1px solid var(--border-mid)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 18px",
        }}
      >
        <Icon size={22} style={{ color: "var(--text-faint)" }} />
      </div>
      <p
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: "var(--text-primary)",
          marginBottom: 8,
          letterSpacing: "-.02em",
        }}
      >
        {title}
      </p>
      <p
        style={{
          fontSize: 13,
          color: "var(--text-faint)",
          marginBottom: href ? 22 : 0,
          lineHeight: 1.6,
        }}
      >
        {desc}
      </p>
      {href && cta && (
        <Link
          href={href}
          style={{
            padding: "10px 22px",
            borderRadius: 10,
            background: "var(--brand)",
            color: "#000",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {cta}
        </Link>
      )}
    </div>
  );
}

/* ── Detail View (shared for history & reviews) ────────────────── */
function DetailView({
  type,
  title,
  content,
  papers,
  timestamp,
  onBack,
  atLimit,
  query,
  onDownload,
  session,
}: any) {
  const accentColor = type === "review" ? "#5db87a" : "var(--brand)";
  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div
        style={{ maxWidth: 820, margin: "0 auto", padding: "28px 24px 60px" }}
      >
        <button
          onClick={onBack}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 14px",
            background: "var(--bg-raised)",
            border: "1px solid var(--border)",
            borderRadius: 9,
            cursor: "pointer",
            fontSize: 12.5,
            color: "var(--text-faint)",
            marginBottom: 24,
            fontFamily: "var(--font-ui)",
            transition: "color .14s",
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.color =
              "var(--text-primary)")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.color = "var(--text-faint)")
          }
        >
          <ChevronLeft size={14} /> Back
        </button>

        <div
          style={{
            padding: "18px 20px",
            borderRadius: 14,
            background: `${type === "review" ? "rgba(93,184,122,.06)" : "var(--brand-dim)"}`,
            border: `1px solid ${type === "review" ? "rgba(93,184,122,.18)" : "var(--brand-border)"}`,
            marginBottom: 24,
          }}
        >
          <p
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              color: accentColor,
              marginBottom: 8,
            }}
          >
            {type === "review" ? "Literature Review" : "Research Query"}
          </p>
          <p
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--text-primary)",
              lineHeight: 1.5,
            }}
          >
            {title}
          </p>
          <p
            style={{
              fontSize: 11,
              color: "var(--text-faint)",
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Clock size={10} /> {timeAgo(timestamp)}
            {papers?.length > 0 && (
              <span style={{ color: accentColor }}>
                · {papers.length} sources
              </span>
            )}
          </p>
        </div>

        {content ? (
          <>
            <div
              style={{
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: "22px 24px",
                marginBottom: 20,
              }}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={mdComponents}
              >
                {content}
              </ReactMarkdown>
            </div>
            {papers?.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    color: "var(--text-faint)",
                    marginBottom: 12,
                  }}
                >
                  Sources ({papers.length})
                </p>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 7 }}
                >
                  {papers.map((p: any, i: number) => (
                    <div
                      key={i}
                      style={{
                        padding: "12px 14px",
                        background: "var(--bg-raised)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        display: "flex",
                        gap: 10,
                      }}
                    >
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          background: accentColor,
                          color: type === "review" ? "#000" : "#000",
                          fontSize: 9.5,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            marginBottom: 3,
                          }}
                        >
                          {p.title}
                        </p>
                        <p
                          style={{ fontSize: 10.5, color: "var(--text-faint)" }}
                        >
                          {p.authors?.slice(0, 3).join(", ")}
                          {(p.authors?.length ?? 0) > 3 ? " et al." : ""}
                          {p.year ? ` · ${p.year}` : ""}
                          {p.journal ? ` · ${p.journal}` : ""}
                        </p>
                        {p.url && (
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: 10.5,
                              color: "var(--brand)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                              marginTop: 4,
                            }}
                          >
                            View <ExternalLink size={8} />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={onDownload}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "1px solid var(--border-mid)",
                  color: "var(--text-secondary)",
                  background: "transparent",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: "var(--font-ui)",
                  transition: "border-color .14s, color .14s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor =
                    "var(--brand)";
                  (e.currentTarget as HTMLElement).style.color = "var(--brand)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor =
                    "var(--border-mid)";
                  (e.currentTarget as HTMLElement).style.color =
                    "var(--text-secondary)";
                }}
              >
                <Download size={13} /> Export PDF
              </button>
              {type === "history" && (
                <Link
                  href={
                    atLimit
                      ? "/pricing"
                      : `/search?q=${encodeURIComponent(query)}`
                  }
                  style={{
                    padding: "10px 18px",
                    borderRadius: 10,
                    background: "var(--brand)",
                    color: "#000",
                    fontSize: 13,
                    fontWeight: 700,
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {atLimit ? (
                    <>
                      <Sparkles size={12} /> Upgrade
                    </>
                  ) : (
                    <>
                      <Search size={12} /> Search Again
                    </>
                  )}
                </Link>
              )}
              {type === "review" && (
                <Link
                  href="/review"
                  style={{
                    padding: "10px 18px",
                    borderRadius: 10,
                    background: "var(--brand)",
                    color: "#000",
                    fontSize: 13,
                    fontWeight: 700,
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <BookOpen size={12} /> New Review
                </Link>
              )}
            </div>
          </>
        ) : (
          <div
            style={{
              textAlign: "center",
              padding: "48px 20px",
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
              borderRadius: 14,
            }}
          >
            <FileText
              size={28}
              style={{
                color: "var(--text-faint)",
                margin: "0 auto 14px",
                display: "block",
                opacity: 0.4,
              }}
            />
            <p
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 6,
              }}
            >
              Content not available
            </p>
            <p
              style={{
                fontSize: 12.5,
                color: "var(--text-faint)",
                marginBottom: 20,
                lineHeight: 1.6,
              }}
            >
              This was saved before answers were stored.
              <br />
              All future searches save automatically.
            </p>
            <Link
              href={
                type === "history"
                  ? `/search?q=${encodeURIComponent(query)}`
                  : "/review"
              }
              style={{
                padding: "9px 20px",
                borderRadius: 10,
                background: "var(--brand)",
                color: "#000",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {type === "history" ? (
                <>
                  <Search size={12} /> Re-run search
                </>
              ) : (
                <>
                  <BookOpen size={12} /> Generate Again
                </>
              )}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════ */
function DashContent() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isMobile } = useIsMobile();

  const [papers, setPapers] = useState<SavedPaper[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [searchesToday, setSearchesToday] = useState(0);
  const [searchesThisMonth, setSearchesThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"library" | "history" | "reviews">(
    "library",
  );
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);
  const [reviewHistory, setReviewHistory] = useState<ReviewItem[]>([]);
  const [selectedReview, setSelectedReview] = useState<ReviewItem | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
  }, [status, router]);

  useEffect(() => {
    if (searchParams.get("upgraded") === "1") {
      void update();
      toast.success("🎉 Plan upgraded successfully!", {
        id: "upgraded",
        duration: 5000,
      });
      router.replace("/dashboard", { scroll: false });
    }
    if (searchParams.get("tab") === "history") setActiveTab("history");
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    Promise.all([
      fetch("/api/papers").then((r) => r.json()),
      fetch("/api/user/history").then((r) => r.json()),
    ])
      .then(([pd, hd]: any) => {
        setPapers(pd.papers ?? []);
        setHistory(hd.history ?? []);
        setReviewHistory(hd.reviewHistory ?? []);
        setSearchesToday(hd.searchesToday ?? 0);
        setSearchesThisMonth(hd.searchesThisMonth ?? 0);
      })
      .catch(() => toast.error("Failed to load data"))
      .finally(() => setLoading(false));
  }, [status]);

  const removePaper = async (id: string) => {
    try {
      await fetch("/api/papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setPapers((p) => p.filter((x) => x.paperId !== id));
      toast.success("Removed from library");
    } catch {
      toast.error("Failed to remove");
    }
  };

  const cancelSubscription = async () => {
    setCancelling(true);
    setShowConfirm(false);
    try {
      const r = await fetch("/api/razorpay/cancel", { method: "POST" });
      const d = (await r.json()) as any;
      if (d.success) {
        await update();
        toast.success(d.message ?? "Subscription cancelled.");
      } else toast.error(d.error ?? "Cancellation failed");
    } catch {
      toast.error("Network error.");
    } finally {
      setCancelling(false);
    }
  };

  if (status === "loading" || status === "unauthenticated")
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span className="spinner" />
      </div>
    );

  const plan = session?.user?.plan ?? "free";
  const isFree = plan === "free",
    isStudent = plan === "student",
    isPro = plan === "pro",
    isPaid = !isFree;
  const atLimit = isFree
    ? searchesToday >= 5
    : isStudent
      ? searchesThisMonth >= 500
      : false;
  const counterUsed = isFree
    ? searchesToday
    : isStudent
      ? searchesThisMonth
      : 0;
  const counterMax = isFree ? 5 : isStudent ? 500 : 0;
  const pct = isPro ? 100 : Math.min((counterUsed / counterMax) * 100, 100);

  const planMeta = {
    free: {
      icon: Zap,
      color: "#6b7280",
      label: "Free",
      gradient: "linear-gradient(135deg,#555,#333)",
    },
    student: {
      icon: Sparkles,
      color: "#e8a045",
      label: "Student",
      gradient: "linear-gradient(135deg,#e8a045,#f5c878)",
    },
    pro: {
      icon: Crown,
      color: "#5c9ae0",
      label: "Pro",
      gradient: "linear-gradient(135deg,#5c9ae0,#91c8f8)",
    },
  }[plan] ?? {
    icon: Zap,
    color: "#6b7280",
    label: "Free",
    gradient: "linear-gradient(135deg,#555,#333)",
  };
  const PlanIcon = planMeta.icon;

  /* ── Detail views ── */
  if (activeTab === "reviews" && selectedReview)
    return (
      <Shell>
        <DetailView
          type="review"
          title={selectedReview.topic}
          content={selectedReview.review}
          papers={selectedReview.papers}
          timestamp={selectedReview.reviewedAt}
          onBack={() => setSelectedReview(null)}
          onDownload={() =>
            downloadResearchPDF(
              selectedReview.topic,
              selectedReview.review ?? "",
              (selectedReview.papers ?? []) as any,
              session?.user?.name ?? undefined,
            )
          }
          session={session}
        />
      </Shell>
    );

  if (activeTab === "history" && selectedItem)
    return (
      <Shell>
        <DetailView
          type="history"
          title={selectedItem.query}
          content={selectedItem.answer}
          papers={selectedItem.papers}
          timestamp={selectedItem.searchedAt}
          query={selectedItem.query}
          atLimit={atLimit}
          onBack={() => setSelectedItem(null)}
          onDownload={() =>
            downloadResearchPDF(
              selectedItem.query,
              selectedItem.answer ?? "",
              (selectedItem.papers ?? []) as any,
              session?.user?.name ?? undefined,
            )
          }
          session={session}
        />
      </Shell>
    );

  const firstName = session?.user?.name?.split(" ")[0] ?? "Researcher";
  const dateStr = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <Shell>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div
          style={{
            maxWidth: 920,
            margin: "0 auto",
            padding: isMobile ? "20px 16px 72px" : "28px 28px 60px",
          }}
        >
          {/* ── Header ───────────────────────────────────────── */}
          <div
            style={{
              display: "flex",
              alignItems: isMobile ? "flex-start" : "center",
              justifyContent: "space-between",
              gap: 16,
              marginBottom: 28,
              flexDirection: isMobile ? "column" : "row",
            }}
          >
            <div>
              {!isMobile && (
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-faint)",
                    marginBottom: 4,
                    fontWeight: 500,
                  }}
                >
                  {dateStr}
                </p>
              )}
              <h1
                style={{
                  fontSize: isMobile ? 20 : 24,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  letterSpacing: "-.035em",
                  lineHeight: 1.2,
                }}
              >
                {getGreeting()}, {firstName} 👋
              </h1>
            </div>
            <Link
              href="/search"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 20px",
                borderRadius: 11,
                background: "var(--brand)",
                color: "#000",
                fontSize: 13.5,
                fontWeight: 700,
                textDecoration: "none",
                flexShrink: 0,
                boxShadow: "0 4px 20px rgba(232,160,69,.25)",
                transition: "transform .15s, box-shadow .15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform =
                  "translateY(-1px)";
                (e.currentTarget as HTMLElement).style.boxShadow =
                  "0 8px 28px rgba(232,160,69,.35)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "";
                (e.currentTarget as HTMLElement).style.boxShadow =
                  "0 4px 20px rgba(232,160,69,.25)";
              }}
            >
              <Search size={14} /> New Search
            </Link>
          </div>

          {/* ── Profile + Plan row ───────────────────────────── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              gap: 12,
              marginBottom: 20,
            }}
          >
            {/* Profile card */}
            <div
              style={{
                padding: "18px 20px",
                borderRadius: 16,
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 14,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -24,
                  right: -24,
                  width: 90,
                  height: 90,
                  borderRadius: "50%",
                  background: `${planMeta.color}10`,
                  filter: "blur(20px)",
                  pointerEvents: "none",
                }}
              />
              {/* Avatar */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                {session?.user?.image ? (
                  <Image
                    src={session.user.image}
                    alt="av"
                    width={48}
                    height={48}
                    style={{
                      borderRadius: "50%",
                      border: `2.5px solid ${planMeta.color}35`,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      background: planMeta.gradient,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 18,
                      fontWeight: 800,
                      color: "#000",
                      border: `2.5px solid ${planMeta.color}35`,
                    }}
                  >
                    {(session?.user?.name?.[0] ?? "U").toUpperCase()}
                  </div>
                )}
                <div
                  style={{
                    position: "absolute",
                    bottom: -2,
                    right: -2,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: planMeta.gradient,
                    border: "2.5px solid var(--bg-raised)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <PlanIcon size={8} color="#000" />
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    marginBottom: 2,
                  }}
                >
                  {session?.user?.name ?? "Researcher"}
                </p>
                <p
                  style={{
                    fontSize: 11.5,
                    color: "var(--text-faint)",
                    marginBottom: 9,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {session?.user?.email}
                </p>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 10px",
                    borderRadius: 99,
                    fontSize: 10.5,
                    fontWeight: 700,
                    background: `${planMeta.color}15`,
                    color: planMeta.color,
                    border: `1px solid ${planMeta.color}30`,
                  }}
                >
                  <PlanIcon size={8} /> {planMeta.label} Plan
                </span>
              </div>
              {isPaid && !isMobile && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 5,
                    flexShrink: 0,
                  }}
                >
                  <Link
                    href="/pricing"
                    style={{
                      fontSize: 11.5,
                      color: "var(--text-faint)",
                      padding: "4px 10px",
                      borderRadius: 7,
                      border: "1px solid var(--border)",
                      textDecoration: "none",
                      textAlign: "center",
                      transition: "color .14s, border-color .14s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.color =
                        "var(--text-primary)";
                      (e.currentTarget as HTMLElement).style.borderColor =
                        "var(--border-mid)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.color =
                        "var(--text-faint)";
                      (e.currentTarget as HTMLElement).style.borderColor =
                        "var(--border)";
                    }}
                  >
                    Change
                  </Link>
                  <button
                    onClick={() => setShowConfirm(true)}
                    disabled={cancelling}
                    style={{
                      fontSize: 11.5,
                      color: "var(--red)",
                      background: "transparent",
                      border: "1px solid rgba(224,92,92,.25)",
                      borderRadius: 7,
                      padding: "4px 10px",
                      cursor: "pointer",
                      fontFamily: "var(--font-ui)",
                    }}
                  >
                    {cancelling ? "…" : "Cancel"}
                  </button>
                </div>
              )}
            </div>

            {/* Plan status card */}
            <div
              style={{
                padding: "18px 20px",
                borderRadius: 16,
                border: "1px solid var(--border)",
                background: atLimit
                  ? "rgba(224,92,92,.04)"
                  : isPaid
                    ? "rgba(93,184,122,.04)"
                    : "var(--brand-dim)",
                borderColor: atLimit
                  ? "rgba(224,92,92,.2)"
                  : isPaid
                    ? "rgba(93,184,122,.2)"
                    : "var(--brand-border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  marginBottom: isPro ? 0 : 16,
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: atLimit
                        ? "rgba(224,92,92,.12)"
                        : isPaid
                          ? "rgba(93,184,122,.12)"
                          : "var(--brand-dim)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {atLimit ? (
                      <Lock size={15} style={{ color: "var(--red)" }} />
                    ) : isPaid ? (
                      <CheckCircle
                        size={15}
                        style={{ color: "var(--green)" }}
                      />
                    ) : (
                      <Activity size={15} style={{ color: "var(--brand)" }} />
                    )}
                  </div>
                  <div>
                    <p
                      style={{
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: atLimit
                          ? "var(--red)"
                          : isPaid
                            ? "var(--green)"
                            : "var(--brand)",
                        marginBottom: 3,
                      }}
                    >
                      {atLimit
                        ? "Limit reached"
                        : isPaid
                          ? "Plan active"
                          : "Free plan"}
                    </p>
                    <p
                      style={{
                        fontSize: 12,
                        color: "var(--text-faint)",
                        lineHeight: 1.4,
                      }}
                    >
                      {atLimit
                        ? isFree
                          ? "Resets at midnight"
                          : "Resets next month"
                        : isPro
                          ? "Unlimited searches & uploads"
                          : isStudent
                            ? `${searchesThisMonth} / 500 this month`
                            : `${searchesToday} / 5 today`}
                    </p>
                  </div>
                </div>
                {!isPro && (
                  <Link
                    href="/pricing"
                    style={{
                      padding: "7px 14px",
                      borderRadius: 8,
                      background: atLimit ? "var(--red)" : "var(--brand)",
                      color: "#000",
                      fontSize: 12,
                      fontWeight: 700,
                      textDecoration: "none",
                      flexShrink: 0,
                    }}
                  >
                    {atLimit ? "Upgrade" : isFree ? "Upgrade ✨" : "Change"}
                  </Link>
                )}
              </div>
              {!isPro && (
                <>
                  <div
                    style={{
                      height: 5,
                      background: "var(--surface-2)",
                      borderRadius: 99,
                      overflow: "hidden",
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: atLimit
                          ? "var(--red)"
                          : pct >= 80
                            ? "var(--brand)"
                            : "var(--green)",
                        borderRadius: 99,
                        transition: "width .6s ease",
                      }}
                    />
                  </div>
                  <p style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                    {atLimit ? "0" : counterMax - counterUsed}{" "}
                    {isPro ? "" : "searches"} remaining
                  </p>
                </>
              )}
              {isPaid && isMobile && (
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={cancelling}
                  style={{
                    marginTop: 12,
                    fontSize: 12,
                    color: "var(--text-faint)",
                    background: "transparent",
                    border: "1px solid var(--border)",
                    borderRadius: 7,
                    padding: "6px 12px",
                    cursor: "pointer",
                    fontFamily: "var(--font-ui)",
                  }}
                >
                  {cancelling ? "…" : "Cancel plan"}
                </button>
              )}
            </div>
          </div>

          {/* ── Stats ────────────────────────────────────────── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <StatCard
              value={papers.length}
              label="Saved Papers"
              icon={BookmarkCheck}
              color="#5c9ae0"
            />
            <StatCard
              value={history.length}
              label="Total Searches"
              icon={Search}
              color="var(--brand)"
            />
            <StatCard
              value={reviewHistory.length}
              label="Lit. Reviews"
              icon={BookOpen}
              color="#5db87a"
            />
            <StatCard
              value={isPro ? "∞" : `${counterUsed}/${counterMax}`}
              label={
                isFree
                  ? "Daily Searches"
                  : isStudent
                    ? "Monthly Searches"
                    : "Searches"
              }
              icon={TrendingUp}
              color={
                atLimit
                  ? "var(--red)"
                  : isPro
                    ? "#5db87a"
                    : "var(--text-primary)"
              }
              sub={isPro ? "Unlimited" : undefined}
            />
          </div>

          {/* ── Quick Actions ─────────────────────────────────── */}
          <div style={{ marginBottom: 28 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: "var(--text-faint)",
                marginBottom: 14,
              }}
            >
              Quick Actions
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)",
                gap: 12,
              }}
            >
              <ActionCard
                label="Research Search"
                desc="AI answers from 200M+ academic papers"
                cta="Start searching"
                href="/search"
                color="var(--brand)"
                Icon={Search}
              />
              <ActionCard
                label="Literature Review"
                desc="Full structured review in under 30 seconds"
                cta="Generate review"
                href="/review"
                color="#5db87a"
                Icon={BookOpen}
              />
              <ActionCard
                label="PDF Chat"
                desc="Upload any paper and ask it questions"
                cta="Upload a PDF"
                href="/upload"
                color="#ad73e0"
                Icon={FileText}
              />
            </div>
          </div>

          {/* ── Tabs + Content ────────────────────────────────── */}
          <div
            style={{
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {/* Tab pills */}
            <div
              style={{
                display: "flex",
                gap: 2,
                background: "var(--bg-raised)",
                padding: 4,
                borderRadius: 12,
                border: "1px solid var(--border)",
              }}
            >
              {[
                {
                  id: "library" as const,
                  label: "Library",
                  icon: BookmarkCheck,
                  count: papers.length,
                },
                {
                  id: "history" as const,
                  label: "History",
                  icon: History,
                  count: history.length,
                },
                {
                  id: "reviews" as const,
                  label: "Reviews",
                  icon: BookOpen,
                  count: reviewHistory.length,
                },
              ].map(({ id, label, icon: Icon, count }) => (
                <button
                  key={id}
                  onClick={() => {
                    setActiveTab(id);
                    setSelectedItem(null);
                    setSelectedReview(null);
                  }}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 9,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: "var(--font-ui)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    whiteSpace: "nowrap",
                    background:
                      activeTab === id ? "var(--surface)" : "transparent",
                    color:
                      activeTab === id
                        ? "var(--text-primary)"
                        : "var(--text-faint)",
                    boxShadow:
                      activeTab === id ? "0 1px 4px rgba(0,0,0,.3)" : "none",
                    transition: "background .15s, color .15s",
                  }}
                >
                  <Icon size={12} /> {label}
                  <span
                    style={{
                      padding: "1px 6px",
                      borderRadius: 99,
                      fontSize: 10,
                      fontWeight: 700,
                      background:
                        activeTab === id ? "var(--brand)" : "var(--surface-2)",
                      color: activeTab === id ? "#000" : "var(--text-faint)",
                    }}
                  >
                    {count}
                  </span>
                </button>
              ))}
            </div>
            {/* Contextual button */}
            <Link
              href={activeTab === "reviews" ? "/review" : "/search"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 9,
                border: "1px solid var(--border)",
                color: "var(--text-faint)",
                fontSize: 12.5,
                textDecoration: "none",
                background: "var(--bg-raised)",
                fontWeight: 600,
                transition: "border-color .14s, color .14s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color =
                  "var(--text-primary)";
                (e.currentTarget as HTMLElement).style.borderColor =
                  "var(--border-mid)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color =
                  "var(--text-faint)";
                (e.currentTarget as HTMLElement).style.borderColor =
                  "var(--border)";
              }}
            >
              <Plus size={12} />{" "}
              {activeTab === "reviews" ? "New review" : "New search"}
            </Link>
          </div>

          {/* ── Library tab ── */}
          {activeTab === "library" &&
            (loading ? (
              [1, 2, 3].map((i) => <Shimmer key={i} h={76} />)
            ) : papers.length === 0 && history.length === 0 ? (
              <Empty
                icon={BookmarkCheck}
                title="No saved papers yet"
                desc="Search papers and bookmark them to build your library"
                href="/search"
                cta="Start Searching"
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

                {/* Recent Searches section */}
                {history.length > 0 && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-faint)" }}>
                        Recent Searches
                      </p>
                      <button
                        onClick={() => { setActiveTab("history"); setSelectedItem(null); }}
                        style={{ fontSize: 11.5, color: "var(--brand)", background: "transparent", border: "none", cursor: "pointer", fontFamily: "var(--font-ui)", fontWeight: 600 }}
                      >
                        View all →
                      </button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {history.slice(0, 5).map((h, i) => (
                        <ListRow
                          key={i}
                          onClick={() => { setActiveTab("history"); setSelectedItem(h); }}
                          iconEl={<Search size={13} style={{ color: "var(--brand)" }} />}
                          iconColor="var(--brand)"
                          title={h.query}
                          meta={
                            <span style={{ fontSize: 10.5, color: "var(--text-faint)", display: "flex", alignItems: "center", gap: 3 }}>
                              <Clock size={9} /> {timeAgo(h.searchedAt)}
                            </span>
                          }
                          badge={h.papers && h.papers.length > 0 ? `${h.papers.length} sources` : h.answer ? "\u2713 saved" : undefined}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Saved Papers section */}
                {papers.length > 0 && (
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 12 }}>
                      Saved Papers
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {papers.map((p) => (
                  <div
                    key={p.paperId}
                    style={{
                      padding: "14px 16px",
                      background: "var(--bg-raised)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      display: "flex",
                      gap: 12,
                      transition: "border-color .14s, background .14s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor =
                        "var(--border-mid)";
                      (e.currentTarget as HTMLElement).style.background =
                        "var(--surface)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor =
                        "var(--border)";
                      (e.currentTarget as HTMLElement).style.background =
                        "var(--bg-raised)";
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        className="truncate-1"
                        style={{
                          fontSize: 13.5,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          marginBottom: 4,
                        }}
                      >
                        {p.title}
                      </p>
                      <p style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                        {(p.authors ?? []).slice(0, 3).join(", ")}
                        {(p.authors?.length ?? 0) > 3 ? " et al." : ""}
                        {p.year ? ` · ${p.year}` : ""}
                        {p.journal ? ` · ${p.journal}` : ""}
                      </p>
                      {p.abstract && !isMobile && (
                        <p
                          className="truncate-2"
                          style={{
                            fontSize: 12,
                            color: "var(--text-faint)",
                            marginTop: 5,
                            lineHeight: 1.55,
                          }}
                        >
                          {p.abstract}
                        </p>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        flexShrink: 0,
                        alignItems: "flex-start",
                      }}
                    >
                      {p.url && (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--text-faint)",
                            textDecoration: "none",
                            transition: "border-color .14s, color .14s",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.borderColor =
                              "var(--border-mid)";
                            (e.currentTarget as HTMLElement).style.color =
                              "var(--text-primary)";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.borderColor =
                              "var(--border)";
                            (e.currentTarget as HTMLElement).style.color =
                              "var(--text-faint)";
                          }}
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                      <button
                        onClick={() => void removePaper(p.paperId)}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          background: "rgba(224,92,92,.07)",
                          border: "1px solid rgba(224,92,92,.15)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: "var(--red)",
                          transition: "background .14s",
                        }}
                        onMouseEnter={(e) =>
                          ((e.currentTarget as HTMLElement).style.background =
                            "rgba(224,92,92,.14)")
                        }
                        onMouseLeave={(e) =>
                          ((e.currentTarget as HTMLElement).style.background =
                            "rgba(224,92,92,.07)")
                        }
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
                    </div>
                  </div>
                )}

              </div>
            ))}

          {/* ── History tab ── */}
          {activeTab === "history" && (
            <>
              {atLimit && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 16px",
                    background: "rgba(232,160,69,.06)",
                    border: "1px solid var(--brand-border)",
                    borderRadius: 10,
                    marginBottom: 14,
                  }}
                >
                  <History
                    size={13}
                    style={{ color: "var(--brand)", flexShrink: 0 }}
                  />
                  <p
                    style={{
                      fontSize: 12.5,
                      color: "var(--text-secondary)",
                      lineHeight: 1.5,
                    }}
                  >
                    Limit reached — tap any search to read its saved answer for
                    free.
                  </p>
                </div>
              )}
              {loading ? (
                [1, 2, 3, 4].map((i) => <Shimmer key={i} />)
              ) : history.length === 0 ? (
                <Empty
                  icon={History}
                  title="No history yet"
                  desc="Your searches will appear here once you start researching"
                />
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 7 }}
                >
                  {history.map((h, i) => (
                    <ListRow
                      key={i}
                      onClick={() => setSelectedItem(h)}
                      iconEl={
                        <Search size={13} style={{ color: "var(--brand)" }} />
                      }
                      iconColor="var(--brand)"
                      title={h.query}
                      meta={
                        <span
                          style={{
                            fontSize: 10.5,
                            color: "var(--text-faint)",
                            display: "flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          <Clock size={9} /> {timeAgo(h.searchedAt)}
                        </span>
                      }
                      badge={
                        h.papers && h.papers.length > 0
                          ? `${h.papers.length} sources`
                          : h.answer
                            ? "✓ saved"
                            : undefined
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Reviews tab ── */}
          {activeTab === "reviews" &&
            (loading ? (
              [1, 2, 3].map((i) => <Shimmer key={i} />)
            ) : reviewHistory.length === 0 ? (
              <Empty
                icon={BookOpen}
                title="No reviews yet"
                desc="Generate your first literature review from academic papers"
                href="/review"
                cta="Generate a Review"
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {reviewHistory.map((r, i) => (
                  <ListRow
                    key={i}
                    onClick={() => setSelectedReview(r)}
                    iconEl={<BookOpen size={13} style={{ color: "#5db87a" }} />}
                    iconColor="#5db87a"
                    title={r.topic}
                    meta={
                      <span
                        style={{
                          fontSize: 10.5,
                          color: "var(--text-faint)",
                          display: "flex",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
                        <Clock size={9} /> {timeAgo(r.reviewedAt)}
                      </span>
                    }
                    badge={
                      r.papers && r.papers.length > 0
                        ? `${r.papers.length} sources`
                        : r.review
                          ? "✓ saved"
                          : undefined
                    }
                  />
                ))}
              </div>
            ))}
        </div>
      </div>

      {/* ── Cancel modal ────────────────────────────────────── */}
      {showConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.75)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setShowConfirm(false)}
        >
          <div
            style={{
              maxWidth: 380,
              width: "100%",
              padding: 28,
              background: "var(--bg-overlay)",
              border: "1px solid var(--border-mid)",
              borderRadius: 20,
              boxShadow: "0 32px 80px rgba(0,0,0,.7)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", gap: 14, marginBottom: 20 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: "rgba(224,92,92,.1)",
                  border: "1px solid rgba(224,92,92,.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={20} style={{ color: "var(--red)" }} />
              </div>
              <div>
                <p
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    marginBottom: 8,
                  }}
                >
                  Cancel subscription?
                </p>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    lineHeight: 1.65,
                  }}
                >
                  You keep access until end of billing period. After that,
                  you'll revert to Free (5 searches/day).
                </p>
              </div>
            </div>
            <div
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "1px solid var(--border-mid)",
                  color: "var(--text-secondary)",
                  background: "transparent",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "var(--font-ui)",
                }}
              >
                Keep Plan
              </button>
              <button
                onClick={() => void cancelSubscription()}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  background: "var(--red)",
                  color: "#fff",
                  border: "none",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "var(--font-ui)",
                }}
              >
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashContent />
    </Suspense>
  );
}
