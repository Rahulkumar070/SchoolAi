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
  TrendingUp,
  Lock,
  ChevronLeft,
  FileText,
  BookOpen,
  Download,
  Activity,
  ChevronRight,
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

/* ── responsive hook ─────────────────────────────────────────── */
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

/* ── markdown ────────────────────────────────────────────────── */
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
        wordBreak: "break-word",
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

/* ── stat card ───────────────────────────────────────────────── */
function StatCard({
  value,
  label,
  color,
  icon,
  sub,
}: {
  value: string | number;
  label: string;
  color: string;
  icon: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        padding: "16px 16px 14px",
        borderRadius: 14,
        background: "var(--bg-raised)",
        border: "1px solid var(--border)",
        position: "relative",
        overflow: "hidden",
        transition: "transform .18s, box-shadow .18s",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = "translateY(-2px)";
        el.style.boxShadow = "0 10px 32px rgba(0,0,0,.35)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = "";
        el.style.boxShadow = "";
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -16,
          right: -16,
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: `${color}18`,
          filter: "blur(16px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 18 }}>{icon}</span>
        {sub && (
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              color: "#5db87a",
              background: "rgba(93,184,122,.12)",
              padding: "2px 6px",
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
          fontWeight: 800,
          color,
          fontFamily: "var(--font-display)",
          lineHeight: 1,
          marginBottom: 4,
          letterSpacing: "-1px",
        }}
      >
        {value}
      </p>
      <p style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 500 }}>
        {label}
      </p>
    </div>
  );
}

/* ── action card ─────────────────────────────────────────────── */
function ActionCard({
  label,
  desc,
  cta,
  href,
  color,
  bg,
  Icon,
}: {
  label: string;
  desc: string;
  cta: string;
  href: string;
  color: string;
  bg: string;
  Icon: any;
}) {
  return (
    <Link
      href={href}
      style={{
        padding: "18px 16px 16px",
        borderRadius: 14,
        background: bg,
        border: `1px solid ${color}28`,
        textDecoration: "none",
        display: "flex",
        flexDirection: "column",
        transition: "all .2s",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLAnchorElement;
        el.style.transform = "translateY(-3px)";
        el.style.boxShadow = `0 14px 36px rgba(0,0,0,.3), inset 0 1px 0 ${color}25`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLAnchorElement;
        el.style.transform = "";
        el.style.boxShadow = "";
      }}
    >
      <div
        style={{
          position: "absolute",
          bottom: -16,
          right: -16,
          width: 70,
          height: 70,
          borderRadius: "50%",
          background: `${color}12`,
          filter: "blur(14px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: `${color}18`,
          border: `1px solid ${color}30`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 12,
        }}
      >
        <Icon size={16} style={{ color }} />
      </div>
      <p
        style={{
          fontSize: 13.5,
          fontWeight: 700,
          color: "var(--text-primary)",
          marginBottom: 4,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 12,
          color: "var(--text-secondary)",
          lineHeight: 1.5,
          marginBottom: 12,
          flex: 1,
        }}
      >
        {desc}
      </p>
      <span
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          color,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {cta} <ArrowRight size={10} />
      </span>
    </Link>
  );
}

/* ── list row ────────────────────────────────────────────────── */
function ListRow({
  iconEl,
  iconBg,
  iconBorder,
  title,
  meta,
  badge,
  badgeColor,
  onClick,
}: any) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "13px 14px",
        background: "var(--bg-raised)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        transition: "all .14s",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.background = "var(--surface)";
        el.style.borderColor = iconBorder;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = "var(--bg-raised)";
        el.style.borderColor = "var(--border)";
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: iconBg,
          border: `1px solid ${iconBorder}`,
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
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {meta}
          {badge && (
            <span style={{ fontSize: 10, color: badgeColor, fontWeight: 700 }}>
              {badge}
            </span>
          )}
        </div>
      </div>
      <ChevronRight
        size={13}
        style={{ color: "var(--text-faint)", flexShrink: 0 }}
      />
    </button>
  );
}

