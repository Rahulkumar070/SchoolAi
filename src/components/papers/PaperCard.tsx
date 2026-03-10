"use client";
import {
  ExternalLink,
  BookmarkPlus,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  Quote,
} from "lucide-react";
import { useState } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { Paper, PaperBadge, BadgedPaper } from "@/types";

// ── Source colors ──────────────────────────────────────────────
const SRC: Record<string, string> = {
  "Semantic Scholar": "#5c9ae0",
  OpenAlex: "#5db87a",
  arXiv: "#e05c5c",
};

// ── Badge configuration  (v7 — Upgrade #7) ────────────────────
const BADGE_CONFIG: Record<
  PaperBadge,
  { label: string; bg: string; text: string; border: string }
> = {
  "highly-cited": {
    label: "🔥 Highly Cited",
    bg: "rgba(59,130,246,0.12)",
    text: "#60a5fa",
    border: "rgba(59,130,246,0.25)",
  },
  foundational: {
    label: "⚡ Foundational",
    bg: "rgba(139,92,246,0.12)",
    text: "#a78bfa",
    border: "rgba(139,92,246,0.25)",
  },
  "recent-breakthrough": {
    label: "🚀 Recent Breakthrough",
    bg: "rgba(16,185,129,0.12)",
    text: "#34d399",
    border: "rgba(16,185,129,0.25)",
  },
  "survey-paper": {
    label: "📚 Survey",
    bg: "rgba(245,158,11,0.12)",
    text: "#fbbf24",
    border: "rgba(245,158,11,0.25)",
  },
  influential: {
    label: "🏆 Influential",
    bg: "rgba(249,115,22,0.12)",
    text: "#fb923c",
    border: "rgba(249,115,22,0.25)",
  },
  "open-access": {
    label: "🔓 Open Access",
    bg: "rgba(20,184,166,0.12)",
    text: "#2dd4bf",
    border: "rgba(20,184,166,0.25)",
  },
  "peer-reviewed": {
    label: "✅ Peer Reviewed",
    bg: "rgba(107,114,128,0.12)",
    text: "#9ca3af",
    border: "rgba(107,114,128,0.25)",
  },
};

function BadgeChip({ badge }: { badge: PaperBadge }) {
  const cfg = BADGE_CONFIG[badge];
  if (!cfg) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 9.5,
        fontWeight: 600,
        padding: "2px 6px",
        borderRadius: 99,
        background: cfg.bg,
        color: cfg.text,
        border: `1px solid ${cfg.border}`,
        whiteSpace: "nowrap",
        lineHeight: 1.4,
        letterSpacing: "0.02em",
      }}
    >
      {cfg.label}
    </span>
  );
}

function formatCitations(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

export default function PaperCard({
  paper,
  index,
  supportingText,
}: {
  paper: Paper | BadgedPaper;
  index?: number;
  supportingText?: string;
}) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exp, setExp] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const { data: session } = useSession();

  const badges = (paper as BadgedPaper).badges ?? [];
  const citations = paper.citationCount ?? 0;
  const c = SRC[paper.source] ?? "var(--text-muted)";

  const save = async () => {
    if (!session) {
      toast.error("Sign in to save");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paper),
      });
      const d = (await r.json()) as { saved: boolean };
      setSaved(d.saved);
      toast.success(d.saved ? "Saved to library" : "Removed");
    } catch {
      toast.error("Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="paper-item">
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Meta row */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 5,
              marginBottom: 5,
            }}
          >
            {index !== undefined && (
              <span className="badge badge-brand">[{index}]</span>
            )}
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 7px",
                borderRadius: 99,
                background: `${c}14`,
                color: c,
                border: `1px solid ${c}25`,
              }}
            >
              {paper.source}
            </span>
            {citations > 0 && (
              <span
                title={`${citations.toLocaleString()} citations`}
                style={{ fontSize: 10, color: "var(--text-faint)", display: "flex", alignItems: "center", gap: 2 }}
              >
                <span style={{ opacity: 0.5 }}>📊</span>
                {formatCitations(citations)} cited
              </span>
            )}
            {paper.year && (
              <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                {paper.year}
              </span>
            )}
          </div>

          {/* Credibility badges (v7 NEW) */}
          {badges.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
              {badges.slice(0, 4).map((badge) => (
                <BadgeChip key={badge} badge={badge} />
              ))}
            </div>
          )}

          {/* Title */}
          <p
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--text-primary)",
              lineHeight: 1.4,
              marginBottom: 3,
            }}
          >
            {paper.url ? (
              <a
                href={paper.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "inherit", textDecoration: "none" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--brand)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
              >
                {paper.title}
              </a>
            ) : (
              paper.title
            )}
          </p>

          {/* Authors */}
          <p style={{ fontSize: 10.5, color: "var(--text-faint)", marginBottom: 5 }}>
            {paper.authors.slice(0, 4).join(", ")}
            {paper.authors.length > 4 ? " et al." : ""}
            {paper.journal ? ` · ${paper.journal}` : ""}
          </p>

          {/* Abstract */}
          {paper.abstract && (
            <>
              <p
                style={{
                  fontSize: 11.5,
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                  overflow: exp ? "visible" : "hidden",
                  display: exp ? "block" : "-webkit-box",
                  WebkitLineClamp: exp ? undefined : 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {paper.abstract}
              </p>
              {paper.abstract.length > 160 && (
                <button
                  onClick={() => setExp(!exp)}
                  style={{
                    fontSize: 10.5,
                    color: "var(--brand)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    marginTop: 3,
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    padding: 0,
                  }}
                >
                  {exp ? <><ChevronUp size={10} />Less</> : <><ChevronDown size={10} />More</>}
                </button>
              )}
            </>
          )}

          {/* Expandable citation evidence (v7 NEW — Upgrade #7) */}
          {supportingText && (
            <div style={{ marginTop: 6 }}>
              <button
                onClick={() => setShowEvidence(!showEvidence)}
                style={{
                  fontSize: 10.5,
                  color: "var(--text-faint)",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 6,
                  cursor: "pointer",
                  padding: "3px 8px",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  transition: "background 0.15s",
                }}
              >
                <Quote size={9} />
                {showEvidence ? "Hide excerpt" : "Show supporting excerpt"}
                {showEvidence ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
              </button>
              {showEvidence && (
                <div
                  style={{
                    marginTop: 6,
                    padding: "10px 12px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderLeft: "2px solid var(--brand)",
                    borderRadius: "0 6px 6px 0",
                    fontSize: 11,
                    color: "var(--text-secondary)",
                    lineHeight: 1.65,
                    fontStyle: "italic",
                  }}
                >
                  &ldquo;{supportingText}&rdquo;
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
          {paper.url && (
            <a
              href={paper.url}
              target="_blank"
              rel="noopener noreferrer"
              className="icon-btn"
              title="Open"
            >
              <ExternalLink size={12} />
            </a>
          )}
          <button
            onClick={() => void save()}
            disabled={saving}
            className="icon-btn"
            title={saved ? "Remove" : "Save"}
            style={{ color: saved ? "var(--brand)" : undefined }}
          >
            {saved ? <BookmarkCheck size={12} /> : <BookmarkPlus size={12} />}
          </button>
        </div>
      </div>
    </div>
  );
}
