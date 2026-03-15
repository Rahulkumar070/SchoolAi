"use client";
import { useEffect, useState, Suspense } from "react";
import Shell from "@/components/layout/Shell";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookmarkCheck,
  Search,
  ExternalLink,
  Trash2,
  Zap,
  Crown,
  Sparkles,
  CheckCircle,
  AlertTriangle,
  Clock,
  ArrowRight,
  Lock,
  ChevronLeft,
  FileText,
  BookOpen,
  Download,
  Activity,
  ChevronRight,
  Plus,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { downloadResearchPDF, downloadSavedPaperPDF } from "@/lib/downloadPDF";
import Image from "next/image";
import toast from "react-hot-toast";
import { SavedPaper } from "@/types";
import AnswerRenderer from "@/components/answer/AnswerRenderer";

interface Paper {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  journal?: string;
  abstract?: string;
  doi?: string;
  url?: string;
}

function useIsMobile() {
  const [w, setW] = useState(0);
  useEffect(() => {
    const update = () => setW(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return { isMobile: w > 0 && w < 640, isTablet: w >= 640 && w < 900, w };
}

const mdComponents = {
  h2: ({ children }: any) => (
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
  h3: ({ children }: any) => (
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
  p: ({ children }: any) => (
    <p
      style={{
        marginBottom: ".75em",
        lineHeight: 1.78,
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
  ul: ({ children }: any) => (
    <ul style={{ paddingLeft: "1.4em", marginBottom: ".75em" }}>{children}</ul>
  ),
  li: ({ children }: any) => (
    <li
      style={{
        marginBottom: ".3em",
        fontSize: 14,
        color: "var(--text-secondary)",
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
      }}
    >
      {children}
    </a>
  ),
  code: ({ children }: any) => (
    <code
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        background: "var(--surface)",
        color: "var(--brand)",
        padding: "2px 5px",
        borderRadius: 4,
      }}
    >
      {children}
    </code>
  ),
};

function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/* ── Stat Card ──────────────────────────────────────────────── */
function StatCard({
  value,
  label,
  icon: Icon,
  color,
  sub,
}: {
  value: string | number;
  label: string;
  icon: any;
  color: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        padding: "18px 18px 16px",
        borderRadius: 14,
        background: "var(--bg-raised)",
        border: "1px solid var(--border)",
        position: "relative",
        overflow: "hidden",
        transition: "border-color .18s, transform .18s",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hi)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
        (e.currentTarget as HTMLElement).style.transform = "";
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -16,
          right: -16,
          width: 70,
          height: 70,
          borderRadius: "50%",
          background: `${color}0e`,
          filter: "blur(16px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: `${color}12`,
            border: `1px solid ${color}20`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={14} style={{ color }} />
        </div>
        {sub && (
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              color: "#5db87a",
              background: "rgba(93,184,122,.1)",
              border: "1px solid rgba(93,184,122,.18)",
              padding: "2px 7px",
              borderRadius: 99,
            }}
          >
            {sub}
          </span>
        )}
      </div>
      <p
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: "var(--text-primary)",
          lineHeight: 1,
          marginBottom: 5,
          letterSpacing: "-1.5px",
        }}
      >
        {value}
      </p>
      <p
        style={{ fontSize: 11.5, color: "var(--text-muted)", fontWeight: 500 }}
      >
        {label}
      </p>
    </div>
  );
}

/* ── Action Card ─────────────────────────────────────────────── */
function ActionCard({
  label,
  desc,
  cta,
  href,
  color,
  Icon,
}: {
  label: string;
  desc: string;
  cta: string;
  href: string;
  color: string;
  Icon: any;
}) {
  return (
    <Link
      href={href}
      style={{
        padding: "20px 20px 18px",
        borderRadius: 14,
        background: "var(--bg-raised)",
        border: "1px solid var(--border)",
        textDecoration: "none",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        transition: "border-color .18s, transform .18s, box-shadow .18s",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = `${color}30`;
        el.style.transform = "translateY(-3px)";
        el.style.boxShadow = `0 16px 40px rgba(0,0,0,.4)`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = "var(--border)";
        el.style.transform = "";
        el.style.boxShadow = "";
      }}
    >
      <div
        style={{
          position: "absolute",
          bottom: -20,
          right: -20,
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: `${color}10`,
          filter: "blur(20px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: `${color}10`,
          border: `1px solid ${color}20`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14,
        }}
      >
        <Icon size={16} style={{ color }} />
      </div>
      <p
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "var(--text-primary)",
          marginBottom: 6,
          letterSpacing: "-.015em",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 12.5,
          color: "var(--text-muted)",
          lineHeight: 1.55,
          marginBottom: 16,
          flex: 1,
        }}
      >
        {desc}
      </p>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color,
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        {cta} <ArrowRight size={11} />
      </span>
    </Link>
  );
}

/* ── List Row ─────────────────────────────────────────────────── */
function ListRow({ iconEl, iconColor, title, meta, badge, onClick }: any) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        background: "var(--bg-raised)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        transition: "border-color .14s, background .14s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hi)";
        (e.currentTarget as HTMLElement).style.background = "var(--surface)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
        (e.currentTarget as HTMLElement).style.background = "var(--bg-raised)";
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          background: `${iconColor}12`,
          border: `1px solid ${iconColor}28`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {iconEl}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-primary)",
            fontWeight: 500,
            marginBottom: 3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {meta}
          {badge && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--text-faint)",
                background: "var(--surface)",
                padding: "1px 7px",
                borderRadius: 99,
              }}
            >
              {badge}
            </span>
          )}
        </div>
      </div>
      <ChevronRight
        size={12}
        style={{ color: "var(--text-faint)", flexShrink: 0 }}
      />
    </button>
  );
}

