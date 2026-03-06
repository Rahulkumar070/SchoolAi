"use client";
import { useState, useRef } from "react";
import Shell from "@/components/layout/Shell";
import PaperCard from "@/components/papers/PaperCard";
import CitationPanel from "@/components/papers/CitationPanel";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookOpen,
  ArrowUp,
  Download,
  Copy,
  Check,
  Lock,
  FileText,
  Loader2,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import { downloadResearchPDF } from "@/lib/downloadPDF";
import { Paper } from "@/types";

interface Result {
  review: string;
  papers: Paper[];
  topic: string;
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
        fontSize: ".93rem",
        color: "var(--text-primary)",
        fontWeight: 600,
        margin: "1em 0 .3em",
      }}
    >
      {children}
    </h3>
  ),
  p: ({ children }: any) => (
    <p
      style={{
        marginBottom: ".85em",
        lineHeight: 1.82,
        fontSize: 14.5,
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
    <ul style={{ paddingLeft: "1.3em", marginBottom: ".7em" }}>{children}</ul>
  ),
  li: ({ children }: any) => (
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
};

export default function ReviewPage() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [tab, setTab] = useState<"review" | "sources" | "cite">("review");
  const [copied, setCopied] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const { data: session } = useSession();

  const resize = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  };

  const generate = async () => {
    if (!input.trim() || loading) return;
    const topic = input.trim();
    setLoading(true);
    setStreaming(true);
    setStatus("Searching academic papers…");
    setResult({ review: "", papers: [], topic });
    setTab("review");

    try {
      const resp = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });

      if (!resp.ok) {
        const d = (await resp.json()) as { error?: string };
        toast.error(d.error ?? "Failed");
        setResult(null);
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
              topic?: string;
            };
            if (evt.type === "papers" && evt.papers) {
              setResult((prev) =>
                prev ? { ...prev, papers: evt.papers! } : null,
              );
            } else if (evt.type === "status" && evt.text) {
              setStatus(evt.text);
            } else if (evt.type === "text" && evt.text) {
              setStatus("");
              setResult((prev) =>
                prev ? { ...prev, review: prev.review + evt.text } : null,
              );
            } else if (evt.type === "done") {
              setStreaming(false);
              setStatus("");
            } else if (evt.type === "error" && evt.text) {
              toast.error(evt.text);
              setResult(null);
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      toast.error("Network error");
      setResult(null);
    } finally {
      setLoading(false);
      setStreaming(false);
      setStatus("");
    }
  };

  const copy = () => {
    if (!result) return;
    void navigator.clipboard.writeText(result.review);
    setCopied(true);
    toast.success("Copied");
    setTimeout(() => setCopied(false), 2000);
  };
  const dl = () => {
    if (!result) return;
    downloadResearchPDF(result.topic, result.review, result.papers);
    toast.success("Downloading PDF...");
  };

  const plan = session?.user?.plan ?? "free";

  return (
    <Shell>
      <div
        className="chat-col"
        style={{ display: "flex", flexDirection: "column" }}
      >
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 20px" }}>
          <div style={{ maxWidth: 740, margin: "0 auto" }}>
            {/* Header */}
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
                  borderRadius: 10,
                  background: "var(--brand-dim)",
                  border: "1px solid var(--brand-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <BookOpen size={16} style={{ color: "var(--brand)" }} />
              </div>
              <div>
                <h1
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    lineHeight: 1,
                  }}
                >
                  Literature Review
                </h1>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-faint)",
                    marginTop: 3,
                  }}
                >
                  AI-generated academic literature review from 200M+ papers
                </p>
              </div>
            </div>

            {/* Plan gate */}
            {(!session || plan === "free") && (
              <div
                style={{
                  padding: "18px 20px",
                  background: "var(--brand-dim)",
                  border: "1px solid var(--brand-border)",
                  borderRadius: 12,
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <Lock size={13} style={{ color: "var(--brand)" }} />
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                    }}
                  >
                    Paid Feature
                  </p>
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    marginBottom: 14,
                    lineHeight: 1.6,
                  }}
                >
                  Literature Review is available on Student (₹199/mo) and Pro
                  (₹499/mo) plans.
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
                  <Sparkles size={12} /> Upgrade to unlock →
                </Link>
              </div>
            )}

            {/* Status pill while loading */}
            {status && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 14px",
                  borderRadius: 99,
                  background: "var(--bg-raised)",
                  border: "1px solid var(--border)",
                  marginBottom: 16,
                }}
              >
                <Loader2
                  size={12}
                  style={{
                    color: "var(--brand)",
                    animation: "spin 1s linear infinite",
                  }}
                />
                <span
                  style={{
                    fontSize: 12.5,
                    color: "var(--text-faint)",
                    fontWeight: 500,
                  }}
                >
                  {status}
                </span>
              </div>
            )}

            {/* Result */}
            {result && (result.review || result.papers.length > 0) && (
              <div className="anim-in">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 16,
                  }}
                >
                  <div className="tab-row" style={{ width: "auto" }}>
                    <button
                      className={`tab${tab === "review" ? " on" : ""}`}
                      onClick={() => setTab("review")}
                    >
                      Review
                    </button>
                    <button
                      className={`tab${tab === "sources" ? " on" : ""}`}
                      onClick={() => setTab("sources")}
                    >
                      Sources{" "}
                      {result.papers.length > 0
                        ? `(${result.papers.length})`
                        : ""}
                    </button>
                    <button
                      className={`tab${tab === "cite" ? " on" : ""}`}
                      onClick={() => setTab("cite")}
                    >
                      Cite
                    </button>
                  </div>
                  {!streaming && result.review && (
                    <div style={{ display: "flex", gap: 5 }}>
                      <button onClick={copy} className="icon-btn" title="Copy">
                        {copied ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                      <button
                        onClick={dl}
                        className="icon-btn"
                        title="Download"
                      >
                        <Download size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {tab === "review" && (
                  <div className="card" style={{ padding: 26 }}>
                    {result.review ? (
                      <>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={MD as any}
                        >
                          {result.review}
                        </ReactMarkdown>
                        {streaming && <Cursor />}
                      </>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "20px 0",
                          color: "var(--text-faint)",
                        }}
                      >
                        <Loader2
                          size={14}
                          style={{ animation: "spin 1s linear infinite" }}
                        />
                        <span style={{ fontSize: 13.5 }}>
                          Writing your literature review…
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {tab === "sources" &&
                  result.papers.map((p, i) => (
                    <PaperCard key={p.id} paper={p} index={i + 1} />
                  ))}
                {tab === "cite" && <CitationPanel papers={result.papers} />}
              </div>
            )}

            {/* Empty state */}
            {!result && !loading && (
              <div
                style={{ textAlign: "center", paddingTop: 40, opacity: 0.5 }}
              >
                <FileText
                  size={36}
                  style={{
                    color: "var(--text-faint)",
                    margin: "0 auto 12px",
                    display: "block",
                  }}
                />
                <p style={{ fontSize: 13.5, color: "var(--text-muted)" }}>
                  Enter a research topic and I&apos;ll write a full literature
                  review
                </p>
              </div>
            )}
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
                  void generate();
                }
              }}
              placeholder="e.g. Social media effects on adolescent mental health…"
              className="input-textarea"
              rows={1}
              disabled={loading || !session || plan === "free"}
            />
            <button
              onClick={() => void generate()}
              disabled={loading || !input.trim() || !session || plan === "free"}
              className={`send-btn${input.trim() && !loading && session && plan !== "free" ? " ready" : " idle"}`}
            >
              {loading ? (
                <span className="spinner" />
              ) : (
                <ArrowUp
                  size={14}
                  style={{
                    color:
                      input.trim() && session ? "#000" : "var(--text-faint)",
                  }}
                />
              )}
            </button>
          </div>
          <p className="input-hint">
            Generates ~1400 word structured review · Streams in real-time ·
            Searches 4 academic databases
          </p>
        </div>
      </div>
    </Shell>
  );
}
