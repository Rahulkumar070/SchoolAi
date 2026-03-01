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
  LayoutDashboard,
  CheckCircle,
  XCircle,
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

function DashContent() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

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

  const planMeta = {
    free: {
      icon: Zap,
      color: "var(--text-muted)",
      bg: "var(--surface-2)",
      border: "var(--border-mid)",
      label: "Free",
    },
    student: {
      icon: Sparkles,
      color: "var(--brand)",
      bg: "var(--brand-dim)",
      border: "var(--brand-border)",
      label: "Student",
    },
    pro: {
      icon: Crown,
      color: "#5c9ae0",
      bg: "rgba(92,154,224,.1)",
      border: "rgba(92,154,224,.22)",
      label: "Pro",
    },
  }[plan] ?? {
    icon: Zap,
    color: "var(--text-muted)",
    bg: "var(--surface-2)",
    border: "var(--border-mid)",
    label: "Free",
  };
  const PlanIcon = planMeta.icon;

  function timeAgo(d: string) {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  // ── REVIEW DETAIL VIEW ──────────────────────────────────
  if (activeTab === "reviews" && selectedReview) {
    return (
      <Shell>
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div
            style={{
              maxWidth: 820,
              margin: "0 auto",
              padding: "28px 20px 60px",
            }}
          >
            <button
              onClick={() => setSelectedReview(null)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                background: "var(--surface)",
                border: "1px solid var(--border-mid)",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 12.5,
                color: "var(--text-secondary)",
                marginBottom: 20,
                fontFamily: "var(--font-ui)",
              }}
            >
              <ChevronLeft size={14} /> Back to Reviews
            </button>

            {/* Topic header */}
            <div
              style={{
                background: "rgba(93,184,122,.07)",
                borderLeft: "4px solid #5db87a",
                borderRadius: "0 12px 12px 0",
                padding: "16px 20px",
                marginBottom: 20,
              }}
            >
              <p
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#5db87a",
                  marginBottom: 5,
                }}
              >
                Literature Review
              </p>
              <p
                style={{
                  fontSize: 16,
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
                    borderRadius: 12,
                    padding: "20px 22px",
                    marginBottom: 20,
                  }}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h2: ({ children }) => (
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
                      h3: ({ children }) => (
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
                      p: ({ children }) => (
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
                      strong: ({ children }) => (
                        <strong
                          style={{
                            color: "var(--text-primary)",
                            fontWeight: 600,
                          }}
                        >
                          {children}
                        </strong>
                      ),
                      ul: ({ children }) => (
                        <ul
                          style={{
                            paddingLeft: "1.4em",
                            marginBottom: ".75em",
                          }}
                        >
                          {children}
                        </ul>
                      ),
                      li: ({ children }) => (
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
                      a: ({ href, children }) => (
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
                    }}
                  >
                    {selectedReview.review}
                  </ReactMarkdown>
                </div>

                {selectedReview.papers && selectedReview.papers.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <p
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
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
                          className="card"
                          style={{
                            padding: "12px 15px",
                            display: "flex",
                            gap: 10,
                          }}
                        >
                          <span
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 6,
                              background: "#5db87a",
                              color: "#000",
                              fontSize: 10,
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
                                fontSize: 12.5,
                                fontWeight: 600,
                                color: "var(--text-primary)",
                                marginBottom: 2,
                                lineHeight: 1.4,
                              }}
                            >
                              {p.title}
                            </p>
                            <p
                              style={{
                                fontSize: 11,
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
                                  fontSize: 11,
                                  color: "var(--brand)",
                                  textDecoration: "none",
                                }}
                              >
                                View paper →
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
                    className="btn btn-outline"
                    style={{
                      padding: "9px 18px",
                      fontSize: 13,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      border: "1px solid var(--brand)",
                      color: "var(--brand)",
                    }}
                  >
                    <Download size={13} /> Download PDF
                  </button>
                  <Link
                    href="/review"
                    className="btn btn-brand"
                    style={{
                      textDecoration: "none",
                      padding: "9px 18px",
                      fontSize: 13,
                    }}
                  >
                    <BookOpen size={12} /> New Review
                  </Link>
                  <button
                    onClick={() => setSelectedReview(null)}
                    className="btn btn-outline"
                    style={{ padding: "9px 18px", fontSize: 13 }}
                  >
                    ← Back
                  </button>
                </div>
              </>
            ) : (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 20px",
                  background: "var(--bg-overlay)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                }}
              >
                <FileText
                  size={28}
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
                  className="btn btn-brand"
                  style={{ textDecoration: "none", padding: "9px 20px" }}
                >
                  Generate Again
                </Link>
              </div>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  // ── HISTORY DETAIL VIEW ──────────────────────────────────
  if (activeTab === "history" && selectedItem) {
    return (
      <Shell>
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div
            style={{
              maxWidth: 820,
              margin: "0 auto",
              padding: "28px 20px 60px",
            }}
          >
            {/* Back */}
            <button
              onClick={() => setSelectedItem(null)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                background: "var(--surface)",
                border: "1px solid var(--border-mid)",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 12.5,
                color: "var(--text-secondary)",
                marginBottom: 20,
                fontFamily: "var(--font-ui)",
              }}
            >
              <ChevronLeft size={14} /> Back to History
            </button>

            {/* Query header */}
            <div
              style={{
                background: "var(--brand-dim)",
                border: "1px solid var(--brand-border)",
                borderLeft: "4px solid var(--brand)",
                borderRadius: "0 12px 12px 0",
                padding: "16px 20px",
                marginBottom: 20,
              }}
            >
              <p
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--brand)",
                  marginBottom: 6,
                }}
              >
                Research Query
              </p>
              <p
                style={{
                  fontSize: 16,
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
                {/* AI Answer */}
                <p
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
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
                    borderRadius: 12,
                    padding: "20px 22px",
                    marginBottom: 20,
                  }}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h2: ({ children }) => (
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
                      h3: ({ children }) => (
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
                      p: ({ children }) => (
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
                      strong: ({ children }) => (
                        <strong
                          style={{
                            color: "var(--text-primary)",
                            fontWeight: 600,
                          }}
                        >
                          {children}
                        </strong>
                      ),
                      ul: ({ children }) => (
                        <ul
                          style={{
                            paddingLeft: "1.4em",
                            marginBottom: ".75em",
                          }}
                        >
                          {children}
                        </ul>
                      ),
                      li: ({ children }) => (
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
                      code: ({ children }) => (
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
                      a: ({ href, children }) => (
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
                    }}
                  >
                    {selectedItem.answer}
                  </ReactMarkdown>
                </div>

                {/* Sources */}
                {selectedItem.papers && selectedItem.papers.length > 0 && (
                  <>
                    <p
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "var(--text-faint)",
                        marginBottom: 12,
                      }}
                    >
                      Sources ({selectedItem.papers.length} Papers)
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
                          className="card"
                          style={{
                            padding: "12px 15px",
                            display: "flex",
                            gap: 11,
                          }}
                        >
                          <span
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 6,
                              background: "var(--brand)",
                              color: "#000",
                              fontSize: 10,
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
                                fontSize: 12.5,
                                fontWeight: 600,
                                color: "var(--text-primary)",
                                marginBottom: 3,
                                lineHeight: 1.4,
                              }}
                            >
                              {p.title}
                            </p>
                            <p
                              style={{
                                fontSize: 11,
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
                                  fontSize: 11.5,
                                  color: "var(--text-secondary)",
                                  marginTop: 4,
                                  lineHeight: 1.5,
                                }}
                                className="truncate-2"
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
                                  fontSize: 11,
                                  color: "var(--brand)",
                                  textDecoration: "none",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 3,
                                  marginTop: 4,
                                }}
                              >
                                View paper <ExternalLink size={9} />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {/* Download PDF button — works on all devices */}
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
                    className="btn btn-outline"
                    style={{
                      padding: "9px 18px",
                      fontSize: 13,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      border: "1px solid var(--brand)",
                      color: "var(--brand)",
                    }}
                  >
                    <Download size={13} /> Download PDF
                  </button>
                  {!atLimit ? (
                    <Link
                      href={`/search?q=${encodeURIComponent(selectedItem.query)}`}
                      className="btn btn-brand"
                      style={{
                        textDecoration: "none",
                        padding: "9px 18px",
                        fontSize: 13,
                      }}
                    >
                      <Search size={12} /> Search Again
                    </Link>
                  ) : (
                    <Link
                      href="/pricing"
                      className="btn btn-brand"
                      style={{
                        textDecoration: "none",
                        padding: "9px 18px",
                        fontSize: 13,
                      }}
                    >
                      <Sparkles size={12} /> Upgrade to Search More
                    </Link>
                  )}
                  <button
                    onClick={() => setSelectedItem(null)}
                    className="btn btn-outline"
                    style={{ padding: "9px 18px", fontSize: 13 }}
                  >
                    ← Back
                  </button>
                </div>
              </>
            ) : (
              /* No answer saved — old history item */
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 20px",
                  background: "var(--bg-overlay)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                }}
              >
                <FileText
                  size={28}
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
                    color: "var(--text-primary)",
                    fontWeight: 600,
                    marginBottom: 6,
                  }}
                >
                  Answer not available
                </p>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--text-secondary)",
                    marginBottom: 20,
                    lineHeight: 1.65,
                  }}
                >
                  This search was made before answers were saved to history.
                  <br />
                  All future searches save the full answer automatically.
                </p>
                {!atLimit ? (
                  <Link
                    href={`/search?q=${encodeURIComponent(selectedItem.query)}`}
                    className="btn btn-brand"
                    style={{ textDecoration: "none", padding: "9px 20px" }}
                  >
                    <Search size={12} /> Re-run this search
                  </Link>
                ) : (
                  <Link
                    href="/pricing"
                    className="btn btn-brand"
                    style={{ textDecoration: "none", padding: "9px 20px" }}
                  >
                    <Sparkles size={12} /> Upgrade to search again
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  // ── MAIN DASHBOARD ───────────────────────────────────────
  return (
    <Shell>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div
          style={{ maxWidth: 820, margin: "0 auto", padding: "28px 20px 60px" }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 11,
              marginBottom: 22,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                background: "rgba(92,154,224,.1)",
                border: "1px solid rgba(92,154,224,.18)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <LayoutDashboard size={16} style={{ color: "#5c9ae0" }} />
            </div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 18,
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              My Dashboard
            </h1>
          </div>

          {/* Profile */}
          <div
            className="card"
            style={{
              padding: 20,
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 12,
            }}
          >
            {session?.user?.image ? (
              <Image
                src={session.user.image}
                alt="avatar"
                width={46}
                height={46}
                style={{ borderRadius: "50%", flexShrink: 0 }}
              />
            ) : (
              <div
                className="avatar"
                style={{ width: 46, height: 46, fontSize: 17, flexShrink: 0 }}
              >
                {(session?.user?.name?.[0] ?? "U").toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                {session?.user?.name ?? "Researcher"}
              </p>
              <p style={{ fontSize: 12, color: "var(--text-faint)" }}>
                {session?.user?.email}
              </p>
            </div>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 12px",
                borderRadius: 99,
                fontSize: 11,
                fontWeight: 700,
                background: planMeta.bg,
                color: planMeta.color,
                border: `1px solid ${planMeta.border}`,
              }}
            >
              <PlanIcon size={10} /> {planMeta.label}
            </span>
          </div>

          {/* Limit reached banner */}
          {atLimit && (
            <div
              style={{
                background: "rgba(224,92,92,.07)",
                border: "1px solid rgba(224,92,92,.22)",
                borderRadius: 14,
                padding: "16px 20px",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <Lock
                  size={18}
                  style={{ color: "var(--red)", flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <p
                    style={{
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: "var(--red)",
                      marginBottom: 3,
                    }}
                  >
                    {isFree
                      ? "Daily limit reached — 5/5 searches used"
                      : "Monthly limit reached — 500/500 used"}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {isFree
                      ? "Resets at midnight. You can still read all your saved answers below."
                      : "Resets next month. Upgrade to Pro for unlimited."}
                  </p>
                </div>
                <Link
                  href="/pricing"
                  className="btn btn-brand"
                  style={{
                    textDecoration: "none",
                    padding: "9px 18px",
                    fontSize: 13,
                    flexShrink: 0,
                  }}
                >
                  {isFree ? "Upgrade ₹199/mo" : "Go Pro ₹499/mo"}{" "}
                  <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          )}

          {/* Free upgrade banner */}
          {isFree && !atLimit && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
                padding: "13px 18px",
                background: "var(--brand-dim)",
                border: "1px solid var(--brand-border)",
                borderRadius: 12,
                marginBottom: 12,
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    marginBottom: 2,
                  }}
                >
                  You&apos;re on the Free plan
                </p>
                <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {searchesToday}/5 searches used today
                </p>
              </div>
              <Link
                href="/pricing"
                className="btn btn-brand"
                style={{
                  textDecoration: "none",
                  padding: "8px 16px",
                  fontSize: 12.5,
                }}
              >
                Upgrade ✨
              </Link>
            </div>
          )}

          {/* Paid active banner */}
          {isPaid && !atLimit && (
            <div
              style={{
                background: "rgba(93,184,122,.06)",
                border: "1px solid rgba(93,184,122,.18)",
                borderRadius: 12,
                padding: "14px 18px",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", gap: 10 }}>
                  <CheckCircle
                    size={17}
                    style={{ color: "var(--green)", flexShrink: 0 }}
                  />
                  <div>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        marginBottom: 2,
                      }}
                    >
                      {planMeta.label} plan active
                    </p>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {isPro
                        ? "Unlimited searches"
                        : `${searchesThisMonth}/500 searches this month`}
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 7 }}>
                  <Link
                    href="/pricing"
                    className="btn btn-outline"
                    style={{
                      textDecoration: "none",
                      padding: "6px 12px",
                      fontSize: 12,
                    }}
                  >
                    Change Plan
                  </Link>
                  <button
                    onClick={() => setShowConfirm(true)}
                    disabled={cancelling}
                    className="btn btn-outline"
                    style={{
                      padding: "6px 12px",
                      fontSize: 12,
                      color: "var(--red)",
                      borderColor: "rgba(224,92,92,.3)",
                    }}
                  >
                    {cancelling ? (
                      <span
                        className="spinner"
                        style={{ width: 10, height: 10 }}
                      />
                    ) : (
                      <>
                        <XCircle size={11} /> Cancel
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Cancel modal */}
          {showConfirm && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,.65)",
                zIndex: 100,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
              }}
            >
              <div
                className="card"
                style={{ maxWidth: 400, width: "100%", padding: 28 }}
              >
                <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                  <AlertTriangle
                    size={20}
                    style={{ color: "var(--red)", flexShrink: 0 }}
                  />
                  <div>
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        marginBottom: 6,
                      }}
                    >
                      Cancel your subscription?
                    </p>
                    <p
                      style={{
                        fontSize: 13,
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
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="btn btn-outline"
                    style={{ padding: "8px 16px", fontSize: 13 }}
                  >
                    Keep Plan
                  </button>
                  <button
                    onClick={() => void cancelSubscription()}
                    className="btn"
                    style={{
                      padding: "8px 16px",
                      fontSize: 13,
                      background: "var(--red)",
                      color: "#fff",
                      border: "none",
                    }}
                  >
                    Yes, Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Stats */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 10,
              marginBottom: 16,
            }}
          >
            {[
              { v: papers.length, l: "Saved Papers", c: planMeta.color },
              {
                v: isPro ? "∞" : `${counterUsed}/${counterMax}`,
                l: isFree
                  ? "Today's Searches"
                  : isStudent
                    ? "Monthly Searches"
                    : "Searches",
                c: atLimit ? "var(--red)" : "var(--green)",
              },
              { v: history.length, l: "Total Searches", c: "#5c9ae0" },
            ].map(({ v, l, c }) => (
              <div key={l} className="card" style={{ padding: "16px 18px" }}>
                <p
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: c,
                    fontFamily: "var(--font-display)",
                    marginBottom: 3,
                  }}
                >
                  {v}
                </p>
                <p style={{ fontSize: 11, color: "var(--text-faint)" }}>{l}</p>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          {!isPro && (
            <div
              className="card"
              style={{ padding: "14px 18px", marginBottom: 20 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <TrendingUp size={13} style={{ color: "var(--brand)" }} />{" "}
                  {isFree ? "Daily" : "Monthly"} Usage
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: atLimit
                      ? "var(--red)"
                      : counterUsed >= counterMax * 0.8
                        ? "var(--brand)"
                        : "var(--green)",
                  }}
                >
                  {counterUsed} / {counterMax}
                </span>
              </div>
              <div
                style={{
                  height: 6,
                  background: "var(--surface-3)",
                  borderRadius: 99,
                  overflow: "hidden",
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min((counterUsed / counterMax) * 100, 100)}%`,
                    background: atLimit
                      ? "var(--red)"
                      : counterUsed >= counterMax * 0.8
                        ? "var(--brand)"
                        : "var(--green)",
                    borderRadius: 99,
                    transition: "width .4s",
                  }}
                />
              </div>
              <p style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                {atLimit ? (
                  <>
                    {isFree ? "Resets at midnight." : "Resets next month."}{" "}
                    <Link
                      href="/pricing"
                      style={{ color: "var(--brand)", textDecoration: "none" }}
                    >
                      Upgrade now →
                    </Link>
                  </>
                ) : (
                  <>
                    {counterMax - counterUsed} remaining ·{" "}
                    <Link
                      href="/pricing"
                      style={{
                        color: "var(--text-faint)",
                        textDecoration: "none",
                      }}
                    >
                      Upgrade for {isFree ? "500/month" : "unlimited"} →
                    </Link>
                  </>
                )}
              </p>
            </div>
          )}

          {/* Tabs */}
          <div
            style={{
              display: "flex",
              gap: 4,
              marginBottom: 16,
              background: "var(--bg-overlay)",
              padding: 4,
              borderRadius: 10,
              border: "1px solid var(--border)",
            }}
          >
            {(
              [
                {
                  id: "library",
                  label: "Saved Papers",
                  icon: BookmarkCheck,
                  count: papers.length,
                },
                {
                  id: "history",
                  label: "Search History",
                  icon: History,
                  count: history.length,
                },
                {
                  id: "reviews",
                  label: "Lit. Reviews",
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
                  flex: 1,
                  padding: "8px 10px",
                  borderRadius: 7,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "var(--font-ui)",
                  transition: "all .15s",
                  background:
                    activeTab === id ? "var(--surface)" : "transparent",
                  color:
                    activeTab === id
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                  boxShadow:
                    activeTab === id ? "0 1px 4px rgba(0,0,0,.3)" : "none",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 5,
                  }}
                >
                  <Icon size={11} /> {label} ({count})
                </span>
              </button>
            ))}
          </div>

          {/* ── Saved Papers ── */}
          {activeTab === "library" && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 15,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  Saved Papers
                </h2>
                {!atLimit && (
                  <Link
                    href="/search"
                    className="btn btn-outline"
                    style={{
                      padding: "5px 11px",
                      fontSize: 12,
                      textDecoration: "none",
                    }}
                  >
                    <Search size={11} /> New Search
                  </Link>
                )}
              </div>
              {loading ? (
                [1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="shimmer-line"
                    style={{ height: 72, borderRadius: 10, marginBottom: 7 }}
                  />
                ))
              ) : papers.length === 0 ? (
                <div
                  className="card"
                  style={{
                    padding: 44,
                    textAlign: "center",
                    borderStyle: "dashed",
                  }}
                >
                  <BookmarkCheck
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
                      fontSize: 15,
                      color: "var(--text-primary)",
                      marginBottom: 6,
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    No saved papers yet
                  </p>
                  <p
                    style={{
                      fontSize: 12.5,
                      color: "var(--text-secondary)",
                      marginBottom: 20,
                    }}
                  >
                    Search papers and bookmark them to save here
                  </p>
                  {!atLimit && (
                    <Link
                      href="/search"
                      className="btn btn-brand"
                      style={{ textDecoration: "none", padding: "8px 18px" }}
                    >
                      <Search size={12} /> Start Searching
                    </Link>
                  )}
                </div>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 7 }}
                >
                  {papers.map((p) => (
                    <div
                      key={p.paperId}
                      className="card"
                      style={{ padding: "13px 15px", display: "flex", gap: 12 }}
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
                        {p.abstract && (
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
                      <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                        {p.url && (
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="icon-btn"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <ExternalLink size={12} />
                          </a>
                        )}
                        <button
                          onClick={() => void removePaper(p.paperId)}
                          className="icon-btn"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Search History List ── */}
          {activeTab === "history" && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 15,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  Search History
                </h2>
                <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
                  Last 50 · tap to read
                </span>
              </div>

              {/* Info strip */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 13px",
                  background: "var(--bg-overlay)",
                  border: "1px solid var(--border)",
                  borderRadius: 9,
                  marginBottom: 14,
                }}
              >
                <History
                  size={12}
                  style={{ color: "var(--brand)", flexShrink: 0 }}
                />
                <p
                  style={{ fontSize: 12, color: "var(--text-muted)", flex: 1 }}
                >
                  {atLimit
                    ? "You've hit your limit — tap any search below to read its saved answer for free."
                    : "Tap any search to read its full saved answer. No credits needed to view history."}
                </p>
              </div>

              {loading ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="shimmer-line"
                    style={{ height: 60, borderRadius: 10, marginBottom: 6 }}
                  />
                ))
              ) : history.length === 0 ? (
                <div
                  className="card"
                  style={{
                    padding: 44,
                    textAlign: "center",
                    borderStyle: "dashed",
                  }}
                >
                  <History
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
                      fontSize: 15,
                      color: "var(--text-primary)",
                      marginBottom: 6,
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    No history yet
                  </p>
                  <p style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                    Your searches will appear here once you start researching
                  </p>
                </div>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {history.map((h, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedItem(h)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "13px 15px",
                        background: "var(--bg-raised)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        cursor: "pointer",
                        textAlign: "left",
                        width: "100%",
                        transition: "all .14s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor =
                          "var(--brand-border)";
                        e.currentTarget.style.background = "var(--surface)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--border)";
                        e.currentTarget.style.background = "var(--bg-raised)";
                      }}
                    >
                      {/* Icon */}
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 9,
                          background: "var(--surface-2)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Search
                          size={13}
                          style={{ color: "var(--text-muted)" }}
                        />
                      </div>

                      {/* Text */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          className="truncate-1"
                          style={{
                            fontSize: 13.5,
                            color: "var(--text-primary)",
                            fontWeight: 500,
                            marginBottom: 3,
                          }}
                        >
                          {h.query}
                        </p>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
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
                          {h.papers && h.papers.length > 0 && (
                            <span
                              style={{ fontSize: 10.5, color: "var(--brand)" }}
                            >
                              {h.papers.length} sources
                            </span>
                          )}
                          {h.answer ? (
                            <span
                              style={{
                                fontSize: 10.5,
                                color: "var(--green)",
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                              }}
                            >
                              ✓ Answer saved
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: 10.5,
                                color: "var(--text-faint)",
                              }}
                            >
                              No answer saved
                            </span>
                          )}
                        </div>
                      </div>

                      <ArrowRight
                        size={13}
                        style={{ color: "var(--text-faint)", flexShrink: 0 }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {/* ── Literature Reviews Tab ── */}
          {activeTab === "reviews" && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 15,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  Literature Reviews
                </h2>
                <Link
                  href="/review"
                  className="btn btn-outline"
                  style={{
                    padding: "5px 11px",
                    fontSize: 12,
                    textDecoration: "none",
                  }}
                >
                  <BookOpen size={11} /> New Review
                </Link>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 13px",
                  background: "var(--bg-overlay)",
                  border: "1px solid var(--border)",
                  borderRadius: 9,
                  marginBottom: 14,
                }}
              >
                <BookOpen
                  size={12}
                  style={{ color: "#5db87a", flexShrink: 0 }}
                />
                <p
                  style={{ fontSize: 12, color: "var(--text-muted)", flex: 1 }}
                >
                  Tap any review to read its full saved content. Available on
                  Student and Pro plans.
                </p>
              </div>

              {loading ? (
                [1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="shimmer-line"
                    style={{ height: 60, borderRadius: 10, marginBottom: 6 }}
                  />
                ))
              ) : reviewHistory.length === 0 ? (
                <div
                  className="card"
                  style={{
                    padding: 44,
                    textAlign: "center",
                    borderStyle: "dashed",
                  }}
                >
                  <BookOpen
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
                      fontSize: 15,
                      color: "var(--text-primary)",
                      marginBottom: 6,
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    No reviews yet
                  </p>
                  <p
                    style={{
                      fontSize: 12.5,
                      color: "var(--text-secondary)",
                      marginBottom: 20,
                    }}
                  >
                    Generate your first literature review from the Literature
                    Review page
                  </p>
                  <Link
                    href="/review"
                    className="btn btn-brand"
                    style={{ textDecoration: "none", padding: "8px 18px" }}
                  >
                    <BookOpen size={12} /> Go to Literature Review
                  </Link>
                </div>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {reviewHistory.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedReview(r)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "13px 15px",
                        background: "var(--bg-raised)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        cursor: "pointer",
                        textAlign: "left",
                        width: "100%",
                        transition: "all .14s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor =
                          "rgba(93,184,122,.4)";
                        e.currentTarget.style.background = "var(--surface)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--border)";
                        e.currentTarget.style.background = "var(--bg-raised)";
                      }}
                    >
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 9,
                          background: "rgba(93,184,122,.1)",
                          border: "1px solid rgba(93,184,122,.2)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <BookOpen size={13} style={{ color: "#5db87a" }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          className="truncate-1"
                          style={{
                            fontSize: 13.5,
                            color: "var(--text-primary)",
                            fontWeight: 500,
                            marginBottom: 3,
                          }}
                        >
                          {r.topic}
                        </p>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
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
                          {r.papers && r.papers.length > 0 && (
                            <span style={{ fontSize: 10.5, color: "#5db87a" }}>
                              {r.papers.length} sources
                            </span>
                          )}
                          {r.review && (
                            <span
                              style={{ fontSize: 10.5, color: "var(--green)" }}
                            >
                              ✓ Saved
                            </span>
                          )}
                        </div>
                      </div>
                      <ArrowRight
                        size={13}
                        style={{ color: "var(--text-faint)", flexShrink: 0 }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
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
