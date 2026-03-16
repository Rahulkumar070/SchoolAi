"use client";
import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Shell from "@/components/layout/Shell";
import PaperCard from "@/components/papers/PaperCard";
import CitationPanel from "@/components/papers/CitationPanel";
import {
  BookOpen,
  ArrowUp,
  Layers,
  Sparkles,
  Crown,
  Lock,
  FileDown,
  Copy,
  Check,
  RotateCcw,
  AlertCircle,
  ArrowRight,
  Link2,
} from "lucide-react";
import { Paper } from "@/types";
import toast from "react-hot-toast";
import Link from "next/link";
import { downloadResearchPDF } from "@/lib/downloadPDF";
import AnswerRenderer from "@/components/answer/AnswerRenderer";

// ── Types ─────────────────────────────────────────────────────
interface Message {
  _id: string;
  role: "user" | "assistant";
  content: string;
  papers: Paper[]; // cited papers only — rendered in the Sources panel
  retrievedPapers: Paper[]; // full ranked retrieval set — available for "Retrieved papers" view
  evidenceIdToPaperId?: Record<string, string>; // maps evidenceId → paperId for citation resolution
  createdAt: string;
}
interface ConvMeta {
  _id: string;
  title: string;
  updatedAt: string;
}

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

function slugify(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function CopyLinkBtn({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="chip"
      onClick={() => {
        void navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? (
        <><Check size={11} style={{ color: "var(--green)" }} /> Copied!</>
      ) : (
        <><Link2 size={11} /> Copy Link</>
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

// ── Loading shimmer ───────────────────────────────────────────
function MsgShimmer() {
  return (
    <div style={{ marginBottom: 32 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 20,
        }}
      >
        <div
          className="shimmer-line"
          style={{ width: "45%", height: 38, borderRadius: 12 }}
        />
      </div>
      <div style={{ display: "flex", gap: 11 }}>
        <div
          className="shimmer-line"
          style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0 }}
        />
        <div style={{ flex: 1 }}>
          <div
            className="shimmer-line"
            style={{ height: 14, borderRadius: 6, marginBottom: 8 }}
          />
          <div
            className="shimmer-line"
            style={{
              height: 14,
              borderRadius: 6,
              width: "80%",
              marginBottom: 8,
            }}
          />
          <div
            className="shimmer-line"
            style={{ height: 14, borderRadius: 6, width: "60%" }}
          />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
function ChatPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, status } = useSession();
  const convId = params.id;

  const [conv, setConv] = useState<ConvMeta | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConv, setLoadingConv] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingPapers, setStreamingPapers] = useState<Paper[]>([]);
  const [streamingEvidenceMap, setStreamingEvidenceMap] = useState<
    Record<string, string>
  >({});
  const [isStreaming, setIsStreaming] = useState(false);
  const [limitError, setLimitError] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [searchesToday, setSearchesToday] = useState(0);
  const [searchesThisMonth, setSearchesThisMonth] = useState(0);
  const [panelMsg, setPanelMsg] = useState<Message | null>(null);
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
  const warnAt = isFree ? 4 : 450;

  // Redirect if not logged in
  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
  }, [status, router]);

  // Fetch conversation + messages
  useEffect(() => {
    if (status !== "authenticated") return;
    setLoadingConv(true);
    setNotFound(false);
    fetch(`/api/conversations/${convId}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status.toString());
        return r.json();
      })
      .then((d: { conversation: ConvMeta; messages: Message[] }) => {
        setConv(d.conversation);
        setMessages(d.messages);
        // Show last assistant message in panel if it has papers
        const lastAsst = [...d.messages]
          .reverse()
          .find((m) => m.role === "assistant" && m.papers?.length > 0);
        if (lastAsst) setPanelMsg(lastAsst);
      })
      .catch((e) => {
        if (e.message === "404") setNotFound(true);
        else setNotFound(true); // show "not found" for any fetch error rather than blank
      })
      .finally(() => setLoadingConv(false));
  }, [convId, status]);

  // Fetch counters
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
      60,
    );

  const resize = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  // Send a follow-up message in this conversation
  const doSend = useCallback(
    async (q: string) => {
      if (!q.trim() || sending) return;
      const query = q.trim();
      setSending(true);
      setErrorMsg("");
      setLimitError(false);
      setInput("");
      if (taRef.current) taRef.current.style.height = "auto";
      setIsStreaming(true);
      setStreamingContent("");
      setStreamingPapers([]);

      // Optimistically add user message to UI
      const tempUserMsg: Message = {
        _id: "temp-user",
        role: "user",
        content: query,
        papers: [],
        retrievedPapers: [],
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMsg]);
      scrollDown();

      try {
        const resp = await fetch("/api/search/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, conversationId: convId }),
        });

        if (!resp.ok) {
          const err = (await resp.json()) as { error?: string };
          if (resp.status === 429) {
            setLimitError(true);
            setErrorMsg(err.error ?? "Limit reached");
          } else setErrorMsg(err.error ?? "Search failed");
          setMessages((prev) => prev.filter((m) => m._id !== "temp-user"));
          setIsStreaming(false);
          setSending(false);
          return;
        }

        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullAnswer = "";
        let finalPapers: Paper[] = [];
        let finalEvidenceMap: Record<string, string> = {};

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
                evidenceIdToPaperId?: Record<string, string>;
              };
              if (evt.type === "papers" && evt.papers) {
                finalPapers = evt.papers;
                setStreamingPapers(evt.papers);
                const eidMap = evt.evidenceIdToPaperId ?? {};
                finalEvidenceMap = eidMap;
                setStreamingEvidenceMap(eidMap);
                setPanelMsg({
                  _id: "streaming",
                  role: "assistant",
                  content: "",
                  papers: evt.papers,
                  retrievedPapers: [],
                  evidenceIdToPaperId: eidMap,
                  createdAt: new Date().toISOString(),
                });
                setPanelTab("sources");
              } else if (evt.type === "text" && evt.text) {
                fullAnswer += evt.text;
                setStreamingContent((c) => c + evt.text);
                scrollDown();
              } else if (evt.type === "done") {
                // Replace temp messages with real ones from server
                const asstMsg: Message = {
                  _id: "temp-asst",
                  role: "assistant",
                  content: fullAnswer,
                  papers: finalPapers,
                  retrievedPapers: [], // not available client-side; DB record has the full set
                  evidenceIdToPaperId: finalEvidenceMap,
                  createdAt: new Date().toISOString(),
                };
                setMessages((prev) => [
                  ...prev.filter((m) => m._id !== "temp-user"),
                  { ...tempUserMsg, _id: Date.now().toString() },
                  asstMsg,
                ]);
                setPanelMsg(asstMsg);
                setIsStreaming(false);
                setStreamingContent("");
                if (isFree) setSearchesToday((c) => Math.min(c + 1, 5));
                if (isStudent)
                  setSearchesThisMonth((c) => Math.min(c + 1, 500));
                window.dispatchEvent(
                  new Event("researchly:conversation-updated"),
                );
              }
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        setErrorMsg("Network error. Please try again.");
        toast.error("Network error");
        setMessages((prev) => prev.filter((m) => m._id !== "temp-user"));
        setIsStreaming(false);
      } finally {
        setSending(false);
        scrollDown();
      }
    },
    [sending, convId, isFree, isStudent],
  );

  // Right panel
  const RightPanel =
    panelMsg && panelMsg.papers.length > 0 ? (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div className="panel-header">
          <div className="tab-row">
            <button
              className={`tab${panelTab === "sources" ? " on" : ""}`}
              onClick={() => setPanelTab("sources")}
            >
              Sources ({panelMsg.papers.length})
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
            panelMsg.papers.map((p, i) => (
              <PaperCard key={p.id} paper={p} index={i + 1} />
            ))
          ) : (
            <CitationPanel papers={panelMsg.papers} />
          )}
        </div>
      </div>
    ) : undefined;

  if (status === "loading" || status === "unauthenticated") return null;

  if (notFound)
    return (
      <Shell activeConversationId={convId}>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <p
              style={{
                fontSize: 15,
                color: "var(--text-secondary)",
                marginBottom: 16,
              }}
            >
              Conversation not found
            </p>
            <Link
              href="/search"
              className="btn btn-brand"
              style={{ textDecoration: "none" }}
            >
              New Research
            </Link>
          </div>
        </div>
      </Shell>
    );

  return (
    <Shell rightPanel={RightPanel} activeConversationId={convId}>
      {/* Usage bar */}
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

      {/* Messages */}
      <div className="chat-col">
        <div className="messages-wrap">
          <div className="messages-inner">
            {loadingConv ? (
              <>
                <MsgShimmer />
                <MsgShimmer />
              </>
            ) : (
              <>
                {messages.map((msg) => (
                  <div key={msg._id} className="msg-turn">
                    {msg.role === "user" ? (
                      <div className="msg-user-row">
                        <div className="msg-user-bubble">{msg.content}</div>
                      </div>
                    ) : (
                      <div className="msg-ai-row">
                        <div className="msg-ai-content">
                          <AnswerRenderer
                            content={msg.content}
                            citedPapers={msg.papers ?? []}
                            evidenceIdToPaperId={msg.evidenceIdToPaperId ?? {}}
                          />
                          <div className="action-bar">
                            {msg.papers.length > 0 && (
                              <button
                                onClick={() => {
                                  setPanelMsg(msg);
                                  setPanelTab("sources");
                                }}
                                className="chip"
                              >
                                <Layers size={11} /> {msg.papers.length} sources
                              </button>
                            )}
                            <CopyBtn text={msg.content} />
                            <button
                              onClick={() =>
                                downloadResearchPDF(
                                  messages.find(
                                    (m) =>
                                      m.role === "user" &&
                                      messages.indexOf(m) ===
                                        messages.indexOf(msg) - 1,
                                  )?.content ?? "",
                                  msg.content,
                                  msg.papers,
                                  session?.user?.name ?? undefined,
                                )
                              }
                              className="chip accent"
                            >
                              <FileDown size={11} /> PDF
                            </button>
                            {!atLimit && (
                              <button
                                onClick={() => {
                                  const userMsg =
                                    messages[messages.indexOf(msg) - 1];
                                  if (userMsg) void doSend(userMsg.content);
                                }}
                                className="chip"
                                title="Search again"
                              >
                                <RotateCcw size={11} /> Re-run
                              </button>
                            )}
                            {(() => {
                              const query = messages[messages.indexOf(msg) - 1]?.content ?? "";
                              const shareUrl = `https://researchly.in/research/${slugify(query)}`;
                              return (
                                <>
                                  <a
                                    href={`https://wa.me/?text=${encodeURIComponent(`Check out this research: ${shareUrl}`)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="chip"
                                    style={{ color: "#4caf72", borderColor: "rgba(76,175,114,0.2)", textDecoration: "none" }}
                                  >
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                    WhatsApp
                                  </a>
                                  <a
                                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Found this on @researchly_in ${shareUrl}`)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="chip"
                                    style={{ textDecoration: "none" }}
                                  >
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                                    Share on X
                                  </a>
                                  <CopyLinkBtn url={shareUrl} />
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Streaming message */}
                {isStreaming && (
                  <div className="msg-turn">
                    <div className="msg-ai-row">
                      <div className="msg-ai-content">
                        {streamingContent ? (
                          <>
                            <AnswerRenderer
                              content={streamingContent}
                              citedPapers={streamingPapers}
                              evidenceIdToPaperId={streamingEvidenceMap}
                              streaming={true}
                            />
                          </>
                        ) : (
                          <div className="typing-bubble">
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Errors */}
                {limitError && !sending && (
                  <div className="msg-row">
                    <div style={{ flex: 1 }}>
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
                      </div>
                    </div>
                  </div>
                )}

                {errorMsg && !sending && !limitError && (
                  <div className="error-card">
                    <AlertCircle
                      size={14}
                      style={{
                        color: "var(--red)",
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    />
                    <p style={{ fontSize: 13.5, color: "var(--red)" }}>
                      {errorMsg}
                    </p>
                  </div>
                )}
              </>
            )}
            <div ref={endRef} style={{ height: 16 }} />
          </div>
          {/* end messages-inner */}
        </div>
      </div>

      {/* Input */}
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
                void doSend(input);
              }
            }}
            placeholder="Ask a follow-up question…"
            className="input-textarea"
            rows={1}
            disabled={sending}
          />
          <button
            onClick={() => void doSend(input)}
            disabled={sending || !input.trim()}
            className={`send-btn${input.trim() && !sending ? " ready" : " idle"}`}
          >
            {sending ? (
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

export default function ChatPageWrapper() {
  return (
    <Suspense>
      <ChatPage />
    </Suspense>
  );
}
