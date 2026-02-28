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
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import toast from "react-hot-toast";
import { SavedPaper } from "@/types";

interface HistoryItem {
  query: string;
  searchedAt: string;
}

function DashContent() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [papers, setPapers] = useState<SavedPaper[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [searchesToday, setSearchesToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"library" | "history">("library");
  const [cancelling, setCancelling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
  }, [status, router]);

  useEffect(() => {
    if (searchParams.get("upgraded") === "1") {
      void update();
      toast.success("Plan upgraded! Welcome to ScholarAI.", {
        id: "upgraded",
        duration: 5000,
      });
      router.replace("/dashboard", { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    Promise.all([
      fetch("/api/papers").then((r) => r.json()),
      fetch("/api/user/history").then((r) => r.json()),
    ])
      .then(
        ([papersData, historyData]: [
          { papers: SavedPaper[] },
          { history: HistoryItem[]; searchesToday: number },
        ]) => {
          setPapers(papersData.papers ?? []);
          setHistory(historyData.history ?? []);
          setSearchesToday(historyData.searchesToday ?? 0);
        },
      )
      .catch(() => toast.error("Failed to load data"))
      .finally(() => setLoading(false));
  }, [status]);

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
      toast.error("Network error. Please try again.");
    } finally {
      setCancelling(false);
    }
  };

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
      toast.error("Failed");
    }
  };

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg)",
        }}
      >
        <span className="spinner" />
      </div>
    );
  }

  const plan = session?.user?.plan ?? "free";
  const isPaid = plan !== "free";
  const isFree = plan === "free";

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

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  return (
    <Shell>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div
          style={{ maxWidth: 820, margin: "0 auto", padding: "28px 20px 48px" }}
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

          {/* Profile card */}
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

          {/* Free plan upgrade banner */}
          {isFree && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
                padding: "14px 18px",
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
                  {searchesToday}/5 searches used today · Upgrade for unlimited
                  searches, literature reviews & PDF chat
                </p>
              </div>
              <Link
                href="/pricing"
                className="btn btn-brand"
                style={{
                  textDecoration: "none",
                  padding: "8px 18px",
                  fontSize: 12.5,
                  flexShrink: 0,
                }}
              >
                Upgrade Now ✨
              </Link>
            </div>
          )}

          {/* Paid plan status */}
          {isPaid && (
            <div
              style={{
                background: "rgba(93,184,122,.06)",
                border: "1px solid rgba(93,184,122,.18)",
                borderRadius: 12,
                padding: "16px 18px",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", gap: 10 }}>
                  <CheckCircle
                    size={18}
                    style={{
                      color: "var(--green)",
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  />
                  <div>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        marginBottom: 3,
                      }}
                    >
                      {planMeta.label} plan is active
                    </p>
                    <p
                      style={{
                        fontSize: 12,
                        color: "var(--text-secondary)",
                        lineHeight: 1.5,
                      }}
                    >
                      Renews automatically each month. Cancel anytime — you keep
                      access until end of billing period.
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <Link
                    href="/pricing"
                    className="btn btn-outline"
                    style={{
                      textDecoration: "none",
                      padding: "6px 14px",
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
                      padding: "6px 14px",
                      fontSize: 12,
                      color: "var(--red)",
                      borderColor: "rgba(224,92,92,.3)",
                    }}
                  >
                    {cancelling ? (
                      <>
                        <span
                          className="spinner"
                          style={{ width: 11, height: 11 }}
                        />{" "}
                        Cancelling…
                      </>
                    ) : (
                      <>
                        <XCircle size={12} /> Cancel Plan
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Cancel confirm */}
          {showConfirm && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.65)",
                zIndex: 100,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
              }}
            >
              <div
                className="card"
                style={{
                  maxWidth: 400,
                  width: "100%",
                  padding: 28,
                  background: "var(--bg-overlay)",
                }}
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
                      You&apos;ll keep full access until the end of your current
                      billing period. After that, your account reverts to Free
                      (5 searches/day).
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
              marginBottom: 22,
            }}
          >
            {[
              { v: papers.length, l: "Saved Papers", c: planMeta.color },
              {
                v: isFree ? `${searchesToday}/5` : "∞",
                l: "Today's Searches",
                c: isFree && searchesToday >= 5 ? "var(--red)" : "var(--green)",
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

          {/* Free search progress bar */}
          {isFree && (
            <div
              className="card"
              style={{ padding: "14px 18px", marginBottom: 22 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
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
                  Daily Search Usage
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color:
                      searchesToday >= 5
                        ? "var(--red)"
                        : searchesToday >= 4
                          ? "var(--brand)"
                          : "var(--green)",
                  }}
                >
                  {searchesToday} / 5 used
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
                    width: `${Math.min((searchesToday / 5) * 100, 100)}%`,
                    background:
                      searchesToday >= 5
                        ? "var(--red)"
                        : searchesToday >= 4
                          ? "var(--brand)"
                          : "var(--green)",
                    borderRadius: 99,
                    transition: "width .4s",
                  }}
                />
              </div>
              <p style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                {searchesToday >= 5
                  ? "Daily limit reached. Resets at midnight. "
                  : `${5 - searchesToday} searches remaining today. Resets daily at midnight. `}
                <Link
                  href="/pricing"
                  style={{ color: "var(--brand)", textDecoration: "none" }}
                >
                  Upgrade for unlimited →
                </Link>
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
            {(["library", "history"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: "7px 12px",
                  borderRadius: 7,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 600,
                  fontFamily: "var(--font-ui)",
                  transition: "all .15s",
                  background:
                    activeTab === tab ? "var(--surface)" : "transparent",
                  color:
                    activeTab === tab
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                  boxShadow:
                    activeTab === tab ? "0 1px 4px rgba(0,0,0,.3)" : "none",
                }}
              >
                {tab === "library" ? (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <BookmarkCheck size={12} /> Saved Papers ({papers.length})
                  </span>
                ) : (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <History size={12} /> Search History ({history.length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Library tab */}
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
              </div>

              {loading ? (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 7 }}
                >
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="shimmer-line"
                      style={{ height: 72, borderRadius: 10 }}
                    />
                  ))}
                </div>
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
                      fontFamily: "var(--font-display)",
                      fontSize: 15,
                      color: "var(--text-primary)",
                      marginBottom: 6,
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
                    Search papers and click the bookmark icon to save them here
                  </p>
                  <Link
                    href="/search"
                    className="btn btn-brand"
                    style={{ textDecoration: "none", padding: "8px 18px" }}
                  >
                    <Search size={12} /> Start Searching
                  </Link>
                </div>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 7 }}
                >
                  {papers.map((p) => (
                    <div
                      key={p.paperId}
                      className="card"
                      style={{
                        padding: "13px 15px",
                        display: "flex",
                        gap: 12,
                        alignItems: "flex-start",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          className="truncate-1"
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            lineHeight: 1.35,
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

          {/* History tab */}
          {activeTab === "history" && (
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
                  Search History
                </h2>
                <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
                  Last 50 searches saved
                </span>
              </div>

              {loading ? (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 7 }}
                >
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="shimmer-line"
                      style={{ height: 52, borderRadius: 10 }}
                    />
                  ))}
                </div>
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
                      fontFamily: "var(--font-display)",
                      fontSize: 15,
                      color: "var(--text-primary)",
                      marginBottom: 6,
                    }}
                  >
                    No search history yet
                  </p>
                  <p
                    style={{
                      fontSize: 12.5,
                      color: "var(--text-secondary)",
                      marginBottom: 20,
                    }}
                  >
                    Your searches will appear here so you can revisit them
                    anytime
                  </p>
                  <Link
                    href="/search"
                    className="btn btn-brand"
                    style={{ textDecoration: "none", padding: "8px 18px" }}
                  >
                    <Search size={12} /> Start Searching
                  </Link>
                </div>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {history.map((h, i) => (
                    <div
                      key={i}
                      className="card"
                      style={{
                        padding: "11px 14px",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          background: "var(--surface-2)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Search
                          size={11}
                          style={{ color: "var(--text-muted)" }}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          className="truncate-1"
                          style={{
                            fontSize: 13,
                            color: "var(--text-primary)",
                            fontWeight: 500,
                          }}
                        >
                          {h.query}
                        </p>
                        <p
                          style={{
                            fontSize: 10.5,
                            color: "var(--text-faint)",
                            marginTop: 2,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Clock size={9} /> {timeAgo(h.searchedAt)}
                        </p>
                      </div>
                      <Link
                        href={`/search?q=${encodeURIComponent(h.query)}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "5px 10px",
                          borderRadius: 7,
                          background: "var(--surface)",
                          border: "1px solid var(--border-mid)",
                          color: "var(--text-secondary)",
                          fontSize: 11.5,
                          textDecoration: "none",
                          flexShrink: 0,
                          fontWeight: 500,
                        }}
                        onMouseEnter={(e) => {
                          (
                            e.currentTarget as HTMLAnchorElement
                          ).style.borderColor = "var(--brand-border)";
                          (e.currentTarget as HTMLAnchorElement).style.color =
                            "var(--brand)";
                        }}
                        onMouseLeave={(e) => {
                          (
                            e.currentTarget as HTMLAnchorElement
                          ).style.borderColor = "var(--border-mid)";
                          (e.currentTarget as HTMLAnchorElement).style.color =
                            "var(--text-secondary)";
                        }}
                      >
                        Research again <ArrowRight size={10} />
                      </Link>
                    </div>
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
