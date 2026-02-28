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
} from "lucide-react";
import { Paper } from "@/types";
import toast from "react-hot-toast";
import Link from "next/link";

interface Turn {
  query: string;
  answer: string;
  papers: Paper[];
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
      : false; // pro = never limited

  const counterText = isFree
    ? `${searchesToday}/5 searches today`
    : isStudent
      ? `${searchesThisMonth}/500 searches this month`
      : "";

  useEffect(() => {
    if (!session?.user?.email) return;
    fetch("/api/user/history")
      .then((r) => r.json())
      .then((d: { searchesToday?: number; searchesThisMonth?: number }) => {
        setSearchesToday(d.searchesToday ?? 0);
        setSearchesThisMonth(d.searchesThisMonth ?? 0);
      })
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

  // Counter bar — show for free and student
  const showCounter = session && (isFree || isStudent);
  const counterMax = isFree ? 5 : 500;
  const counterUsed = isFree ? searchesToday : searchesThisMonth;
  const warnAt = isFree ? 4 : 450;

  return (
    <Shell rightPanel={RightPanel}>
      {/* Counter bar */}
      {showCounter && (
        <div
          className="search-counter-bar"
          data-limit={atLimit ? "true" : undefined}
        >
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
                {counterText}
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

      {/* Limit reached banner */}
      {atLimit && (
        <div className="limit-banner">
          <div className="limit-banner-inner">
            <div>
              <p className="limit-banner-title">
                {isFree ? "Daily limit reached" : "Monthly limit reached"}
              </p>
              <p className="limit-banner-desc">
                {isFree
                  ? "Upgrade to Student plan for 500 searches/month."
                  : "Upgrade to Pro for truly unlimited searches."}
              </p>
            </div>
            <Link href="/pricing" className="btn btn-brand limit-banner-btn">
              {isFree ? "Upgrade ₹199/mo →" : "Upgrade to Pro ₹499/mo →"}
            </Link>
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
            <div className="suggestion-grid">
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
            placeholder={
              atLimit
                ? "Limit reached — upgrade for more searches…"
                : "Ask a research question…"
            }
            className="input-textarea"
            rows={1}
            disabled={loading || atLimit}
          />
          <button
            onClick={() => void doSearch(input)}
            disabled={loading || !input.trim() || atLimit}
            className={`send-btn${input.trim() && !loading && !atLimit ? " ready" : " idle"}`}
          >
            {loading ? (
              <span className="spinner" />
            ) : (
              <ArrowUp
                size={14}
                style={{
                  color:
                    input.trim() && !atLimit ? "#000" : "var(--text-faint)",
                }}
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
