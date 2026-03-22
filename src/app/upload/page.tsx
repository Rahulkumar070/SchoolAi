"use client";
declare global {
  interface Window {
    pdfjsLib: any;
  }
}

import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import Shell from "@/components/layout/Shell";
import ReactMarkdown from "react-markdown";
import {
  FileText,
  X,
  BookOpen,
  User,
  AlertCircle,
  MessageSquare,
  Sparkles,
  Loader2,
  Plus,
} from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ChatMessage } from "@/types";

const DEFAULT_QUESTIONS = [
  "Summarise this paper in simple terms",
  "What methodology did the authors use?",
  "What are the key findings?",
  "What are the limitations of this study?",
  "How does this compare to prior work?",
  "What are the practical implications?",
];

const MD_COMPONENTS = {
  h2: ({ children }: any) => (
    <h2
      style={{
        fontFamily: "var(--font-display)",
        fontSize: "1rem",
        color: "var(--text-primary)",
        margin: "1.2em 0 .4em",
        fontWeight: 600,
      }}
    >
      {children}
    </h2>
  ),
  h3: ({ children }: any) => (
    <h3
      style={{
        fontSize: ".9rem",
        color: "var(--text-primary)",
        fontWeight: 600,
        margin: ".8em 0 .3em",
      }}
    >
      {children}
    </h3>
  ),
  p: ({ children }: any) => (
    <p
      style={{
        marginBottom: ".65em",
        lineHeight: 1.72,
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
  code: ({ children }: any) => (
    <code
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11.5,
        background: "var(--surface-2)",
        color: "var(--brand)",
        padding: "2px 5px",
        borderRadius: 4,
      }}
    >
      {children}
    </code>
  ),
  ul: ({ children }: any) => (
    <ul style={{ paddingLeft: "1.2em", marginBottom: ".5em" }}>{children}</ul>
  ),
  li: ({ children }: any) => (
    <li
      style={{
        marginBottom: ".2em",
        fontSize: 14,
        color: "var(--text-secondary)",
      }}
    >
      {children}
    </li>
  ),
  blockquote: ({ children }: any) => (
    <blockquote
      style={{
        borderLeft: "3px solid var(--brand)",
        paddingLeft: 12,
        margin: "8px 0",
        color: "var(--text-secondary)",
        fontStyle: "italic",
      }}
    >
      {children}
    </blockquote>
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
      }}
    >
      {children}
    </a>
  ),
};

