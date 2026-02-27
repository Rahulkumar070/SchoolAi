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
  Zap,
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

  const [panelTurn, setPanelTurn] = useState<Turn | null>(null);
  const [panelTab, setPanelTab] = useState<"sources" | "cite">("sources");

  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const plan = session?.user?.plan ?? "free";
  const isFree = plan === "free";

  // Load today's search count
  useEffect(() => {
    if (!session?.user?.email) return;
    fetch("/api/user/history")
      .then((r) => r.json())
      .then((d: { searchesToday?: number }) =>
        setSearchesToday(d.searchesToday ?? 0),
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
    el.style.height = Math.min(el.scrollHeight, 170) + "px";
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
          toast.error(d.error ?? "Search failed");
          return;
        }
        const turn: Turn = {
          query: q.trim(),
          answer: d.answer ?? "",
          papers: d.papers ?? [],
        };
        setTurns((prev) => [...prev, turn]);
        setPanelTurn(turn);
        if (isFree) setSearchesToday((c) => Math.min(c + 1, 10));
        scrollDown();
      } catch {
        setError("Network error. Please try again.");
        toast.error("Network error");
      } finally {
        setLoading(false);
      }
    },
    [loading, isFree],
  );

  useEffect(() => {
    if (initQ) void doSearch(initQ);
  }, []); // eslint-disable-line

  const SUGGESTIONS = [
    "How does gut microbiome affect mental health?",
    "What are the latest breakthroughs in quantum computing?",
    "Explain RLHF for language model alignment",
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

  // Search counter bar for free users
  const CounterBar =
    isFree && session ? (
      <div
        style={{
          padding: "7px 16px",
          background:
            searchesToday >= 10 ? "rgba(224,92,92,.08)" : "var(--bg-raised)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}
        >
          <Zap
            size={12}
            style={{
              color: searchesToday >= 10 ? "var(--red)" : "var(--brand)",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, maxWidth: 180 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 3,
              }}
            >
              <span style={{ fontSize: 10.5, color: "var(--text-faint)" }}>
                Daily limit
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color:
                    searchesToday >= 10
                      ? "var(--red)"
                      : searchesToday >= 7
                        ? "var(--brand)"
                        : "var(--text-secondary)",
                }}
              >
                {searchesToday}/10
              </span>
            </div>
            <div
              style={{
                height: 3,
                background: "var(--surface-3)",
                borderRadius: 99,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.min((searchesToday / 10) * 100, 100)}%`,
                  background:
                    searchesToday >= 10
                      ? "var(--red)"
                      : searchesToday >= 7
                        ? "var(--brand)"
                        : "var(--green)",
                  borderRadius: 99,
                  transition: "width .4s",
                }}
              />
            </div>
          </div>
        </div>
        {searchesToday >= 7 && (
          <Link
            href="/pricing"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 10px",
              borderRadius: 7,
              background: "var(--brand)",
              color: "#000",
              fontSize: 11,
              fontWeight: 700,
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            Upgrade <ArrowRight size={10} />
          </Link>
        )}
      </div>
    ) : null;

  return (
    <Shell rightPanel={RightPanel}>
      {/* Counter bar */}
      {CounterBar}

      {/* Limit reached banner */}
      {isFree && searchesToday >= 10 && (
        <div
          style={{
            margin: "16px",
            padding: "16px 18px",
            background: "rgba(224,92,92,.07)",
            border: "1px solid rgba(224,92,92,.18)",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <div>
            <p
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: "var(--red)",
                marginBottom: 3,
              }}
            >
              Daily limit reached
            </p>
            <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              You&apos;ve used all 10 free searches. Upgrade for unlimited
              access.
            </p>
          </div>
          <Link
            href="/pricing"
            className="btn btn-brand"
            style={{
              textDecoration: "none",
              padding: "8px 16px",
              fontSize: 12.5,
              flexShrink: 0,
            }}
          >
            Upgrade to Student ₹199/mo →
          </Link>
        </div>
      )}

      {/* Chat column */}
      <div className="chat-col">
        {turns.length === 0 && !loading ? (
          <div className="welcome">
            <div className="welcome-mark">
              <BookOpen size={22} style={{ color: "var(--brand)" }} />
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
              What would you like to research?
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "var(--text-secondary)",
                maxWidth: 400,
                lineHeight: 1.65,
              }}
            >
              Ask anything. I&apos;ll search 200M+ academic papers and give you
              a cited synthesis.
            </p>
            {isFree && session && (
              <p
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginTop: 8,
                }}
              >
                Free plan: {searchesToday}/10 searches used today
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
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "5px 11px",
                          borderRadius: 7,
                          background: "var(--surface)",
                          border: "1px solid var(--border-mid)",
                          color: "var(--text-secondary)",
                          fontSize: 11.5,
                          fontFamily: "var(--font-ui)",
                          cursor: "pointer",
                          marginTop: 10,
                          fontWeight: 500,
                        }}
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
                  <div className="msg-bubble" style={{ opacity: 0.6 }}>
                    {input || "Searching…"}
                  </div>
                </div>
                <div className="msg-row">
                  <div className="msg-avatar">
                    <BookOpen size={12} style={{ color: "var(--brand)" }} />
                  </div>
                  <div
                    style={{
                      padding: "10px 14px",
                      background: "var(--bg-overlay)",
                      border: "1px solid var(--border)",
                      borderRadius: "4px 12px 12px 12px",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              </>
            )}

            {error && !loading && (
              <div
                style={{
                  display: "flex",
                  gap: 9,
                  padding: "12px 14px",
                  background: "rgba(224,92,92,.07)",
                  border: "1px solid rgba(224,92,92,.18)",
                  borderRadius: 10,
                  margin: "0 0 24px",
                }}
              >
                <AlertCircle
                  size={14}
                  style={{ color: "var(--red)", flexShrink: 0, marginTop: 1 }}
                />
                <div style={{ flex: 1 }}>
                  <p
                    style={{
                      fontSize: 13.5,
                      color: "var(--red)",
                      marginBottom: error.includes("limit") ? 6 : 0,
                    }}
                  >
                    {error}
                  </p>
                  {error.includes("limit") && (
                    <Link
                      href="/pricing"
                      style={{
                        fontSize: 12,
                        color: "var(--brand)",
                        textDecoration: "none",
                        fontWeight: 600,
                      }}
                    >
                      Upgrade to Student plan ₹199/mo →
                    </Link>
                  )}
                </div>
              </div>
            )}
            <div ref={endRef} />
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
              isFree && searchesToday >= 10
                ? "Daily limit reached — upgrade for unlimited searches"
                : "Ask a research question… (Enter to send)"
            }
            className="input-textarea"
            rows={1}
            disabled={loading || (isFree && searchesToday >= 10)}
          />
          <button
            onClick={() => void doSearch(input)}
            disabled={
              loading || !input.trim() || (isFree && searchesToday >= 10)
            }
            className={`send-btn${input.trim() && !loading && !(isFree && searchesToday >= 10) ? " ready" : " idle"}`}
          >
            {loading ? (
              <span className="spinner" />
            ) : (
              <ArrowUp
                size={14}
                style={{
                  color:
                    input.trim() && !(isFree && searchesToday >= 10)
                      ? "#000"
                      : "var(--text-faint)",
                }}
              />
            )}
          </button>
        </div>
        <p className="input-hint">
          {isFree && session
            ? `${searchesToday}/10 daily searches used · `
            : ""}
          Searches Semantic Scholar · OpenAlex · arXiv simultaneously
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
