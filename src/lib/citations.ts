/**
 * Citation formatter for Researchly — Improved Version
 *
 * Improvements over original:
 * 1. FEAT: Harvard citation format added
 * 2. FIX:  APA: handles missing forename gracefully
 * 3. FIX:  MLA: handles 3-author case (was only 1 or 2+)
 * 4. FEAT: All formats include DOI/URL link where available
 * 5. FIX:  Vancouver: cleaner initial formatting
 */

import { Paper, CitationFormat } from "@/types";

const ln = (n: string) => n.trim().split(" ").pop() ?? n;
const ini = (n: string) => {
  const parts = n.trim().split(" ").slice(0, -1);
  return parts.map((p) => (p[0] ? p[0] + "." : "")).join(" ");
};

export function cite(p: Paper, fmt: CitationFormat): string {
  const y = p.year ?? "n.d.";
  const t = p.title;
  const j = p.journal ?? p.source;
  const link = p.doi
    ? `https://doi.org/${p.doi}`
    : p.url
    ? p.url
    : "";
  const au = p.authors.length ? p.authors : ["Unknown Author"];

  switch (fmt) {
    case "apa": {
      // APA 7th: Last, F. M., & Last, F. M. (Year). Title. *Journal*. DOI
      const apaAuthors = au
        .slice(0, 7)
        .map((n) => {
          const last = ln(n);
          const initials = ini(n);
          return initials ? `${last}, ${initials}` : last;
        })
        .join(", ");
      const suffix = au.length > 7 ? ", ... " + ln(au[au.length - 1]) : "";
      return `${apaAuthors}${suffix} (${y}). ${t}. *${j}*.${link ? " " + link : ""}`;
    }

    case "mla": {
      // MLA 9th: Last, First, and First Last. "Title." *Journal*, Year. DOI
      let mlaAuthor: string;
      if (au.length === 1) mlaAuthor = au[0];
      else if (au.length === 2)
        mlaAuthor = `${au[0]}, and ${au[1]}`;
      else mlaAuthor = `${au[0]}, et al`; // 3+ authors
      return `${mlaAuthor}. "${t}." *${j}*, ${y}.${link ? " " + link : ""}`;
    }

    case "ieee": {
      // IEEE: F. M. Last, "Title," *Journal*, Year.
      const ieeeAuthors = au
        .slice(0, 6)
        .map((n) => `${ini(n)} ${ln(n)}`.trim())
        .join(", ");
      return `${ieeeAuthors}, "${t}," *${j}*, ${y}.${link ? " [Online]. Available: " + link : ""}`;
    }

    case "chicago": {
      // Chicago Author-Date: Last, First. "Title." *Journal* (Year). DOI
      const chicagoAuthor =
        au.length === 1 ? au[0] : `${au[0]}, et al`;
      return `${chicagoAuthor}. "${t}." *${j}* (${y}).${link ? " " + link : ""}`;
    }

    case "harvard": {
      // Harvard: Last, F.M. (Year) 'Title', *Journal*. DOI
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
      // Vancouver: Last FM. Title. Journal. Year.
      const vanAuthors = au
        .slice(0, 6)
        .map((n) =>
          `${ln(n)} ${ini(n).replace(/\./g, "").replace(/ /g, "")}`.trim()
        )
        .join(", ");
      return `${vanAuthors}. ${t}. ${j}. ${y}.${link ? " Available from: " + link : ""}`;
    }

    case "bibtex": {
      const key = `${ln(au[0] ?? "unknown")}${y}`;
      return `@article{${key},
  title   = {${t}},
  author  = {${au.join(" and ")}},
  journal = {${j}},
  year    = {${y}},${p.doi ? `\n  doi     = {${p.doi}},` : ""}${p.url && !p.doi ? `\n  url     = {${p.url}},` : ""}
}`;
    }
  }
}

export function citeAll(papers: Paper[], fmt: CitationFormat): string {
  return papers.map((p, i) => `[${i + 1}] ${cite(p, fmt)}`).join("\n\n");
}
