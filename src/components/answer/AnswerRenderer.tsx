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
  const link = paper.doi
    ? `https://doi.org/${paper.doi}`
    : paper.url ?? null;
  const source = paper.journal ?? paper.source ?? "Research Paper";

  return (
    <div
      style={{
        margin: "1rem 0",
        padding: "14px 16px",
        background: "rgba(232,160,69,0.05)",
        border: "1px solid rgba(232,160,69,0.18)",
        borderLeft: "3px solid var(--brand)",
        borderRadius: "0 10px 10px 0",
        display: "flex",
        gap: 12,
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
          marginTop: 1,
        }}
      >
        <BookOpen size={14} style={{ color: "var(--brand)" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: "var(--text-primary)",
            lineHeight: 1.4,
            marginBottom: 4,
          }}
        >
          {paper.title}
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "4px 12px",
            marginBottom: 6,
          }}
        >
          {paper.authors && paper.authors.length > 0 && (
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {paper.authors.slice(0, 3).join(", ")}
              {paper.authors.length > 3 ? " et al." : ""}
            </span>
          )}
          {paper.year && (
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
              {paper.year}
            </span>
          )}
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
              gap: 4,
              textDecoration: "none",
              opacity: 0.85,
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.opacity = "1")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.opacity = "0.85")
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
  { color: string; bg: string; border: string; icon: string }
> = {
  overview: {
    color: "#5c9ae0",
    bg: "rgba(92,154,224,0.06)",
    border: "rgba(92,154,224,0.18)",
    icon: "◈",
  },
  "key concepts": {
    color: "#ad73e0",
    bg: "rgba(173,115,224,0.06)",
    border: "rgba(173,115,224,0.18)",
    icon: "◆",
  },
  "system architecture": {
    color: "#e8a045",
    bg: "rgba(232,160,69,0.06)",
    border: "rgba(232,160,69,0.18)",
    icon: "◉",
  },
  "technical details": {
    color: "#5db87a",
    bg: "rgba(93,184,122,0.06)",
    border: "rgba(93,184,122,0.18)",
    icon: "◎",
  },
  "technical details or comparison": {
    color: "#5db87a",
    bg: "rgba(93,184,122,0.06)",
    border: "rgba(93,184,122,0.18)",
    icon: "◎",
  },
  "key research papers": {
    color: "#e8a045",
    bg: "rgba(232,160,69,0.06)",
    border: "rgba(232,160,69,0.18)",
    icon: "📄",
  },
  limitations: {
    color: "#e05c5c",
    bg: "rgba(224,92,92,0.06)",
    border: "rgba(224,92,92,0.18)",
    icon: "⚠",
  },
  "key takeaways": {
    color: "#5db87a",
    bg: "rgba(93,184,122,0.06)",
    border: "rgba(93,184,122,0.18)",
    icon: "✦",
  },
  "what to search next": {
    color: "#5c9ae0",
    bg: "rgba(92,154,224,0.06)",
    border: "rgba(92,154,224,0.18)",
    icon: "→",
  },
  "quick revision points": {
    color: "#ad73e0",
    bg: "rgba(173,115,224,0.06)",
    border: "rgba(173,115,224,0.18)",
    icon: "✦",
  },
};

function getSectionMeta(title: string) {
  const key = title.toLowerCase().trim();
  return (
    SECTION_META[key] ?? {
      color: "var(--text-muted)",
      bg: "var(--surface)",
      border: "var(--border-mid)",
      icon: "○",
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
        margin: "0 0 12px",
        borderRadius: 14,
        border: `1px solid ${meta.border}`,
        background: meta.bg,
        overflow: "hidden",
        transition: "border-color .2s",
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
          padding: "14px 18px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 13,
              color: meta.color,
              fontWeight: 700,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            {meta.icon}
          </span>
          <h2
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 700,
              color: meta.color,
              letterSpacing: "0.03em",
              textTransform: "uppercase",
              fontFamily: "var(--font-ui)",
            }}
          >
            {title}
          </h2>
        </div>
        <div style={{ color: meta.color, opacity: 0.6, flexShrink: 0 }}>
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </div>
      </button>

      {/* Section content */}
      {!collapsed && (
        <div
          style={{
            padding: "0 18px 16px",
            borderTop: `1px solid ${meta.border}`,
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
  // Parse fields from blockquote lines
  const lines = raw.split("\n").map((l) => l.replace(/^>\s*/, "").trim());
  const get = (key: string) => {
    const line = lines.find((l) =>
      l.toLowerCase().startsWith(`**${key.toLowerCase()}**`)
    );
    if (!line) return "";
    return line.replace(/^\*\*[^*]+\*\*[:\s]*/i, "").trim();
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
          marginBottom: "0.85em",
          lineHeight: 1.82,
          fontSize: 14.5,
          color: "var(--text-secondary)",
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
          paddingLeft: "1.4em",
          marginBottom: "0.85em",
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
          marginBottom: "0.4em",
          fontSize: 14.5,
          color: "var(--text-secondary)",
          lineHeight: 1.75,
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <span
          style={{
            color: "var(--brand)",
            fontWeight: 700,
            fontSize: 13,
            marginTop: 3,
            flexShrink: 0,
          }}
        >
          ›
        </span>
        <span>{children}</span>
      </li>
    ),

    blockquote: ({ children, node }: any) => {
      // Check if this is a paper citation card (starts with 📄)
      const rawText = node?.children
        ?.map((c: any) => {
          if (c.type === "paragraph") {
            return c.children?.map((cc: any) => cc.value ?? "").join("");
          }
          return "";
        })
        .join("\n");

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
          <DiagramBlock>
            {children?.props?.children ?? children}
          </DiagramBlock>
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

    tbody: ({ children }: any) => (
      <tbody>{children}</tbody>
    ),

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
  content: string
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

function SectionContent({ body }: { body: string }) {
  const mdComponents = buildMdComponents(() => {});
  return (
    <div style={{ paddingTop: 14 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents as any}>
        {body}
      </ReactMarkdown>
    </div>
  );
}

// ─────────────────────────────────────────────
// AnswerContainer — main export
// ─────────────────────────────────────────────

export default function AnswerRenderer({
  content,
  papers,
  streaming = false,
}: AnswerRendererProps) {
  const sections = splitIntoSections(content);

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
          <SectionContent body={sections[0].body} />
        </div>
      )}

      {/* Section cards */}
      {sections
        .filter((s) => s.title !== null)
        .map((section, i) => (
          <SectionCard key={i} title={section.title!}>
            <SectionContent body={section.body} />
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
