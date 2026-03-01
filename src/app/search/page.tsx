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
  History,
  Clock,
  Lock,
  Sparkles,
  Crown,
  FileDown,
  ChevronLeft,
  ExternalLink,
} from "lucide-react";
import { Paper } from "@/types";
import toast from "react-hot-toast";
import Link from "next/link";
import { downloadResearchPDF } from "@/lib/downloadPDF";

interface Turn {
  query: string;
  answer: string;
  papers: Paper[];
}
interface HistItem {
  query: string;
  answer?: string;
  papers?: Paper[];
  searchedAt: string;
}

function SearchApp() {
  const params = useSearchParams();
  const initQ = params.get("q") ?? "";
  const newKey = params.get("new") ?? "";
  const { data: session } = useSession();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState(initQ);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [limitError, setLimitError] = useState(false); // true when 429
  const [searchesToday, setSearchesToday] = useState(0);
  const [searchesThisMonth, setSearchesThisMonth] = useState(0);
  const [recentHistory, setRecentHistory] = useState<HistItem[]>([]);
  const [panelTurn, setPanelTurn] = useState<Turn | null>(null);
  const [panelTab, setPanelTab] = useState<"sources" | "cite">("sources");
  const [viewingHistory, setViewingHistory] = useState<HistItem | null>(null);

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
  const warnAt = isFree ? 4 : 450;

  // Fetch counters and history
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

  // Reset all state when New Research clicked
  useEffect(() => {
    if (newKey) {
      setTurns([]);
      setInput("");
      setError("");
      setLimitError(false);
      setPanelTurn(null);
      setViewingHistory(null);
      if (taRef.current) taRef.current.style.height = "auto";
    }
  }, [newKey]);

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
      setLimitError(false);
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
        };
        if (!r.ok) {
          if (r.status === 429) {
            // Limit hit — show inline upgrade prompt, not error
            setLimitError(true);
            setError(d.error ?? "Limit reached");
          } else {
            setError(d.error ?? "Search failed");
          }
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
        // Update or add to local history — no duplicates
        const newItem = {
          query: q.trim(),
          answer: d.answer ?? "",
          papers: d.papers ?? [],
          searchedAt: new Date().toISOString(),
        };
        setRecentHistory((prev) => {
          const idx = prev.findIndex(
            (h) => h.query.toLowerCase() === q.trim().toLowerCase(),
          );
          if (idx !== -1) {
            // Replace existing entry with updated one
            const updated = [...prev];
            updated[idx] = newItem;
            return updated;
          }
          return [newItem, ...prev.slice(0, 49)];
        });
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

  // Only auto-run when suggestion card clicked (not from history)
  const autoRun = params.get("autorun") === "1";
  useEffect(() => {
    if (initQ && autoRun) void doSearch(initQ);
  }, []); // eslint-disable-line

  // Filter out non-research queries from the recent display
  const realHistory = recentHistory.filter(
    (h) =>
      h.query.length > 10 &&
      !h.query
        .toLowerCase()
        .match(
          /^(give me|download|pdf|get me|can you|please|help me get|i want to download)/,
        ),
  );

  function timeAgo(d: string) {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  const SUGGESTIONS = [
    "How does gut microbiome affect mental health?",
    "Latest breakthroughs in quantum computing",
    "RLHF for language model alignment",
    "Long COVID mechanisms and treatments",
  ];

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

  // ── HISTORY ANSWER VIEWER ──────────────────────────────
  if (viewingHistory) {
    return (
      <Shell>
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div
            style={{
              maxWidth: 740,
              margin: "0 auto",
              padding: "24px 20px 60px",
            }}
          >
            {/* Back button */}
            <button
              onClick={() => setViewingHistory(null)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "7px 12px",
                background: "var(--surface)",
                border: "1px solid var(--border-mid)",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 12.5,
                color: "var(--text-secondary)",
                marginBottom: 20,
                fontFamily: "var(--font-ui)",
                transition: "all .13s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.borderColor = "var(--brand-border)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.borderColor = "var(--border-mid)")
              }
            >
              <ChevronLeft size={14} /> Back to Search
            </button>

            {/* Query header */}
            <div
              style={{
                background: "var(--brand-dim)",
                borderLeft: "4px solid var(--brand)",
                borderRadius: "0 12px 12px 0",
                padding: "14px 18px",
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
                  marginBottom: 5,
                }}
              >
                Saved Research
              </p>
              <p
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  lineHeight: 1.45,
                }}
              >
                {viewingHistory.query}
              </p>
              <p
                style={{
                  fontSize: 11,
                  color: "var(--text-faint)",
                  marginTop: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                <Clock size={10} /> {timeAgo(viewingHistory.searchedAt)}
                {viewingHistory.papers && viewingHistory.papers.length > 0 && (
                  <span style={{ color: "var(--brand)" }}>
                    · {viewingHistory.papers.length} sources
                  </span>
                )}
              </p>
            </div>

            {viewingHistory.answer ? (
              <>
                {/* Answer */}
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
                    {viewingHistory.answer}
                  </ReactMarkdown>
                </div>

                {/* Sources */}
                {viewingHistory.papers && viewingHistory.papers.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <p
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.09em",
                        textTransform: "uppercase",
                        color: "var(--text-faint)",
                        marginBottom: 12,
                      }}
                    >
                      Sources ({viewingHistory.papers.length} papers)
                    </p>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      {viewingHistory.papers.map((p: Paper, i: number) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            gap: 10,
                            padding: "12px 14px",
                            background: "var(--bg-raised)",
                            border: "1px solid var(--border)",
                            borderRadius: 10,
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
                                marginBottom: 3,
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
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 3,
                                }}
                              >
                                View paper <ExternalLink size={9} />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={() => {
                      downloadResearchPDF(
                        viewingHistory.query,
                        viewingHistory.answer!,
                        viewingHistory.papers ?? [],
                        session?.user?.name ?? undefined,
                      );
                    }}
                    className="sources-chip"
                    style={{
                      color: "var(--brand)",
                      borderColor: "var(--brand-border)",
                      padding: "8px 14px",
                      fontSize: 13,
                    }}
                  >
                    <FileDown size={13} /> Download PDF
                  </button>
                  {!atLimit && (
                    <button
                      onClick={() => {
                        setViewingHistory(null);
                        void doSearch(viewingHistory.query);
                      }}
                      className="btn btn-brand"
                      style={{ padding: "8px 16px", fontSize: 13 }}
                    >
                      🔍 Search Again
                    </button>
                  )}
                  {atLimit && (
                    <Link
                      href="/pricing"
                      className="btn btn-brand"
                      style={{
                        textDecoration: "none",
                        padding: "8px 16px",
                        fontSize: 13,
                      }}
                    >
                      <Sparkles size={12} /> Upgrade to Search More
                    </Link>
                  )}
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
                <History
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
                  Answer not saved
                </p>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--text-secondary)",
                    marginBottom: 20,
                    lineHeight: 1.65,
                  }}
                >
                  This was searched before answer-saving was added.
                  <br />
                  New searches save the full answer automatically.
                </p>
                {!atLimit ? (
                  <button
                    onClick={() => {
                      setViewingHistory(null);
                      void doSearch(viewingHistory.query);
                    }}
                    className="btn btn-brand"
                    style={{ padding: "9px 20px" }}
                  >
                    🔍 Re-run this search
                  </button>
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
                  data-limit={atLimit ? "true" : undefined}
                />
              </div>
              <span
                className="search-counter-text"
                data-limit={atLimit ? "true" : undefined}
              >
                {isFree
                  ? `${searchesToday}/5 today`
                  : `${searchesThisMonth}/500 this month`}
              </span>
            </div>
            {counterUsed >= warnAt && (
              <Link href="/pricing" className="search-counter-cta">
                Upgrade <ArrowRight size={10} />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Chat */}
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
                {searchesToday}/5 free searches today
              </p>
            )}
            {session && isStudent && (
              <p className="welcome-quota">
                {searchesThisMonth}/500 searches this month
              </p>
            )}
            {session && isPro && (
              <p className="welcome-quota" style={{ color: "var(--green)" }}>
                Pro plan — unlimited ✨
              </p>
            )}

            {/* Recent history quick access */}
            {recentHistory.length > 0 && (
              <div style={{ marginTop: 22, width: "100%", maxWidth: 520 }}>
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
                  {realHistory.slice(0, 4).map((h, i) => (
                    <button
                      key={i}
                      onClick={() =>
                        h.answer ? setViewingHistory(h) : setInput(h.query)
                      }
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 13px",
                        background: "var(--bg-raised)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all .13s",
                        width: "100%",
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
                        <History
                          size={11}
                          style={{ color: "var(--text-muted)" }}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            fontSize: 12.5,
                            color: "var(--text-primary)",
                            fontWeight: 500,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            marginBottom: 2,
                          }}
                        >
                          {h.query}
                        </p>
                        <p
                          style={{
                            fontSize: 10,
                            color: "var(--text-faint)",
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          {timeAgo(h.searchedAt)}
                          {h.answer && (
                            <span style={{ color: "var(--green)" }}>
                              · Answer saved ✓
                            </span>
                          )}
                        </p>
                      </div>
                      <ArrowRight
                        size={11}
                        style={{ color: "var(--text-faint)", flexShrink: 0 }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="suggestion-grid" style={{ marginTop: 20 }}>
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
                      {turn.answer}
                    </ReactMarkdown>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        marginTop: 10,
                        flexWrap: "wrap",
                        alignItems: "center",
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
                      >
                        <FileDown size={11} /> Download PDF
                      </button>
                      {session && (
                        <span
                          style={{
                            fontSize: 10.5,
                            color: "var(--green)",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            marginLeft: 4,
                          }}
                        >
                          ✓ Saved to history
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <>
                <div className="msg-row user">
                  <div className="msg-bubble" style={{ opacity: 0.5 }}>
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

            {/* ── LIMIT HIT — inline upgrade card ── */}
            {limitError && !loading && (
              <div className="msg-row">
                <div className="msg-avatar">
                  <Lock size={12} style={{ color: "var(--red)" }} />
                </div>
                <div style={{ flex: 1 }}>
                  {/* Show the query they tried */}
                  <div
                    style={{
                      background: "rgba(224,92,92,.07)",
                      border: "1px solid rgba(224,92,92,.2)",
                      borderRadius: 12,
                      padding: "16px 18px",
                    }}
                  >
                    <p
                      style={{
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: "var(--red)",
                        marginBottom: 6,
                      }}
                    >
                      {isFree
                        ? "Daily limit reached (5/5)"
                        : "Monthly limit reached (500/500)"}
                    </p>
                    <p
                      style={{
                        fontSize: 13,
                        color: "var(--text-secondary)",
                        marginBottom: 14,
                        lineHeight: 1.6,
                      }}
                    >
                      {isFree
                        ? "You've used all 5 free searches for today. Upgrade to get 500 searches per month, or come back tomorrow."
                        : "You've used all 500 searches this month. Upgrade to Pro for truly unlimited searches."}
                    </p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Link
                        href="/pricing"
                        className="btn btn-brand"
                        style={{
                          textDecoration: "none",
                          padding: "9px 18px",
                          fontSize: 13,
                        }}
                      >
                        {isFree ? (
                          <>
                            <Sparkles size={12} /> Upgrade to Student ₹199/mo
                          </>
                        ) : (
                          <>
                            <Crown size={12} /> Upgrade to Pro ₹499/mo
                          </>
                        )}
                      </Link>
                      <Link
                        href="/dashboard?tab=history"
                        className="btn btn-outline"
                        style={{
                          textDecoration: "none",
                          padding: "9px 14px",
                          fontSize: 13,
                        }}
                      >
                        <History size={12} /> View Past Answers
                      </Link>
                    </div>
                    {isFree && (
                      <p
                        style={{
                          fontSize: 11,
                          color: "var(--text-faint)",
                          marginTop: 10,
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <Clock size={9} /> Free searches reset at midnight
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* General error (non-limit) */}
            {error && !loading && !limitError && (
              <div className="error-card">
                <AlertCircle
                  size={14}
                  style={{ color: "var(--red)", flexShrink: 0, marginTop: 1 }}
                />
                <p style={{ fontSize: 13.5, color: "var(--red)" }}>{error}</p>
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
          {session && !isPro
            ? `${isFree ? `${searchesToday}/5 today` : `${searchesThisMonth}/500 this month`} · `
            : ""}
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
