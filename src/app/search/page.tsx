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

const BADGE_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  Foundational: {
    bg: "rgba(173,115,224,0.12)",
    text: "#ad73e0",
    border: "rgba(173,115,224,0.25)",
  },
  "Highly Cited": {
    bg: "rgba(92,154,224,0.12)",
    text: "#5c9ae0",
    border: "rgba(92,154,224,0.25)",
  },
  Breakthrough: {
    bg: "rgba(93,184,122,0.12)",
    text: "#5db87a",
    border: "rgba(93,184,122,0.25)",
  },
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
      className="sr-suggestions-popup"
    >
      {uniq.map((s, i) => (
        <button key={i} className="sr-sugg-item" onClick={() => onSelect(s)}>
          <Search size={11} style={{ color: "#555", flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{s}</span>
          <ArrowRight size={10} style={{ color: "#3a3a3a", flexShrink: 0 }} />
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
  const [showPdfUpgradeModal, setShowPdfUpgradeModal] = useState(false);

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

  /* ── Search page styles — exact screenshot match ── */
  const searchPageStyles = `
    /* ── Base ── */
    .sr-chat-wrap {
      display: flex; flex-direction: column;
      height: 100%; position: relative;
      background: #0f0f0f;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }

    /* ── Welcome ── */
    .sr-welcome {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 0 24px 100px;
      min-height: 0; overflow-y: auto;
      gap: 0;
    }

    /* Plan badge — "Free Plan | Upgrade" style from image 2 */
    .sr-plan-label {
      display: inline-flex; align-items: center; gap: 0;
      margin-bottom: 20px;
      background: #1c1c1c; border: 1px solid #2a2a2a;
      border-radius: 99px; overflow: hidden;
      font-size: 12px;
    }
    .sr-plan-label-text {
      padding: 5px 12px; color: #555; white-space: nowrap;
    }
    .sr-plan-label-btn {
      padding: 5px 12px;
      background: #2a2a2a; color: #ccc;
      border: none; border-left: 1px solid #333;
      cursor: pointer; font-family: inherit; font-size: 12px;
      white-space: nowrap; text-decoration: none;
      display: inline-flex; align-items: center;
      transition: background 0.15s, color 0.15s;
    }
    .sr-plan-label-btn:hover { background: #333; color: #fff; }

    /* Heading — bold, centered, matches image 2 */
    .sr-heading {
      font-size: clamp(1.4rem, 3vw, 1.85rem);
      font-weight: 600; color: #e0dbd4;
      text-align: center; line-height: 1.25;
      letter-spacing: -0.02em;
      margin-bottom: 28px;
      max-width: 540px;
    }

    /* ── Pill wrapper ── */
    .sr-pill-wrap {
      width: 100%; max-width: 580px;
      display: flex; flex-direction: column;
      align-items: flex-start; gap: 10px;
    }

    /* The pill — matches image 2 exactly */
    .sr-pill {
      width: 100%; display: flex; align-items: center;
      background: #171717; border: 1px solid #2e2e2e;
      border-radius: 99px;
      padding: 5px 5px 5px 6px;
      gap: 8px; position: relative;
      transition: border-color 0.18s, box-shadow 0.18s;
    }
    .sr-pill:focus-within {
      border-color: #3a3a3a;
      box-shadow: 0 0 0 3px rgba(255,255,255,0.03);
    }

    /* Circle + button — outlined circle like image 2 */
    .sr-pill-attach {
      width: 34px; height: 34px; border-radius: 50%;
      background: transparent; border: 1px solid #333;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; color: #777; flex-shrink: 0; position: relative;
      transition: border-color 0.15s, color 0.15s, background 0.15s;
    }
    .sr-pill-attach:hover { border-color: #555; color: #bbb; background: #1e1e1e; }
    .sr-pill-attach:disabled { opacity: 0.35; cursor: default; }

    /* lock badge */
    .sr-pill-lock {
      position: absolute; top: -3px; right: -3px;
      width: 13px; height: 13px; border-radius: 50%;
      background: #0f0f0f; border: 1px solid #2a2a2a;
      display: flex; align-items: center; justify-content: center;
      font-size: 7px; pointer-events: none;
    }
    .sr-pill-pdf-dot {
      position: absolute; top: -2px; right: -2px;
      width: 7px; height: 7px; border-radius: 50%;
      background: #c9b99a; pointer-events: none;
    }

    /* Textarea */
    .sr-pill-input {
      flex: 1; background: transparent; border: none; outline: none;
      font-family: inherit; font-size: 14px; color: #bbb;
      line-height: 1.5; resize: none;
      min-height: 22px; max-height: 180px;
      padding: 7px 0;
    }
    .sr-pill-input::placeholder { color: #363636; }
    .sr-pill-input:disabled { opacity: 0.4; }

    /* PDF tag */
    .sr-pill-pdf-tag {
      display: inline-flex; align-items: center; gap: 5px;
      background: rgba(201,185,154,0.07);
      border: 1px solid rgba(201,185,154,0.18);
      border-radius: 99px; padding: 3px 8px;
      font-size: 11.5px; color: #c9b99a;
      flex-shrink: 0; max-width: 160px;
    }
    .sr-pill-pdf-tag span {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .sr-pill-pdf-remove {
      background: none; border: none; cursor: pointer; color: #555;
      padding: 0; display: flex; align-items: center; transition: color 0.12s;
    }
    .sr-pill-pdf-remove:hover { color: #aaa; }

    /* Waveform btn */
    .sr-pill-wave {
      width: 30px; height: 30px; border-radius: 50%;
      background: transparent; border: none;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; flex-shrink: 0; color: #383838;
    }

    /* Send button — white circle with arrow, matches image 2 */
    .sr-pill-send {
      width: 34px; height: 34px; border-radius: 50%;
      background: #fff; border: none;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; flex-shrink: 0;
      transition: background 0.15s, opacity 0.15s;
    }
    .sr-pill-send:disabled {
      background: #202020; cursor: not-allowed;
    }
    .sr-pill-send:not(:disabled):hover { background: #e8e8e8; }

    .sr-pill-spinner {
      width: 12px; height: 12px; border-radius: 50%;
      border: 2px solid rgba(0,0,0,0.1);
      border-top-color: #555;
      animation: sr-spin 0.7s linear infinite;
    }

    /* Chips below pill — matches image 2 style */
    .sr-quick-chips {
      display: flex; align-items: center;
      gap: 6px; flex-wrap: wrap;
    }
    .sr-qchip {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 6px 13px; border-radius: 99px;
      background: transparent; border: 1px solid #222;
      font-family: inherit; font-size: 12px; color: #444;
      cursor: pointer; white-space: nowrap;
      transition: border-color 0.14s, color 0.14s;
    }
    .sr-qchip:hover { border-color: #3a3a3a; color: #888; }

    /* ── Messages ── */
    .sr-messages-wrap {
      flex: 1; overflow-y: auto; padding: 24px 0 0; min-height: 0;
    }
    .sr-messages-inner {
      max-width: 680px; margin: 0 auto; padding: 0 20px 32px;
    }
    .sr-turn { margin-bottom: 36px; }

    /* User bubble */
    .sr-user-row {
      display: flex; justify-content: flex-end; margin-bottom: 20px;
    }
    .sr-user-bubble {
      background: #1c1c1c; border: 1px solid #272727;
      border-radius: 20px 20px 5px 20px;
      padding: 11px 17px; max-width: 75%;
      font-size: 14px; color: #ccc;
      line-height: 1.55; word-break: break-word;
    }

    /* AI response */
    .sr-ai-row { display: flex; align-items: flex-start; }
    .sr-ai-body { flex: 1; min-width: 0; }

    /* Action bar */
    .sr-action-bar {
      display: flex; flex-wrap: wrap; align-items: center;
      gap: 4px; margin-top: 14px; padding-top: 12px;
      border-top: 1px solid #1c1c1c;
    }
    .sr-chip {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 5px 10px; border-radius: 8px;
      background: transparent; border: 1px solid #1e1e1e;
      font-family: inherit; font-size: 12px; color: #4a4a4a;
      cursor: pointer; white-space: nowrap;
      transition: background 0.12s, color 0.12s, border-color 0.12s;
    }
    .sr-chip:hover { background: #181818; color: #999; border-color: #2e2e2e; }
    .sr-chip-accent { color: #a09070; border-color: rgba(160,144,112,0.18); }
    .sr-chip-accent:hover { background: rgba(160,144,112,0.06); color: #c9b99a; border-color: rgba(160,144,112,0.3); }
    .sr-saved-tag { font-size: 11px; color: #2e5a3e; display: flex; align-items: center; gap: 3px; }

    /* Status */
    .sr-status {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 8px 16px; border-radius: 99px;
      background: #141414; border: 1px solid #1e1e1e;
      font-size: 13px; color: #4a4a4a;
    }
    @keyframes sr-spin { to { transform: rotate(360deg); } }
    .sr-spin { animation: sr-spin 1s linear infinite; }

    /* Typing dots */
    .sr-typing { display: flex; gap: 4px; padding: 8px 4px; }
    .sr-dot {
      width: 5px; height: 5px; border-radius: 50%;
      background: #2e2e2e; animation: sr-bounce 1.2s infinite;
    }
    .sr-dot:nth-child(2) { animation-delay: 0.18s; }
    .sr-dot:nth-child(3) { animation-delay: 0.36s; }
    @keyframes sr-bounce {
      0%,60%,100% { transform: translateY(0); }
      30% { transform: translateY(-4px); }
    }

    /* Related */
    .sr-related { margin-top: 16px; }
    .sr-related-label {
      font-size: 10px; color: #2e2e2e; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 6px;
    }
    .sr-related-btn {
      display: flex; align-items: center; gap: 8px;
      width: 100%; padding: 8px 0;
      background: transparent; border: none;
      border-bottom: 1px solid #181818;
      cursor: pointer; text-align: left; font-family: inherit;
      font-size: 13px; color: #444; transition: color 0.12s;
    }
    .sr-related-btn:last-child { border-bottom: none; }
    .sr-related-btn:hover { color: #999; }

    /* Limit & error */
    .sr-limit-card {
      background: #141414; border: 1px solid #202020;
      border-radius: 14px; padding: 20px 22px; margin: 12px 0;
    }
    .sr-limit-card h3 { font-size: 14px; font-weight: 600; color: #bbb; margin-bottom: 6px; }
    .sr-limit-card p { font-size: 13px; color: #3a3a3a; margin-bottom: 14px; line-height: 1.6; }
    .sr-limit-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .sr-btn-solid {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 16px; border-radius: 99px;
      background: #d4c5a0; color: #111;
      font-family: inherit; font-size: 13px; font-weight: 600;
      text-decoration: none; border: none; cursor: pointer; transition: opacity 0.15s;
    }
    .sr-btn-solid:hover { opacity: 0.88; }
    .sr-btn-outline {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 14px; border-radius: 99px;
      background: transparent; color: #444;
      border: 1px solid #222; font-family: inherit;
      font-size: 13px; text-decoration: none;
      transition: color 0.15s, border-color 0.15s;
    }
    .sr-btn-outline:hover { color: #999; border-color: #333; }
    .sr-error-card {
      display: flex; gap: 10px; align-items: flex-start;
      padding: 12px 16px; border-radius: 10px;
      background: rgba(200,80,80,0.04); border: 1px solid rgba(200,80,80,0.1);
      margin: 8px 0;
    }

    /* ── Bottom input bar (chat mode only) ── */
    .sr-input-wrap {
      padding: 10px 16px 16px; flex-shrink: 0;
      background: #0f0f0f; border-top: 1px solid #181818;
    }
    .sr-input-wrap-inner { max-width: 680px; margin: 0 auto; }

    /* Suggestions popup */
    .sr-suggestions-popup {
      position: absolute; bottom: calc(100% + 8px);
      left: 0; right: 0; z-index: 50;
      background: #181818; border: 1px solid #252525;
      border-radius: 14px; overflow: hidden;
      box-shadow: 0 -8px 32px rgba(0,0,0,0.7);
    }
    .sr-sugg-item {
      width: 100%; display: flex; align-items: center; gap: 10px;
      padding: 10px 14px; background: transparent; border: none;
      border-bottom: 1px solid #1e1e1e;
      cursor: pointer; text-align: left; font-family: inherit;
      font-size: 13px; color: #666; transition: background 0.12s, color 0.12s;
    }
    .sr-sugg-item:last-child { border-bottom: none; }
    .sr-sugg-item:hover { background: #1e1e1e; color: #aaa; }

    /* Counter bar */
    .sr-counter-bar {
      display: flex; align-items: center; justify-content: center;
      gap: 8px; padding: 6px 16px;
      font-size: 11px; color: #2e2e2e;
      border-bottom: 1px solid #181818; flex-shrink: 0;
    }
    .sr-counter-track {
      width: 50px; height: 2px; background: #1e1e1e;
      border-radius: 99px; overflow: hidden;
    }
    .sr-counter-fill {
      height: 100%; background: #303030;
      border-radius: 99px; transition: width 0.3s;
    }
    .sr-counter-fill.warn { background: #5a4a1a; }
    .sr-counter-fill.limit { background: #5a1a1a; }
    .sr-counter-upgrade {
      color: #444; text-decoration: none; font-size: 11px; transition: color 0.15s;
    }
    .sr-counter-upgrade:hover { color: #888; }

    /* Hint */
    .sr-hint {
      text-align: center; font-size: 10.5px; color: #1e1e1e;
      margin-top: 8px;
    }
    .sr-hint a { color: #252525; text-decoration: none; }
    .sr-hint a:hover { color: #555; }

    /* Responsive */
    @media (max-width: 520px) {
      .sr-pill-wrap { max-width: 100%; }
      .sr-welcome { padding: 0 16px 80px; }
      .sr-heading { font-size: 1.35rem; }
    }
  `;

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
      <style>{searchPageStyles}</style>

      <div className="sr-chat-wrap">
        {/* ── Counter bar ── */}
        {session && !isPro && (
          <div className="sr-counter-bar">
            <div className="sr-counter-track">
              <div
                className={`sr-counter-fill${counterUsed >= warnAt ? (atLimit ? " limit" : " warn") : ""}`}
                style={{
                  width: `${Math.min((counterUsed / counterMax) * 100, 100)}%`,
                }}
              />
            </div>
            <span>
              {isFree
                ? `${searchesToday}/5 searches today`
                : `${searchesThisMonth}/500 this month`}
            </span>
            {counterUsed >= warnAt && (
              <Link href="/pricing" className="sr-counter-upgrade">
                Upgrade →
              </Link>
            )}
          </div>
        )}

        {/* ── Welcome screen ── */}
        {turns.length === 0 && !loading ? (
          <motion.div
            className="sr-welcome"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35 }}
          >
            {/* Plan badge — "Free Plan | Upgrade" pill style from image 2 */}
            <motion.div
              className="sr-plan-label"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <span className="sr-plan-label-text">
                {!session
                  ? "Guest"
                  : plan === "student"
                    ? "Student Plan"
                    : plan === "pro"
                      ? "Pro Plan"
                      : "Free Plan"}
              </span>
              {!isPro && (
                <Link
                  href={!session ? "/auth/signin" : "/pricing"}
                  className="sr-plan-label-btn"
                >
                  {!session ? "Sign in free" : "Upgrade"}
                </Link>
              )}
            </motion.div>

            {/* Bold heading — matches image 2 */}
            <motion.h2
              className="sr-heading"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.12 }}
            >
              What's on the research agenda today?
            </motion.h2>

            {/* Pill input */}
            <motion.div
              className="sr-pill-wrap"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.38, delay: 0.18 }}
            >
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

              <div className="sr-pill" style={{ position: "relative" }}>
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

                {/* Circle + button */}
                <button
                  className="sr-pill-attach"
                  title={
                    isFree || !session
                      ? "PDF uploads: Student & Pro plans"
                      : attachedPdf
                        ? "Replace PDF"
                        : "Attach PDF"
                  }
                  disabled={pdfParsing}
                  onClick={() => {
                    if (isFree || !session) {
                      setShowPdfUpgradeModal(true);
                    } else {
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  {pdfParsing ? (
                    <Loader2 size={14} className="sr-spin" />
                  ) : (
                    <Plus size={14} />
                  )}
                  {(isFree || !session) && (
                    <span className="sr-pill-lock">🔒</span>
                  )}
                  {attachedPdf && !isFree && session && (
                    <span className="sr-pill-pdf-dot" />
                  )}
                </button>

                {/* PDF tag */}
                {attachedPdf && (
                  <div className="sr-pill-pdf-tag">
                    <FileText size={10} />
                    <span>{attachedPdf.name}</span>
                    <button
                      className="sr-pill-pdf-remove"
                      onClick={() => setAttachedPdf(null)}
                    >
                      <X size={9} />
                    </button>
                  </div>
                )}

                {/* Textarea */}
                <textarea
                  ref={taRef}
                  className="sr-pill-input"
                  value={input}
                  rows={1}
                  disabled={loading}
                  placeholder={
                    attachedPdf
                      ? `Ask about "${attachedPdf.name}"…`
                      : "Ask me anything about research"
                  }
                  onChange={(e) => {
                    setInput(e.target.value);
                    resize();
                    setShowSuggestions(e.target.value.length >= 3);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setShowSuggestions(false);
                      return;
                    }
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      setShowSuggestions(false);
                      void doSearch(input);
                    }
                  }}
                  onBlur={() =>
                    setTimeout(() => setShowSuggestions(false), 150)
                  }
                />

                {/* Waveform */}
                <button className="sr-pill-wave" title="Voice">
                  <WaveformIcon />
                </button>

                {/* Send — white circle with arrow matching image 2 */}
                <button
                  className="sr-pill-send"
                  disabled={loading || (!input.trim() && !attachedPdf)}
                  onClick={() =>
                    void doSearch(
                      input ||
                        (attachedPdf ? `Summarize: ${attachedPdf.name}` : ""),
                    )
                  }
                >
                  {loading ? (
                    <span className="sr-pill-spinner" />
                  ) : (
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={input.trim() || attachedPdf ? "#111" : "#666"}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 19V5M5 12l7-7 7 7" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Quick action chips */}
              <div className="sr-quick-chips">
                <button
                  className="sr-qchip"
                  onClick={() => router.push("/review")}
                >
                  <BookOpen size={11} /> Literature Review
                </button>
                <button
                  className="sr-qchip"
                  onClick={() => {
                    if (isFree || !session) {
                      setShowPdfUpgradeModal(true);
                    } else {
                      router.push("/upload");
                    }
                  }}
                >
                  <FileText size={11} /> PDF Chat
                  {(isFree || !session) && (
                    <Lock size={9} style={{ opacity: 0.4 }} />
                  )}
                </button>
                <button
                  className="sr-qchip"
                  onClick={() => router.push("/dashboard")}
                >
                  <Layers size={11} /> My Library
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          /* ── Messages ── */
          <div className="sr-messages-wrap">
            <div className="sr-messages-inner">
              {turns.map((turn, i) => (
                <motion.div
                  key={i}
                  className="sr-turn"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28 }}
                >
                  {/* User bubble */}
                  <div className="sr-user-row">
                    <div className="sr-user-bubble">{turn.query}</div>
                  </div>

                  {/* AI response */}
                  <div className="sr-ai-row">
                    <div className="sr-ai-body">
                      {turn.streaming && !turn.answer && turn.status && (
                        <div className="sr-status">
                          <Loader2 size={12} className="sr-spin" />
                          <span>{turn.status}</span>
                        </div>
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
                              <div className="sr-action-bar">
                                {turn.papers.length > 0 && (
                                  <button
                                    className="sr-chip"
                                    onClick={() => {
                                      setPanelTurn(turn);
                                      setPanelTab("sources");
                                    }}
                                  >
                                    <Layers size={11} /> {turn.papers.length}{" "}
                                    sources
                                  </button>
                                )}
                                <CopyBtn text={turn.answer} />
                                <button
                                  className="sr-chip sr-chip-accent"
                                  onClick={() =>
                                    downloadResearchPDF(
                                      turn.query,
                                      turn.answer,
                                      turn.papers,
                                      session?.user?.name ?? undefined,
                                    )
                                  }
                                >
                                  <FileDown size={11} /> PDF
                                </button>
                                {!atLimit && (
                                  <button
                                    className="sr-chip"
                                    onClick={() => void doSearch(turn.query)}
                                  >
                                    <RotateCcw size={11} /> Re-run
                                  </button>
                                )}
                                <div
                                  style={{
                                    marginLeft: "auto",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                  }}
                                >
                                  <FeedbackBtn
                                    query={turn.query}
                                    conversationId={conversationId}
                                    turnIndex={i}
                                    currentFeedback={turn.feedback}
                                    onFeedback={handleFeedback}
                                  />
                                </div>
                                {session && (
                                  <span className="sr-saved-tag">✓ Saved</span>
                                )}
                              </div>
                              {(turn.related ?? []).length > 0 && (
                                <div className="sr-related">
                                  <p className="sr-related-label">
                                    Related searches
                                  </p>
                                  {(turn.related ?? []).map((q, ri) => (
                                    <button
                                      key={ri}
                                      className="sr-related-btn"
                                      onClick={() => void doSearch(q)}
                                    >
                                      <Search
                                        size={11}
                                        style={{ color: "#444", flexShrink: 0 }}
                                      />
                                      <span style={{ flex: 1 }}>{q}</span>
                                      <ArrowRight
                                        size={10}
                                        style={{ color: "#333", flexShrink: 0 }}
                                      />
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </>
                      ) : turn.streaming && !turn.status ? (
                        <div className="sr-typing">
                          <span className="sr-dot" />
                          <span className="sr-dot" />
                          <span className="sr-dot" />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Limit error */}
              {limitError && !loading && (
                <div className="sr-limit-card">
                  <h3>
                    <Lock
                      size={13}
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
                        : "Monthly limit (500/500)"}
                  </h3>
                  <p>
                    {!session
                      ? "Sign in free for 5 searches every day."
                      : isFree
                        ? "Upgrade or come back tomorrow."
                        : "Upgrade to Pro for unlimited."}
                  </p>
                  <div className="sr-limit-actions">
                    {!session ? (
                      <>
                        <Link href="/auth/signin" className="sr-btn-solid">
                          Sign in free →
                        </Link>
                        <Link href="/pricing" className="sr-btn-outline">
                          See plans
                        </Link>
                      </>
                    ) : (
                      <Link href="/pricing" className="sr-btn-solid">
                        {isFree ? "Student — ₹199/mo" : "Pro — ₹499/mo"}
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {/* Error */}
              {errorMsg && !loading && !limitError && (
                <div className="sr-error-card">
                  <AlertCircle
                    size={14}
                    style={{ color: "#e06060", flexShrink: 0, marginTop: 1 }}
                  />
                  <p style={{ fontSize: 13.5, color: "#e06060" }}>{errorMsg}</p>
                </div>
              )}
              <div ref={endRef} style={{ height: 20 }} />
            </div>
          </div>
        )}

        {/* ── Input bar (chat mode only — hidden on welcome screen) ── */}
        {(turns.length > 0 || loading) && (
          <div className="sr-input-wrap">
            <div className="sr-input-wrap-inner">
              <div className="sr-pill" style={{ position: "relative" }}>
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

                {/* + attach */}
                <button
                  className="sr-pill-attach"
                  title={
                    isFree || !session
                      ? "PDF uploads: Student & Pro plans"
                      : attachedPdf
                        ? "Replace PDF"
                        : "Attach PDF"
                  }
                  disabled={pdfParsing}
                  onClick={() => {
                    if (isFree || !session) {
                      setShowPdfUpgradeModal(true);
                    } else {
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  {pdfParsing ? (
                    <Loader2 size={15} className="sr-spin" />
                  ) : (
                    <Plus size={15} />
                  )}
                  {(isFree || !session) && (
                    <span className="sr-pill-lock">🔒</span>
                  )}
                  {attachedPdf && !isFree && session && (
                    <span className="sr-pill-pdf-dot" />
                  )}
                </button>

                {/* PDF tag */}
                {attachedPdf && (
                  <div className="sr-pill-pdf-tag">
                    <FileText size={10} />
                    <span>{attachedPdf.name}</span>
                    <button
                      className="sr-pill-pdf-remove"
                      onClick={() => setAttachedPdf(null)}
                    >
                      <X size={9} />
                    </button>
                  </div>
                )}

                {/* Textarea */}
                <textarea
                  ref={taRef}
                  className="sr-pill-input"
                  value={input}
                  rows={1}
                  disabled={loading}
                  placeholder="Ask a research question…"
                  onChange={(e) => {
                    setInput(e.target.value);
                    resize();
                    setShowSuggestions(e.target.value.length >= 3);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setShowSuggestions(false);
                      return;
                    }
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      setShowSuggestions(false);
                      void doSearch(input);
                    }
                  }}
                  onBlur={() =>
                    setTimeout(() => setShowSuggestions(false), 150)
                  }
                />

                {/* Waveform */}
                <button className="sr-pill-wave" title="Voice">
                  <WaveformIcon />
                </button>

                {/* Send */}
                <button
                  className="sr-pill-send"
                  disabled={loading || (!input.trim() && !attachedPdf)}
                  onClick={() =>
                    void doSearch(
                      input ||
                        (attachedPdf ? `Summarize: ${attachedPdf.name}` : ""),
                    )
                  }
                >
                  {loading ? (
                    <span className="sr-pill-spinner" />
                  ) : (
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={input.trim() || attachedPdf ? "#1a1a1a" : "#444"}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 19V5M5 12l7-7 7 7" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="sr-hint">
                {session && !isPro ? (
                  <>
                    <Link href="/pricing">
                      {isFree
                        ? `${searchesToday}/5 today`
                        : `${searchesThisMonth}/500 this month`}
                    </Link>{" "}
                    ·{" "}
                  </>
                ) : null}
                Semantic Scholar · OpenAlex · arXiv · PubMed
              </p>
            </div>
          </div>
        )}
        {/* end chat-mode input bar */}
      </div>
      {/* end sr-chat-wrap */}

      {/* ── PDF Upgrade Modal — fully responsive ─────────────── */}
      <style>{`
        .pdf-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.82);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          /* allow scroll on very small screens */
          overflow-y: auto;
        }
        .pdf-modal-card {
          background: #0e0e0e;
          border: 1px solid #252525;
          border-radius: 20px;
          width: 100%;
          max-width: 480px;
          /* sit at top on tiny screens so close btn is reachable */
          margin: auto;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.04),
            0 32px 80px rgba(0,0,0,0.9);
          position: relative;
          overflow: hidden;
        }
        .pdf-modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 22px 22px 0;
        }
        .pdf-modal-body {
          padding: 0 22px;
        }
        .pdf-modal-plans {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 14px;
        }
        .pdf-modal-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 14px 22px 20px;
          flex-wrap: wrap;
        }
        /* ── Tablet & small desktop ── */
        @media (max-width: 520px) {
          .pdf-modal-overlay { padding: 10px; align-items: flex-start; padding-top: 24px; }
          .pdf-modal-card { border-radius: 16px; }
          .pdf-modal-header { padding: 18px 16px 0; }
          .pdf-modal-body { padding: 0 16px; }
          .pdf-modal-footer { padding: 12px 16px 18px; }
        }
        /* ── Small phones — stack plan cards vertically ── */
        @media (max-width: 380px) {
          .pdf-modal-plans { grid-template-columns: 1fr; }
        }
        .pdf-close-btn {
          flex-shrink: 0;
          width: 34px; height: 34px;
          border-radius: 10px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          color: #555;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .pdf-close-btn:hover {
          background: rgba(255,255,255,0.1);
          color: #ccc;
          border-color: rgba(255,255,255,0.2);
        }
        .pdf-plan-btn-student {
          width: 100%; padding: 11px 0;
          border-radius: 10px; border: none;
          background: #D4C5A0; color: #0A0A0A;
          font-weight: 700; font-size: 13px;
          cursor: pointer; transition: opacity 0.15s;
          font-family: inherit;
        }
        .pdf-plan-btn-student:hover { opacity: 0.88; }
        .pdf-plan-btn-pro {
          width: 100%; padding: 11px 0;
          border-radius: 10px;
          border: 1px solid rgba(126,168,201,0.35);
          background: rgba(126,168,201,0.08);
          color: #7ea8c9;
          font-weight: 700; font-size: 13px;
          cursor: pointer; transition: background 0.15s;
          font-family: inherit;
        }
        .pdf-plan-btn-pro:hover { background: rgba(126,168,201,0.14); }
      `}</style>

      <AnimatePresence>
        {showPdfUpgradeModal && (
          <motion.div
            className="pdf-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setShowPdfUpgradeModal(false)}
          >
            <motion.div
              className="pdf-modal-card"
              initial={{ opacity: 0, y: 28, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Rainbow-ish top accent line */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 2,
                  background:
                    "linear-gradient(90deg, transparent, rgba(212,197,160,0.7) 35%, rgba(126,168,201,0.7) 65%, transparent)",
                  borderRadius: "20px 20px 0 0",
                }}
              />

              {/* Soft glow behind header */}
              <div
                style={{
                  position: "absolute",
                  top: -80,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 360,
                  height: 200,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(ellipse, rgba(212,197,160,0.07) 0%, transparent 70%)",
                  pointerEvents: "none",
                }}
              />

              {/* ── HEADER ── */}
              <div className="pdf-modal-header">
                {/* Lock icon + title */}
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 12,
                      flexShrink: 0,
                      background: "rgba(212,197,160,0.1)",
                      border: "1px solid rgba(212,197,160,0.22)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 19,
                    }}
                  >
                    🔒
                  </div>
                  <div>
                    <p
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: "0.11em",
                        textTransform: "uppercase",
                        color: "#D4C5A0",
                        margin: 0,
                        marginBottom: 3,
                      }}
                    >
                      Premium Feature
                    </p>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: 18,
                        fontWeight: 700,
                        color: "#fff",
                        letterSpacing: "-0.02em",
                        lineHeight: 1.15,
                      }}
                    >
                      Unlock PDF Chat
                    </h2>
                  </div>
                </div>

                {/* ── CLOSE BUTTON — always visible, prominent ── */}
                <button
                  className="pdf-close-btn"
                  onClick={() => setShowPdfUpgradeModal(false)}
                  title="Close"
                >
                  <X size={15} strokeWidth={2.5} />
                </button>
              </div>

              {/* ── BODY ── */}
              <div className="pdf-modal-body">
                {/* Subtitle */}
                <p
                  style={{
                    fontSize: 13,
                    color: "#4e4e4e",
                    margin: "8px 0 0",
                    fontWeight: 300,
                    lineHeight: 1.65,
                  }}
                >
                  {!session
                    ? "Sign in and upgrade to chat with your research papers."
                    : "Upload PDFs and get instant AI-powered answers with citations."}
                </p>

                {/* Thin divider */}
                <div
                  style={{
                    height: 1,
                    background: "#1c1c1c",
                    margin: "16px 0 14px",
                  }}
                />

                {/* Feature pills */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[
                    ["📄", "PDF Chat"],
                    ["📖", "Literature Reviews"],
                    ["🔖", "6 Citation Formats"],
                    ["📚", "Paper Library"],
                    ["⚡", "500+ Searches"],
                  ].map(([icon, label]) => (
                    <span
                      key={label}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "4px 10px",
                        borderRadius: 99,
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        fontSize: 11.5,
                        color: "#777",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span style={{ fontSize: 11 }}>{icon}</span>
                      {label}
                    </span>
                  ))}
                </div>

                {/* ── PLAN CARDS ── */}
                <div className="pdf-modal-plans">
                  {/* Student */}
                  <div
                    style={{
                      borderRadius: 14,
                      border: "1px solid rgba(212,197,160,0.3)",
                      background: "rgba(212,197,160,0.05)",
                      padding: "16px 14px",
                      display: "flex",
                      flexDirection: "column",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    {/* POPULAR badge */}
                    <span
                      style={{
                        position: "absolute",
                        top: 9,
                        right: 9,
                        fontSize: 8,
                        fontWeight: 800,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "#D4C5A0",
                        background: "rgba(212,197,160,0.13)",
                        border: "1px solid rgba(212,197,160,0.25)",
                        borderRadius: 99,
                        padding: "2px 7px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      POPULAR
                    </span>

                    {/* Icon row */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 10,
                      }}
                    >
                      <Sparkles size={13} style={{ color: "#D4C5A0" }} />
                      <span
                        style={{
                          fontSize: 13.5,
                          fontWeight: 700,
                          color: "#e8e3dc",
                        }}
                      >
                        Student
                      </span>
                    </div>

                    {/* Price */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 3,
                        marginBottom: 12,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 30,
                          fontWeight: 800,
                          color: "#D4C5A0",
                          letterSpacing: "-2px",
                          lineHeight: 1,
                        }}
                      >
                        ₹199
                      </span>
                      <span style={{ fontSize: 11, color: "#444" }}>/mo</span>
                    </div>

                    {/* Features */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 7,
                        marginBottom: 14,
                        flex: 1,
                      }}
                    >
                      {[
                        "20 PDFs / month",
                        "500 searches / mo",
                        "All 6 citation formats",
                        "Unlimited library",
                      ].map((f) => (
                        <div
                          key={f}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 7,
                          }}
                        >
                          <span
                            style={{
                              color: "#D4C5A0",
                              fontSize: 9,
                              fontWeight: 900,
                              marginTop: 3,
                              flexShrink: 0,
                            }}
                          >
                            ✔
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              color: "#666",
                              lineHeight: 1.35,
                            }}
                          >
                            {f}
                          </span>
                        </div>
                      ))}
                    </div>

                    <button
                      className="pdf-plan-btn-student"
                      onClick={() => {
                        setShowPdfUpgradeModal(false);
                        router.push("/pricing");
                      }}
                    >
                      Get Student
                    </button>
                  </div>

                  {/* Pro */}
                  <div
                    style={{
                      borderRadius: 14,
                      border: "1px solid rgba(126,168,201,0.25)",
                      background: "rgba(126,168,201,0.04)",
                      padding: "16px 14px",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    {/* Icon row */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 10,
                      }}
                    >
                      <Crown size={13} style={{ color: "#7ea8c9" }} />
                      <span
                        style={{
                          fontSize: 13.5,
                          fontWeight: 700,
                          color: "#e8e3dc",
                        }}
                      >
                        Pro
                      </span>
                    </div>

                    {/* Price */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 3,
                        marginBottom: 12,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 30,
                          fontWeight: 800,
                          color: "#7ea8c9",
                          letterSpacing: "-2px",
                          lineHeight: 1,
                        }}
                      >
                        ₹499
                      </span>
                      <span style={{ fontSize: 11, color: "#444" }}>/mo</span>
                    </div>

                    {/* Features */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 7,
                        marginBottom: 14,
                        flex: 1,
                      }}
                    >
                      {[
                        "Unlimited PDFs",
                        "Unlimited searches",
                        "API access (100/day)",
                        "Team sharing (5 seats)",
                      ].map((f) => (
                        <div
                          key={f}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 7,
                          }}
                        >
                          <span
                            style={{
                              color: "#7ea8c9",
                              fontSize: 9,
                              fontWeight: 900,
                              marginTop: 3,
                              flexShrink: 0,
                            }}
                          >
                            ✔
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              color: "#666",
                              lineHeight: 1.35,
                            }}
                          >
                            {f}
                          </span>
                        </div>
                      ))}
                    </div>

                    <button
                      className="pdf-plan-btn-pro"
                      onClick={() => {
                        setShowPdfUpgradeModal(false);
                        router.push("/pricing");
                      }}
                    >
                      Get Pro
                    </button>
                  </div>
                </div>
              </div>

              {/* ── FOOTER ── */}
              <div className="pdf-modal-footer">
                <span style={{ fontSize: 11, color: "#2e2e2e" }}>
                  Cancel anytime · No hidden fees
                </span>
                <button
                  onClick={() => setShowPdfUpgradeModal(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#3a3a3a",
                    fontSize: 12.5,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontWeight: 500,
                    padding: "4px 2px",
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = "#666";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = "#3a3a3a";
                  }}
                >
                  Maybe later
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
