/**
 * Citation Export API — /api/export
 * Upgrade #9 — Research Export
 *
 * Accepts an array of Paper objects + a citation format and returns
 * formatted citation strings ready to copy into a thesis or paper manager.
 *
 * Supported formats: bibtex | apa | mla | ieee | chicago | harvard | vancouver
 *
 * POST /api/export
 * Body: { papers: Paper[], format: CitationFormat }
 * Returns: { citations: string, format, count }
 */

import { NextRequest, NextResponse } from "next/server";
import { Paper, CitationFormat } from "@/types";

// ── String helpers ────────────────────────────────────────────
const lastName = (name: string) => name.trim().split(" ").pop() ?? name;

const initials = (name: string) => {
  const parts = name.trim().split(" ").slice(0, -1);
  return parts.map((p) => (p[0] ? p[0] + "." : "")).join(" ");
};

// ── Individual formatters ─────────────────────────────────────

function formatBibTeX(p: Paper, index: number): string {
  const key = `${lastName(p.authors[0] ?? "unknown").toLowerCase()}${p.year ?? "nd"}`;
  const authors = p.authors.join(" and ");
  const journal = p.journal ?? p.source ?? "Unknown";
  const y = p.year ?? "n.d.";

  return (
    `@article{${key},\n` +
    `  title   = {${p.title}},\n` +
    `  author  = {${authors}},\n` +
    `  journal = {${journal}},\n` +
    `  year    = {${y}},\n` +
    (p.doi ? `  doi     = {${p.doi}},\n` : "") +
    (p.url && !p.doi ? `  url     = {${p.url}},\n` : "") +
    (p.citationCount ? `  note    = {Cited by ${p.citationCount.toLocaleString()} papers},\n` : "") +
    `}`
  );
}

function formatAPA(p: Paper): string {
  const y = p.year ?? "n.d.";
  const j = p.journal ?? p.source ?? "Unknown";
  const link = p.doi ? `https://doi.org/${p.doi}` : p.url ?? "";

  const apaAuthors = p.authors
    .slice(0, 7)
    .map((n) => {
      const last = lastName(n);
      const ini = initials(n);
      return ini ? `${last}, ${ini}` : last;
    })
    .join(", ");
  const suffix = p.authors.length > 7 ? `, ... ${lastName(p.authors[p.authors.length - 1])}` : "";

  return `${apaAuthors}${suffix} (${y}). ${p.title}. *${j}*.${link ? " " + link : ""}`;
}

function formatMLA(p: Paper): string {
  const y = p.year ?? "n.d.";
  const j = p.journal ?? p.source ?? "Unknown";
  const link = p.doi ? `https://doi.org/${p.doi}` : p.url ?? "";

  let mlaAuthor: string;
  if (p.authors.length === 0) mlaAuthor = "Unknown Author";
  else if (p.authors.length === 1) mlaAuthor = p.authors[0];
  else if (p.authors.length === 2) mlaAuthor = `${p.authors[0]}, and ${p.authors[1]}`;
  else mlaAuthor = `${p.authors[0]}, et al`;

  return `${mlaAuthor}. "${p.title}." *${j}*, ${y}.${link ? " " + link : ""}`;
}

function formatIEEE(p: Paper, index: number): string {
  const y = p.year ?? "n.d.";
  const j = p.journal ?? p.source ?? "Unknown";
  const link = p.doi ? `https://doi.org/${p.doi}` : p.url ?? "";

  const ieeeAuthors = p.authors
    .slice(0, 6)
    .map((n) => `${initials(n)} ${lastName(n)}`.trim())
    .join(", ");

  return `[${index}] ${ieeeAuthors}, "${p.title}," *${j}*, ${y}.${link ? ` [Online]. Available: ${link}` : ""}`;
}

function formatChicago(p: Paper): string {
  const y = p.year ?? "n.d.";
  const j = p.journal ?? p.source ?? "Unknown";
  const link = p.doi ? `https://doi.org/${p.doi}` : p.url ?? "";
  const chicagoAuthor = p.authors.length === 0
    ? "Unknown"
    : p.authors.length === 1
    ? p.authors[0]
    : `${p.authors[0]}, et al`;

  return `${chicagoAuthor}. "${p.title}." *${j}* (${y}).${link ? " " + link : ""}`;
}

