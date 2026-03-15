"use client";

/**
 * AnswerRenderer — Production-grade AI answer display system
 * Handles: markdown, tables, code/diagrams, paper citation cards, section cards
 */

import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Terminal,
  Table2,
  FileText,
  Maximize2,
} from "lucide-react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface Paper {
  id?: string;
  title: string;
  authors: string[];
  year?: number | null;
  journal?: string;
  source?: string;
  doi?: string;
  url?: string;
  abstract?: string;
  _refKey?: string; // e.g. "REF-FOUND-1", "REF-1" etc for inline citation resolution
}

interface AnswerRendererProps {
  content: string;
  citedPapers?: Paper[];
  evidenceIdToPaperId?: Record<string, string>;
  streaming?: boolean;
}

// ─────────────────────────────────────────────
// Citation resolution helpers
// ─────────────────────────────────────────────

// Maps evidenceId → "REF-N" using the server-supplied evidenceIdToPaperId
// and the position of each paper in citedPapers (matching buildRefMap's numbering).
function buildEvidenceToRefMap(
  evidenceIdToPaperId: Record<string, string> | undefined,
  citedPapers: Paper[],
): Record<string, string> {
  if (!evidenceIdToPaperId || !citedPapers.length) return {};
  // citedPapers has no _refKey, so buildRefMap assigns REF-1, REF-2, ... in array order
  const paperIdToRef = new Map<string, string>();
  citedPapers.forEach((p, i) => {
    if (p.id) paperIdToRef.set(p.id, `REF-${i + 1}`);
  });
  const map: Record<string, string> = {};
  for (const [evidenceId, paperId] of Object.entries(evidenceIdToPaperId)) {
    const refKey = paperIdToRef.get(paperId);
    if (refKey) map[evidenceId] = refKey;
  }
  return map;
}

// Converts [CITATION:evidenceId] and [CITATION:evidenceId]⚠️ markers:
//   - Known evidenceId → [REF-N]   (rendered as clickable badge by resolveRefMarkers)
//   - Unknown evidenceId → ""      (stripped — fallback for chat history with no mapping)
function resolveCitationMarkers(
  body: string,
  evidenceToRef: Record<string, string>,
): string {
  return body.replace(/\[CITATION:([a-z0-9]+)\](?:⚠️)?/g, (_, evidenceId) => {
    const refKey = evidenceToRef[evidenceId];
    return refKey ? `[${refKey}]` : "";
  });
}

// ─────────────────────────────────────────────
// PaperCitationCard
// ─────────────────────────────────────────────

export function PaperCitationCard({ paper }: { paper: Paper }) {
  const link = paper.doi ? `https://doi.org/${paper.doi}` : (paper.url ?? null);
  const source = paper.journal ?? paper.source ?? "Research Paper";
  const authorsDisplay =
    paper.authors && paper.authors.length > 0
      ? paper.authors.slice(0, 2).join(", ") +
        (paper.authors.length > 2 ? " et al." : "")
      : null;

  return (
    <div
      style={{
        margin: "1.1rem 0",
        padding: "16px 20px",
        background: "var(--bg-raised)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        display: "flex",
        gap: 16,
        alignItems: "flex-start",
        transition: "border-color 0.2s, background 0.2s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "var(--surface)";
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hi)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "var(--bg-raised)";
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          background: "var(--surface)",
          border: "1px solid var(--border-mid)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        <BookOpen size={14} style={{ color: "var(--text-muted)" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: "var(--text-primary)",
            lineHeight: 1.45,
            marginBottom: 6,
            letterSpacing: "-0.01em",
          }}
        >
          {paper.title}
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "4px 10px",
            marginBottom: 8,
          }}
        >
          {authorsDisplay && (
            <span
              style={{
                fontSize: 11.5,
                color: "var(--text-muted)",
                fontWeight: 400,
              }}
            >
              {authorsDisplay}
            </span>
          )}
          {authorsDisplay && paper.year && (
            <span style={{ fontSize: 11, color: "var(--border-hi)" }}>·</span>
          )}
          {paper.year && (
            <span
              style={{
                fontSize: 11.5,
                color: "var(--text-secondary)",
                fontWeight: 500,
              }}
            >
              {paper.year}
            </span>
          )}
          {source && (
            <>
              <span style={{ fontSize: 11, color: "var(--border-hi)" }}>·</span>
              <span
                style={{
                  fontSize: 10.5,
                  color: "var(--text-muted)",
                  background: "var(--surface)",
                  padding: "2px 8px",
                  borderRadius: 99,
                  border: "1px solid var(--border)",
                  letterSpacing: "0.02em",
                }}
              >
                {source}
              </span>
            </>
          )}
        </div>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 11.5,
              color: "var(--brand)",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              textDecoration: "none",
              fontWeight: 500,
              opacity: 0.8,
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.opacity = "1")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.opacity = "0.8")
            }
          >
            View paper <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// DiagramBlock — scrollable monospace container
// ─────────────────────────────────────────────

function DiagramBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLPreElement>(null);

  const copy = () => {
    const text = ref.current?.innerText ?? "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      style={{
        margin: "1.2rem 0",
        borderRadius: 12,
        border: "1px solid var(--border-mid)",
        background: "#0a0a0a",
        overflow: "hidden",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 14px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Terminal size={12} style={{ color: "var(--text-muted)" }} />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-muted)",
              letterSpacing: "0.5px",
              textTransform: "uppercase",
            }}
          >
            Diagram
          </span>
        </div>
        <button
          onClick={copy}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 9px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "transparent",
            cursor: "pointer",
            fontSize: 11,
            color: copied ? "var(--green)" : "var(--text-muted)",
            fontFamily: "var(--font-ui)",
            transition: "color .15s",
          }}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {/* Scrollable content */}
      <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 480 }}>
        <pre
          ref={ref}
          style={{
            margin: 0,
            padding: "18px 20px",
            fontFamily: "var(--font-mono)",
            fontSize: 12.5,
            lineHeight: 1.7,
            color: "#c9d1d9",
            whiteSpace: "pre",
            minWidth: "max-content",
          }}
        >
          {children}
        </pre>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CodeBlock — syntax-highlighted code
