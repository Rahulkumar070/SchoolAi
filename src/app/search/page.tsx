"use client";
declare global {
  interface Window {
    pdfjsLib: any;
  }
}
import { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import Shell from "@/components/layout/Shell";
import PaperCard from "@/components/papers/PaperCard";
import CitationPanel from "@/components/papers/CitationPanel";
import AnswerRenderer from "@/components/answer/AnswerRenderer";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookOpen,
  AlertCircle,
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
  ThumbsUp,
  ThumbsDown,
  Layers,
  Plus,
  FileText,
  X,
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
  feedback?: "up" | "down" | null;
}

// ── Animated waveform (from uploaded UI) ──────────────────────
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

function FeedbackBtn({
  query,
  conversationId,
  turnIndex,
  currentFeedback,
  onFeedback,
}: {
  query: string;
  conversationId: string | null;
  turnIndex: number;
  currentFeedback?: "up" | "down" | null;
  onFeedback: (i: number, r: "up" | "down") => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const voted = !!currentFeedback;
  const submit = async (rating: "up" | "down") => {
    if (submitting || voted) return;
    setSubmitting(true);
    onFeedback(turnIndex, rating);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, rating, conversationId }),
      });
    } catch {
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <button
        onClick={() => void submit("up")}
        disabled={voted || submitting}
        className="chip"
        title="Good answer"
        style={{
          color: currentFeedback === "up" ? "#6ab07a" : undefined,
          opacity: voted && currentFeedback !== "up" ? 0.3 : 1,
          cursor: voted ? "default" : "pointer",
        }}
      >
        <ThumbsUp size={11} />
      </button>
      <button
        onClick={() => void submit("down")}
        disabled={voted || submitting}
        className="chip"
        title="Bad answer"
        style={{
          color: currentFeedback === "down" ? "#e06060" : undefined,
          opacity: voted && currentFeedback !== "down" ? 0.3 : 1,
          cursor: voted ? "default" : "pointer",
        }}
      >
        <ThumbsDown size={11} />
      </button>
      {currentFeedback && (
        <span style={{ fontSize: 10.5, color: "#555" }}>
          {currentFeedback === "up" ? "Thanks!" : "Got it"}
        </span>
      )}
    </div>
  );
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
      className="chip"
      title="Copy"
    >
      {copied ? (
        <>
          <Check size={11} style={{ color: "#6ab07a" }} /> Copied
        </>
      ) : (
        <>
          <Copy size={11} /> Copy
        </>
      )}
    </button>
  );
}

function StatusPill({ text }: { text: string }) {
  return (
    <div className="status-pill">
      <Loader2
        size={12}
        style={{ color: "#c9b99a", animation: "spin 1s linear infinite" }}
      />
      <span>{text}</span>
    </div>
  );
}

function RelatedQuestions({
  questions,
  onSearch,
}: {
  questions: string[];
  onSearch: (q: string) => void;
}) {
  if (!questions.length) return null;
  return (
    <div className="related-section">
      <p className="related-label">Related searches</p>
      {questions.map((q, i) => (
        <button key={i} onClick={() => onSearch(q)} className="related-btn">
          <Search size={11} style={{ color: "#c9b99a", flexShrink: 0 }} />
          <span>{q}</span>
          <ArrowRight
            size={10}
            style={{ color: "#555", flexShrink: 0, marginLeft: "auto" }}
          />
        </button>
      ))}
    </div>
  );
}

const SUGGESTIONS = [
  "How does gut microbiome affect mental health?",
  "Latest breakthroughs in quantum computing",
  "RLHF for language model alignment",
  "Long COVID mechanisms and treatments",
];

