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
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import toast from "react-hot-toast";
import { SavedPaper } from "@/types";

function DashContent() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [papers, setPapers] = useState<SavedPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
  }, [status, router]);

  useEffect(() => {
    if (searchParams.get("upgraded") === "1") {
      void update();
      toast.success("Plan upgraded! Welcome to ScholarAI Pro.", {
        id: "upgraded",
        duration: 5000,
      });
      router.replace("/dashboard", { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/papers")
      .then((r) => r.json())
      .then((d: { papers: SavedPaper[] }) => setPapers(d.papers ?? []))
      .catch(() => toast.error("Failed to load papers"))
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
        await update(); // Refresh session
        toast.success(
          d.message ??
            "Subscription cancelled. Access continues until billing period ends.",
        );
      } else {
        toast.error(d.error ?? "Cancellation failed");
      }
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

  return (
    <Shell>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div
          style={{ maxWidth: 800, margin: "0 auto", padding: "28px 20px 48px" }}
        >
          {/* ── Header ── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 11,
              marginBottom: 24,
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

          {/* ── Profile card ── */}
          <div
            className="card"
            style={{
              padding: 20,
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 14,
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

          {/* ── Free plan upgrade banner ── */}
          {!isPaid && (
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
                marginBottom: 14,
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
                  Unlimited searches, reviews & PDF chat from ₹199/mo
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

          {/* ── Paid plan status card ── */}
          {isPaid && (
            <div
              style={{
                background: "rgba(93,184,122,.06)",
                border: "1px solid rgba(93,184,122,.18)",
                borderRadius: 12,
                padding: "16px 18px",
                marginBottom: 14,
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
                      access until the end of your billing period.
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

          {/* ── Cancel confirm dialog ── */}
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
                      (10 searches/day).
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

          {/* ── Stats ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 10,
              marginBottom: 24,
            }}
          >
            {[
              { v: papers.length, l: "Saved Papers", c: planMeta.color },
              {
                v: plan === "free" ? "10 / day" : "∞",
                l: "Daily Searches",
                c: "var(--green)",
              },
              { v: planMeta.label, l: "Current Plan", c: "#5c9ae0" },
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

          {/* ── Saved papers ── */}
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
              Saved Papers ({papers.length})
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
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
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