// ─────────────────────────────────────────────

function CodeBlock({
  children,
  language,
}: {
  children: string;
  language?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      style={{
        margin: "1.2rem 0",
        borderRadius: 12,
        border: "1px solid var(--border-mid)",
        background: "#0d1117",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 14px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-raised)",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-muted)",
            letterSpacing: "0.5px",
            textTransform: "uppercase",
          }}
        >
          {language || "code"}
        </span>
        <button
          onClick={copy}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 9px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "transparent",
            cursor: "pointer",
            fontSize: 11,
            color: copied ? "var(--green)" : "var(--text-muted)",
            fontFamily: "var(--font-ui)",
            transition: "color .15s",
          }}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <pre
          style={{
            margin: 0,
            padding: "18px 20px",
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            lineHeight: 1.65,
            color: "#e6edf3",
            whiteSpace: "pre",
            minWidth: "max-content",
          }}
        >
          <code>{children}</code>
        </pre>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TableWrapper — horizontally scrollable table
// ─────────────────────────────────────────────

function TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        margin: "1.2rem 0",
        borderRadius: 12,
        border: "1px solid var(--border-mid)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "8px 14px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <Table2 size={12} style={{ color: "var(--text-muted)" }} />
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-muted)",
            letterSpacing: "0.5px",
            textTransform: "uppercase",
          }}
        >
          Table
        </span>
      </div>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            minWidth: 480,
            fontSize: 13.5,
          }}
        >
          {children}
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SectionCard — wraps each ## heading block
// ─────────────────────────────────────────────

const SECTION_META: Record<
  string,
  { color: string; bg: string; border: string; icon: string; accent: string }
> = {
  overview: {
    color: "var(--text-primary)",
    bg: "transparent",
    border: "var(--border)",
    icon: "01",
    accent: "#5c9ae0",
  },
  "key concepts": {
    color: "var(--text-primary)",
    bg: "transparent",
    border: "var(--border)",
    icon: "02",
    accent: "#ad73e0",
  },
  "system architecture": {
    color: "var(--text-primary)",
    bg: "transparent",
    border: "var(--border)",
    icon: "03",
    accent: "#e8a045",
  },
  "technical details": {
    color: "var(--text-primary)",
    bg: "transparent",
    border: "var(--border)",
    icon: "04",
    accent: "#5db87a",
  },
  "technical details or comparison": {
    color: "var(--text-primary)",
    bg: "transparent",
    border: "var(--border)",
    icon: "04",
    accent: "#5db87a",
  },
  "key research papers": {
    color: "var(--text-primary)",
    bg: "transparent",
    border: "var(--border)",
    icon: "05",
    accent: "#e8a045",
  },
  limitations: {
    color: "var(--text-primary)",
    bg: "transparent",
    border: "var(--border)",
    icon: "05",
    accent: "#e05c5c",
  },
  "key takeaways": {
    color: "var(--text-primary)",
    bg: "transparent",
    border: "var(--border)",
    icon: "06",
    accent: "#5db87a",
  },
  "what to search next": {
    color: "var(--text-primary)",
    bg: "transparent",
    border: "var(--border)",
    icon: "07",
    accent: "#5c9ae0",
  },
  "quick revision points": {
    color: "var(--text-primary)",
    bg: "transparent",
    border: "var(--border)",
    icon: "08",
    accent: "#ad73e0",
  },
};

