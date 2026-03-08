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
  papers?: Paper[];
  streaming?: boolean;
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
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        display: "flex",
        gap: 16,
        alignItems: "flex-start",
        transition: "border-color 0.2s, background 0.2s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background =
          "rgba(255,255,255,0.05)";
        (e.currentTarget as HTMLElement).style.borderColor =
          "rgba(255,255,255,0.14)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background =
          "rgba(255,255,255,0.03)";
        (e.currentTarget as HTMLElement).style.borderColor =
          "rgba(255,255,255,0.08)";
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        <BookOpen size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: "rgba(255,255,255,0.92)",
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
                color: "rgba(255,255,255,0.45)",
                fontWeight: 400,
              }}
            >
              {authorsDisplay}
            </span>
          )}
          {authorsDisplay && paper.year && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
              ·
            </span>
          )}
          {paper.year && (
            <span
              style={{
                fontSize: 11.5,
                color: "rgba(255,255,255,0.55)",
                fontWeight: 500,
              }}
            >
              {paper.year}
            </span>
          )}
          {source && (
            <>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
                ·
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  color: "rgba(255,255,255,0.38)",
                  background: "rgba(255,255,255,0.06)",
                  padding: "2px 8px",
                  borderRadius: 99,
                  border: "1px solid rgba(255,255,255,0.08)",
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
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(255,255,255,0.03)",
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
    color: "rgba(255,255,255,0.85)",
    bg: "transparent",
    border: "rgba(255,255,255,0.07)",
    icon: "01",
    accent: "#5c9ae0",
  },
  "key concepts": {
    color: "rgba(255,255,255,0.85)",
    bg: "transparent",
    border: "rgba(255,255,255,0.07)",
    icon: "02",
    accent: "#ad73e0",
  },
  "system architecture": {
    color: "rgba(255,255,255,0.85)",
    bg: "transparent",
    border: "rgba(255,255,255,0.07)",
    icon: "03",
    accent: "#e8a045",
  },
  "technical details": {
    color: "rgba(255,255,255,0.85)",
    bg: "transparent",
    border: "rgba(255,255,255,0.07)",
    icon: "04",
    accent: "#5db87a",
  },
  "technical details or comparison": {
    color: "rgba(255,255,255,0.85)",
    bg: "transparent",
    border: "rgba(255,255,255,0.07)",
    icon: "04",
    accent: "#5db87a",
  },
  "key research papers": {
    color: "rgba(255,255,255,0.85)",
    bg: "transparent",
    border: "rgba(255,255,255,0.07)",
    icon: "05",
    accent: "#e8a045",
  },
  limitations: {
    color: "rgba(255,255,255,0.85)",
    bg: "transparent",
    border: "rgba(255,255,255,0.07)",
    icon: "05",
    accent: "#e05c5c",
  },
  "key takeaways": {
    color: "rgba(255,255,255,0.85)",
    bg: "transparent",
    border: "rgba(255,255,255,0.07)",
    icon: "06",
    accent: "#5db87a",
  },
  "what to search next": {
    color: "rgba(255,255,255,0.85)",
    bg: "transparent",
    border: "rgba(255,255,255,0.07)",
    icon: "07",
    accent: "#5c9ae0",
  },
  "quick revision points": {
    color: "rgba(255,255,255,0.85)",
    bg: "transparent",
    border: "rgba(255,255,255,0.07)",
    icon: "08",
    accent: "#ad73e0",
  },
};

function getSectionMeta(title: string) {
  const key = title.toLowerCase().trim();
  return (
    SECTION_META[key] ?? {
      color: "rgba(255,255,255,0.85)",
      bg: "transparent",
      border: "rgba(255,255,255,0.07)",
      icon: "—",
      accent: "rgba(255,255,255,0.3)",
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
        borderBottom: `1px solid rgba(255,255,255,0.06)`,
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
              fontWeight: 600,
              color: "rgba(255,255,255,0.75)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontFamily: "var(--font-ui)",
            }}
          >
            {title}
          </h2>
        </div>
        <div style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>
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
          fontSize: 14,
          fontWeight: 700,
          color: "var(--text-primary)",
          margin: "1.4em 0 0.5em",
          letterSpacing: "-0.01em",
          fontFamily: "var(--font-ui)",
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
          color: "rgba(255,255,255,0.68)",
          letterSpacing: "0.01em",
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
          background: "rgba(255,255,255,0.04)",
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
          color: "rgba(255,255,255,0.7)",
          lineHeight: 1.8,
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          paddingLeft: 2,
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.2)",
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
          (e.currentTarget as HTMLElement).style.background =
            "rgba(255,255,255,0.02)";
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
function CitationBadge({ num, label }: { num: number; label: string }) {
  return (
    <sup
      title={label}
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
        background: "rgba(139,92,246,0.15)",
        border: "1px solid rgba(139,92,246,0.3)",
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
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background =
          "rgba(139,92,246,0.28)";
        (e.currentTarget as HTMLElement).style.borderColor =
          "rgba(139,92,246,0.55)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background =
          "rgba(139,92,246,0.15)";
        (e.currentTarget as HTMLElement).style.borderColor =
          "rgba(139,92,246,0.3)";
      }}
    >
      {num}
    </sup>
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
    // Hard cap: max 1 badge per key per section body passed to resolveRefMarkers
    if (rendered >= 1) return null; // suppress — already showed this badge once
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
        paraNodes.push(
          <ReactMarkdownSegment key={`md-${pi}-${i}`} content={part} />,
        );
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
            color: "rgba(255,255,255,0.82)",
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
              color: "rgba(255,255,255,0.35)",
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
              color: "rgba(255,255,255,0.28)",
              background: "rgba(255,255,255,0.04)",
              padding: "1px 6px",
              borderRadius: 99,
              border: "1px solid rgba(255,255,255,0.06)",
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