const TRENDING_PAPERS = [
  {
    title: "Attention Is All You Need",
    authors: "Vaswani et al.",
    year: 2017,
    citations: "120k",
    badge: "Foundational" as const,
    color: "#ad73e0",
  },
  {
    title: "RLHF: Training Language Models to Follow Instructions",
    authors: "Ouyang et al.",
    year: 2022,
    citations: "9.8k",
    badge: "Highly Cited" as const,
    color: "#5c9ae0",
  },
  {
    title: "Retrieval-Augmented Generation for NLP",
    authors: "Lewis et al.",
    year: 2020,
    citations: "8.5k",
    badge: "Breakthrough" as const,
    color: "#5db87a",
  },
  {
    title: "Scaling Laws for Neural Language Models",
    authors: "Kaplan et al.",
    year: 2020,
    citations: "5.1k",
    badge: "Foundational" as const,
    color: "#ad73e0",
  },
  {
    title: "BERT: Pre-training Deep Bidirectional Transformers",
    authors: "Devlin et al.",
    year: 2019,
    citations: "72k",
    badge: "Highly Cited" as const,
    color: "#5c9ae0",
  },
  {
    title: "GPT-4 Technical Report",
    authors: "OpenAI",
    year: 2023,
    citations: "15k",
    badge: "Breakthrough" as const,
    color: "#5db87a",
  },
];

const BADGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "Foundational": { bg: "rgba(173,115,224,0.12)", text: "#ad73e0", border: "rgba(173,115,224,0.25)" },
  "Highly Cited": { bg: "rgba(92,154,224,0.12)", text: "#5c9ae0", border: "rgba(92,154,224,0.25)" },
  "Breakthrough": { bg: "rgba(93,184,122,0.12)", text: "#5db87a", border: "rgba(93,184,122,0.25)" },
};

const PAPER_TIMELINE = [
  { year: 2013, title: "Word2Vec", desc: "Semantic word embeddings" },
  { year: 2014, title: "GAN", desc: "Generative adversarial networks" },
  { year: 2017, title: "Transformer", desc: "Attention is all you need" },
  { year: 2019, title: "BERT", desc: "Bidirectional LM pretraining" },
  { year: 2020, title: "GPT-3", desc: "175B parameter few-shot learner" },
  { year: 2022, title: "ChatGPT", desc: "RLHF-tuned conversational AI" },
  { year: 2023, title: "GPT-4", desc: "Multimodal frontier model" },
];

const SUGGESTION_MAP: Record<string, string[]> = {
  transform: [
    "How do transformers work?",
    "Transformer vs RNN comparison",
    "Transformer architecture explained",
    "Vision transformers for image recognition",
  ],
  bert: [
    "What is BERT and how does it work?",
    "BERT vs GPT architecture differences",
    "BERT fine-tuning for classification",
  ],
  gpt: [
    "How GPT models are trained with RLHF",
    "GPT-4 capabilities and limitations",
    "GPT vs BERT for NLP tasks",
  ],
  rlhf: [
    "RLHF for language model alignment",
    "How reward models work in RLHF",
    "Problems with RLHF training",
  ],
  neural: [
    "Neural network architecture survey",
    "Neural scaling laws explained",
    "Deep neural network training techniques",
  ],
  quantum: [
    "Quantum computing breakthroughs 2024",
    "Quantum error correction methods",
    "Quantum machine learning algorithms",
  ],
  cancer: [
    "Latest cancer immunotherapy research",
    "Cancer biomarkers for early detection",
    "CAR-T cell therapy advances",
  ],
  covid: [
    "Long COVID mechanisms and treatment",
    "COVID-19 neurological effects",
    "Post-COVID syndrome research",
  ],
  climate: [
    "Climate change mitigation strategies",
    "Carbon capture technology research",
    "Climate tipping points analysis",
  ],
  drug: [
    "Drug discovery using AI models",
    "Drug repurposing computational methods",
    "Drug resistance mechanisms",
  ],
};