function getSectionMeta(title: string) {
  const key = title.toLowerCase().trim();
  return (
    SECTION_META[key] ?? {
      color: "var(--text-primary)",
      bg: "transparent",
      border: "var(--border)",
      icon: "—",
      accent: "var(--text-muted)",
    }
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const meta = getSectionMeta(title);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      style={{
        margin: "0 0 6px",
        borderRadius: 0,
        borderBottom: `1px solid var(--border)`,
        background: "transparent",
        overflow: "hidden",
      }}
    >
      {/* Section header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 0 14px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Accent number pill */}
          <span
            style={{
              fontSize: 9,
              color: (meta as { accent?: string }).accent ?? meta.color,
              fontWeight: 700,
              letterSpacing: "0.08em",
              background: `${(meta as { accent?: string }).accent ?? meta.color}18`,
              border: `1px solid ${(meta as { accent?: string }).accent ?? meta.color}30`,
              padding: "3px 7px",
              borderRadius: 6,
              flexShrink: 0,
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            {meta.icon}
          </span>
          <h2
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-muted)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              fontFamily: "var(--font-display)",
            }}
          >
            {title}
          </h2>
        </div>
        <div style={{ color: "var(--text-faint)", flexShrink: 0 }}>
          {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </div>
      </button>

      {/* Section content */}
      {!collapsed && (
        <div
          style={{
            paddingBottom: 20,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Inline citation card parser
// Detects the > 📄 **Paper:** ... blockquote pattern
// ─────────────────────────────────────────────

function InlinePaperCard({ raw }: { raw: string }) {
  // Parse fields from blockquote lines — handles both "> " prefixed and plain text
  const lines = raw
    .split("\n")
    .map((l) => {
      // Strip "> " blockquote prefix
      const stripped = l.replace(/^>\s*/, "").trim();
      // Strip any leading non-bold prefix (e.g. "📄 " before "**Paper:**")
      // This handles the case where the first line is "📄 **Paper:** ..."
      return stripped.replace(/^[^*]*(\*\*)/, "$1");
    })
    .filter(Boolean);
  const fullText = lines.join(" ");

  const get = (key: string) => {
    // Try line-by-line first (structured format)
    // Match both "**Key**" and "**Key:**" formats
    const keyLower = key.toLowerCase();
    const line = lines.find((l) => {
      const ll = l.toLowerCase();
      return (
        ll.startsWith(`**${keyLower}**`) || ll.startsWith(`**${keyLower}:**`)
      );
    });
    if (line) return line.replace(/^\*\*[^*]+\*\*[:\s]*/i, "").trim();

    // Fallback: extract from full text using regex (for children-extracted text)
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = fullText.match(
      new RegExp(
        `\\*\\*${escapedKey}\\*\\*[:\\s]*([^*]+?)(?:\\s*\\*\\*|$)`,
        "i",
      ),
    );
    return match ? match[1].trim() : "";
  };

  const title = get("paper").replace(/\*/g, "");
  const authors = get("authors");
  const year = get("year");
  const source = get("source");
  const link = get("link");
  const contribution = get("key contribution");

  if (!title) return null;

  return (
    <div
      style={{
        margin: "1rem 0",
        padding: "14px 16px",
        background: "rgba(232,160,69,0.05)",
        border: "1px solid rgba(232,160,69,0.18)",
        borderLeft: "3px solid var(--brand)",
        borderRadius: "0 10px 10px 0",
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: "0 12px",
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "rgba(232,160,69,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        <FileText size={14} style={{ color: "var(--brand)" }} />
      </div>
      <div>
        <p
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: "var(--text-primary)",
            lineHeight: 1.4,
            marginBottom: 6,
          }}
        >
          {title}
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "4px 10px",
            marginBottom: contribution ? 8 : 0,
          }}
        >
          {authors && (
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {authors}
            </span>
          )}
          {year && year !== "n.d." && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--brand)",
                background: "rgba(232,160,69,0.1)",
                padding: "1px 7px",
                borderRadius: 99,
              }}
            >
              {year}
            </span>
          )}
          {source && (
            <span
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                background: "var(--surface-2)",
                padding: "1px 7px",
                borderRadius: 99,
              }}
            >
              {source}
            </span>
          )}
        </div>
        {contribution && (
          <p
            style={{
              fontSize: 12.5,
              color: "var(--text-secondary)",
              lineHeight: 1.55,
              marginBottom: link && link !== "Not available" ? 8 : 0,
              fontStyle: "italic",
            }}
          >
            {contribution}
          </p>
        )}
        {link && link !== "Not available" && (
          <a
            href={link.startsWith("http") ? link : `https://${link}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 11.5,
              color: "var(--brand)",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              textDecoration: "none",
            }}
          >
            View paper <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Markdown component overrides
// ─────────────────────────────────────────────

function buildMdComponents(onSection: (title: string) => void) {
  return {
    // h2 → SectionCard trigger
    h2: ({ children }: any) => {
      const title = String(children);
      onSection(title);
      return null; // sections are rendered by the section splitter
    },

    h3: ({ children }: any) => (
      <h3
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "var(--text-primary)",
          margin: "1.4em 0 0.5em",
          letterSpacing: "-0.01em",
          fontFamily: "var(--font-display)",
        }}
      >
        {children}
      </h3>
    ),

    p: ({ children }: any) => (
      <p
        style={{
          marginBottom: "1em",
          lineHeight: 1.9,
          fontSize: 15,
          color: "var(--text-secondary)",
          letterSpacing: "0.005em",
          fontFamily: "var(--font-display)",
          fontWeight: 400,
          overflowWrap: "break-word",
          wordBreak: "break-word",
        }}
      >
        {children}
      </p>
    ),

    strong: ({ children }: any) => (
      <strong
        style={{
          color: "var(--text-primary)",
          fontWeight: 650,
          background: "var(--surface)",
          padding: "1px 4px",
          borderRadius: 4,
        }}
      >
        {children}
      </strong>
    ),

    em: ({ children }: any) => (
      <em style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>
        {children}
      </em>
    ),

    ul: ({ children }: any) => (
      <ul
        style={{
          paddingLeft: "0.2em",
          marginBottom: "1em",
          marginTop: "0.4em",
          listStyleType: "none",
        }}
      >
        {children}
      </ul>
    ),

    ol: ({ children }: any) => (
      <ol
        style={{
          paddingLeft: "1.6em",
          marginBottom: "0.85em",
          counterReset: "list-counter",
        }}
      >
        {children}
      </ol>
    ),

    li: ({ children, ordered }: any) => (
      <li
        style={{
          marginBottom: "0.7em",
          fontSize: 14.5,
          color: "var(--text-secondary)",
          lineHeight: 1.85,
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          paddingLeft: 2,
          fontFamily: "var(--font-display)",
          fontWeight: 400,
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "var(--border-hi)",
            flexShrink: 0,
            marginTop: 9,
          }}
        />
        <span style={{ flex: 1 }}>{children}</span>
      </li>
    ),

    blockquote: ({ children, node }: any) => {
      // Check if this is a paper citation card (starts with 📄)
      // Use node AST if available, fallback to extracting text from children
      let rawText = node?.children
        ?.map((c: any) => {
          if (c.type === "paragraph") {
            return c.children
              ?.map(
                (cc: any) =>
                  cc.value ??
                  cc.children?.map((ccc: any) => ccc.value ?? "").join("") ??
                  "",
              )
              .join("");
          }
          return "";
        })
        .join("\n");

      // Fallback: extract text from React children if node parsing failed
      if (!rawText || !rawText.includes("📄")) {
        const extractText = (child: any): string => {
          if (!child) return "";
          if (typeof child === "string") return child;
          if (Array.isArray(child)) return child.map(extractText).join("");
          if (child.props?.children) return extractText(child.props.children);
          return "";
        };
        rawText = extractText(children);
      }

      if (rawText && rawText.includes("📄")) {
        return <InlinePaperCard raw={rawText} />;
      }

      return (
        <blockquote
          style={{
            margin: "1rem 0",
            padding: "12px 16px",
            borderLeft: "3px solid var(--border-hi)",
            background: "var(--surface)",
            borderRadius: "0 8px 8px 0",
            color: "var(--text-secondary)",
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          {children}
        </blockquote>
      );
    },

    code: ({ inline, className, children }: any) => {
      const lang = className?.replace("language-", "") ?? "";
      const content = String(children).replace(/\n$/, "");

      if (inline) {
        return (
          <code
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12.5,
              background: "var(--surface-2)",
              color: "#e8a045",
              padding: "2px 6px",
              borderRadius: 5,
              border: "1px solid var(--border)",
            }}
          >
            {children}
          </code>
        );
      }
      return <CodeBlock language={lang}>{content}</CodeBlock>;
    },

    pre: ({ children }: any) => {
      // pre without code class = ASCII diagram
      if (
        children?.props?.className === undefined ||
        children?.props?.className === ""
      ) {
        return (
          <DiagramBlock>{children?.props?.children ?? children}</DiagramBlock>
        );
      }
      return <>{children}</>;
    },

    table: ({ children }: any) => <TableWrapper>{children}</TableWrapper>,

    thead: ({ children }: any) => (
      <thead
        style={{
          background: "var(--surface)",
          borderBottom: "2px solid var(--border-mid)",
        }}
      >
        {children}
      </thead>
    ),

    tbody: ({ children }: any) => <tbody>{children}</tbody>,

    tr: ({ children }: any) => (
      <tr
        style={{
          borderBottom: "1px solid var(--border)",
          transition: "background .12s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--surface)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        {children}
      </tr>
    ),

    th: ({ children }: any) => (
      <th
        style={{
          padding: "10px 14px",
          textAlign: "left",
          fontSize: 11.5,
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          fontFamily: "var(--font-ui)",
        }}
      >
        {children}
      </th>
    ),

    td: ({ children }: any) => (
      <td
        style={{
          padding: "10px 14px",
          fontSize: 13.5,
          color: "var(--text-secondary)",
          lineHeight: 1.55,
          verticalAlign: "top",
        }}
      >
        {children}
      </td>
    ),

    a: ({ href, children }: any) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: "var(--brand)",
          textDecoration: "underline",
          textDecorationStyle: "dotted",
          textUnderlineOffset: 3,
          transition: "opacity .15s",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLElement).style.opacity = "0.75")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLElement).style.opacity = "1")
        }
      >
        {children}
      </a>
    ),

    hr: () => (
      <hr
        style={{
          border: "none",
          borderTop: "1px solid var(--border)",
          margin: "1.5rem 0",
        }}
      />
    ),
  };
}

// ─────────────────────────────────────────────
// Section splitter
// Splits markdown by ## headings into SectionCards
// ─────────────────────────────────────────────

function splitIntoSections(
  content: string,
): Array<{ title: string | null; body: string }> {
  const lines = content.split("\n");
  const sections: Array<{ title: string | null; body: string }> = [];
  let current: { title: string | null; body: string[] } = {
    title: null,
    body: [],
  };

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      if (current.body.join("").trim() || current.title) {
        sections.push({
          title: current.title,
          body: current.body.join("\n"),
        });
      }
      current = { title: h2Match[1].trim(), body: [] };
    } else {
      current.body.push(line);
    }
  }

  if (current.body.join("").trim() || current.title) {
    sections.push({ title: current.title, body: current.body.join("\n") });
  }

  return sections;
}

// ─────────────────────────────────────────────
// StreamingCursor
// ─────────────────────────────────────────────

function StreamingCursor() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 2,
        height: "1em",
        background: "var(--brand)",
        marginLeft: 2,
        verticalAlign: "text-bottom",
        animation: "blink 1s step-end infinite",
      }}
    />
  );
}

// ─────────────────────────────────────────────
// SectionContent — renders markdown inside a section
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// REF marker resolver
// ─────────────────────────────────────────────
// Citation Alignment System
//
// Strategy: [REF-N] markers are replaced inline with compact numbered badges.
// After each paragraph block, any papers cited IN that block are rendered
// as citation cards — keeping reading flow uninterrupted.
// ─────────────────────────────────────────────

function buildRefMap(papers: Paper[]): Map<string, Paper> {
  const refMap = new Map<string, Paper>();
  const guaranteed = papers.filter((p) => p._refKey);
  const retrieved = papers.filter((p) => !p._refKey);
  const G = guaranteed.length;
  guaranteed.forEach((p, i) => {
    refMap.set(`REF-${i + 1}`, p);
    if (p._refKey) refMap.set(p._refKey, p);
  });
  retrieved.forEach((p, i) => {
    refMap.set(`REF-${G + i + 1}`, p);
  });
  return refMap;
}

// Inline badge: small numbered superscript rendered where [REF-N] appears in text
function CitationBadge({
  num,
  label,
  paper,
}: {
  num: number;
  label: string;
  paper?: Paper;
}) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      <sup
        title={label}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 15,
          height: 15,
          padding: "0 4px",
          marginLeft: 1,
          marginRight: 1,
          borderRadius: 3,
          background: hovered
            ? "rgba(139,92,246,0.28)"
            : "rgba(139,92,246,0.15)",
          border: `1px solid ${hovered ? "rgba(139,92,246,0.55)" : "rgba(139,92,246,0.3)"}`,
          color: "#a78bfa",
          fontSize: 9,
          fontWeight: 700,
          fontFamily: "var(--font-ui)",
          cursor: "default",
          verticalAlign: "super",
          lineHeight: 1,
          letterSpacing: 0,
          transition: "background 0.15s, border-color 0.15s",
        }}
      >
        {num}
      </sup>

      {/* Hover popup preview */}
      {hovered && paper && (
        <span
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            width: 280,
            background: "var(--surface)",
            border: "1px solid rgba(139,92,246,0.3)",
            borderRadius: 10,
            padding: "12px 14px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            pointerEvents: "none",
          }}
        >
          {/* Arrow */}
          <span
            style={{
              position: "absolute",
              bottom: -6,
              left: "50%",
              transform: "translateX(-50%)",
              width: 10,
              height: 6,
              background: "var(--surface)",
              clipPath: "polygon(0 0, 100% 0, 50% 100%)",
              borderBottom: "1px solid rgba(139,92,246,0.3)",
            }}
          />
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-primary)",
              lineHeight: 1.4,
              marginBottom: 6,
            }}
          >
            {paper.title}
          </p>
          {paper.authors && paper.authors.length > 0 && (
            <p
              style={{
                fontSize: 10.5,
                color: "var(--text-muted)",
                marginBottom: 4,
              }}
            >
              {paper.authors.slice(0, 3).join(", ")}
              {paper.authors.length > 3 ? " et al." : ""}
              {paper.year ? ` · ${paper.year}` : ""}
            </p>
          )}
          {paper.abstract && (
            <p
              style={{
                fontSize: 10.5,
                color: "var(--text-secondary)",
                lineHeight: 1.55,
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                marginTop: 4,
              }}
            >
              {paper.abstract}
            </p>
          )}
          {(paper.journal ?? paper.source) && (
            <span
              style={{
                display: "inline-block",
                marginTop: 7,
                fontSize: 9.5,
                color: "#a78bfa",
                background: "rgba(139,92,246,0.12)",
                border: "1px solid rgba(139,92,246,0.2)",
                borderRadius: 99,
                padding: "2px 7px",
              }}
            >
              {paper.journal ?? paper.source}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

// Resolves [REF-N] markers into:
//   - Inline numbered badges in the text
//   - Citation cards grouped AFTER each paragraph block (not inline)
function resolveRefMarkers(body: string, papers: Paper[]): React.ReactNode[] {
  const refMap = buildRefMap(papers);

  // Global citation counter — tracks badges rendered across ALL paragraphs in this section
  const citationDisplayNum = new Map<string, number>();
  const globalBadgeCount = new Map<string, number>(); // total badges per key across whole section
  let nextNum = 1;

  // Pre-scan: count how many times each REF key appears in the full body
  // This lets us enforce per-key limits BEFORE rendering
  const keyAppearances = new Map<string, number>();
  const allRefs = body.match(/\[REF-(?:FOUND-)?\d+\]/g) ?? [];
  for (const ref of allRefs) {
    const k = ref.replace(/[\[\]]/g, "");
    keyAppearances.set(k, (keyAppearances.get(k) ?? 0) + 1);
  }

  function getDisplayNum(key: string): number | null {
    const paper = refMap.get(key);
    if (!paper) return null;
    const rendered = globalBadgeCount.get(key) ?? 0;
    // Track badge count for PaperCitationCard dedup (count <= 1 check below)
    globalBadgeCount.set(key, rendered + 1);
    if (!citationDisplayNum.has(key)) {
      citationDisplayNum.set(key, nextNum++);
    }
    return citationDisplayNum.get(key)!;
  }

  // Split body into paragraph-level blocks (split on double newlines)
  // Then process each block: replace [REF-N] with badges, collect cited papers
  const paragraphs = body.split(/\n\n+/);
  const nodes: React.ReactNode[] = [];

  paragraphs.forEach((para, pi) => {
    if (!para.trim()) return;

    // Split this paragraph on [REF-N] markers
    const parts = para.split(/(\[REF-(?:FOUND-)?\d+\])/g);
    const paraNodes: React.ReactNode[] = [];
    const citedInPara: Array<{ key: string; paper: Paper; num: number }> = [];
    const seenInPara = new Set<string>();

    parts.forEach((part, i) => {
      const refMatch = part.match(/^\[((REF-(?:FOUND-)?\d+))\]$/);
      if (refMatch) {
        const key = refMatch[1];
        const num = getDisplayNum(key);
        const paper = refMap.get(key);
        if (num !== null && paper) {
          paraNodes.push(
            <CitationBadge
              key={`badge-${pi}-${i}`}
              num={num}
              label={paper.title}
              paper={paper}
            />,
          );
          // Collect for rendering below paragraph (first cite only per paragraph)
          if (!seenInPara.has(key)) {
            seenInPara.add(key);
            const count = globalBadgeCount.get(key) ?? 0;
            // Only render the card on first citation globally
            if (count <= 1) {
              citedInPara.push({ key, paper, num });
            }
          }
        }
      } else if (part) {
        // Check if the next part is a [REF-N] marker — if so, use inline span rendering
        // to keep the citation badge on the same line as the text.
        const nextPart = parts[i + 1];
        const nextIsRef = nextPart !== undefined && /^\[REF-(?:FOUND-)?\d+\]$/.test(nextPart);
        if (nextIsRef) {
          paraNodes.push(
            <ReactMarkdownInlineSegment key={`md-${pi}-${i}`} content={part} />,
          );
        } else {
          paraNodes.push(
            <ReactMarkdownSegment key={`md-${pi}-${i}`} content={part} />,
          );
        }
      }
    });

    // Render the paragraph text
    if (paraNodes.length > 0) {
      nodes.push(
        <div
          key={`para-${pi}`}
          style={{ marginBottom: citedInPara.length > 0 ? 4 : 0 }}
        >
          {paraNodes}
        </div>,
      );
    }

    // Render citation cards BELOW the paragraph, aligned and compact
    if (citedInPara.length > 0) {
      nodes.push(
        <div
          key={`citations-${pi}`}
          style={{
            margin: "5px 0 12px 0",
            paddingLeft: 10,
            borderLeft: "2px solid rgba(139,92,246,0.2)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {citedInPara.map(({ paper, num }) => (
            <InlineCitationRow key={`citerow-${num}`} paper={paper} num={num} />
          ))}
        </div>,
      );
    }
  });

  return nodes;
}

// Compact citation row — clean, minimal, polished
function InlineCitationRow({ paper, num }: { paper: Paper; num: number }) {
  const link = paper.doi ? `https://doi.org/${paper.doi}` : (paper.url ?? null);
  const source = paper.journal ?? paper.source ?? "";
  const authorsDisplay =
    paper.authors && paper.authors.length > 0
      ? paper.authors.slice(0, 2).join(", ") +
        (paper.authors.length > 2 ? " et al." : "")
      : "";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 10px",
        background: "rgba(139,92,246,0.04)",
        border: "1px solid rgba(139,92,246,0.14)",
        borderRadius: 7,
        transition: "background 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background =
          "rgba(139,92,246,0.09)";
        (e.currentTarget as HTMLElement).style.borderColor =
          "rgba(139,92,246,0.25)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background =
          "rgba(139,92,246,0.04)";
        (e.currentTarget as HTMLElement).style.borderColor =
          "rgba(139,92,246,0.14)";
      }}
    >
      {/* Number pill */}
      <span
        style={{
          flexShrink: 0,
          width: 17,
          height: 17,
          borderRadius: 4,
          background: "rgba(139,92,246,0.18)",
          border: "1px solid rgba(139,92,246,0.28)",
          color: "#a78bfa",
          fontSize: 9,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {num}
      </span>
      {/* Title + meta in one line */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-secondary)",
            lineHeight: 1.3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 280,
          }}
        >
          {paper.title}
        </span>
        {authorsDisplay && (
          <span
            style={{
              fontSize: 10.5,
              color: "var(--text-muted)",
              whiteSpace: "nowrap",
            }}
          >
            {authorsDisplay}
          </span>
        )}
        {paper.year && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#a78bfa",
              background: "rgba(139,92,246,0.12)",
              padding: "1px 6px",
              borderRadius: 99,
            }}
          >
            {paper.year}
          </span>
        )}
        {source && (
          <span
            style={{
              fontSize: 10,
              color: "var(--text-faint)",
              background: "var(--surface)",
              padding: "1px 6px",
              borderRadius: 99,
              border: "1px solid var(--border)",
              whiteSpace: "nowrap",
            }}
          >
            {source}
          </span>
        )}
      </div>
      {/* Link */}
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flexShrink: 0,
            color: "#a78bfa",
            fontSize: 10.5,
            display: "flex",
            alignItems: "center",
            gap: 3,
            textDecoration: "none",
            opacity: 0.7,
            transition: "opacity 0.15s",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.opacity = "1")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.opacity = "0.7")
          }
        >
          View <ExternalLink size={9} />
        </a>
      )}
    </div>
  );
}