function Shimmer({ h = 66 }: { h?: number }) {
  return (
    <div
      className="shimmer-line"
      style={{ height: h, borderRadius: 12, marginBottom: 8 }}
    />
  );
}

function Empty({
  icon: Icon,
  title,
  desc,
  href,
  cta,
}: {
  icon: any;
  title: string;
  desc: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div
      style={{
        padding: "52px 24px",
        textAlign: "center",
        background: "var(--bg-raised)",
        border: "1px dashed var(--border-mid)",
        borderRadius: 16,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: "var(--surface)",
          border: "1px solid var(--border-mid)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 18px",
        }}
      >
        <Icon size={22} style={{ color: "var(--text-faint)" }} />
      </div>
      <p
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: "var(--text-primary)",
          marginBottom: 8,
          letterSpacing: "-.02em",
        }}
      >
        {title}
      </p>
      <p
        style={{
          fontSize: 13,
          color: "var(--text-faint)",
          marginBottom: href ? 22 : 0,
          lineHeight: 1.6,
        }}
      >
        {desc}
      </p>
      {href && cta && (
        <Link
          href={href}
          style={{
            padding: "10px 22px",
            borderRadius: 10,
            background: "var(--brand)",
            color: "#000",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {cta}
        </Link>
      )}
    </div>
  );
}