function TrendingSection({ onSearch }: { onSearch: (q: string) => void }) {
  return (
    <div style={{ width: "100%", maxWidth: 660, margin: "0 auto 0" }}>
      {/* Trending Papers */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--text-faint)",
            }}
          >
            🔥 Trending Papers
          </span>
          <div
            style={{
              flex: 1,
              height: 1,
              background: "rgba(255,255,255,0.05)",
            }}
          />
        </div>
        <div className="trending-grid">
          {TRENDING_PAPERS.map((p, i) => {
            const bc = BADGE_COLORS[p.badge] ?? BADGE_COLORS["Foundational"];
            return (
              <motion.button
                key={i}
                onClick={() => onSearch(p.title)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.06 }}
                className="trending-paper-card"
                style={{
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "all 0.18s",
                  width: "100%",
                }}
                whileHover={{
                  background: "rgba(255,255,255,0.05)",
                  borderColor: "rgba(255,255,255,0.14)",
                  y: -1,
                }}
              >
                <div style={{ marginBottom: 5 }}>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 99,
                      background: bc.bg,
                      color: bc.text,
                      border: `1px solid ${bc.border}`,
                    }}
                  >
                    {p.badge}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.82)",
                    lineHeight: 1.35,
                    marginBottom: 4,
                  }}
                >
                  {p.title}
                </p>
                <p
                  style={{
                    fontSize: 10,
                    color: "var(--text-faint)",
                    lineHeight: 1.3,
                  }}
                >
                  {p.authors} · {p.year} · {p.citations} citations
                </p>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Research Timeline */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--text-faint)",
            }}
          >
            ⏳ AI Research Timeline
          </span>
          <div
            style={{
              flex: 1,
              height: 1,
              background: "rgba(255,255,255,0.05)",
            }}
          />
        </div>
        <div className="timeline-scroll">
          {PAPER_TIMELINE.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 + i * 0.07 }}
              style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
            >
              <motion.button
                onClick={() => onSearch(`${item.title} paper research`)}
                className="timeline-item"
                style={{
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 8,
                  padding: "7px 10px",
                  cursor: "pointer",
                  textAlign: "center",
                  minWidth: 78,
                }}
                whileHover={{
                  background: "rgba(201,185,154,0.1)",
                  borderColor: "rgba(201,185,154,0.25)",
                }}
              >
                <p
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: "var(--brand)",
                    marginBottom: 2,
                  }}
                >
                  {item.year}
                </p>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.8)",
                    marginBottom: 2,
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.title}
                </p>
                <p
                  style={{
                    fontSize: 9,
                    color: "var(--text-faint)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.desc}
                </p>
              </motion.button>
              {i < PAPER_TIMELINE.length - 1 && (
                <div
                  style={{
                    width: 18,
                    height: 1,
                    background:
                      "linear-gradient(90deg, rgba(201,185,154,0.3), rgba(201,185,154,0.1))",
                    flexShrink: 0,
                  }}
                />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SmartSuggestions({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (q: string) => void;
}) {
  const q = query.toLowerCase().trim();
  if (!q || q.length < 3) return null;

  const suggestions: string[] = [];
  for (const [key, vals] of Object.entries(SUGGESTION_MAP)) {
    if (q.includes(key) || key.includes(q)) {
      suggestions.push(...vals);
    }
  }
  const uniq = [...new Set(suggestions)].slice(0, 4);
  if (!uniq.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="smart-suggestions-popup"
      style={{
        position: "absolute",
        bottom: "calc(100% + 6px)",
        left: 0,
        right: 0,
        background: "var(--surface)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12,
        overflow: "hidden",
        zIndex: 50,
        boxShadow: "0 -8px 32px rgba(0,0,0,0.4)",
      }}
    >
      {uniq.map((s, i) => (
        <button
          key={i}
          onClick={() => onSelect(s)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 14px",
            background: "transparent",
            border: "none",
            borderBottom:
              i < uniq.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
            cursor: "pointer",
            textAlign: "left",
            transition: "background 0.14s",
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.background =
              "rgba(255,255,255,0.04)")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.background = "transparent")
          }
        >
          <Search size={11} style={{ color: "var(--brand)", flexShrink: 0 }} />
          <span
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.75)",
              lineHeight: 1.3,
            }}
          >
            {s}
          </span>
          <ArrowRight
            size={10}
            style={{ color: "#444", flexShrink: 0, marginLeft: "auto" }}
          />
        </button>
      ))}
    </motion.div>
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

  const [showSuggestions, setShowSuggestions] = useState(false);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── PDF attachment state ───────────────────────────────
  const [attachedPdf, setAttachedPdf] = useState<{
    name: string;
    text: string;
  } | null>(null);
  const [pdfParsing, setPdfParsing] = useState(false);

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

  const handleFeedback = (index: number, rating: "up" | "down") => {
    setTurns((prev) =>
      prev.map((t, i) => (i === index ? { ...t, feedback: rating } : t)),
    );
  };

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
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  // ── PDF extraction (client-side via PDF.js) ───────────────
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

  const handlePdfAttach = async (file: File) => {
    if (!file.name.endsWith(".pdf") && !file.type.includes("pdf")) {
      toast.error("Please upload a PDF file");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Max 3MB PDF supported");
      return;
    }
    setPdfParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const text = await extractTextFromPDF(buf);
      if (!text || text.length < 50) {
        toast.error("Could not extract text — may be a scanned PDF");
        return;
      }
      setAttachedPdf({ name: file.name, text });
      toast.success(`PDF attached: ${file.name}`);
    } catch {
      toast.error("Failed to read PDF. Try another file.");
    } finally {
      setPdfParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const doSearch = useCallback(
    async (q: string, convId?: string | null) => {
      if (!q.trim() || loading) return;
      const query = q.trim();
      const useConvId = convId !== undefined ? convId : conversationId;

      // ── Inject PDF context if attached ─────────────────
      const queryWithContext = attachedPdf
        ? `The user has uploaded a PDF titled "${attachedPdf.name}". Use it as primary context.\n\n--- PDF CONTENT START ---\n${attachedPdf.text.slice(0, 30000)}\n--- PDF CONTENT END ---\n\nUser question: ${query}`
        : query;

      setLoading(true);
      setErrorMsg("");
      setLimitError(false);
      setInput("");
      if (taRef.current) taRef.current.style.height = "auto";

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
          body: JSON.stringify({
            query: queryWithContext,
            conversationId: useConvId,
          }),
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
              let answerLocked = false;
              if (evt.type === "meta" && evt.conversationId) {
                setConversationId(evt.conversationId);
                if (evt.isNewConversation)
                  window.history.replaceState(
                    null,
                    "",
                    `/chat/${evt.conversationId}`,
                  );
              } else if (evt.type === "status" && evt.text) {
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
                if (!answerLocked) {
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
                }
              } else if (evt.type === "answer_replace" && evt.text) {
                // Server stripped bibliography — hard replace and lock to prevent further text appending
                const cleanAnswer = evt.text as string;
                answerLocked = true;
                setTurns((prev) => {
                  const u = [...prev];
                  const last = { ...u[u.length - 1] };
                  last.answer = cleanAnswer;
                  u[u.length - 1] = last;
                  return [...u];
                });
              } else if (evt.type === "done") {
                const related = evt.related ?? [];
                setTurns((prev) => {
                  const u = [...prev];
                  u[u.length - 1] = {
                    ...u[u.length - 1],
                    streaming: false,
                    status: undefined,
                    related,
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
            } catch {}
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
    [loading, isFree, isStudent, conversationId, attachedPdf],
  );

  const autoRun = params.get("autorun") === "1";
  useEffect(() => {
    if (initQ && autoRun) void doSearch(initQ);
  }, []); // eslint-disable-line

  const RightPanel = panelTurn ? (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="panel-header">
        <div className="tab-row">
          <button
            className={`tab-btn${panelTab === "sources" ? " active" : ""}`}
            onClick={() => setPanelTab("sources")}
          >
            Sources ({panelTurn.papers.length})
          </button>
          <button
            className={`tab-btn${panelTab === "cite" ? " active" : ""}`}
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
      rightPanelTitle={
        panelTurn ? `Sources (${panelTurn.papers.length})` : "Sources"
      }
    >
      <div className="chat-wrap">
        <div className="chat-glow" />

        {/* Counter bar */}
        {session && !isPro && (
          <div
            className="counter-bar"
            style={{ marginTop: turns.length > 0 ? 0 : 0 }}
          >
            <div className="counter-fill-wrap">
              <div
                className={`counter-fill${counterUsed >= warnAt ? (atLimit ? " limit" : " warn") : ""}`}
                style={{
                  width: `${Math.min((counterUsed / counterMax) * 100, 100)}%`,
                }}
              />
            </div>
            <span>
              {isFree
                ? `${searchesToday}/5 today`
                : `${searchesThisMonth}/500 this month`}
            </span>
            {counterUsed >= warnAt && (
              <Link href="/pricing" className="counter-cta">
                Upgrade <ArrowRight size={10} />
              </Link>
            )}
          </div>
        )}

        {/* Welcome / messages */}
        {turns.length === 0 && !loading ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.55, ease: "easeOut" }}
            className="welcome"
          >
            {/* Inner wrapper — centers content vertically when there's room */}
            <div className="welcome-inner">
              {session && !isPro && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25, duration: 0.4 }}
                  className="chat-plan-badge"
                  style={{
                    position: "relative",
                    top: "auto",
                    left: "auto",
                    transform: "none",
                    margin: "0 auto 24px",
                    display: "flex",
                  }}
                >
                  <span>{plan === "student" ? "Student" : "Free"} plan</span>
                  <span style={{ color: "#333" }}>·</span>
                  <button onClick={() => router.push("/pricing")}>Upgrade</button>
                </motion.div>
              )}
              <h1 className="welcome-greeting">
                What would you like
                <br />
                to research?
              </h1>
              {!session && (
                <p
                  style={{
                    fontSize: 12.5,
                    color: "#555",
                    marginBottom: 16,
                    fontWeight: 300,
                  }}
                >
                  2 free searches as guest ·{" "}
                  <Link href="/auth/signin" style={{ color: "#c9b99a" }}>
                    Sign in for 5/day →
                  </Link>
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

              {/* Research signals section */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, duration: 0.5 }}
                style={{ marginTop: 36, width: "100%" }}
              >
                <TrendingSection onSearch={(q) => void doSearch(q)} />
              </motion.div>
            </div>
          </motion.div>
        ) : (
          <div className="messages-wrap">
            <div className="messages-inner">
              {turns.map((turn, i) => (
                <motion.div
                  key={i}
                  className="msg-turn"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {/* User bubble */}
                  <div className="msg-user-row">
                    <div className="msg-user-bubble">{turn.query}</div>
                  </div>

                  {/* AI response */}
                  <div className="msg-ai-row">
                    <div className="msg-ai-content">
                      {turn.streaming && !turn.answer && turn.status && (
                        <StatusPill text={turn.status} />
                      )}

                      {turn.answer ? (
                        <>
                          <AnswerRenderer
                            content={turn.answer}
                            papers={turn.papers}
                            streaming={turn.streaming}
                          />

                          {!turn.streaming && (
                            <>
                              <div className="action-bar">
                                {turn.papers.length > 0 && (
                                  <button
                                    onClick={() => {
                                      setPanelTurn(turn);
                                      setPanelTab("sources");
                                    }}
                                    className="chip"
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
                                  className="chip accent"
                                >
                                  <FileDown size={11} /> PDF
                                </button>
                                {!atLimit && (
                                  <button
                                    onClick={() => void doSearch(turn.query)}
                                    className="chip"
                                    title="Re-run"
                                  >
                                    <RotateCcw size={11} /> Re-run
                                  </button>
                                )}
                                <div style={{ marginLeft: "auto" }}>
                                  <FeedbackBtn
                                    query={turn.query}
                                    conversationId={conversationId}
                                    turnIndex={i}
                                    currentFeedback={turn.feedback}
                                    onFeedback={handleFeedback}
                                  />
                                </div>
                                {session && (
                                  <span
                                    style={{
                                      fontSize: 10.5,
                                      color: "#5a8a6a",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 3,
                                    }}
                                  >
                                    ✓ Saved
                                  </span>
                                )}
                              </div>
                              <RelatedQuestions
                                questions={turn.related ?? []}
                                onSearch={(q) => void doSearch(q)}
                              />
                            </>
                          )}
                        </>
                      ) : turn.streaming && !turn.status ? (
                        <div className="typing-bubble">
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Limit error */}
              {limitError && !loading && (
                <div className="limit-card">
                  <h3>
                    <Lock
                      size={14}
                      style={{
                        display: "inline",
                        marginRight: 6,
                        verticalAlign: -2,
                      }}
                    />
                    {!session
                      ? "Guest limit reached (2/2)"
                      : isFree
                        ? "Daily limit reached (5/5)"
                        : "Monthly limit reached (500/500)"}
                  </h3>
                  <p>
                    {!session
                      ? "Sign in free to get 5 searches every day — no credit card needed."
                      : isFree
                        ? "Upgrade or come back tomorrow."
                        : "Upgrade to Pro for unlimited searches."}
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {!session ? (
                      <>
                        <Link href="/auth/signin" className="btn-accent">
                          Sign In Free → Get 5/day
                        </Link>
                        <Link href="/pricing" className="btn-ghost">
                          <Sparkles size={12} /> See Plans
                        </Link>
                      </>
                    ) : (
                      <Link href="/pricing" className="btn-accent">
                        {isFree ? (
                          <>
                            <Sparkles size={12} /> Student ₹199/mo
                          </>
                        ) : (
                          <>
                            <Crown size={12} /> Pro ₹499/mo
                          </>
                        )}
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {/* General error */}
              {errorMsg && !loading && !limitError && (
                <div className="error-card">
                  <AlertCircle
                    size={14}
                    style={{ color: "#e06060", flexShrink: 0, marginTop: 1 }}
                  />
                  <p style={{ fontSize: 13.5, color: "#e06060" }}>{errorMsg}</p>
                </div>
              )}

              <div ref={endRef} style={{ height: 16 }} />
            </div>
          </div>
        )}

        {/* Input bar */}
        {/* Input bar */}
        <div className="input-wrap">
          <div className="input-wrap-inner">
          <div className="input-box" style={{ position: "relative" }}>
            <AnimatePresence>
              {showSuggestions && input.length >= 3 && (
                <SmartSuggestions
                  query={input}
                  onSelect={(q) => {
                    setShowSuggestions(false);
                    void doSearch(q);
                  }}
                />
              )}
            </AnimatePresence>
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handlePdfAttach(f);
              }}
            />

            {/* PDF attachment badge */}
            {attachedPdf && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 10px 0",
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    background: "rgba(201,185,154,0.12)",
                    border: "1px solid rgba(201,185,154,0.25)",
                    borderRadius: 6,
                    padding: "3px 8px",
                    fontSize: 12,
                    color: "#c9b99a",
                    maxWidth: "100%",
                  }}
                >
                  <FileText size={11} />
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 200,
                    }}
                  >
                    {attachedPdf.name}
                  </span>
                  <button
                    onClick={() => setAttachedPdf(null)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#666",
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                    }}
                    title="Remove PDF"
                  >
                    <X size={11} />
                  </button>
                </div>
              </div>
            )}

            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                resize();
                setShowSuggestions(e.target.value.length >= 3);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setShowSuggestions(false); return; }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  setShowSuggestions(false);
                  void doSearch(input);
                }
              }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder={
                attachedPdf
                  ? `Ask anything about "${attachedPdf.name}"…`
                  : "Ask a research question…"
              }
              className="input-textarea"
              rows={1}
              disabled={loading}
            />

            <div className="input-bottom-row">
              {/* Attach button */}
              <button
                className="input-attach-btn"
                title={attachedPdf ? "Replace PDF" : "Attach PDF"}
                onClick={() => fileInputRef.current?.click()}
                disabled={pdfParsing}
                style={{ position: "relative" }}
              >
                {pdfParsing ? (
                  <Loader2
                    size={15}
                    style={{ animation: "spin 1s linear infinite" }}
                  />
                ) : (
                  <Plus
                    size={15}
                    style={{ color: attachedPdf ? "#c9b99a" : undefined }}
                  />
                )}
                {attachedPdf && (
                  <span
                    style={{
                      position: "absolute",
                      top: -3,
                      right: -3,
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: "#c9b99a",
                    }}
                  />
                )}
              </button>

              {/* Voice button */}
              <button className="waveform-btn" title="Voice">
                <WaveformIcon />
              </button>

              {/* Send button */}
              <button
                onClick={() =>
                  void doSearch(
                    input ||
                      (attachedPdf
                        ? `Summarize this document: ${attachedPdf.name}`
                        : ""),
                  )
                }
                disabled={loading || (!input.trim() && !attachedPdf)}
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
                    stroke={input.trim() || attachedPdf ? "#141414" : "#555"}
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
            {session && !isPro
              ? `${isFree ? `${searchesToday}/5 today` : `${searchesThisMonth}/500 this month`} · `
              : ""}
            Semantic Scholar · OpenAlex · arXiv · PubMed
          </p>
          </div>{/* end input-wrap-inner */}
        </div>{/* end input-wrap */}
      </div>{/* end chat-wrap */}
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
