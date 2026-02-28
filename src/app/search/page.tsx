"use client";
import { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Shell from "@/components/layout/Shell";
import PaperCard from "@/components/papers/PaperCard";
import CitationPanel from "@/components/papers/CitationPanel";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookOpen,
  AlertCircle,
  ArrowUp,
  Layers,
  ArrowRight,
  Lock,
  History,
  Clock,
  Sparkles,
  Crown,
  Zap,
  FileDown,
} from "lucide-react";
import { downloadResearchPDF } from "@/lib/downloadPDF";
import { Paper } from "@/types";
import toast from "react-hot-toast";
import Link from "next/link";

interface Turn {
  query: string;
  answer: string;
  papers: Paper[];
}
interface HistItem {
  query: string;
  searchedAt: string;
}

function SearchApp() {
  const params = useSearchParams();
  const initQ = params.get("q") ?? "";
  const { data: session } = useSession();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState(initQ);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchesToday, setSearchesToday] = useState(0);
  const [searchesThisMonth, setSearchesThisMonth] = useState(0);
  const [recentHistory, setRecentHistory] = useState<HistItem[]>([]);
  const [panelTurn, setPanelTurn] = useState<Turn | null>(null);
  const [panelTab, setPanelTab] = useState<"sources" | "cite">("sources");

  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const plan = session?.user?.plan ?? "free";
  const isFree = plan === "free";
  const isStudent = plan === "student";
  const isPro = plan === "pro";

  const atLimit = isFree
    ? searchesToday >= 5
    : isStudent
      ? searchesThisMonth >= 500
      : false;

  const counterMax = isFree ? 5 : isStudent ? 500 : 0;
  const counterUsed = isFree
    ? searchesToday
    : isStudent
      ? searchesThisMonth
      : 0;
  const warnAt = isFree ? 4 : isStudent ? 450 : 0;
  const counterText = isFree
    ? `${searchesToday}/5 searches today`
    : isStudent
      ? `${searchesThisMonth}/500 this month`
      : "";

  useEffect(() => {
    if (!session?.user?.email) return;
    fetch("/api/user/history")
      .then((r) => r.json())
      .then(
        (d: {
          searchesToday?: number;
          searchesThisMonth?: number;
          history?: HistItem[];
        }) => {
          setSearchesToday(d.searchesToday ?? 0);
          setSearchesThisMonth(d.searchesThisMonth ?? 0);
          setRecentHistory(d.history ?? []);
        },
      )
      .catch(() => {});
  }, [session]);

  const scrollDown = () =>
    setTimeout(
      () => endRef.current?.scrollIntoView({ behavior: "smooth" }),
      80,
    );

  const resize = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim() || loading) return;
      setLoading(true);
      setError("");
      setInput("");
      if (taRef.current) taRef.current.style.height = "auto";
      try {
        const r = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q.trim() }),
        });
        const d = (await r.json()) as {
          papers?: Paper[];
          answer?: string;
          error?: string;
          fromCache?: boolean;
        };
        if (!r.ok) {
          setError(d.error ?? "Search failed");
          return;
        }
        const turn: Turn = {
          query: q.trim(),
          answer: d.answer ?? "",
          papers: d.papers ?? [],
        };
        setTurns((prev) => [...prev, turn]);
        setPanelTurn(turn);
        if (isFree) setSearchesToday((c) => Math.min(c + 1, 5));
        if (isStudent) setSearchesThisMonth((c) => Math.min(c + 1, 500));
        // Add to recent history locally
        setRecentHistory((prev) => [
          { query: q.trim(), searchedAt: new Date().toISOString() },
          ...prev.slice(0, 11),
        ]);
        scrollDown();
      } catch {
        setError("Network error. Please try again.");
        toast.error("Network error");
      } finally {
        setLoading(false);
      }
    },
    [loading, isFree, isStudent],
  );

  useEffect(() => {
    if (initQ) void doSearch(initQ);
  }, []); // eslint-disable-line

  const SUGGESTIONS = [
    "How does gut microbiome affect mental health?",
    "Latest breakthroughs in quantum computing",
    "RLHF for language model alignment",
    "Long COVID mechanisms and treatments",
  ];

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  const RightPanel = panelTurn ? (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="panel-header">
        <div className="tab-row">
          <button
            className={`tab${panelTab === "sources" ? " on" : ""}`}
            onClick={() => setPanelTab("sources")}
          >
            Sources ({panelTurn.papers.length})
          </button>
          <button
            className={`tab${panelTab === "cite" ? " on" : ""}`}
            onClick={() => setPanelTab("cite")}
          >
            Cite
          </button>
        </div>
      </div>
      <div className="panel-body">
        {panelTab === "sources" ? (
          panelTurn.papers.map((p, i) => (
            <PaperCard key={p.id} paper={p} index={i + 1} />
          ))
        ) : (
          <CitationPanel papers={panelTurn.papers} />
        )}
      </div>
    </div>
  ) : undefined;

  // ── LIMIT REACHED SCREEN ──────────────────────────────────
  if (atLimit) {
    const upgradeTarget = isFree
      ? {
          plan: "Student",
          price: "₹199/mo",
          searches: "500 searches/month",
          icon: Sparkles,
          color: "var(--brand)",
        }
      : {
          plan: "Pro",
          price: "₹499/mo",
          searches: "Unlimited searches",
          icon: Crown,
          color: "#5c9ae0",
        };
    const UpgradeIcon = upgradeTarget.icon;

    return (
      <Shell>
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div
            style={{ maxWidth: 600, margin: "0 auto", padding: "40px 20px" }}
          >
            {/* Lock icon */}
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 16,
                  background: "rgba(224,92,92,.1)",
                  border: "1px solid rgba(224,92,92,.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                }}
              >
                <Lock size={28} style={{ color: "var(--red)" }} />
              </div>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 22,
                  fontWeight: 400,
                  color: "var(--text-primary)",
                  marginBottom: 8,
                }}
              >
                {isFree ? "Daily limit reached" : "Monthly limit reached"}
              </h2>
              <p
                style={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  lineHeight: 1.65,
                }}
              >
                {isFree
                  ? "You've used all 5 free searches today. Your limit resets at midnight."
                  : "You've used all 500 searches this month. Upgrade to Pro for unlimited access."}
              </p>
            </div>

            {/* Upgrade card */}
            <div
              style={{
                background: "var(--surface)",
                border: `1px solid ${upgradeTarget.color}40`,
                borderRadius: 16,
                padding: 24,
                marginBottom: 16,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: `${upgradeTarget.color}1a`,
                  border: `1px solid ${upgradeTarget.color}30`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 12px",
                }}
              >
                <UpgradeIcon size={18} style={{ color: upgradeTarget.color }} />
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  marginBottom: 4,
                }}
              >
                Upgrade to
              </p>
              <p
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: upgradeTarget.color,
                  marginBottom: 4,
                }}
              >
                {upgradeTarget.plan}
              </p>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  marginBottom: 20,
                }}
              >
                {upgradeTarget.searches}
              </p>
              <Link
                href="/pricing"
                className="btn btn-brand"
                style={{
                  textDecoration: "none",
                  padding: "12px 32px",
                  fontSize: 14,
                  fontWeight: 700,
                  width: "100%",
                  justifyContent: "center",
                }}
              >
                Upgrade for {upgradeTarget.price} <ArrowRight size={14} />
              </Link>
            </div>

            {/* Reset info for free users */}
            {isFree && (
              <div
                style={{
                  background: "var(--bg-overlay)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "14px 16px",
                  marginBottom: 20,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Clock
                  size={14}
                  style={{ color: "var(--text-muted)", flexShrink: 0 }}
                />
                <p style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                  Free limit resets every day at midnight. Come back tomorrow
                  for 5 more searches — or upgrade now for 500/month.
                </p>
              </div>
            )}

            {/* History section — always accessible even at limit */}
            {recentHistory.length > 0 && (
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 12,
                  }}
                >
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                    }}
                  >
                    <History size={13} style={{ color: "var(--brand)" }} /> Your
                    Recent Searches
                  </p>
                  <Link
                    href="/dashboard"
                    style={{
                      fontSize: 11.5,
                      color: "var(--brand)",
                      textDecoration: "none",
                    }}
                  >
                    View all →
                  </Link>
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    marginBottom: 12,
                  }}
                >
                  You can still browse your previous searches below.
                </p>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {recentHistory.slice(0, 8).map((h, i) => (
                    <Link
                      key={i}
                      href={`/search?q=${encodeURIComponent(h.query)}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "11px 14px",
                        background: "var(--bg-raised)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        textDecoration: "none",
                        transition: "border-color .14s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.borderColor =
                          "var(--brand-border)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.borderColor = "var(--border)")
                      }
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          background: "var(--surface)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <History
                          size={11}
                          style={{ color: "var(--text-muted)" }}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            fontSize: 13,
                            color: "var(--text-primary)",
                            fontWeight: 500,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h.query}
                        </p>
                        <p
                          style={{
                            fontSize: 10.5,
                            color: "var(--text-faint)",
                            marginTop: 2,
                          }}
                        >
                          {timeAgo(h.searchedAt)}
                        </p>
                      </div>
                      <ArrowRight
                        size={11}
                        style={{ color: "var(--text-faint)", flexShrink: 0 }}
                      />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* No history yet */}
            {recentHistory.length === 0 && (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                  No search history yet.
                </p>
              </div>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  // ── NORMAL SEARCH SCREEN ─────────────────────────────────
  return (
    <Shell rightPanel={RightPanel}>
      {/* Counter bar */}
      {session && !isPro && (
        <div className="search-counter-bar">
          <div className="search-counter-inner">
            <div className="search-counter-track-wrap">
              <div className="search-counter-track">
                <div
                  className="search-counter-fill"
                  style={{
                    width: `${Math.min((counterUsed / counterMax) * 100, 100)}%`,
                  }}
                  data-warn={counterUsed >= warnAt ? "true" : undefined}
                />
              </div>
              <span className="search-counter-text">{counterText}</span>
            </div>
            {counterUsed >= warnAt && (
              <Link href="/pricing" className="search-counter-cta">
                Upgrade <ArrowRight size={10} />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Chat column */}
      <div className="chat-col">
        {turns.length === 0 && !loading ? (
          <div className="welcome">
            <div className="welcome-mark">
              <BookOpen size={22} style={{ color: "var(--brand)" }} />
            </div>
            <h2 className="welcome-title">What would you like to research?</h2>
            <p className="welcome-sub">
              Ask anything — I&apos;ll search 200M+ papers and give you a cited
              answer.
            </p>
            {session && isFree && (
              <p className="welcome-quota">
                {searchesToday}/5 free searches used today
              </p>
            )}
            {session && isStudent && (
              <p className="welcome-quota">
                {searchesThisMonth}/500 searches used this month
              </p>
            )}
            {session && isPro && (
              <p className="welcome-quota" style={{ color: "var(--green)" }}>
                Pro plan — unlimited searches ✨
              </p>
            )}

            {/* Recent history chips when no searches yet */}
            {recentHistory.length > 0 && turns.length === 0 && (
              <div style={{ marginTop: 24, width: "100%", maxWidth: 520 }}>
                <p
                  style={{
                    fontSize: 11,
                    color: "var(--text-faint)",
                    marginBottom: 8,
                    textAlign: "center",
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    fontWeight: 600,
                  }}
                >
                  Recent
                </p>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 5 }}
                >
                  {recentHistory.slice(0, 4).map((h, i) => (
                    <button
                      key={i}
                      onClick={() => void doSearch(h.query)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 9,
                        padding: "8px 12px",
                        background: "var(--bg-raised)",
                        border: "1px solid var(--border)",
                        borderRadius: 9,
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all .13s",
                      }}
                      onMouseEnter={(e) => {
                        (
                          e.currentTarget as HTMLButtonElement
                        ).style.borderColor = "var(--brand-border)";
                      }}
                      onMouseLeave={(e) => {
                        (
                          e.currentTarget as HTMLButtonElement
                        ).style.borderColor = "var(--border)";
                      }}
                    >
                      <History
                        size={10}
                        style={{ color: "var(--text-faint)", flexShrink: 0 }}
                      />
                      <span
                        style={{
                          fontSize: 12.5,
                          color: "var(--text-secondary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: 1,
                        }}
                      >
                        {h.query}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--text-faint)",
                          flexShrink: 0,
                        }}
                      >
                        {timeAgo(h.searchedAt)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div
              className="suggestion-grid"
              style={{ marginTop: recentHistory.length > 0 ? 16 : 24 }}
            >
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="suggestion-card"
                  onClick={() => void doSearch(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="messages-wrap">
            {turns.map((turn, i) => (
              <div key={i}>
                <div className="msg-row user">
                  <div className="msg-bubble">{turn.query}</div>
                </div>
                <div className="msg-row">
                  <div className="msg-avatar">
                    <BookOpen size={12} style={{ color: "var(--brand)" }} />
                  </div>
                  <div className="msg-ai-content">
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
                              marginBottom: ".7em",
                              lineHeight: 1.76,
                              fontSize: 14.5,
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
                              paddingLeft: "1.3em",
                              marginBottom: ".7em",
                            }}
                          >
                            {children}
                          </ul>
                        ),
                        ol: ({ children }) => (
                          <ol
                            style={{
                              paddingLeft: "1.3em",
                              marginBottom: ".7em",
                            }}
                          >
                            {children}
                          </ol>
                        ),
                        li: ({ children }) => (
                          <li
                            style={{
                              marginBottom: ".25em",
                              fontSize: 14.5,
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
                      }}
                    >
                      {turn.answer}
                    </ReactMarkdown>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        marginTop: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      {turn.papers.length > 0 && (
                        <button
                          onClick={() => {
                            setPanelTurn(turn);
                            setPanelTab("sources");
                          }}
                          className="sources-chip"
                        >
                          <Layers size={11} /> {turn.papers.length} sources
                        </button>
                      )}
                      <button
                        onClick={() =>
                          downloadResearchPDF(
                            turn.query,
                            turn.answer,
                            turn.papers,
                            session?.user?.name ?? undefined,
                          )
                        }
                        className="sources-chip"
                        style={{
                          color: "var(--brand)",
                          borderColor: "var(--brand-border)",
                        }}
                        title="Download full research report as PDF"
                      >
                        <FileDown size={11} /> Download PDF
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <>
                <div className="msg-row user">
                  <div className="msg-bubble" style={{ opacity: 0.55 }}>
                    Searching…
                  </div>
                </div>
                <div className="msg-row">
                  <div className="msg-avatar">
                    <BookOpen size={12} style={{ color: "var(--brand)" }} />
                  </div>
                  <div className="typing-bubble">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              </>
            )}

            {error && !loading && (
              <div className="error-card">
                <AlertCircle
                  size={14}
                  style={{ color: "var(--red)", flexShrink: 0, marginTop: 1 }}
                />
                <div>
                  <p
                    style={{
                      fontSize: 13.5,
                      color: "var(--red)",
                      marginBottom: 6,
                    }}
                  >
                    {error}
                  </p>
                  {error.toLowerCase().includes("limit") && (
                    <Link
                      href="/pricing"
                      style={{
                        fontSize: 12.5,
                        color: "var(--brand)",
                        fontWeight: 600,
                      }}
                    >
                      {isFree
                        ? "Upgrade to Student ₹199/mo →"
                        : "Upgrade to Pro ₹499/mo →"}
                    </Link>
                  )}
                </div>
              </div>
            )}
            <div ref={endRef} style={{ height: 8 }} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="input-bar-wrap">
        <div className="input-bar">
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              resize();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void doSearch(input);
              }
            }}
            placeholder="Ask a research question…"
            className="input-textarea"
            rows={1}
            disabled={loading}
          />
          <button
            onClick={() => void doSearch(input)}
            disabled={loading || !input.trim()}
            className={`send-btn${input.trim() && !loading ? " ready" : " idle"}`}
          >
            {loading ? (
              <span className="spinner" />
            ) : (
              <ArrowUp
                size={14}
                style={{ color: input.trim() ? "#000" : "var(--text-faint)" }}
              />
            )}
          </button>
        </div>
        <p className="input-hint">
          {session && !isPro ? `${counterText} · ` : ""}
          Semantic Scholar · OpenAlex · arXiv
        </p>
      </div>
    </Shell>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchApp />
    </Suspense>
  );
}
