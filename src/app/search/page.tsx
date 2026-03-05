"use client";
import { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
  Sparkles,
  Crown,
  FileDown,
  Copy,
  Check,
  RotateCcw,
  Search,
  Loader2,
} from "lucide-react";
import { Paper } from "@/types";
import toast from "react-hot-toast";
import Link from "next/link";
import { downloadResearchPDF } from "@/lib/downloadPDF";

interface Turn {
  query: string;
  answer: string;
  papers: Paper[];
  streaming?: boolean;
  related?: string[];
  status?: string;
}

const MD = {
  h2: ({ children }: any) => (
    <h2
      style={{
        fontFamily: "var(--font-display)",
        fontSize: "1.05rem",
        color: "var(--text-primary)",
        margin: "1.4em 0 .5em",
        fontWeight: 600,
      }}
    >
      {children}
    </h2>
  ),
  h3: ({ children }: any) => (
    <h3
      style={{
        fontSize: ".95rem",
        color: "var(--text-primary)",
        fontWeight: 600,
        margin: "1em 0 .35em",
      }}
    >
      {children}
    </h3>
  ),
  p: ({ children }: any) => (
    <p
      style={{
        marginBottom: ".8em",
        lineHeight: 1.8,
        fontSize: 15,
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
    <ul style={{ paddingLeft: "1.4em", marginBottom: ".8em" }}>{children}</ul>
  ),
  ol: ({ children }: any) => (
    <ol style={{ paddingLeft: "1.4em", marginBottom: ".8em" }}>{children}</ol>
  ),
  li: ({ children }: any) => (
    <li
      style={{
        marginBottom: ".3em",
        fontSize: 15,
        color: "var(--text-secondary)",
        lineHeight: 1.7,
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
        fontSize: 12.5,
        background: "var(--surface-2)",
        color: "var(--brand)",
        padding: "2px 6px",
        borderRadius: 5,
      }}
    >
      {children}
    </code>
  ),
  blockquote: ({ children }: any) => (
    <blockquote
      style={{
        borderLeft: "3px solid var(--brand)",
        paddingLeft: 14,
        margin: "12px 0",
        color: "var(--text-secondary)",
        fontStyle: "italic",
      }}
    >
      {children}
    </blockquote>
  ),
};

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="sources-chip"
      title="Copy answer"
    >
      {copied ? (
        <>
          <Check size={11} style={{ color: "var(--green)" }} /> Copied
        </>
      ) : (
        <>
          <Copy size={11} /> Copy
        </>
      )}
    </button>
  );
}

function Cursor() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 2,
        height: "0.9em",
        background: "var(--brand)",
        marginLeft: 2,
        verticalAlign: "text-bottom",
        animation: "cursorBlink .85s step-end infinite",
      }}
    />
  );
}

// ── Status indicator shown while streaming ────────────────────
function StatusPill({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 14px",
        borderRadius: 99,
        background: "var(--bg-raised)",
        border: "1px solid var(--border)",
        marginBottom: 14,
      }}
    >
      <Loader2
        size={12}
        style={{ color: "var(--brand)", animation: "spin 1s linear infinite" }}
      />
      <span
        style={{ fontSize: 12.5, color: "var(--text-faint)", fontWeight: 500 }}
      >
        {text}
      </span>
    </div>
  );
}