/* ── Detail View (shared for history & reviews) ────────────────── */
function DetailView({
  type,
  title,
  content,
  papers,
  timestamp,
  onBack,
  atLimit,
  query,
  onDownload,
  session,
}: any) {
  const accentColor = type === "review" ? "#5db87a" : "var(--brand)";
  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div
        style={{ maxWidth: 820, margin: "0 auto", padding: "28px 24px 60px" }}
      >
        <button
          onClick={onBack}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 14px",
            background: "var(--bg-raised)",
            border: "1px solid var(--border)",
            borderRadius: 9,
            cursor: "pointer",
            fontSize: 12.5,
            color: "var(--text-faint)",
            marginBottom: 24,
            fontFamily: "var(--font-ui)",
            transition: "color .14s",
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.color =
              "var(--text-primary)")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.color = "var(--text-faint)")
          }
        >
          <ChevronLeft size={14} /> Back
        </button>

        <div
          style={{
            padding: "18px 20px",
            borderRadius: 14,
            background: `${type === "review" ? "rgba(93,184,122,.06)" : "var(--brand-dim)"}`,
            border: `1px solid ${type === "review" ? "rgba(93,184,122,.18)" : "var(--brand-border)"}`,
            marginBottom: 24,
          }}
        >
          <p
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              color: accentColor,
              marginBottom: 8,
            }}
          >
            {type === "review" ? "Literature Review" : "Research Query"}
          </p>
          <p
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--text-primary)",
              lineHeight: 1.5,
            }}
          >
            {title}
          </p>
          <p
            style={{
              fontSize: 11,
              color: "var(--text-faint)",
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Clock size={10} /> {timeAgo(timestamp)}
            {papers?.length > 0 && (
              <span style={{ color: accentColor }}>
                · {papers.length} sources
              </span>
            )}
          </p>
        </div>

        {content ? (
          <>
            <div style={{ marginBottom: 20 }}>
              <AnswerRenderer content={content} citedPapers={papers ?? []} />
            </div>
            {papers?.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    color: "var(--text-faint)",
                    marginBottom: 12,
                  }}
                >
                  Sources ({papers.length})
                </p>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 7 }}
                >
                  {papers.map((p: any, i: number) => (
                    <div
                      key={i}
                      style={{
                        padding: "12px 14px",
                        background: "var(--bg-raised)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        display: "flex",
                        gap: 10,
                      }}
                    >
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          background: accentColor,
                          color: type === "review" ? "#000" : "#000",
                          fontSize: 9.5,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            marginBottom: 3,
                          }}
                        >
                          {p.title}
                        </p>
                        <p
                          style={{ fontSize: 10.5, color: "var(--text-faint)" }}
                        >
                          {p.authors?.slice(0, 3).join(", ")}
                          {(p.authors?.length ?? 0) > 3 ? " et al." : ""}
                          {p.year ? ` · ${p.year}` : ""}
                          {p.journal ? ` · ${p.journal}` : ""}
                        </p>
                        {p.url && (
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: 10.5,
                              color: "var(--brand)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                              marginTop: 4,
                            }}
                          >
                            View <ExternalLink size={8} />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={onDownload}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "1px solid var(--border-mid)",
                  color: "var(--text-muted)",
                  background: "transparent",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: "var(--font-ui)",
                  transition: "border-color .14s, color .14s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor =
                    "var(--brand)";
                  (e.currentTarget as HTMLElement).style.color = "var(--brand)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor =
                    "#2a2a2a";
                  (e.currentTarget as HTMLElement).style.color =
                    "var(--text-secondary)";
                }}
              >
                <Download size={13} /> Export PDF
              </button>
              {type === "history" && (
                <Link
                  href={
                    atLimit
                      ? "/pricing"
                      : `/search?q=${encodeURIComponent(query)}`
                  }
                  style={{
                    padding: "10px 18px",
                    borderRadius: 10,
                    background: "var(--brand)",
                    color: "#000",
                    fontSize: 13,
                    fontWeight: 700,
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {atLimit ? (
                    <>
                      <Sparkles size={12} /> Upgrade
                    </>
                  ) : (
                    <>
                      <Search size={12} /> Search Again
                    </>
                  )}
                </Link>
              )}
              {type === "review" && (
                <Link
                  href="/review"
                  style={{
                    padding: "10px 18px",
                    borderRadius: 10,
                    background: "var(--brand)",
                    color: "#000",
                    fontSize: 13,
                    fontWeight: 700,
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <BookOpen size={12} /> New Review
                </Link>
              )}
            </div>
          </>
        ) : (
          <div
            style={{
              textAlign: "center",
              padding: "48px 20px",
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
              borderRadius: 14,
            }}
          >
            <FileText
              size={28}
              style={{
                color: "var(--text-faint)",
                margin: "0 auto 14px",
                display: "block",
                opacity: 0.4,
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
              Content not available
            </p>
            <p
              style={{
                fontSize: 12.5,
                color: "var(--text-faint)",
                marginBottom: 20,
                lineHeight: 1.6,
              }}
            >
              This was saved before answers were stored.
              <br />
              All future searches save automatically.
            </p>
            <Link
              href={
                type === "history"
                  ? `/search?q=${encodeURIComponent(query)}`
                  : "/review"
              }
              style={{
                padding: "9px 20px",
                borderRadius: 10,
                background: "var(--brand)",
                color: "#000",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {type === "history" ? (
                <>
                  <Search size={12} /> Re-run search
                </>
              ) : (
                <>
                  <BookOpen size={12} /> Generate Again
                </>
              )}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Saved Paper Detail View ─────────────────────────────────── */
function SavedPaperDetail({
  paper,
  onBack,
  onRemove,
  session,
}: {
  paper: SavedPaper;
  onBack: () => void;
  onRemove: (id: string) => Promise<void>;
  session: any;
}) {
  const [removing, setRemoving] = useState(false);

  const handleDownload = () => {
    downloadSavedPaperPDF(paper, session?.user?.name ?? undefined);
  };

  const handleRemove = async () => {
    setRemoving(true);
    await onRemove(paper.paperId);
    onBack();
  };

  const savedDate = paper.savedAt
    ? new Date(paper.savedAt).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;
  const authorsStr =
    (paper.authors?.slice(0, 4).join(", ") ?? "") +
    ((paper.authors?.length ?? 0) > 4 ? " et al." : "");
  const apaCitation = `${authorsStr}${paper.year ? ` (${paper.year}).` : " (n.d.)."} ${paper.title}.${paper.journal ? ` ${paper.journal}.` : ""}${paper.doi ? ` https://doi.org/${paper.doi}` : paper.url ? ` ${paper.url}` : ""}`;

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div
        style={{ maxWidth: 820, margin: "0 auto", padding: "28px 24px 60px" }}
      >
        <button
          onClick={onBack}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 14px",
            background: "var(--bg-raised)",
            border: "1px solid var(--border)",
            borderRadius: 9,
            cursor: "pointer",
            fontSize: 12.5,
            color: "var(--text-faint)",
            marginBottom: 24,
            fontFamily: "var(--font-ui)",
            transition: "color .14s",
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.color =
              "var(--text-primary)")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.color = "var(--text-faint)")
          }
        >
          <ChevronLeft size={14} /> Back to Library
        </button>

        <div
          style={{
            padding: "22px 24px",
            borderRadius: 16,
            background: "rgba(92,154,224,.06)",
            border: "1px solid rgba(92,154,224,.18)",
            marginBottom: 20,
          }}
        >
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
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "1.5px",
                textTransform: "uppercase" as const,
                color: "#5c9ae0",
              }}
            >
              Saved Paper
            </span>
            {savedDate && (
              <span
                style={{
                  fontSize: 10,
                  color: "var(--text-faint)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Clock size={9} /> Saved {savedDate}
              </span>
            )}
          </div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 20,
              fontWeight: 600,
              color: "var(--text-primary)",
              lineHeight: 1.35,
              marginBottom: 12,
              letterSpacing: "-.02em",
            }}
          >
            {paper.title}
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              lineHeight: 1.5,
            }}
          >
            {authorsStr}
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap" as const,
              gap: 7,
              marginTop: 12,
            }}
          >
            {paper.year && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 99,
                  background: "rgba(92,154,224,.1)",
                  color: "#5c9ae0",
                  border: "1px solid rgba(92,154,224,.2)",
                }}
              >
                📅 {paper.year}
              </span>
            )}
            {paper.journal && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 99,
                  background: "var(--surface)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-mid)",
                }}
              >
                📰 {paper.journal}
              </span>
            )}
            {paper.doi && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 99,
                  background: "rgba(93,184,122,.08)",
                  color: "#5db87a",
                  border: "1px solid rgba(93,184,122,.2)",
                }}
              >
                🔗 DOI
              </span>
            )}
            {paper.url && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 99,
                  background: "rgba(173,115,224,.08)",
                  color: "#ad73e0",
                  border: "1px solid rgba(173,115,224,.2)",
                }}
              >
                🌐 Full Text
              </span>
            )}
          </div>
        </div>

        {paper.abstract && (
          <div style={{ marginBottom: 20 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "1.5px",
                textTransform: "uppercase" as const,
                color: "var(--text-faint)",
                marginBottom: 10,
              }}
            >
              Abstract
            </p>
            <div
              style={{
                padding: "16px 18px",
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
                borderLeft: "3px solid #5c9ae0",
                borderRadius: "0 10px 10px 0",
              }}
            >
              <p
                style={{
                  fontSize: 13.5,
                  color: "var(--text-secondary)",
                  lineHeight: 1.8,
                }}
              >
                {paper.abstract}
              </p>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "1.5px",
              textTransform: "uppercase" as const,
              color: "var(--text-faint)",
              marginBottom: 10,
            }}
          >
            APA Citation
          </p>
          <div
            style={{
              padding: "14px 16px",
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              position: "relative" as const,
            }}
          >
            <p
              style={{
                fontSize: 12.5,
                color: "var(--text-secondary)",
                lineHeight: 1.7,
                fontStyle: "italic",
                paddingRight: 70,
              }}
            >
              {apaCitation}
            </p>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(apaCitation);
                toast.success("Citation copied!");
              }}
              style={{
                position: "absolute" as const,
                top: 10,
                right: 10,
                padding: "4px 10px",
                fontSize: 10.5,
                fontWeight: 600,
                color: "var(--text-faint)",
                background: "var(--surface)",
                border: "1px solid var(--border-mid)",
                borderRadius: 6,
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
              }}
            >
              Copy
            </button>
          </div>
        </div>

        {(paper.doi || paper.url) && (
          <div style={{ marginBottom: 24 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "1.5px",
                textTransform: "uppercase" as const,
                color: "var(--text-faint)",
                marginBottom: 10,
              }}
            >
              Access
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column" as const,
                gap: 7,
              }}
            >
              {paper.doi && (
                <a
                  href={`https://doi.org/${paper.doi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: "12px 16px",
                    background: "var(--bg-raised)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    textDecoration: "none",
                    transition: "border-color .14s",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.borderColor =
                      "var(--border-hi)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.borderColor =
                      "var(--border)")
                  }
                >
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: "#5db87a",
                      background: "rgba(93,184,122,.1)",
                      padding: "2px 8px",
                      borderRadius: 5,
                      flexShrink: 0,
                    }}
                  >
                    DOI
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-faint)",
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap" as const,
                    }}
                  >
                    doi.org/{paper.doi}
                  </span>
                  <ExternalLink
                    size={11}
                    style={{ color: "var(--text-faint)", flexShrink: 0 }}
                  />
                </a>
              )}
              {paper.url && (
                <a
                  href={paper.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: "12px 16px",
                    background: "var(--bg-raised)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    textDecoration: "none",
                    transition: "border-color .14s",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.borderColor =
                      "var(--border-hi)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.borderColor =
                      "var(--border)")
                  }
                >
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: "#ad73e0",
                      background: "rgba(173,115,224,.1)",
                      padding: "2px 8px",
                      borderRadius: 5,
                      flexShrink: 0,
                    }}
                  >
                    Full Text
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-faint)",
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap" as const,
                    }}
                  >
                    {paper.url}
                  </span>
                  <ExternalLink
                    size={11}
                    style={{ color: "var(--text-faint)", flexShrink: 0 }}
                  />
                </a>
              )}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          <button
            onClick={handleDownload}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid var(--border-mid)",
              color: "var(--text-muted)",
              background: "transparent",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "var(--font-ui)",
              transition: "border-color .14s, color .14s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor =
                "var(--brand)";
              (e.currentTarget as HTMLElement).style.color = "var(--brand)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor =
                "var(--border-mid)";
              (e.currentTarget as HTMLElement).style.color =
                "var(--text-muted)";
            }}
          >
            <Download size={13} /> Export PDF
          </button>
          {paper.url && (
            <a
              href={paper.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                background: "rgba(92,154,224,.1)",
                color: "#5c9ae0",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: 6,
                border: "1px solid rgba(92,154,224,.2)",
              }}
            >
              <ExternalLink size={12} /> View Full Paper
            </a>
          )}
          <button
            onClick={() => void handleRemove()}
            disabled={removing}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid rgba(224,92,92,.2)",
              color: "var(--red)",
              background: "transparent",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "var(--font-ui)",
              marginLeft: "auto",
            }}
          >
            <Trash2 size={13} />{" "}
            {removing ? "Removing…" : "Remove from Library"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════ */
function DashContent() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isMobile } = useIsMobile();

  const [papers, setPapers] = useState<SavedPaper[]>([]);
  const [searchesToday, setSearchesToday] = useState(0);
  const [searchesThisMonth, setSearchesThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState<SavedPaper | null>(null);
  const [paperSearch, setPaperSearch] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
  }, [status, router]);

  useEffect(() => {
    if (searchParams.get("upgraded") === "1") {
      void update();
      toast.success("🎉 Plan upgraded successfully!", {
        id: "upgraded",
        duration: 5000,
      });
      router.replace("/dashboard", { scroll: false });
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    Promise.allSettled([
      fetch("/api/papers").then((r) => r.json()),
      fetch("/api/sidebar").then((r) => r.json()),
    ])
      .then(([papersResult, sidebarResult]) => {
        const pd =
          papersResult.status === "fulfilled" ? papersResult.value : {};
        const sd =
          sidebarResult.status === "fulfilled" ? sidebarResult.value : {};
        setPapers((pd as any).papers ?? []);
        setSearchesToday((sd as any).searchesToday ?? 0);
        setSearchesThisMonth((sd as any).searchesThisMonth ?? 0);
      })
      .finally(() => setLoading(false));
  }, [status]);

  const removePaper = async (id: string): Promise<void> => {
    // ── Optimistic update: remove from UI instantly ──
    const snapshot = papers;
    setPapers((p) => p.filter((x) => x.paperId !== id));
    try {
      await fetch("/api/papers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      toast.success("Removed from library");
    } catch {
      // Revert on failure
      setPapers(snapshot);
      toast.error("Failed to remove, try again");
    }
  };

  const cancelSubscription = async () => {
    setCancelling(true);
    setShowConfirm(false);
    try {
      const r = await fetch("/api/razorpay/cancel", { method: "POST" });
      const d = (await r.json()) as any;
      if (d.success) {
        await update();
        toast.success(d.message ?? "Subscription cancelled.");
      } else toast.error(d.error ?? "Cancellation failed");
    } catch {
      toast.error("Network error.");
    } finally {
      setCancelling(false);
    }
  };

  if (status === "loading" || status === "unauthenticated")
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span className="spinner" />
      </div>
    );

  const plan = session?.user?.plan ?? "free";
  const isFree = plan === "free",
    isStudent = plan === "student",
    isPro = plan === "pro",
    isPaid = !isFree;
  const atLimit = isFree
    ? searchesToday >= 5
    : isStudent
      ? searchesThisMonth >= 500
      : false;
  const counterUsed = isFree
    ? searchesToday
    : isStudent
      ? searchesThisMonth
      : 0;
  const counterMax = isFree ? 5 : isStudent ? 500 : 0;
  const pct = isPro ? 100 : Math.min((counterUsed / counterMax) * 100, 100);

  const planMeta = {
    free: {
      icon: Zap,
      color: "#6b7280",
      label: "Free",
      gradient: "linear-gradient(135deg,#555,#333)",
    },
    student: {
      icon: Sparkles,
      color: "#c9b99a",
      label: "Student",
      gradient: "linear-gradient(135deg,#c9b99a,#e0d4b8)",
    },
    pro: {
      icon: Crown,
      color: "#7ea8c9",
      label: "Pro",
      gradient: "linear-gradient(135deg,#7ea8c9,#a8c9e0)",
    },
  }[plan] ?? {
    icon: Zap,
    color: "#6b7280",
    label: "Free",
    gradient: "linear-gradient(135deg,#555,#333)",
  };
  const PlanIcon = planMeta.icon;

  const firstName = session?.user?.name?.split(" ")[0] ?? "Researcher";
  const dateStr = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <Shell>
      <style>{`
        [data-theme="light"] .shimmer-line {
          background: linear-gradient(90deg,#ececec 25%,#ddd 50%,#ececec 75%) !important;
          background-size: 400% 100% !important;
        }
        [data-theme="light"] .icon-btn { color: var(--text-muted) !important; }
        [data-theme="light"] .icon-btn:hover { background: var(--surface) !important; color: var(--text-primary) !important; }
        [data-theme="light"] .btn { border-color: var(--border-mid) !important; color: var(--text-secondary) !important; }
        [data-theme="light"] .btn:hover { border-color: var(--brand) !important; color: var(--brand) !important; }
      `}</style>
      {/* Show paper detail view if a paper is selected */}
      {selectedPaper ? (
        <SavedPaperDetail
          paper={selectedPaper}
          onBack={() => setSelectedPaper(null)}
          onRemove={removePaper}
          session={session}
        />
      ) : (
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div
            style={{
              maxWidth: 900,
              margin: "0 auto",
              padding: isMobile ? "20px 16px 72px" : "28px 28px 60px",
            }}
          >
            {/* ── Header ───────────────────────────────────────── */}
            <div
              style={{
                display: "flex",
                alignItems: isMobile ? "flex-start" : "center",
                justifyContent: "space-between",
                gap: 16,
                marginBottom: 28,
                flexDirection: isMobile ? "column" : "row",
              }}
            >
              <div>
                {!isMobile && (
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--text-faint)",
                      marginBottom: 4,
                      fontWeight: 500,
                    }}
                  >
                    {dateStr}
                  </p>
                )}
                <h1
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: isMobile ? 22 : 28,
                    fontWeight: 400,
                    color: "var(--text-primary)",
                    letterSpacing: "-.04em",
                    lineHeight: 1.1,
                  }}
                >
                  {getGreeting()}, {firstName} 👋
                </h1>
              </div>
              <Link
                href="/search"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 20px",
                  borderRadius: 11,
                  background: "var(--brand)",
                  color: "#000",
                  fontSize: 13.5,
                  fontWeight: 700,
                  textDecoration: "none",
                  flexShrink: 0,
                  boxShadow: "0 4px 20px rgba(232,160,69,.25)",
                  transition: "transform .15s, box-shadow .15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.transform =
                    "translateY(-1px)";
                  (e.currentTarget as HTMLElement).style.boxShadow =
                    "0 8px 28px rgba(232,160,69,.35)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = "";
                  (e.currentTarget as HTMLElement).style.boxShadow =
                    "0 4px 20px rgba(232,160,69,.25)";
                }}
              >
                <Search size={14} /> New Search
              </Link>
            </div>

            {/* ── Profile + Plan row ───────────────────────────── */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                gap: 12,
                marginBottom: 20,
              }}
            >
              {/* Profile card */}
              <div
                style={{
                  padding: "18px 20px",
                  borderRadius: 16,
                  background: "var(--bg-raised)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -24,
                    right: -24,
                    width: 90,
                    height: 90,
                    borderRadius: "50%",
                    background: `${planMeta.color}10`,
                    filter: "blur(20px)",
                    pointerEvents: "none",
                  }}
                />
                {/* Avatar */}
                <div style={{ position: "relative", flexShrink: 0 }}>
                  {session?.user?.image ? (
                    <Image
                      src={session.user.image}
                      alt="av"
                      width={48}
                      height={48}
                      style={{
                        borderRadius: "50%",
                        border: `2.5px solid ${planMeta.color}35`,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        background: planMeta.gradient,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                        fontWeight: 800,
                        color: "#000",
                        border: `2.5px solid ${planMeta.color}35`,
                      }}
                    >
                      {(session?.user?.name?.[0] ?? "U").toUpperCase()}
                    </div>
                  )}
                  <div
                    style={{
                      position: "absolute",
                      bottom: -2,
                      right: -2,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: planMeta.gradient,
                      border: "2.5px solid var(--bg)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <PlanIcon size={8} color="#000" />
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      marginBottom: 2,
                    }}
                  >
                    {session?.user?.name ?? "Researcher"}
                  </p>
                  <p
                    style={{
                      fontSize: 11.5,
                      color: "var(--text-faint)",
                      marginBottom: 9,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {session?.user?.email}
                  </p>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "3px 10px",
                      borderRadius: 99,
                      fontSize: 10.5,
                      fontWeight: 700,
                      background: `${planMeta.color}15`,
                      color: planMeta.color,
                      border: `1px solid ${planMeta.color}30`,
                    }}
                  >
                    <PlanIcon size={8} /> {planMeta.label} Plan
                  </span>
                </div>
                {isPaid && !isMobile && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 5,
                      flexShrink: 0,
                    }}
                  >
                    <Link
                      href="/pricing"
                      style={{
                        fontSize: 11.5,
                        color: "var(--text-faint)",
                        padding: "4px 10px",
                        borderRadius: 7,
                        border: "1px solid var(--border)",
                        textDecoration: "none",
                        textAlign: "center",
                        transition: "color .14s, border-color .14s",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.color =
                          "var(--text-primary)";
                        (e.currentTarget as HTMLElement).style.borderColor =
                          "#2a2a2a";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.color =
                          "var(--text-faint)";
                        (e.currentTarget as HTMLElement).style.borderColor =
                          "var(--surface)";
                      }}
                    >
                      Change
                    </Link>
                    <button
                      onClick={() => setShowConfirm(true)}
                      disabled={cancelling}
                      style={{
                        fontSize: 11.5,
                        color: "var(--red)",
                        background: "transparent",
                        border: "1px solid rgba(224,92,92,.25)",
                        borderRadius: 7,
                        padding: "4px 10px",
                        cursor: "pointer",
                        fontFamily: "var(--font-ui)",
                      }}
                    >
                      {cancelling ? "…" : "Cancel"}
                    </button>
                  </div>
                )}
              </div>

              {/* Plan status card */}
              <div
                style={{
                  padding: "18px 20px",
                  borderRadius: 16,
                  border: "1px solid var(--border)",
                  background: atLimit
                    ? "rgba(224,92,92,.04)"
                    : isPaid
                      ? "rgba(93,184,122,.04)"
                      : "rgba(201,185,154,.04)",
                  borderColor: atLimit
                    ? "rgba(224,92,92,.18)"
                    : isPaid
                      ? "rgba(93,184,122,.18)"
                      : "rgba(201,185,154,.18)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    marginBottom: isPro ? 0 : 16,
                    gap: 10,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: atLimit
                          ? "rgba(224,92,92,.12)"
                          : isPaid
                            ? "rgba(93,184,122,.12)"
                            : "var(--brand-dim)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {atLimit ? (
                        <Lock size={15} style={{ color: "var(--red)" }} />
                      ) : isPaid ? (
                        <CheckCircle
                          size={15}
                          style={{ color: "var(--green)" }}
                        />
                      ) : (
                        <Activity size={15} style={{ color: "var(--brand)" }} />
                      )}
                    </div>
                    <div>
                      <p
                        style={{
                          fontSize: 13.5,
                          fontWeight: 700,
                          color: atLimit
                            ? "var(--red)"
                            : isPaid
                              ? "var(--green)"
                              : "var(--brand)",
                          marginBottom: 3,
                        }}
                      >
                        {atLimit
                          ? "Limit reached"
                          : isPaid
                            ? "Plan active"
                            : "Free plan"}
                      </p>
                      <p
                        style={{
                          fontSize: 12,
                          color: "var(--text-faint)",
                          lineHeight: 1.4,
                        }}
                      >
                        {atLimit
                          ? isFree
                            ? "Resets at midnight"
                            : "Resets next month"
                          : isPro
                            ? "Unlimited searches & uploads"
                            : isStudent
                              ? `${searchesThisMonth} / 500 this month`
                              : `${searchesToday} / 5 today`}
                      </p>
                    </div>
                  </div>
                  {!isPro && (
                    <Link
                      href="/pricing"
                      style={{
                        padding: "7px 14px",
                        borderRadius: 8,
                        background: atLimit ? "#e05c5c" : "#c9b99a",
                        color: "#000",
                        fontSize: 12,
                        fontWeight: 700,
                        textDecoration: "none",
                        flexShrink: 0,
                      }}
                    >
                      {atLimit ? "Upgrade" : isFree ? "Upgrade ✨" : "Change"}
                    </Link>
                  )}
                </div>
                {!isPro && (
                  <>
                    <div
                      style={{
                        height: 5,
                        background: "var(--surface)",
                        borderRadius: 99,
                        overflow: "hidden",
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          background: atLimit
                            ? "var(--red)"
                            : pct >= 80
                              ? "var(--brand)"
                              : "var(--green)",
                          borderRadius: 99,
                          transition: "width .6s ease",
                        }}
                      />
                    </div>
                    <p style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                      {atLimit ? "0" : counterMax - counterUsed}{" "}
                      {isPro ? "" : "searches"} remaining
                    </p>
                  </>
                )}
                {isPaid && isMobile && (
                  <button
                    onClick={() => setShowConfirm(true)}
                    disabled={cancelling}
                    style={{
                      marginTop: 12,
                      fontSize: 12,
                      color: "var(--text-faint)",
                      background: "transparent",
                      border: "1px solid var(--border)",
                      borderRadius: 7,
                      padding: "6px 12px",
                      cursor: "pointer",
                      fontFamily: "var(--font-ui)",
                    }}
                  >
                    {cancelling ? "…" : "Cancel plan"}
                  </button>
                )}
              </div>
            </div>

            {/* ── Stats ────────────────────────────────────────── */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "repeat(2,1fr)"
                  : "repeat(2,1fr)",
                gap: 12,
                marginBottom: 24,
              }}
            >
              <StatCard
                value={papers.length}
                label="Saved Papers"
                icon={BookmarkCheck}
                color="#5c9ae0"
              />

              <StatCard
                value={isPro ? "∞" : `${counterUsed}/${counterMax}`}
                label={
                  isFree
                    ? "Daily Searches"
                    : isStudent
                      ? "Monthly Searches"
                      : "Searches"
                }
                icon={TrendingUp}
                color={
                  atLimit
                    ? "var(--red)"
                    : isPro
                      ? "#5db87a"
                      : "var(--text-primary)"
                }
                sub={isPro ? "Unlimited" : undefined}
              />
            </div>

            {/* ── Quick Actions ─────────────────────────────────── */}
            <div style={{ marginBottom: 28 }}>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  color: "var(--text-faint)",
                  marginBottom: 14,
                }}
              >
                Quick Actions
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)",
                  gap: 12,
                }}
              >
                <ActionCard
                  label="Research Search"
                  desc="AI answers from 200M+ academic papers"
                  cta="Start searching"
                  href="/search"
                  color="var(--brand)"
                  Icon={Search}
                />
                <ActionCard
                  label="Literature Review"
                  desc="Full structured review in under 30 seconds"
                  cta="Generate review"
                  href="/review"
                  color="#5db87a"
                  Icon={BookOpen}
                />
                <ActionCard
                  label="PDF Chat"
                  desc="Upload any paper and ask it questions"
                  cta="Upload a PDF"
                  href="/upload"
                  color="#ad73e0"
                  Icon={FileText}
                />
              </div>
            </div>

            {/* ── Saved Papers ─────────────────────────────────────── */}
            <div style={{ marginBottom: 28 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 14,
                }}
              >
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    color: "var(--text-faint)",
                  }}
                >
                  Saved Papers
                  {papers.length > 0 && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#5c9ae0",
                        background: "rgba(92,154,224,.12)",
                        padding: "2px 8px",
                        borderRadius: 99,
                        border: "1px solid rgba(92,154,224,.2)",
                      }}
                    >
                      {papers.length}
                    </span>
                  )}
                </p>
                {papers.length > 3 && (
                  <div style={{ position: "relative" }}>
                    <Search
                      size={12}
                      style={{
                        position: "absolute",
                        left: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "var(--text-faint)",
                        pointerEvents: "none",
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Search papers…"
                      value={paperSearch}
                      onChange={(e) => setPaperSearch(e.target.value)}
                      style={{
                        paddingLeft: 30,
                        paddingRight: 12,
                        paddingTop: 7,
                        paddingBottom: 7,
                        background: "var(--bg-raised)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-ui)",
                        outline: "none",
                        width: 180,
                      }}
                      onFocus={(e) =>
                        ((e.currentTarget as HTMLElement).style.borderColor =
                          "var(--border-hi)")
                      }
                      onBlur={(e) =>
                        ((e.currentTarget as HTMLElement).style.borderColor =
                          "var(--border)")
                      }
                    />
                  </div>
                )}
              </div>

              {loading ? (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {[1, 2, 3].map((i) => (
                    <Shimmer key={i} h={90} />
                  ))}
                </div>
              ) : papers.length === 0 ? (
                <Empty
                  icon={BookmarkCheck}
                  title="No saved papers yet"
                  desc="Save papers from your research results and they'll appear here for easy access."
                  href="/search"
                  cta="Start Researching"
                />
              ) : (
                <>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    {papers
                      .filter(
                        (p) =>
                          paperSearch.trim() === "" ||
                          p.title
                            .toLowerCase()
                            .includes(paperSearch.toLowerCase()) ||
                          p.authors?.some((a) =>
                            a.toLowerCase().includes(paperSearch.toLowerCase()),
                          ) ||
                          (p.journal ?? "")
                            .toLowerCase()
                            .includes(paperSearch.toLowerCase()),
                      )
                      .map((paper) => {
                        const savedDate = paper.savedAt
                          ? new Date(paper.savedAt).toLocaleDateString(
                              "en-IN",
                              {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              },
                            )
                          : null;
                        return (
                          <div
                            key={paper.paperId}
                            style={{
                              padding: "14px 16px",
                              background: "var(--bg-raised)",
                              border: "1px solid var(--border)",
                              borderRadius: 12,
                              transition: "border-color .14s, background .14s",
                            }}
                            onMouseEnter={(e) => {
                              (
                                e.currentTarget as HTMLElement
                              ).style.borderColor = "var(--border-hi)";
                              (
                                e.currentTarget as HTMLElement
                              ).style.background = "var(--bg-raised)";
                            }}
                            onMouseLeave={(e) => {
                              (
                                e.currentTarget as HTMLElement
                              ).style.borderColor = "var(--border)";
                              (
                                e.currentTarget as HTMLElement
                              ).style.background = "var(--bg-raised)";
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                gap: 12,
                                alignItems: "flex-start",
                              }}
                            >
                              {/* Icon */}
                              <div
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: 10,
                                  background: "rgba(92,154,224,.1)",
                                  border: "1px solid rgba(92,154,224,.2)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                  marginTop: 1,
                                }}
                              >
                                <BookmarkCheck
                                  size={15}
                                  style={{ color: "#5c9ae0" }}
                                />
                              </div>
                              {/* Content */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <button
                                  onClick={() => setSelectedPaper(paper)}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    padding: 0,
                                    textAlign: "left",
                                    width: "100%",
                                  }}
                                >
                                  <p
                                    style={{
                                      fontSize: 13.5,
                                      fontWeight: 600,
                                      color: "var(--text-primary)",
                                      marginBottom: 4,
                                      lineHeight: 1.4,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {paper.title}
                                  </p>
                                </button>
                                <p
                                  style={{
                                    fontSize: 11.5,
                                    color: "var(--text-faint)",
                                    marginBottom: 6,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {(paper.authors?.slice(0, 3).join(", ") ??
                                    "") +
                                    ((paper.authors?.length ?? 0) > 3
                                      ? " et al."
                                      : "")}
                                  {paper.year ? ` · ${paper.year}` : ""}
                                  {paper.journal ? ` · ${paper.journal}` : ""}
                                </p>
                                {paper.abstract && (
                                  <p
                                    style={{
                                      fontSize: 11.5,
                                      color: "var(--text-faint)",
                                      lineHeight: 1.55,
                                      overflow: "hidden",
                                      display: "-webkit-box",
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: "vertical" as const,
                                      marginBottom: 8,
                                    }}
                                  >
                                    {paper.abstract}
                                  </p>
                                )}
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    flexWrap: "wrap" as const,
                                  }}
                                >
                                  {savedDate && (
                                    <span
                                      style={{
                                        fontSize: 10,
                                        color: "var(--text-faint)",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 3,
                                      }}
                                    >
                                      <Clock size={9} /> {savedDate}
                                    </span>
                                  )}
                                  {paper.doi && (
                                    <span
                                      style={{
                                        fontSize: 10,
                                        fontWeight: 600,
                                        color: "#5db87a",
                                        background: "rgba(93,184,122,.08)",
                                        padding: "1px 7px",
                                        borderRadius: 5,
                                        border:
                                          "1px solid rgba(93,184,122,.15)",
                                      }}
                                    >
                                      DOI
                                    </span>
                                  )}
                                  {paper.url && (
                                    <span
                                      style={{
                                        fontSize: 10,
                                        fontWeight: 600,
                                        color: "#ad73e0",
                                        background: "rgba(173,115,224,.08)",
                                        padding: "1px 7px",
                                        borderRadius: 5,
                                        border:
                                          "1px solid rgba(173,115,224,.15)",
                                      }}
                                    >
                                      Full Text
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* Actions */}
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column" as const,
                                  gap: 4,
                                  flexShrink: 0,
                                }}
                              >
                                <button
                                  onClick={() => setSelectedPaper(paper)}
                                  title="View details"
                                  className="icon-btn"
                                  style={{ color: "#5c9ae0" }}
                                >
                                  <ChevronRight size={13} />
                                </button>
                                <button
                                  onClick={() =>
                                    downloadSavedPaperPDF(
                                      paper,
                                      session?.user?.name ?? undefined,
                                    )
                                  }
                                  title="Download PDF"
                                  className="icon-btn"
                                >
                                  <Download size={12} />
                                </button>
                                {paper.url && (
                                  <a
                                    href={paper.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="icon-btn"
                                    title="Open paper"
                                  >
                                    <ExternalLink size={12} />
                                  </a>
                                )}
                                <button
                                  onClick={() =>
                                    void removePaper(paper.paperId)
                                  }
                                  title="Remove from library"
                                  className="icon-btn"
                                  style={{ color: "var(--red)" }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  {paperSearch &&
                    papers.filter(
                      (p) =>
                        p.title
                          .toLowerCase()
                          .includes(paperSearch.toLowerCase()) ||
                        p.authors?.some((a) =>
                          a.toLowerCase().includes(paperSearch.toLowerCase()),
                        ) ||
                        (p.journal ?? "")
                          .toLowerCase()
                          .includes(paperSearch.toLowerCase()),
                    ).length === 0 && (
                      <div
                        style={{
                          padding: "28px",
                          textAlign: "center",
                          color: "var(--text-faint)",
                          fontSize: 13,
                        }}
                      >
                        No papers match &ldquo;{paperSearch}&rdquo;
                      </div>
                    )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel modal ────────────────────────────────────── */}
      {showConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.75)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setShowConfirm(false)}
        >
          <div
            style={{
              maxWidth: 380,
              width: "100%",
              padding: 28,
              background: "var(--bg-raised)",
              border: "1px solid var(--border-mid)",
              borderRadius: 18,
              boxShadow: "0 32px 80px rgba(0,0,0,.8)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", gap: 14, marginBottom: 20 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: "rgba(224,92,92,.1)",
                  border: "1px solid rgba(224,92,92,.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={20} style={{ color: "var(--red)" }} />
              </div>
              <div>
                <p
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    marginBottom: 8,
                  }}
                >
                  Cancel subscription?
                </p>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    lineHeight: 1.65,
                  }}
                >
                  You keep access until end of billing period. After that,
                  you'll revert to Free (5 searches/day).
                </p>
              </div>
            </div>
            <div
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "1px solid var(--border-mid)",
                  color: "var(--text-secondary)",
                  background: "transparent",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "var(--font-ui)",
                }}
              >
                Keep Plan
              </button>
              <button
                onClick={() => void cancelSubscription()}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  background: "var(--red)",
                  color: "#fff",
                  border: "none",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "var(--font-ui)",
                }}
              >
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashContent />
    </Suspense>
  );
}