/* ── shimmer ─────────────────────────────────────────────────── */
function Shimmer({ h = 66 }: { h?: number }) {
  return (
    <div
      className="shimmer-line"
      style={{ height: h, borderRadius: 12, marginBottom: 8 }}
    />
  );
}

/* ── empty state ─────────────────────────────────────────────── */
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
        padding: "48px 24px",
        textAlign: "center",
        background: "var(--bg-raised)",
        border: "1px dashed var(--border-mid)",
        borderRadius: 16,
      }}
    >
      <Icon
        size={30}
        style={{
          color: "var(--text-faint)",
          opacity: 0.2,
          margin: "0 auto 16px",
          display: "block",
        }}
      />
      <p
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "var(--text-primary)",
          marginBottom: 7,
          fontFamily: "var(--font-display)",
        }}
      >
        {title}
      </p>
      <p
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          marginBottom: href ? 22 : 0,
        }}
      >
        {desc}
      </p>
      {href && cta && (
        <Link
          href={href}
          style={{
            padding: "9px 22px",
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

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════ */
function DashContent() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isMobile, isTablet } = useIsMobile();
  const isSmall = isMobile || isTablet; // < 900px

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
      toast.success("🎉 Plan upgraded! Enjoy your new plan.", {
        id: "upgraded",
        duration: 5000,
      });
      router.replace("/dashboard", { scroll: false });
    }
    if (searchParams.get("tab") === "history") setActiveTab("history");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    Promise.all([
      fetch("/api/papers").then((r) => r.json()),
      fetch("/api/user/history").then((r) => r.json()),
    ])
      .then(
        ([pd, hd]: [
          { papers: SavedPaper[] },
          {
            history: HistoryItem[];
            reviewHistory?: ReviewItem[];
            searchesToday: number;
            searchesThisMonth: number;
          },
        ]) => {
          setPapers(pd.papers ?? []);
          setHistory(hd.history ?? []);
          setReviewHistory(hd.reviewHistory ?? []);
          setSearchesToday(hd.searchesToday ?? 0);
          setSearchesThisMonth(hd.searchesThisMonth ?? 0);
        },
      )
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
      toast.success("Removed");
    } catch {
      toast.error("Failed");
    }
  };

  const cancelSubscription = async () => {
    setCancelling(true);
    setShowConfirm(false);
    try {
      const r = await fetch("/api/razorpay/cancel", { method: "POST" });
      const d = (await r.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };
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
  const isFree = plan === "free";
  const isStudent = plan === "student";
  const isPro = plan === "pro";
  const isPaid = !isFree;
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
      color: "#888",
      bg: "rgba(136,136,136,.1)",
      border: "rgba(136,136,136,.2)",
      label: "Free",
      gradient: "linear-gradient(135deg,#555,#333)",
    },
    student: {
      icon: Sparkles,
      color: "#e8a045",
      bg: "rgba(232,160,69,.1)",
      border: "rgba(232,160,69,.25)",
      label: "Student",
      gradient: "linear-gradient(135deg,#e8a045,#f5c878)",
    },
    pro: {
      icon: Crown,
      color: "#5c9ae0",
      bg: "rgba(92,154,224,.1)",
      border: "rgba(92,154,224,.25)",
      label: "Pro",
      gradient: "linear-gradient(135deg,#5c9ae0,#91c8f8)",
    },
  }[plan] ?? {
    icon: Zap,
    color: "#888",
    bg: "rgba(136,136,136,.1)",
    border: "rgba(136,136,136,.2)",
    label: "Free",
    gradient: "linear-gradient(135deg,#555,#333)",
  };
  const PlanIcon = planMeta.icon;

  /* shared padding / max-width */
  const px = isMobile ? 16 : 24;
  const pb = isMobile ? "48px 20px 80px" : "32px 24px 60px";

  /* ── REVIEW DETAIL ─────────────────────────────────────────── */
  if (activeTab === "reviews" && selectedReview)
    return (
      <Shell>
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div
            style={{
              maxWidth: 820,
              margin: "0 auto",
              padding: `28px ${px}px 60px`,
            }}
          >
            <button
              onClick={() => setSelectedReview(null)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 14px",
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
                borderRadius: 9,
                cursor: "pointer",
                fontSize: 12.5,
                color: "var(--text-secondary)",
                marginBottom: 24,
                fontFamily: "var(--font-ui)",
              }}
            >
              <ChevronLeft size={14} /> Back
            </button>
            <div
              style={{
                background: "rgba(93,184,122,.07)",
                borderLeft: "3px solid #5db87a",
                borderRadius: "0 12px 12px 0",
                padding: "16px 18px",
                marginBottom: 20,
              }}
            >
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  color: "#5db87a",
                  marginBottom: 6,
                }}
              >
                Literature Review
              </p>
              <p
                style={{
                  fontSize: isMobile ? 15 : 17,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  lineHeight: 1.45,
                }}
              >
                {selectedReview.topic}
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
                <Clock size={10} /> {timeAgo(selectedReview.reviewedAt)}
                {selectedReview.papers && selectedReview.papers.length > 0 && (
                  <span style={{ color: "#5db87a" }}>
                    · {selectedReview.papers.length} sources
                  </span>
                )}
              </p>
            </div>
            {selectedReview.review ? (
              <>
                <div
                  style={{
                    background: "var(--bg-raised)",
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    padding: isMobile ? "16px 16px" : "22px 24px",
                    marginBottom: 20,
                  }}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={mdComponents}
                  >
                    {selectedReview.review}
                  </ReactMarkdown>
                </div>
                {selectedReview.papers && selectedReview.papers.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <p
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "1.5px",
                        textTransform: "uppercase",
                        color: "var(--text-faint)",
                        marginBottom: 12,
                      }}
                    >
                      Sources ({selectedReview.papers.length})
                    </p>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 7,
                      }}
                    >
                      {selectedReview.papers.map((p, i) => (
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
                              background: "#5db87a",
                              color: "#000",
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
                                marginBottom: 2,
                              }}
                            >
                              {p.title}
                            </p>
                            <p
                              style={{
                                fontSize: 10.5,
                                color: "var(--text-faint)",
                              }}
                            >
                              {p.authors?.slice(0, 3).join(", ")}
                              {(p.authors?.length ?? 0) > 3 ? " et al." : ""}
                              {p.year ? ` · ${p.year}` : ""}
                            </p>
                            {p.url && (
                              <a
                                href={p.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontSize: 10.5,
                                  color: "var(--brand)",
                                  textDecoration: "none",
                                }}
                              >
                                View →
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
                    onClick={() =>
                      downloadResearchPDF(
                        selectedReview.topic,
                        selectedReview.review ?? "",
                        (selectedReview.papers ??
                          []) as import("@/types").Paper[],
                        session?.user?.name ?? undefined,
                      )
                    }
                    style={{
                      padding: "10px 16px",
                      borderRadius: 10,
                      border: "1px solid var(--brand)",
                      color: "var(--brand)",
                      background: "transparent",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontFamily: "var(--font-ui)",
                    }}
                  >
                    <Download size={13} /> PDF
                  </button>
                  <Link
                    href="/review"
                    style={{
                      padding: "10px 16px",
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
                  <button
                    onClick={() => setSelectedReview(null)}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                      background: "transparent",
                      fontSize: 13,
                      cursor: "pointer",
                      fontFamily: "var(--font-ui)",
                    }}
                  >
                    ← Back
                  </button>
                </div>
              </>
            ) : (
              <div
                style={{
                  textAlign: "center",
                  padding: "44px 20px",
                  background: "var(--bg-raised)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                }}
              >
                <FileText
                  size={26}
                  style={{
                    color: "var(--text-faint)",
                    opacity: 0.4,
                    margin: "0 auto 12px",
                    display: "block",
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
                  Review not available
                </p>
                <Link
                  href="/review"
                  style={{
                    padding: "9px 20px",
                    borderRadius: 10,
                    background: "var(--brand)",
                    color: "#000",
                    fontSize: 13,
                    fontWeight: 700,
                    textDecoration: "none",
                    display: "inline-flex",
                  }}
                >
                  Generate Again
                </Link>
              </div>
            )}
          </div>
        </div>
      </Shell>
    );

  /* ── HISTORY DETAIL ────────────────────────────────────────── */
  if (activeTab === "history" && selectedItem)
    return (
      <Shell>
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div
            style={{
              maxWidth: 820,
              margin: "0 auto",
              padding: `28px ${px}px 60px`,
            }}
          >
            <button
              onClick={() => setSelectedItem(null)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 14px",
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
                borderRadius: 9,
                cursor: "pointer",
                fontSize: 12.5,
                color: "var(--text-secondary)",
                marginBottom: 24,
                fontFamily: "var(--font-ui)",
              }}
            >
              <ChevronLeft size={14} /> Back
            </button>
            <div
              style={{
                background: "var(--brand-dim)",
                borderLeft: "3px solid var(--brand)",
                borderRadius: "0 12px 12px 0",
                padding: "16px 18px",
                marginBottom: 20,
              }}
            >
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  color: "var(--brand)",
                  marginBottom: 6,
                }}
              >
                Research Query
              </p>
              <p
                style={{
                  fontSize: isMobile ? 15 : 17,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  lineHeight: 1.45,
                }}
              >
                {selectedItem.query}
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
                <Clock size={10} /> {timeAgo(selectedItem.searchedAt)}
                {selectedItem.papers && selectedItem.papers.length > 0 && (
                  <span style={{ color: "var(--brand)" }}>
                    · {selectedItem.papers.length} sources
                  </span>
                )}
              </p>
            </div>
            {selectedItem.answer ? (
              <>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    color: "var(--text-faint)",
                    marginBottom: 14,
                  }}
                >
                  AI Research Summary
                </p>
                <div
                  style={{
                    background: "var(--bg-raised)",
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    padding: isMobile ? "16px" : "22px 24px",
                    marginBottom: 20,
                  }}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={mdComponents}
                  >
                    {selectedItem.answer}
                  </ReactMarkdown>
                </div>
                {selectedItem.papers && selectedItem.papers.length > 0 && (
                  <>
                    <p
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "1.5px",
                        textTransform: "uppercase",
                        color: "var(--text-faint)",
                        marginBottom: 12,
                      }}
                    >
                      Sources ({selectedItem.papers.length})
                    </p>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        marginBottom: 24,
                      }}
                    >
                      {selectedItem.papers.map((p, i) => (
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
                              background: "var(--brand)",
                              color: "#000",
                              fontSize: 9.5,
                              fontWeight: 700,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                              marginTop: 1,
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
                              style={{
                                fontSize: 10.5,
                                color: "var(--text-faint)",
                              }}
                            >
                              {p.authors?.slice(0, 3).join(", ")}
                              {(p.authors?.length ?? 0) > 3 ? " et al." : ""}
                              {p.year ? ` · ${p.year}` : ""}
                              {p.journal ? ` · ${p.journal}` : ""}
                            </p>
                            {p.abstract && (
                              <p
                                style={{
                                  fontSize: 11,
                                  color: "var(--text-secondary)",
                                  marginTop: 4,
                                  lineHeight: 1.5,
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                }}
                              >
                                {p.abstract}
                              </p>
                            )}
                            {p.url && (
                              <a
                                href={p.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontSize: 10.5,
                                  color: "var(--brand)",
                                  textDecoration: "none",
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
                  </>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={() =>
                      downloadResearchPDF(
                        selectedItem.query,
                        selectedItem.answer ?? "",
                        (selectedItem.papers ??
                          []) as import("@/types").Paper[],
                        session?.user?.name ?? undefined,
                      )
                    }
                    style={{
                      padding: "10px 16px",
                      borderRadius: 10,
                      border: "1px solid var(--brand)",
                      color: "var(--brand)",
                      background: "transparent",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontFamily: "var(--font-ui)",
                    }}
                  >
                    <Download size={13} /> PDF
                  </button>
                  {!atLimit ? (
                    <Link
                      href={`/search?q=${encodeURIComponent(selectedItem.query)}`}
                      style={{
                        padding: "10px 16px",
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
                      <Search size={12} /> Search Again
                    </Link>
                  ) : (
                    <Link
                      href="/pricing"
                      style={{
                        padding: "10px 16px",
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
                      <Sparkles size={12} /> Upgrade
                    </Link>
                  )}
                  <button
                    onClick={() => setSelectedItem(null)}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                      background: "transparent",
                      fontSize: 13,
                      cursor: "pointer",
                      fontFamily: "var(--font-ui)",
                    }}
                  >
                    ← Back
                  </button>
                </div>
              </>
            ) : (
              <div
                style={{
                  textAlign: "center",
                  padding: "44px 20px",
                  background: "var(--bg-raised)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                }}
              >
                <FileText
                  size={26}
                  style={{
                    color: "var(--text-faint)",
                    opacity: 0.4,
                    margin: "0 auto 12px",
                    display: "block",
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
                  Answer not saved
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    marginBottom: 18,
                    lineHeight: 1.6,
                  }}
                >
                  This search was made before answers were saved.
                  <br />
                  All future searches save automatically.
                </p>
                {!atLimit ? (
                  <Link
                    href={`/search?q=${encodeURIComponent(selectedItem.query)}`}
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
                    <Search size={12} /> Re-run search
                  </Link>
                ) : (
                  <Link
                    href="/pricing"
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
                    <Sparkles size={12} /> Upgrade
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </Shell>
    );

  /* ═══════════════════════════════════════════════════════════
     MAIN DASHBOARD
  ═══════════════════════════════════════════════════════════ */
  return (
    <Shell>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: pb }}>
          {/* ── Top bar ── */}
          <div
            style={{
              display: "flex",
              alignItems: isMobile ? "flex-start" : "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 24,
              flexDirection: isMobile ? "column" : "row",
            }}
          >
            <div>
              {!isMobile && (
                <p
                  style={{
                    fontSize: 11.5,
                    color: "var(--text-faint)",
                    marginBottom: 3,
                    fontWeight: 500,
                  }}
                >
                  {new Date().toLocaleDateString("en-IN", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              )}
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: isMobile ? 18 : 21,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  letterSpacing: "-.4px",
                }}
              >
                Good{" "}
                {new Date().getHours() < 12
                  ? "morning"
                  : new Date().getHours() < 17
                    ? "afternoon"
                    : "evening"}
                , {session?.user?.name?.split(" ")[0]} 👋
              </h1>
            </div>
            <Link
              href="/search"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "9px 18px",
                borderRadius: 10,
                background: "var(--brand)",
                color: "#000",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
                flexShrink: 0,
                alignSelf: isMobile ? "flex-start" : "auto",
              }}
            >
              <Search size={13} /> New Search
            </Link>
          </div>

          {/* ── Profile card (always single col, stacked on mobile) ── */}
          <div
            style={{
              padding: "18px 18px",
              borderRadius: 16,
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 12,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: 120,
                height: 120,
                background: `radial-gradient(circle, ${planMeta.color}12 0%, transparent 70%)`,
                pointerEvents: "none",
              }}
            />
            {/* Avatar */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              {session?.user?.image ? (
                <Image
                  src={session.user.image}
                  alt="avatar"
                  width={52}
                  height={52}
                  style={{
                    borderRadius: "50%",
                    border: `2.5px solid ${planMeta.color}45`,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    background: planMeta.gradient,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                    fontWeight: 800,
                    color: "#000",
                    border: `2.5px solid ${planMeta.color}40`,
                  }}
                >
                  {(session?.user?.name?.[0] ?? "U").toUpperCase()}
                </div>
              )}
              <div
                style={{
                  position: "absolute",
                  bottom: -3,
                  right: -3,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: planMeta.gradient,
                  border: "2.5px solid var(--bg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <PlanIcon size={8} color="#000" />
              </div>
            </div>
            {/* Name + plan */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  marginBottom: 1,
                }}
              >
                {session?.user?.name ?? "Researcher"}
              </p>
              <p
                style={{
                  fontSize: 11,
                  color: "var(--text-faint)",
                  marginBottom: 8,
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
                  background: planMeta.bg,
                  color: planMeta.color,
                  border: `1px solid ${planMeta.border}`,
                }}
              >
                <PlanIcon size={8} /> {planMeta.label} Plan
              </span>
            </div>
            {/* Plan controls */}
            {isPaid && !isMobile && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                  alignItems: "flex-end",
                  flexShrink: 0,
                }}
              >
                <Link
                  href="/pricing"
                  style={{
                    fontSize: 11,
                    color: "var(--text-faint)",
                    textDecoration: "none",
                    padding: "3px 9px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                  }}
                >
                  Change
                </Link>
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={cancelling}
                  style={{
                    fontSize: 11,
                    color: "var(--red)",
                    background: "transparent",
                    border: "1px solid rgba(224,92,92,.3)",
                    borderRadius: 6,
                    padding: "3px 9px",
                    cursor: "pointer",
                    fontFamily: "var(--font-ui)",
                  }}
                >
                  {cancelling ? "..." : "Cancel"}
                </button>
              </div>
            )}
          </div>

          {/* ── Plan status banner ── */}
          <div
            style={{
              padding: "14px 16px",
              borderRadius: 14,
              marginBottom: 12,
              background: atLimit
                ? "rgba(224,92,92,.04)"
                : isPaid
                  ? "rgba(93,184,122,.04)"
                  : "var(--brand-dim)",
              border: `1px solid ${atLimit ? "rgba(224,92,92,.18)" : isPaid ? "rgba(93,184,122,.18)" : "var(--brand-border)"}`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
                marginBottom: !isPro ? 12 : 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {atLimit && <Lock size={14} style={{ color: "var(--red)" }} />}
                {!atLimit && isPaid && (
                  <CheckCircle size={14} style={{ color: "var(--green)" }} />
                )}
                {!atLimit && isFree && (
                  <Activity size={14} style={{ color: "var(--brand)" }} />
                )}
                <div>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: atLimit
                        ? "var(--red)"
                        : isPaid
                          ? "var(--green)"
                          : "var(--brand)",
                    }}
                  >
                    {atLimit
                      ? "Limit reached"
                      : isPaid
                        ? "Plan active"
                        : "Free plan"}
                  </p>
                  <p style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                    {atLimit
                      ? isFree
                        ? "Resets at midnight"
                        : "Resets next month"
                      : isPro
                        ? "Unlimited searches & PDF uploads"
                        : isStudent
                          ? `${searchesThisMonth} / 500 searches this month`
                          : `${searchesToday} / 5 searches today`}
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
                  {atLimit
                    ? "Upgrade now"
                    : isFree
                      ? "Upgrade ✨"
                      : "Change plan"}
                </Link>
              )}
              {isPaid && isMobile && (
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={cancelling}
                  style={{
                    fontSize: 11,
                    color: "var(--text-faint)",
                    background: "transparent",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "5px 10px",
                    cursor: "pointer",
                    fontFamily: "var(--font-ui)",
                  }}
                >
                  {cancelling ? "..." : "Cancel plan"}
                </button>
              )}
            </div>
            {!isPro && (
              <>
                <div
                  style={{
                    height: 5,
                    background: "var(--surface-3)",
                    borderRadius: 99,
                    overflow: "hidden",
                    marginBottom: 6,
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
                <p style={{ fontSize: 11, color: "var(--text-faint)" }}>
                  {atLimit ? "0" : counterMax - counterUsed} remaining
                </p>
              </>
            )}
          </div>

          {/* ── Stats — 2 cols on mobile, 4 on tablet/desktop ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)",
              gap: 10,
              marginBottom: 20,
            }}
          >
            <StatCard
              value={papers.length}
              label="Saved Papers"
              color="#5c9ae0"
              icon="📚"
            />
            <StatCard
              value={history.length}
              label="Total Searches"
              color="var(--brand)"
              icon="🔬"
            />
            <StatCard
              value={reviewHistory.length}
              label="Lit. Reviews"
              color="#5db87a"
              icon="📄"
            />
            <StatCard
              value={isPro ? "∞" : `${counterUsed}/${counterMax}`}
              label={
                isFree ? "Daily Searches" : isStudent ? "Monthly" : "Searches"
              }
              color={
                atLimit
                  ? "var(--red)"
                  : isPro
                    ? "#5db87a"
                    : "var(--text-primary)"
              }
              icon="⚡"
              sub={isPro ? "Unlimited" : undefined}
            />
          </div>

          {/* ── Quick actions — 1 col mobile, 3 col tablet+ ── */}
          <div style={{ marginBottom: 26 }}>
            <p
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: "var(--text-faint)",
                marginBottom: 12,
              }}
            >
              Quick Actions
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)",
                gap: 10,
              }}
            >
              <ActionCard
                label="Research Search"
                desc="AI answers from 200M+ academic papers"
                cta="Start searching"
                href="/search"
                color="var(--brand)"
                bg="rgba(232,160,69,.06)"
                Icon={Search}
              />
              <ActionCard
                label="Literature Review"
                desc="Generate a full structured academic review"
                cta="Generate review"
                href="/review"
                color="#5db87a"
                bg="rgba(93,184,122,.06)"
                Icon={BookOpen}
              />
              <ActionCard
                label="PDF Chat"
                desc="Upload a paper and ask it questions"
                cta="Upload a PDF"
                href="/upload"
                color="#ad73e0"
                bg="rgba(173,115,224,.06)"
                Icon={FileText}
              />
            </div>
          </div>

          {/* ── Tabs — scrollable on mobile ── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 14,
              flexWrap: isMobile ? "wrap" : "nowrap",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 2,
                background: "var(--bg-raised)",
                padding: "3px",
                borderRadius: 11,
                border: "1px solid var(--border)",
                overflowX: "auto",
                flexShrink: 0,
              }}
            >
              {(
                [
                  {
                    id: "library",
                    label: "Library",
                    icon: BookmarkCheck,
                    count: papers.length,
                  },
                  {
                    id: "history",
                    label: "History",
                    icon: History,
                    count: history.length,
                  },
                  {
                    id: "reviews",
                    label: "Reviews",
                    icon: BookOpen,
                    count: reviewHistory.length,
                  },
                ] as const
              ).map(({ id, label, icon: Icon, count }) => (
                <button
                  key={id}
                  onClick={() => {
                    setActiveTab(id);
                    setSelectedItem(null);
                    setSelectedReview(null);
                  }}
                  style={{
                    padding: isMobile ? "7px 12px" : "8px 14px",
                    borderRadius: 9,
                    border: "none",
                    cursor: "pointer",
                    fontSize: isMobile ? 12 : 12.5,
                    fontWeight: 600,
                    fontFamily: "var(--font-ui)",
                    transition: "all .15s",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    whiteSpace: "nowrap",
                    background:
                      activeTab === id ? "var(--surface)" : "transparent",
                    color:
                      activeTab === id
                        ? "var(--text-primary)"
                        : "var(--text-muted)",
                    boxShadow:
                      activeTab === id ? "0 1px 4px rgba(0,0,0,.25)" : "none",
                  }}
                >
                  <Icon size={11} />
                  {label}
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
            {/* Contextual add button */}
            {activeTab === "library" && !atLimit && (
              <Link
                href="/search"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "7px 12px",
                  borderRadius: 9,
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                  fontSize: 12,
                  textDecoration: "none",
                  background: "var(--bg-raised)",
                  flexShrink: 0,
                }}
              >
                <Search size={10} /> Search
              </Link>
            )}
            {activeTab === "reviews" && (
              <Link
                href="/review"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "7px 12px",
                  borderRadius: 9,
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                  fontSize: 12,
                  textDecoration: "none",
                  background: "var(--bg-raised)",
                  flexShrink: 0,
                }}
              >
                <BookOpen size={10} /> New
              </Link>
            )}
          </div>

          {/* ── Saved Papers ── */}
          {activeTab === "library" &&
            (loading ? (
              [1, 2, 3].map((i) => <Shimmer key={i} h={76} />)
            ) : papers.length === 0 ? (
              <Empty
                icon={BookmarkCheck}
                title="No saved papers yet"
                desc="Search papers and bookmark them to build your library"
                href="/search"
                cta="Start Searching"
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {papers.map((p) => (
                  <div
                    key={p.paperId}
                    style={{
                      padding: "13px 14px",
                      background: "var(--bg-raised)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      display: "flex",
                      gap: 12,
                      transition: "all .14s",
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLDivElement;
                      el.style.background = "var(--surface)";
                      el.style.borderColor = "rgba(92,154,224,.25)";
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLDivElement;
                      el.style.background = "var(--bg-raised)";
                      el.style.borderColor = "var(--border)";
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        className="truncate-1"
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          marginBottom: 3,
                        }}
                      >
                        {p.title}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--text-faint)" }}>
                        {(p.authors ?? []).slice(0, 3).join(", ")}
                        {(p.authors?.length ?? 0) > 3 ? " et al." : ""}
                        {p.year ? ` · ${p.year}` : ""}
                        {p.journal ? ` · ${p.journal}` : ""}
                      </p>
                      {p.abstract && !isMobile && (
                        <p
                          className="truncate-2"
                          style={{
                            fontSize: 11.5,
                            color: "var(--text-secondary)",
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
                        gap: 5,
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
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}

          {/* ── Search History ── */}
          {activeTab === "history" && (
            <>
              {atLimit && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "10px 13px",
                    background: "rgba(232,160,69,.06)",
                    border: "1px solid rgba(232,160,69,.18)",
                    borderRadius: 10,
                    marginBottom: 12,
                  }}
                >
                  <History
                    size={12}
                    style={{
                      color: "var(--brand)",
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  />
                  <p
                    style={{
                      fontSize: 12,
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
                      iconBg="rgba(232,160,69,.08)"
                      iconBorder="rgba(232,160,69,.22)"
                      title={h.query}
                      meta={
                        <span
                          style={{
                            fontSize: 10,
                            color: "var(--text-faint)",
                            display: "flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          <Clock size={8} /> {timeAgo(h.searchedAt)}
                        </span>
                      }
                      badge={
                        h.papers && h.papers.length > 0
                          ? `${h.papers.length} sources`
                          : h.answer
                            ? "✓ saved"
                            : undefined
                      }
                      badgeColor={
                        h.papers && h.papers.length > 0
                          ? "var(--brand)"
                          : "var(--green)"
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Literature Reviews ── */}
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
                    iconBg="rgba(93,184,122,.08)"
                    iconBorder="rgba(93,184,122,.22)"
                    title={r.topic}
                    meta={
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--text-faint)",
                          display: "flex",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
                        <Clock size={8} /> {timeAgo(r.reviewedAt)}
                      </span>
                    }
                    badge={
                      r.papers && r.papers.length > 0
                        ? `${r.papers.length} sources`
                        : r.review
                          ? "✓ saved"
                          : undefined
                    }
                    badgeColor={
                      r.papers && r.papers.length > 0
                        ? "#5db87a"
                        : "var(--green)"
                    }
                  />
                ))}
              </div>
            ))}
        </div>
      </div>

      {/* ── Cancel modal ── */}
      {showConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.72)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              maxWidth: 380,
              width: "100%",
              padding: isMobile ? 22 : 28,
              background: "var(--bg-overlay)",
              border: "1px solid var(--border-mid)",
              borderRadius: 18,
              boxShadow: "0 28px 72px rgba(0,0,0,.6)",
            }}
          >
            <div style={{ display: "flex", gap: 13, marginBottom: 18 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 11,
                  background: "rgba(224,92,92,.1)",
                  border: "1px solid rgba(224,92,92,.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={18} style={{ color: "var(--red)" }} />
              </div>
              <div>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    marginBottom: 7,
                  }}
                >
                  Cancel subscription?
                </p>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--text-secondary)",
                    lineHeight: 1.6,
                  }}
                >
                  You keep access until end of billing period. After that,
                  reverts to Free (5 searches/day).
                </p>
              </div>
            </div>
            <div
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  padding: "9px 18px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                  background: "transparent",
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "var(--font-ui)",
                }}
              >
                Keep Plan
              </button>
              <button
                onClick={() => void cancelSubscription()}
                style={{
                  padding: "9px 18px",
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