// Strip noise patterns the model adds despite instructions
function preprocessBody(body: string, papers: Paper[]): string {
  let cleaned = body;

  // 0. Strip plain [1] bibliography — only matches standalone [1], not [REF-1]
  cleaned = cleaned.replace(/\s*\[(?!REF-)1\][^\[]*[\s\S]*$/, "");

  // 1. Strip bibliography heading block
  cleaned = cleaned.replace(/\n+(references|bibliography)[\s\S]*/i, "");

  // 1b. Strip [1] bibliography — catches "More [1]", " [1] Author", "\n[1] Author" patterns
  cleaned = cleaned.replace(/\s*(More\s*)?\[1\][\s\S]*$/, "");

  // 1c. Strip any run of 2+ consecutive lines starting with [N]
  cleaned = cleaned.replace(/(\n|^)(\[\d+\][^\n]+\n?){2,}/gm, "\n");

  // 2. Strip any remaining single "[N] ..." reference lines with a URL
  cleaned = cleaned.replace(
    /^\[\d+\][^\n]*(https?:\/\/|doi\.org)[^\n]*\n?/gm,
    "",
  );

  // 3. Replace ALL "(From general knowledge...)" variants with [REF-1]
  const fgkPattern = new RegExp("\\(From general knowledge[^)]*\\)", "gi");
  cleaned =
    papers.length > 0
      ? cleaned.replace(fgkPattern, "[REF-1]")
      : cleaned.replace(fgkPattern, "");

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

  // 10. Merge orphan [REF-N] lines onto the end of the preceding content line
  // Handles both mid-body and end-of-body orphan markers
  cleaned = cleaned.replace(
    /([^\n]+)\n+(\[REF-(?:FOUND-)?\d+\])(\s*\n|$)/g,
    "$1 $2\n",
  );

  // 11. Collapse 3+ blank lines into 2
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  // 12. NUCLEAR DEDUP: keep only the FIRST occurrence of each [REF-N] key
  // This is the last line of defence — runs after all other transforms
  const seenRefs = new Set<string>();
  cleaned = cleaned.replace(/\[REF-(?:FOUND-)?\d+\]/g, (match) => {
    if (seenRefs.has(match)) return "";
    seenRefs.add(match);
    return match;
  });

  return cleaned;
}

// Per-section citation hard cap — enforced in the frontend regardless of model output
const SECTION_CITATION_LIMIT: Record<string, number> = {
  overview: 1,
  "key concepts": 1,
  "system architecture": 0,
  "technical details": 1,
  "technical details or comparison": 1,
  limitations: 0,
  "key takeaways": 1,
  "what to search next": 0,
  "quick revision points": 0,
};

// Strip extra [REF-N] markers beyond the per-section limit
function enforceMaxCitations(body: string, max: number): string {
  if (max === 0) {
    // Remove all [REF-N] markers
    return body
      .replace(/\[REF-(?:FOUND-)?\d+\]/g, "")
      .replace(/\n{3,}/g, "\n\n");
  }
  let count = 0;
  return body.replace(/\[REF-(?:FOUND-)?\d+\]/g, (match) => {
    count++;
    return count <= max ? match : "";
  });
}

function SectionContent({
  body,
  papers,
  sectionTitle,
}: {
  body: string;
  papers: Paper[];
  sectionTitle?: string;
}) {
  const key = (sectionTitle ?? "").toLowerCase().trim();
  const maxCitations = SECTION_CITATION_LIMIT[key] ?? 2;

  // Run preprocessBody FIRST (it may inject [REF-1] from "From general knowledge" replacements)
  // THEN enforce the per-section cap — order matters
  const preprocessed = preprocessBody(body, papers);
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
  // Remove any [REF-N] markers and markdown bold for clean summary text
  const cleaned = overviewBody
    .replace(/\[REF-(?:FOUND-)?\d+\]/g, "")
    .replace(/\*\*/g, "")
    .replace(/\n+/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 40) return null;

  // Split into sentences and take first 2
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
        margin: "0 0 16px 0",
        padding: "12px 16px",
        background: "rgba(92,154,224,0.06)",
        border: "1px solid rgba(92,154,224,0.18)",
        borderRadius: 12,
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      {/* Label pill */}
      <span
        style={{
          flexShrink: 0,
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: "#5c9ae0",
          background: "rgba(92,154,224,0.15)",
          border: "1px solid rgba(92,154,224,0.25)",
          borderRadius: 5,
          padding: "3px 7px",
          marginTop: 2,
          lineHeight: 1.3,
        }}
      >
        TL;DR
      </span>
      {/* Summary text + toggle */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.75)",
            lineHeight: 1.6,
            margin: 0,
            fontStyle: "italic",
          }}
        >
          {displayText}
        </p>
        {isLong && (
          <button
            onClick={() => setExpanded((e) => !e)}
            style={{
              marginTop: 6,
              fontSize: 11,
              color: "#5c9ae0",
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              opacity: 0.8,
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
  papers,
  streaming = false,
}: AnswerRendererProps) {
  const sections = splitIntoSections(content);
  const tldr = !streaming ? extractTldr(content) : null;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 800,
        margin: "0 auto",
        padding: "0 0 40px",
        fontFamily: "var(--font-ui)",
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
            papers={papers ?? []}
            sectionTitle=""
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
              papers={papers ?? []}
              sectionTitle={section.title ?? ""}
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