function ReactMarkdownSegment({ content }: { content: string }) {
  const mdComponents = buildMdComponents(() => {});
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents as any}>
      {content}
    </ReactMarkdown>
  );
}

// Inline variant — overrides <p> → <span> so citation badges stay on the same line.
// Use this for text segments that are immediately followed by a [REF-N] badge.
function ReactMarkdownInlineSegment({ content }: { content: string }) {
  const mdComponents = {
    ...buildMdComponents(() => {}),
    p: ({ children }: any) => (
      <span
        style={{
          lineHeight: 1.9,
          fontSize: 15,
          color: "var(--text-primary)",
          marginRight: 2,
        }}
      >
        {children}
      </span>
    ),
  };
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents as any}>
      {content}
    </ReactMarkdown>
  );
}

// Strip noise patterns the model adds despite instructions
function preprocessBody(body: string, papers: Paper[]): string {
  let cleaned = body;

  // 0. Strip ALL inline [N] numeric-citation artifacts the model adds alongside [CITATION:] tags.
  //    [REF-N] markers (already resolved from [CITATION:]) are protected by the negative lookahead.
  //    This replaces the old narrow rule that only matched [1] and stripped to end-of-string.
  cleaned = cleaned.replace(/\s*\[(?!REF-)(?!FOUND-)\d+\]/g, "");

  // 1. Strip bibliography heading block
  cleaned = cleaned.replace(/\n+(references|bibliography)[\s\S]*/i, "");

  // 1b. Strip "More [N]..." trailing bibliography pattern (inline [N] already gone from rule 0)
  cleaned = cleaned.replace(/\s*More\s*\[\d+\][\s\S]*$/i, "");

  // 1c. Strip any run of 2+ consecutive lines starting with [N]
  cleaned = cleaned.replace(/(\n|^)(\[\d+\][^\n]+\n?){2,}/gm, "\n");

  // 2. Strip any remaining single "[N] ..." reference lines with a URL
  cleaned = cleaned.replace(
    /^\[\d+\][^\n]*(https?:\/\/|doi\.org)[^\n]*\n?/gm,
    "",
  );

  // 3. Strip ALL "(From general knowledge...)" variants — never convert to a citation
  const fgkPattern = new RegExp("\\(From general knowledge[^)]*\\)", "gi");
  cleaned = cleaned.replace(fgkPattern, "");

  // 4. Strip "Foundational Paper/citation/Reference: ..." lines
  cleaned = cleaned.replace(
    /^.{0,5}Foundational (Paper|citation|Reference)[^\n]+\n?/gim,
    "",
  );

  // 5. Strip "Related Work: ..." lines
  cleaned = cleaned.replace(/^.{0,5}Related Work[^\n]+\n?/gim, "");

  // 6. Strip "Key Benchmark/Finding/Result/Note: ..." annotation lines
  cleaned = cleaned.replace(
    /^.{0,5}Key (Benchmark|Finding|Result|Note)[^\n]+\n?/gim,
    "",
  );

  // 7. Strip plain-text citation lines: Title — Author et al., YEAR | https://...
  cleaned = cleaned.replace(
    /^[\s"]*[A-Z][^\n]{10,}(et al\.|[0-9]{4})[^\n]*(https?:\/\/|doi\.org)[^\n]*\n?/gm,
    "",
  );

  // 8. Strip lines that are just a URL
  cleaned = cleaned.replace(/^\s*https?:\/\/\S+\s*$/gm, "");

  // 9. Strip lone ** lines
  cleaned = cleaned.replace(/^\*\*\s*$/gm, "");

  // 9b. Strip [REF-N] markers from markdown table rows.
  // resolveRefMarkers splits body at every [REF-N] position; if a citation sits inside a
  // table cell the table markdown is fragmented across separate ReactMarkdownSegment calls
  // and ReactMarkdown can no longer parse it as a valid table — all rows collapse into text.
  cleaned = cleaned.replace(/^\|[^\n]+$/gm, (row) =>
    row.replace(/\s*\[REF-(?:FOUND-)?\d+\]/g, ""),
  );

  // 9c. (removed — stripping [REF-N] from numbered list items was suppressing citation badges)

  // 10. Merge orphan [REF-N] lines onto the end of the preceding content line
  // Handles both mid-body and end-of-body orphan markers
  cleaned = cleaned.replace(
    /([^\n]+)\n+(\[REF-(?:FOUND-)?\d+\])(\s*\n|$)/g,
    "$1 $2\n",
  );

  // 11. Collapse 3+ blank lines into 2
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  // 11b. Strip bare standalone digit lines — orphaned citation numbers left after [N] stripping.
  //      Matches lines that are only whitespace + digits + whitespace (no other content).
  cleaned = cleaned.replace(/^\s*\d+\s*$/gm, "");

  // 11c. Strip bare numbers immediately following [REF-N] markers (citation-number artifacts).
  // When the model writes "[CITATION:xxx] 1" the [N] stripping in rule 0 removes "[1]" but
  // if the model wrote a bare " 1" after the marker (not a bracketed [1]) it survives as
  // a stray number. e.g. "[REF-2] 1" → "[REF-2]", "result [REF-3] 3." → "result [REF-3]."
  cleaned = cleaned.replace(
    /(\[REF-(?:FOUND-)?\d+\])\s{0,4}\d{1,3}(?=[\s,;.!?\n]|$)/g,
    "$1",
  );

  return cleaned;
}

// Per-section citation hard cap — must match RAG_SYSTEM prompt limits so the renderer
// never silently strips citations the model was explicitly told to produce.
const SECTION_CITATION_LIMIT: Record<string, number> = {
  overview: 2,                          // prompt: max 2
  "key concepts": 4,                    // prompt: max 4, every concept must have 1
  "system architecture": 0,            // prompt: 0 — structural diagrams, no citations
  "technical details": 3,              // prompt: max 3
  "technical details or comparison": 3, // prompt: max 3
  limitations: 2,                       // was 0 — now allows factual limitation claims
  "key takeaways": 4,                   // prompt: every takeaway must have 1 citation; max 4
  "what to search next": 0,            // prompt: 0 — suggestions only
  "quick revision points": 0,          // exam-style summaries, no citations needed
};

// Strip extra [REF-N] markers beyond the per-section limit.
// The cap counts UNIQUE [REF-N] keys, not total marker occurrences.
// Repeat appearances of an already-introduced key always pass through —
// they are needed so superscript badges render on every sentence that
// cites that paper (not just the first sentence).
function enforceMaxCitations(body: string, max: number): string {
  if (max === 0) {
    // Remove all [REF-N] markers
    return body
      .replace(/\[REF-(?:FOUND-)?\d+\]/g, "")
      .replace(/\n{3,}/g, "\n\n");
  }
  const seenKeys = new Set<string>();
  return body.replace(/\[REF-(?:FOUND-)?\d+\]/g, (match) => {
    const key = match.slice(1, -1); // strip [ and ]
    if (seenKeys.has(key)) return match; // repeat of known key — always keep
    if (seenKeys.size >= max) return ""; // new key beyond cap — strip
    seenKeys.add(key);
    return match;
  });
}

function SectionContent({
  body,
  papers,
  sectionTitle,
  evidenceToRef,
}: {
  body: string;
  papers: Paper[];
  sectionTitle?: string;
  evidenceToRef?: Record<string, string>;
}) {
  const key = (sectionTitle ?? "").toLowerCase().trim();
  const maxCitations = SECTION_CITATION_LIMIT[key] ?? 2;

  // Step 0: resolve [CITATION:evidenceId] → [REF-N] (or strip if no mapping).
  // Must run before preprocessBody so the REF markers are in place for step 1.
  const withRefsResolved = resolveCitationMarkers(body, evidenceToRef ?? {});

  // Run preprocessBody FIRST (it may inject [REF-1] from "From general knowledge" replacements)
  // THEN enforce the per-section cap — order matters
  const preprocessed = preprocessBody(withRefsResolved, papers);
  const processedBody = enforceMaxCitations(preprocessed, maxCitations);

  // If body contains [REF-N] markers, resolve them into cards
  if (/\[REF-(?:FOUND-)?\d+\]/.test(processedBody)) {
    return (
      <div style={{ paddingTop: 14 }}>
        {resolveRefMarkers(processedBody, papers)}
      </div>
    );
  }
  // Fallback: plain markdown (no ref markers)
  const mdComponents = buildMdComponents(() => {});
  return (
    <div style={{ paddingTop: 14 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={mdComponents as any}
      >
        {processedBody}
      </ReactMarkdown>
    </div>
  );
}

// ─────────────────────────────────────────────
// AnswerContainer — main export
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// TL;DR Summary Card
// Extracts first 2-3 sentences from the Overview section
// and renders them as a compact pinned card above all sections.
// No extra LLM call — derived from content already generated.
// ─────────────────────────────────────────────

function extractTldr(content: string): string | null {
  // Find the Overview section body
  const overviewMatch = content.match(
    /##\s+Overview[\s\S]*?\n([\s\S]*?)(?=\n##|$)/i,
  );
  if (!overviewMatch) return null;

  const overviewBody = overviewMatch[1].trim();
  const cleaned = overviewBody
    .replace(/\[REF-(?:FOUND-)?\d+\]/g, "") // old REF markers
    .replace(/\[CITATION:[^\]]+\]/g, "") // citation tags — match ANY chunk_id including future formats
    .replace(/⚠️/g, "") // leftover weak-citation flags (stripped separately to avoid emoji regex fragility)
    .replace(/\(From general knowledge\)/gi, "") // verifyAnswer labels
    // Strip full inline cite patterns: "Vaswani et al. (2017)", "Smith (2020)", "Smith & Jones (2019)"
    .replace(
      /[A-Z][a-záéíóúñ\-]+(?:\s+(?:et al\.|&\s+[A-Z][a-z]+))?\s+\(\d{4}\)/g,
      "",
    )
    // Strip orphaned bare year fragments like "(2017)" left after the above
    .replace(/\s*\(\d{4}\)/g, "")
    .replace(/\*\*/g, "") // markdown bold
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 40) return null;

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  if (sentences.length === 0) return null;
  return sentences.slice(0, 2).join(" ");
}

function TldrCard({ summary }: { summary: string }) {
  const [expanded, setExpanded] = React.useState(false);
  // Truncate for collapsed state
  const isLong = summary.length > 160;
  const displayText =
    !isLong || expanded ? summary : summary.slice(0, 160).trimEnd() + "…";

  return (
    <div
      style={{
        margin: "0 0 20px 0",
        padding: "14px 18px",
        background:
          "linear-gradient(135deg, rgba(92,154,224,0.1) 0%, rgba(92,154,224,0.04) 100%)",
        border: "1px solid rgba(92,154,224,0.28)",
        borderRadius: 14,
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        boxShadow: "0 2px 20px rgba(92,154,224,0.08)",
      }}
    >
      {/* Brain icon badge */}
      <div
        style={{
          flexShrink: 0,
          width: 34,
          height: 34,
          borderRadius: 10,
          background: "rgba(92,154,224,0.15)",
          border: "1px solid rgba(92,154,224,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 17,
          marginTop: 1,
        }}
      >
        🧠
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* TL;DR label */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 7,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#5c9ae0",
            }}
          >
            TL;DR
          </span>
          <div
            style={{ flex: 1, height: 1, background: "rgba(92,154,224,0.15)" }}
          />
        </div>
        {/* Summary text */}
        <p
          style={{
            fontSize: 14.5,
            color: "var(--text-primary)",
            lineHeight: 1.7,
            margin: 0,
            fontWeight: 400,
            letterSpacing: "0.008em",
          }}
        >
          {displayText}
        </p>
        {isLong && (
          <button
            onClick={() => setExpanded((e) => !e)}
            style={{
              marginTop: 7,
              fontSize: 11.5,
              color: "#5c9ae0",
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              opacity: 0.8,
              fontWeight: 500,
            }}
          >
            {expanded ? "Show less ↑" : "Read more ↓"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function AnswerRenderer({
  content,
  citedPapers,
  evidenceIdToPaperId,
  streaming = false,
}: AnswerRendererProps) {
  const sections = splitIntoSections(content);
  const tldr = !streaming ? extractTldr(content) : null;
  const evidenceToRef = buildEvidenceToRefMap(evidenceIdToPaperId, citedPapers ?? []);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 800,
        margin: "0 auto",
        padding: "0 4px 40px",
        fontFamily: "var(--font-display)",
        overflowX: "hidden",
        wordBreak: "break-word",
        overflowWrap: "break-word",
        boxSizing: "border-box",
      }}
    >
      {/* TL;DR summary card — shown only after streaming completes */}
      {tldr && <TldrCard summary={tldr} />}

      {/* Pre-section content (before first ##) */}
      {sections[0]?.title === null && sections[0].body.trim() && (
        <div
          style={{
            padding: "18px 20px 14px",
            marginBottom: 10,
            borderRadius: 14,
            border: "1px solid var(--border)",
            background: "var(--bg-raised)",
          }}
        >
          <SectionContent
            body={sections[0].body}
            papers={citedPapers ?? []}
            sectionTitle=""
            evidenceToRef={evidenceToRef}
          />
        </div>
      )}

      {/* Section cards */}
      {sections
        .filter((s) => s.title !== null)
        .map((section, i) => (
          <SectionCard key={i} title={section.title!}>
            <SectionContent
              body={section.body}
              papers={citedPapers ?? []}
              sectionTitle={section.title ?? ""}
              evidenceToRef={evidenceToRef}
            />
          </SectionCard>
        ))}

      {/* Streaming cursor */}
      {streaming && (
        <div style={{ padding: "4px 18px" }}>
          <StreamingCursor />
        </div>
      )}

      {/* Inject global blink animation */}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