// ── Animated waveform — identical to search page ──────────────
function WaveformIcon() {
  return (
    <div className="flex items-center gap-[2px] h-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <motion.span
          key={i}
          className="w-[2px] rounded-full"
          style={{ backgroundColor: "#555" }}
          animate={{ height: ["5px", `${7 + i * 2}px`, "5px"] }}
          transition={{
            duration: 0.9,
            repeat: Infinity,
            delay: i * 0.12,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfText, setPdfText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseErr, setParseErr] = useState("");
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [quickQs, setQuickQs] = useState<string[]>(DEFAULT_QUESTIONS);
  const [loadingQs, setLoadingQs] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();
  const isFree = !session || (session?.user?.plan ?? "free") === "free";

  const scrollDown = () =>
    setTimeout(() => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight < 150;
      if (isNearBottom) endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 80);

  const resize = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  const fetchStarterQuestions = async (fileName: string) => {
    setLoadingQs(true);
    try {
      const r = await fetch("/api/pdf-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: fileName.replace(".pdf", "") }),
      });
      const d = (await r.json()) as { questions?: string[] };
      if (d.questions?.length) setQuickQs(d.questions);
    } catch {
      /* fallback */
    } finally {
      setLoadingQs(false);
    }
  };

  const extractTextFromPDF = async (buf: ArrayBuffer): Promise<string> => {
    if (!window.pdfjsLib) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load PDF.js"));
        document.head.appendChild(script);
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const maxPages = Math.min(pdf.numPages, 20);
    const texts: string[] = [];
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => item.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (pageText) texts.push(`--- Page ${i} ---\n${pageText}`);
    }
    return texts.join("\n\n").slice(0, 40000);
  };

  const processFile = useCallback(async (f: File) => {
    if (!f.name.endsWith(".pdf") && !f.type.includes("pdf")) {
      toast.error("Please upload a PDF");
      return;
    }
    if (f.size > 3 * 1024 * 1024) {
      toast.error("Max 3MB PDF supported");
      return;
    }

    setFile(f);
    setParsing(true);
    setParseErr("");
    setMsgs([]);
    setPdfText("");
    setConversationId(null);
    setQuickQs(DEFAULT_QUESTIONS);

    try {
      const buf = await f.arrayBuffer();
      const text = await extractTextFromPDF(buf);
      if (!text || text.length < 50) {
        setParseErr("Could not extract text. May be a scanned/image PDF.");
        setFile(null);
        setParsing(false);
        return;
      }
      setPdfText(text);
      setMsgs([
        {
          role: "assistant",
          content: `I've read **"${f.name}"** (${(f.size / 1024).toFixed(0)}KB, ${text.length.toLocaleString()} characters). Ask me anything about this document!`,
        },
      ]);
      toast.success("PDF ready!");
      void fetchStarterQuestions(f.name);
    } catch (e) {
      console.error(e);
      setParseErr("Failed to read PDF. Try another file.");
      setFile(null);
    } finally {
      setParsing(false);
    }
  }, []);

  const clearFile = () => {
    setFile(null);
    setPdfText("");
    setMsgs([]);
    setParseErr("");
    setConversationId(null);
    setQuickQs(DEFAULT_QUESTIONS);
  };

  const send = async (q?: string) => {
    const question = (q ?? input).trim();
    if (!question || loading || !pdfText) return;

    setMsgs((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    setLoading(true);
    scrollDown();
    setMsgs((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const resp = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, pdfText, history: msgs.slice(-6), conversationId }),
      });

      if (!resp.ok) {
        const d = (await resp.json()) as { error?: string };
        toast.error(d.error ?? "Failed");
        setMsgs((prev) => {
          const u = [...prev];
          u[u.length - 1] = {
            role: "assistant",
            content: `❌ ${d.error ?? "Something went wrong."}`,
          };
          return u;
        });
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
              remaining?: number | null;
              conversationId?: string;
            };
            if (evt.type === "text" && evt.text) {
              setMsgs((prev) => {
                const u = [...prev];
                u[u.length - 1] = {
                  role: "assistant",
                  content: u[u.length - 1].content + evt.text,
                };
                return u;
              });
              scrollDown();
            } else if (evt.type === "done") {
              if (evt.remaining !== undefined && evt.remaining !== null)
                setRemaining(evt.remaining);
            } else if (evt.type === "meta") {
              if (evt.conversationId) setConversationId(evt.conversationId);
              window.dispatchEvent(new Event("researchly:conversation-updated"));
            } else if (evt.type === "error") {
              toast.error(evt.text ?? "Chat failed");
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      toast.error("Network error");
      setMsgs((prev) => {
        const u = [...prev];
        u[u.length - 1] = {
          role: "assistant",
          content: "❌ Network error. Please try again.",
        };
        return u;
      });
    } finally {
      setLoading(false);
      scrollDown();
    }
  };

  return (
    <Shell>
      <div className="chat-wrap">
        <div className="chat-glow" />

        {/* ── Chat / welcome area ── */}
        {msgs.length === 0 && !loading ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.55, ease: "easeOut" }}
            className="welcome"
          >
            <div className="welcome-mark">
              <MessageSquare size={22} style={{ color: "var(--brand)" }} />
            </div>
            <h1 className="welcome-greeting">
              {session
                ? isFree
                  ? "PDF Chat —\nPaid Feature"
                  : "Upload a PDF to\nstart chatting"
                : "Sign in to use\nPDF Chat"}
            </h1>
            <p
              style={{
                fontSize: 13.5,
                color: "var(--text-secondary)",
                maxWidth: 340,
                lineHeight: 1.65,
                marginBottom: 16,
                textAlign: "center",
              }}
            >
              {!session
                ? "PDF Chat requires a free account. Sign in with Google or GitHub — it takes 10 seconds."
                : isFree
                  ? "PDF Chat is a paid feature. Upgrade to Student or Pro to upload and chat with academic papers."
                  : "Click the + button below to upload any academic paper or research document."}
            </p>

            {!session && (
              <Link
                href="/auth/signin"
                className="btn btn-brand"
                style={{ textDecoration: "none", padding: "10px 22px" }}
              >
                Sign In Free
              </Link>
            )}
            {session && isFree && (
              <Link
                href="/pricing"
                className="btn btn-brand"
                style={{
                  textDecoration: "none",
                  padding: "10px 22px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Sparkles size={13} /> Upgrade ₹199/mo →
              </Link>
            )}

            {parseErr && (
              <div
                style={{
                  marginTop: 18,
                  padding: "10px 14px",
                  background: "rgba(224,92,92,.07)",
                  border: "1px solid rgba(224,92,92,.16)",
                  borderRadius: 9,
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  maxWidth: 380,
                }}
              >
                <AlertCircle
                  size={13}
                  style={{ color: "var(--red)", flexShrink: 0, marginTop: 1 }}
                />
                <p
                  style={{ fontSize: 12, color: "var(--red)", lineHeight: 1.5 }}
                >
                  {parseErr}
                </p>
              </div>
            )}
          </motion.div>
        ) : (
          <div className="messages-wrap" ref={scrollContainerRef}>
            <div className="messages-inner">
              {/* PDF info strip */}
              {file && pdfText && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
                    background: "var(--bg-overlay)",
                    border: "1px solid var(--border)",
                    borderRadius: 9,
                    marginBottom: 14,
                  }}
                >
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      background: "var(--brand-dim)",
                      border: "1px solid var(--brand-border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <FileText size={11} style={{ color: "var(--brand)" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {file.name}
                    </p>
                    <p style={{ fontSize: 10, color: "var(--text-faint)" }}>
                      {(file.size / 1024).toFixed(0)}KB ·{" "}
                      {Math.round(pdfText.length / 1000)}K chars
                      {session?.user?.plan === "student" && remaining !== null
                        ? ` · ${remaining} uploads left`
                        : ""}
                    </p>
                  </div>
                  <button
                    onClick={clearFile}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-faint)",
                      padding: 2,
                      display: "flex",
                    }}
                    title="Remove PDF"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {/* Quick questions — pill chips */}
              {pdfText && msgs.length <= 1 && (
                <div style={{ marginBottom: 14 }}>
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--text-faint)",
                      marginBottom: 7,
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    Quick Questions
                    {loadingQs && (
                      <Loader2
                        size={10}
                        style={{
                          color: "var(--brand)",
                          animation: "spin 1s linear infinite",
                        }}
                      />
                    )}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {quickQs.slice(0, 4).map((q) => (
                      <button
                        key={q}
                        onClick={() => void send(q)}
                        style={{
                          padding: "5px 10px",
                          borderRadius: 20,
                          background: "var(--bg-overlay)",
                          border: "1px solid var(--border)",
                          color: "var(--text-secondary)",
                          fontFamily: "var(--font-ui)",
                          fontSize: 11.5,
                          cursor: "pointer",
                          transition: "all .13s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor =
                            "var(--brand-border)";
                          e.currentTarget.style.color = "var(--text-primary)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "var(--border)";
                          e.currentTarget.style.color = "var(--text-secondary)";
                        }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages */}
              {msgs.map((m, i) => (
                <motion.div
                  key={i}
                  className="msg-turn"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {m.role === "user" ? (
                    <div className="msg-user-row">
                      <div className="msg-user-bubble">{m.content}</div>
                    </div>
                  ) : (
                    <div className="msg-ai-row">
                      <div className="msg-ai-avatar">
                        <BookOpen size={11} color="#c9b99a" />
                      </div>
                      <div className="msg-ai-content">
                        {m.content ? (
                          <ReactMarkdown components={MD_COMPONENTS as any}>
                            {m.content}
                          </ReactMarkdown>
                        ) : loading && i === msgs.length - 1 ? (
                          <div className="typing-bubble">
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
              <div ref={endRef} style={{ height: 16 }} />
            </div>
          </div>
        )}

        {/* ── Input bar — identical structure to /search ── */}
        <div className="input-wrap">
          <div className="input-box">
            {/* Hidden file input */}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void processFile(f);
                e.target.value = "";
              }}
            />

            {/* PDF attachment badge */}
            {file && (parsing || pdfText) && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  paddingBottom: 8,
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    background: "rgba(201,185,154,0.12)",
                    border: "1px solid rgba(201,185,154,0.25)",
                    borderRadius: 6,
                    padding: "3px 8px",
                    fontSize: 12,
                    color: "#c9b99a",
                  }}
                >
                  {parsing ? (
                    <Loader2
                      size={10}
                      style={{ animation: "spin 1s linear infinite" }}
                    />
                  ) : (
                    <FileText size={10} />
                  )}
                  <span
                    style={{
                      maxWidth: 240,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {parsing ? `Reading ${file.name}…` : file.name}
                  </span>
                  {!parsing && (
                    <button
                      onClick={clearFile}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#666",
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Textarea */}
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
                  void send();
                }
              }}
              placeholder={
                !session
                  ? "Sign in to use PDF Chat…"
                  : isFree
                    ? "Upgrade to use PDF Chat…"
                    : pdfText
                      ? `Ask anything about "${file?.name}"…`
                      : "Click + to attach a PDF, then ask anything…"
              }
              className="input-textarea"
              rows={1}
              disabled={loading || !pdfText || !session || isFree}
            />

            {/* Bottom row — + | waveform | send */}
            <div className="input-bottom-row">
              {/* + attach button */}
              <button
                className="input-attach-btn"
                title={
                  !session
                    ? "Sign in required"
                    : isFree
                      ? "Upgrade to upload PDFs"
                      : file
                        ? "Replace PDF"
                        : "Attach PDF"
                }
                style={{
                  position: "relative",
                  color: file && pdfText ? "#c9b99a" : undefined,
                }}
                disabled={parsing}
                onClick={() => {
                  if (!session) {
                    toast.error("Sign in to use PDF Chat");
                    return;
                  }
                  if (isFree) {
                    toast.error("PDF Chat requires Student or Pro plan");
                    return;
                  }
                  fileRef.current?.click();
                }}
              >
                {parsing ? (
                  <Loader2
                    size={15}
                    style={{ animation: "spin 1s linear infinite" }}
                  />
                ) : (
                  <Plus size={15} />
                )}
                {/* Gold dot when PDF is loaded */}
                {file && pdfText && !parsing && (
                  <span
                    style={{
                      position: "absolute",
                      top: 0,
                      right: 0,
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: "#c9b99a",
                    }}
                  />
                )}
              </button>

              {/* Waveform */}
              <button className="waveform-btn" title="Voice">
                <WaveformIcon />
              </button>

              {/* Send button */}
              <button
                onClick={() => void send()}
                disabled={loading || !input.trim() || !pdfText}
                className="send-btn"
                title="Send"
              >
                {loading ? (
                  <span className="spinner" />
                ) : (
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={input.trim() && pdfText ? "#141414" : "#555"}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <p className="input-hint">
            Analyses methods, findings, statistics · Powered by Claude AI
          </p>
        </div>
      </div>
    </Shell>
  );
}