function formatHarvard(p: Paper): string {
  const y = p.year ?? "n.d.";
  const j = p.journal ?? p.source ?? "Unknown";
  const link = p.doi ? `https://doi.org/${p.doi}` : p.url ?? "";

  const harvardAuthors = p.authors
    .slice(0, 3)
    .map((n) => {
      const last = lastName(n);
      const ini = initials(n);
      return ini ? `${last}, ${ini}` : last;
    })
    .join(", ");
  const harvardSuffix = p.authors.length > 3 ? " et al." : "";

  return `${harvardAuthors}${harvardSuffix} (${y}) '${p.title}', *${j}*.${link ? " Available at: " + link : ""}`;
}

function formatVancouver(p: Paper, index: number): string {
  const y = p.year ?? "n.d.";
  const j = p.journal ?? p.source ?? "Unknown";
  const link = p.doi ? `https://doi.org/${p.doi}` : p.url ?? "";

  const vanAuthors = p.authors
    .slice(0, 6)
    .map((n) => `${lastName(n)} ${initials(n).replace(/\./g, "").replace(/ /g, "")}`.trim())
    .join(", ");
  const etAl = p.authors.length > 6 ? " et al" : "";

  return `${index}. ${vanAuthors}${etAl}. ${p.title}. ${j}. ${y}.${link ? " Available from: " + link : ""}`;
}

// ── Dispatcher ────────────────────────────────────────────────

function formatCitation(p: Paper, fmt: CitationFormat, index: number): string {
  switch (fmt) {
    case "bibtex":    return formatBibTeX(p, index);
    case "apa":       return formatAPA(p);
    case "mla":       return formatMLA(p);
    case "ieee":      return formatIEEE(p, index);
    case "chicago":   return formatChicago(p);
    case "harvard":   return formatHarvard(p);
    case "vancouver": return formatVancouver(p, index);
    default:          return formatAPA(p);
  }
}

// ── Format all papers with separator ─────────────────────────

function formatAll(papers: Paper[], fmt: CitationFormat): string {
  const separator = fmt === "bibtex" ? "\n\n" : "\n\n";
  const numbered = ["ieee", "vancouver"].includes(fmt);

  return papers
    .map((p, i) => {
      const citation = formatCitation(p, fmt, i + 1);
      return numbered ? citation : `[${i + 1}] ${citation}`;
    })
    .join(separator);
}

// ── Format label for header ───────────────────────────────────

const FORMAT_LABELS: Record<CitationFormat, string> = {
  bibtex:    "BibTeX",
  apa:       "APA 7th Edition",
  mla:       "MLA 9th Edition",
  ieee:      "IEEE",
  chicago:   "Chicago Author-Date",
  harvard:   "Harvard",
  vancouver: "Vancouver",
};

// ── Route handler ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      papers: Paper[];
      format: CitationFormat;
    };

    const { papers, format } = body;

    if (!papers || !Array.isArray(papers) || papers.length === 0) {
      return NextResponse.json({ error: "No papers provided" }, { status: 400 });
    }

    const validFormats: CitationFormat[] = [
      "bibtex", "apa", "mla", "ieee", "chicago", "harvard", "vancouver",
    ];
    if (!validFormats.includes(format)) {
      return NextResponse.json(
        { error: `Invalid format. Use: ${validFormats.join(", ")}` },
        { status: 400 },
      );
    }

    // Generate citations
    const citations = formatAll(papers, format);

    // Build a header for the export block
    const header =
      `% Researchly Export — ${FORMAT_LABELS[format]}\n` +
      `% Generated: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}\n` +
      `% Papers: ${papers.length}\n\n`;

    return NextResponse.json({
      format,
      formatLabel: FORMAT_LABELS[format],
      count: papers.length,
      citations: format === "bibtex" ? header + citations : citations,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Export failed" },
      { status: 500 },
    );
  }
}