// ── Related questions after answer ────────────────────────────
function RelatedQuestions({
  questions,
  onSearch,
}: {
  questions: string[];
  onSearch: (q: string) => void;
}) {
  if (!questions.length) return null;
  return (
    <div
      style={{
        marginTop: 18,
        paddingTop: 14,
        borderTop: "1px solid var(--border)",
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "1.2px",
          textTransform: "uppercase",
          color: "var(--text-faint)",
          marginBottom: 10,
        }}
      >
        Related searches
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {questions.map((q, i) => (
          <button
            key={i}
            onClick={() => onSearch(q)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 10,
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
              transition: "border-color .14s, background .14s",
              fontFamily: "var(--font-ui)",
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
            <Search
              size={12}
              style={{ color: "var(--brand)", flexShrink: 0 }}
            />
            <span
              style={{ fontSize: 13, color: "var(--text-secondary)", flex: 1 }}
            >
              {q}
            </span>
            <ArrowRight
              size={11}
              style={{ color: "var(--text-faint)", flexShrink: 0 }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function SearchApp() {
  const params = useSearchParams();
  const router = useRouter();
  const initQ = params.get("q") ?? "";
  const newKey = params.get("new") ?? "";
  const { data: session } = useSession();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState(initQ);
  const [loading, setLoading] = useState(false);
  const [limitError, setLimitError] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [searchesToday, setSearchesToday] = useState(0);
  const [searchesThisMonth, setSearchesThisMonth] = useState(0);
  const [panelTurn, setPanelTurn] = useState<Turn | null>(null);
  const [panelTab, setPanelTab] = useState<"sources" | "cite">("sources");
  const [conversationId, setConversationId] = useState<string | null>(null);

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

  useEffect(() => {
    if (newKey) {
      setTurns([]);
      setInput("");
      setErrorMsg("");
      setLimitError(false);
      setPanelTurn(null);
      setConversationId(null);
      if (taRef.current) taRef.current.style.height = "auto";
    }
  }, [newKey]);

  const scrollDown = () =>
    setTimeout(
      () => endRef.current?.scrollIntoView({ behavior: "smooth" }),
      60,
    );

  const resize = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  const doSearch = useCallback(
    async (q: string, convId?: string | null) => {
      if (!q.trim() || loading) return;
      const query = q.trim();
      const useConvId = convId !== undefined ? convId : conversationId;

      setLoading(true);
      setErrorMsg("");
      setLimitError(false);
      setInput("");
      if (taRef.current) taRef.current.style.height = "auto";

      // Add turn with empty status
      setTurns((prev) => [
        ...prev,
        {
          query,
          answer: "",
          papers: [],
          streaming: true,
          status: "Searching 200M+ papers…",
        },
      ]);
      scrollDown();

      try {
        const resp = await fetch("/api/search/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, conversationId: useConvId }),
        });

        if (!resp.ok) {
          const err = (await resp.json()) as { error?: string };
          if (resp.status === 429) {
            setLimitError(true);
            setErrorMsg(err.error ?? "Limit reached");
          } else setErrorMsg(err.error ?? "Search failed");
          setTurns((prev) => prev.slice(0, -1));
          setLoading(false);
          return;
        }

        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const evt = JSON.parse(line.slice(6)) as {
                type: string;
                text?: string;
                papers?: Paper[];
                conversationId?: string;
                isNewConversation?: boolean;
                related?: string[];
              };

              if (evt.type === "meta" && evt.conversationId) {
                setConversationId(evt.conversationId);
                if (evt.isNewConversation) {
                  window.history.replaceState(
                    null,
                    "",
                    `/chat/${evt.conversationId}`,
                  );
                }
              } else if (evt.type === "status" && evt.text) {
                // Update the loading status text on the last turn
                setTurns((prev) => {
                  const u = [...prev];
                  u[u.length - 1] = { ...u[u.length - 1], status: evt.text };
                  return u;
                });
              } else if (evt.type === "papers" && evt.papers) {
                setTurns((prev) => {
                  const u = [...prev];
                  u[u.length - 1] = { ...u[u.length - 1], papers: evt.papers! };
                  return u;
                });
                setPanelTurn(
                  (t) =>
                    t ?? {
                      query,
                      answer: "",
                      papers: evt.papers!,
                      streaming: true,
                    },
                );
                setPanelTab("sources");
              } else if (evt.type === "text" && evt.text) {
                setTurns((prev) => {
                  const u = [...prev];
                  const last = u[u.length - 1];
                  u[u.length - 1] = {
                    ...last,
                    answer: last.answer + evt.text,
                    status: undefined,
                  };
                  return u;
                });
                scrollDown();
              } else if (evt.type === "done") {
                const relatedQuestions = evt.related ?? [];
                setTurns((prev) => {
                  const u = [...prev];
                  u[u.length - 1] = {
                    ...u[u.length - 1],
                    streaming: false,
                    status: undefined,
                    related: relatedQuestions,
                  };
                  return u;
                });
                setTurns((curr) => {
                  setPanelTurn({ ...curr[curr.length - 1], streaming: false });
                  return curr;
                });
                if (isFree) setSearchesToday((c) => Math.min(c + 1, 5));
                if (isStudent)
                  setSearchesThisMonth((c) => Math.min(c + 1, 500));
                window.dispatchEvent(
                  new Event("researchly:conversation-updated"),
                );
              }
            } catch {
              /* ignore parse errors */
            }
          }
        }
      } catch {
        setErrorMsg("Network error. Please try again.");
        toast.error("Network error");
        setTurns((prev) => prev.slice(0, -1));
      } finally {
        setLoading(false);
        scrollDown();
      }
    },
    [loading, isFree, isStudent, conversationId],
  );

  const autoRun = params.get("autorun") === "1";
  useEffect(() => {
    if (initQ && autoRun) void doSearch(initQ);
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

  return (
    <Shell
      rightPanel={RightPanel}
      activeConversationId={conversationId ?? undefined}
    >
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

      <div className="chat-col">
        {turns.length === 0 && !loading ? (
          /* ── Welcome screen ── */
          <div className="welcome">
            <div className="welcome-mark">
              <BookOpen size={22} style={{ color: "var(--brand)" }} />
            </div>
            <h2 className="welcome-title">What would you like to research?</h2>
            <p className="welcome-sub">
              Ask anything — I&apos;ll search 200M+ papers and give you a cited
              answer.
            </p>
            {!session && (
              <p className="welcome-quota">
                2 free searches as guest ·{" "}
                <Link
                  href="/auth/signin"
                  style={{ color: "var(--brand)", textDecoration: "none" }}
                >
                  Sign in for 5/day →
                </Link>
              </p>
            )}
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
            <div className="suggestion-grid" style={{ marginTop: 24 }}>
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
          /* ── Conversation turns ── */
          <div className="messages-wrap">
            {turns.map((turn, i) => (
              <div key={i} style={{ marginBottom: 36 }}>
                {/* User bubble */}
                <div className="msg-row user">
                  <div className="msg-bubble">{turn.query}</div>
                </div>

                {/* AI response */}
                <div className="msg-row">
                  <div className="msg-avatar">
                    <BookOpen size={12} style={{ color: "var(--brand)" }} />
                  </div>
                  <div className="msg-ai-content">
                    {/* Status pill shown before answer starts */}
                    {turn.streaming && !turn.answer && turn.status && (
                      <StatusPill text={turn.status} />
                    )}

                    {turn.answer ? (
                      <>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={MD as any}
                        >
                          {turn.answer}
                        </ReactMarkdown>
                        {turn.streaming && <Cursor />}

                        {/* Action bar + related questions */}
                        {!turn.streaming && (
                          <>
                            <div
                              style={{
                                display: "flex",
                                gap: 6,
                                marginTop: 14,
                                flexWrap: "wrap",
                                alignItems: "center",
                                borderTop: "1px solid var(--border)",
                                paddingTop: 12,
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
                                  <Layers size={11} /> {turn.papers.length}{" "}
                                  sources
                                </button>
                              )}
                              <CopyBtn text={turn.answer} />
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
                                <FileDown size={11} /> PDF
                              </button>
                              {!atLimit && (
                                <button
                                  onClick={() => void doSearch(turn.query)}
                                  className="sources-chip"
                                  title="Search again"
                                >
                                  <RotateCcw size={11} /> Re-run
                                </button>
                              )}
                              {session && (
                                <span
                                  style={{
                                    fontSize: 10.5,
                                    color: "var(--green)",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                  }}
                                >
                                  ✓ Saved
                                </span>
                              )}
                            </div>

                            {/* Related questions */}
                            <RelatedQuestions
                              questions={turn.related ?? []}
                              onSearch={(q) => void doSearch(q)}
                            />
                          </>
                        )}
                      </>
                    ) : turn.streaming ? (
                      /* Typing dots while waiting for first text chunk */
                      !turn.status && (
                        <div className="typing-bubble">
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                        </div>
                      )
                    ) : null}
                  </div>
                </div>
              </div>
            ))}

            {/* Limit error */}
            {limitError && !loading && (
              <div className="msg-row">
                <div className="msg-avatar">
                  <Lock size={12} style={{ color: "var(--red)" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      background: "rgba(224,92,92,.07)",
                      border: "1px solid rgba(224,92,92,.2)",
                      borderRadius: 12,
                      padding: "16px 18px",
                    }}
                  >
                    {!session ? (
                      <>
                        <p
                          style={{
                            fontSize: 13.5,
                            fontWeight: 700,
                            color: "var(--red)",
                            marginBottom: 6,
                          }}
                        >
                          Guest limit reached (2/2)
                        </p>
                        <p
                          style={{
                            fontSize: 13,
                            color: "var(--text-secondary)",
                            marginBottom: 14,
                            lineHeight: 1.6,
                          }}
                        >
                          Sign in free to get{" "}
                          <strong>5 searches every day</strong> — no credit card
                          needed.
                        </p>
                        <div
                          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                        >
                          <Link
                            href="/auth/signin"
                            className="btn btn-brand"
                            style={{
                              textDecoration: "none",
                              padding: "9px 18px",
                              fontSize: 13,
                            }}
                          >
                            Sign In Free → Get 5/day
                          </Link>
                          <Link
                            href="/pricing"
                            className="btn btn-outline"
                            style={{
                              textDecoration: "none",
                              padding: "9px 14px",
                              fontSize: 13,
                            }}
                          >
                            <Sparkles size={12} /> See Plans
                          </Link>
                        </div>
                      </>
                    ) : (
                      <>
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
                            ? "Upgrade or come back tomorrow."
                            : "Upgrade to Pro for unlimited searches."}
                        </p>
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
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* General error */}
            {errorMsg && !loading && !limitError && (
              <div className="error-card">
                <AlertCircle
                  size={14}
                  style={{ color: "var(--red)", flexShrink: 0, marginTop: 1 }}
                />
                <p style={{ fontSize: 13.5, color: "var(--red)" }}>
                  {errorMsg}
                </p>
              </div>
            )}

            <div ref={endRef} style={{ height: 16 }} />
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
          Semantic Scholar · OpenAlex · arXiv · PubMed
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
