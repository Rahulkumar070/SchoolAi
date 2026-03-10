/**
 * Citations Library — Researchly v2
 * Upgrades #1, #2, #9
 *
 * Changes:
 * 1. formatInlineCite()  — "Vaswani et al. (2017)" style inline citations
 * 2. formatCitationCard() — structured card with authors/year/venue/doi/citations
 * 3. cite() — all original formats preserved + Harvard/Vancouver
 * 4. citeAll() — batch formatting with numbered index
 * 5. buildReferenceList() — full numbered reference list for answers
 */

import { Paper, CitationFormat } from "@/types";

// ── String helpers ────────────────────────────────────────────
const ln = (n: string) => n.trim().split(" ").pop() ?? n;
const ini = (n: string) => {
  const parts = n.trim().split(" ").slice(0, -1);
  return parts.map((p) => (p[0] ? p[0] + "." : "")).join(" ");
};

// =============================================================
// UPGRADE #1 — Inline citation formatter
// Produces "Author et al. (Year)" strings for inline use
// =============================================================

export function formatInlineCite(authors: string[], year: number | null): string {
  const y = year ?? "n.d.";
  if (!authors.length) return `(${y})`;

  if (authors.length === 1) return `${ln(authors[0])} (${y})`;
  if (authors.length === 2)
    return `${ln(authors[0])} & ${ln(authors[1])} (${y})`;
  return `${ln(authors[0])} et al. (${y})`;
}

// =============================================================
// UPGRADE #1 — Structured citation card
//
// Renders a markdown citation card block:
//   Vaswani et al. (2017)
//   Attention Is All You Need
//   NeurIPS
//   Citations: 80,000+
//   DOI: 10.48550/arXiv.1706.03762
// =============================================================

export function formatCitationCard(p: Paper, index?: number): string {
  const inlineCite = formatInlineCite(p.authors, p.year);
  const venue = p.journal ?? p.source ?? "Unknown";
  const doiLine = p.doi ? `DOI: ${p.doi}` : p.url ? `URL: ${p.url}` : "";
  const citLine =
    p.citationCount !== undefined
      ? `Citations: ${p.citationCount >= 1000 ? (p.citationCount / 1000).toFixed(0) + "k+" : p.citationCount.toLocaleString()}`
      : "";
  const indexPrefix = index !== undefined ? `[${index}] ` : "";

  return (
    `> **${indexPrefix}${inlineCite}**\n` +
    `> *${p.title}*\n` +
    `> ${venue}\n` +
    (citLine ? `> ${citLine}\n` : "") +
    (doiLine ? `> ${doiLine}\n` : "")
  ).trimEnd();
}

// =============================================================
// UPGRADE #9 — Full citation formatters (all styles)
// =============================================================

export function cite(p: Paper, fmt: CitationFormat): string {
  const y = p.year ?? "n.d.";
  const t = p.title;
  const j = p.journal ?? p.source ?? "Unknown";
  const link = p.doi ? `https://doi.org/${p.doi}` : p.url ? p.url : "";
  const au = p.authors.length ? p.authors : ["Unknown Author"];

  switch (fmt) {
    case "apa": {
      const apaAuthors = au
        .slice(0, 7)
        .map((n) => {
          const last = ln(n);
          const initials = ini(n);
          return initials ? `${last}, ${initials}` : last;
        })
        .join(", ");
      const suffix =
        au.length > 7 ? `, ... ${ln(au[au.length - 1])}` : "";
      return `${apaAuthors}${suffix} (${y}). ${t}. *${j}*.${link ? " " + link : ""}`;
    }

    case "mla": {
      let mlaAuthor: string;
      if (au.length === 1) mlaAuthor = au[0];
      else if (au.length === 2) mlaAuthor = `${au[0]}, and ${au[1]}`;
      else mlaAuthor = `${au[0]}, et al`;
      return `${mlaAuthor}. "${t}." *${j}*, ${y}.${link ? " " + link : ""}`;
    }

    case "ieee": {
      const ieeeAuthors = au
        .slice(0, 6)
        .map((n) => `${ini(n)} ${ln(n)}`.trim())
        .join(", ");
      return `${ieeeAuthors}, "${t}," *${j}*, ${y}.${link ? " [Online]. Available: " + link : ""}`;
    }

    case "chicago": {
      const chicagoAuthor = au.length === 1 ? au[0] : `${au[0]}, et al`;
      return `${chicagoAuthor}. "${t}." *${j}* (${y}).${link ? " " + link : ""}`;
    }

    case "harvard": {
      const harvardAuthors = au
        .slice(0, 3)
        .map((n) => {
          const last = ln(n);
          const initials = ini(n);
          return initials ? `${last}, ${initials}` : last;
        })
        .join(", ");
      const harvardSuffix = au.length > 3 ? " et al." : "";
      return `${harvardAuthors}${harvardSuffix} (${y}) '${t}', *${j}*.${link ? " Available at: " + link : ""}`;
    }

    case "vancouver": {
      const vanAuthors = au
        .slice(0, 6)
        .map((n) => `${ln(n)} ${ini(n).replace(/\./g, "").replace(/ /g, "")}`.trim())
        .join(", ");
      const etAl = au.length > 6 ? " et al" : "";
      return `${vanAuthors}${etAl}. ${t}. ${j}. ${y}.${link ? " Available from: " + link : ""}`;
    }

    case "bibtex": {
      const key = `${ln(au[0] ?? "unknown").toLowerCase()}${y}`;
      return (
        `@article{${key},\n` +
        `  title   = {${t}},\n` +
        `  author  = {${au.join(" and ")}},\n` +
        `  journal = {${j}},\n` +
        `  year    = {${y}},\n` +
        (p.doi ? `  doi     = {${p.doi}},\n` : "") +
        (p.url && !p.doi ? `  url     = {${p.url}},\n` : "") +
        (p.citationCount ? `  note    = {Cited by ${p.citationCount.toLocaleString()} papers},\n` : "") +
        `}`
      );
    }
  }
}

export function citeAll(papers: Paper[], fmt: CitationFormat): string {
  return papers.map((p, i) => `[${i + 1}] ${cite(p, fmt)}`).join("\n\n");
}

// =============================================================
// UPGRADE #1 — Numbered reference list for answer footers
//
// Produces a clean reference list like academic papers use:
//   [1] Vaswani et al. (2017) — Attention Is All You Need
//       NeurIPS | 80k citations | DOI: 10.48550/arXiv.1706.03762
// =============================================================

export function buildReferenceList(papers: Paper[]): string {
  if (!papers.length) return "";

  const lines = papers.map((p, i) => {
    const inlineCite = formatInlineCite(p.authors, p.year);
    const venue = p.journal ?? p.source ?? "Unknown";
    const doiOrUrl = p.doi
      ? `DOI: ${p.doi}`
      : p.url
      ? `URL: ${p.url}`
      : "";
    const citations =
      p.citationCount !== undefined
        ? `${p.citationCount >= 1000 ? Math.round(p.citationCount / 1000) + "k" : p.citationCount} citations`
        : "";

    const meta = [venue, citations, doiOrUrl].filter(Boolean).join(" | ");

    return `**[${i + 1}]** ${inlineCite} — *${p.title}*\n    ${meta}`;
  });

  return `## References\n\n${lines.join("\n\n")}`;
}
