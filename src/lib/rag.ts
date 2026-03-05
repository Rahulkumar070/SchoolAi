/**
 * RAG (Retrieval-Augmented Generation) system for Researchly
 *
 * Sources: OpenAlex · Semantic Scholar · arXiv · PubMed
 *
 * Flow:
 *  1. searchAllWithPubMed()  — fetch papers from all 4 sources in parallel
 *  2. chunkPapers()          — split each abstract into overlapping text chunks
 *  3. rankChunks()           — BM25-style keyword scoring to pick the most
 *                              relevant chunks for a given user query
 *  4. buildRAGContext()      — format top-K chunks into a prompt-ready string
 *  5. generateRAGAnswer()    — call Claude with the ranked context
 */

import Anthropic from "@anthropic-ai/sdk";
import { Paper } from "@/types";

// ── Constants ──────────────────────────────────────────────────
const CHUNK_SIZE = 300; // words per chunk
const CHUNK_OVERLAP = 60; // word overlap between consecutive chunks
const TOP_K_CHUNKS = 8; // number of chunks sent to Claude
const FETCH_TIMEOUT = 9_000; // ms per source

// ── Timeout helper ─────────────────────────────────────────────
function withTimeout<T>(p: Promise<T>, ms = FETCH_TIMEOUT): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);
}

// ══════════════════════════════════════════════════════════════
// 1. SOURCE FETCHERS
// ══════════════════════════════════════════════════════════════

async function fetchSemanticScholar(q: string, n = 8): Promise<Paper[]> {
  try {
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=${n}&fields=paperId,title,authors,year,abstract,journal,externalIds,citationCount,openAccessPdf,url`;
    const data = (await withTimeout(fetch(url).then((r) => r.json()))) as {
      data?: {
        paperId: string;
        title: string;
        authors?: { name: string }[];
        year?: number;
        abstract?: string;
        journal?: { name: string };
        externalIds?: { DOI?: string };
        citationCount?: number;
        openAccessPdf?: { url: string };
        url?: string;
      }[];
    };
    return (data.data ?? []).map((p) => ({
      id: p.paperId,
      title: p.title ?? "",
      authors: (p.authors ?? []).map((a) => a.name),
      year: p.year ?? null,
      abstract: p.abstract ?? "",
      journal: p.journal?.name,
      doi: p.externalIds?.DOI,
      url: p.openAccessPdf?.url ?? p.url,
      citationCount: p.citationCount ?? 0,
      source: "Semantic Scholar",
    }));
  } catch {
    return [];
  }
}

async function fetchOpenAlex(q: string, n = 8): Promise<Paper[]> {
  try {
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(q)}&per_page=${n}&select=id,title,authorships,publication_year,abstract_inverted_index,primary_location,doi,cited_by_count,open_access`;
    const data = (await withTimeout(
      fetch(url, { headers: { "User-Agent": "Researchly/1.0" } }).then((r) =>
        r.json(),
      ),
    )) as {
      results?: {
        id: string;
        title: string;
        authorships?: { author: { display_name: string } }[];
        publication_year?: number;
        abstract_inverted_index?: Record<string, number[]>;
        primary_location?: {
          source?: { display_name: string };
          landing_page_url?: string;
        };
        doi?: string;
        cited_by_count?: number;
        open_access?: { oa_url?: string };
      }[];
    };
    return (data.results ?? []).map((p) => {
      // Reconstruct abstract from inverted index
      let abstract = "";
      if (p.abstract_inverted_index) {
        const pos: Record<number, string> = {};
        for (const [word, positions] of Object.entries(
          p.abstract_inverted_index,
        ))
          for (const idx of positions) pos[idx] = word;
        abstract = Object.keys(pos)
          .sort((a, b) => +a - +b)
          .map((k) => pos[+k])
          .join(" ");
      }
      return {
        id: p.id,
        title: p.title ?? "",
        authors: (p.authorships ?? [])
          .slice(0, 5)
          .map((a) => a.author?.display_name),
        year: p.publication_year ?? null,
        abstract,
        journal: p.primary_location?.source?.display_name,
        doi: p.doi?.replace("https://doi.org/", ""),
        url: p.open_access?.oa_url ?? p.primary_location?.landing_page_url,
        citationCount: p.cited_by_count ?? 0,
        source: "OpenAlex",
      };
    });
  } catch {
    return [];
  }
}

async function fetchArXiv(q: string, n = 4): Promise<Paper[]> {
  try {
    const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}&start=0&max_results=${n}&sortBy=relevance`;
    const xml = await withTimeout(fetch(url).then((r) => r.text()));
    const papers: Paper[] = [];
    const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(xml)) !== null) {
      const e = m[1];
      const title =
        e
          .match(/<title>([\s\S]*?)<\/title>/)?.[1]
          ?.trim()
          .replace(/\s+/g, " ") ?? "";
      const abstract =
        e
          .match(/<summary>([\s\S]*?)<\/summary>/)?.[1]
          ?.trim()
          .replace(/\s+/g, " ") ?? "";
      const published = e.match(/<published>([\s\S]*?)<\/published>/)?.[1];
      const id = e.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() ?? "";
      const authorMatches = e.match(/<name>[\s\S]*?<\/name>/g) ?? [];
      const authors = authorMatches.map((a) =>
        a.replace(/<\/?name>/g, "").trim(),
      );
      if (title && abstract)
        papers.push({
          id,
          title,
          authors,
          year: published ? parseInt(published.slice(0, 4)) : null,
          abstract,
          url: id,
          source: "arXiv",
          citationCount: 0,
        });
    }
    return papers;
  } catch {
    return [];
  }
}

/**
 * PubMed two-step fetch:
 *  Step 1 — esearch → get PMIDs
 *  Step 2 — efetch  → get full records (title, abstract, authors, year)
 */
async function fetchPubMed(q: string, n = 6): Promise<Paper[]> {
  try {
    // Step 1: search
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(q)}&retmax=${n}&retmode=json&sort=relevance`;
    const searchData = (await withTimeout(
      fetch(searchUrl).then((r) => r.json()),
    )) as { esearchresult?: { idlist?: string[] } };
    const ids = searchData.esearchresult?.idlist ?? [];
    if (ids.length === 0) return [];

    // Step 2: fetch details
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml`;
    const xml = await withTimeout(fetch(fetchUrl).then((r) => r.text()));

    const papers: Paper[] = [];
    const articleRe = /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g;
    let m: RegExpExecArray | null;

    while ((m = articleRe.exec(xml)) !== null) {
      const article = m[1];

      // Title
      const title =
        article
          .match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/)?.[1]
          ?.replace(/<[^>]+>/g, "")
          .trim() ?? "";

      // Abstract (may have multiple AbstractText sections)
      const abstractParts = [
        ...article.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g),
      ].map((am) => am[1].replace(/<[^>]+>/g, "").trim());
      const abstract = abstractParts.join(" ");

      // Authors
      const authorMatches = [
        ...article.matchAll(
          /<Author[^>]*>[\s\S]*?<LastName>([\s\S]*?)<\/LastName>(?:[\s\S]*?<ForeName>([\s\S]*?)<\/ForeName>)?/g,
        ),
      ];
      const authors = authorMatches
        .slice(0, 6)
        .map((am) => `${am[1]} ${am[2] ?? ""}`.trim());

      // Year
      const yearMatch = article.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/);
      const year = yearMatch ? parseInt(yearMatch[1]) : null;

      // Journal
      const journal =
        article.match(/<Title>([\s\S]*?)<\/Title>/)?.[1]?.trim() ?? undefined;

      // PMID
      const pmidMatch = article.match(/<PMID[^>]*>(\d+)<\/PMID>/);
      const pmid = pmidMatch?.[1] ?? "";

      // DOI
      const doiMatch = article.match(
        /<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/,
      );
      const doi = doiMatch?.[1]?.trim();

      if (title && abstract) {
        papers.push({
          id: `pubmed-${pmid}`,
          title,
          authors,
          year,
          abstract,
          journal,
          doi,
          url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : undefined,
          citationCount: 0,
          source: "PubMed",
        });
      }
    }
    return papers;
  } catch {
    return [];
  }
}

// ══════════════════════════════════════════════════════════════
// 2. UNIFIED SEARCH (all 4 sources)
// ══════════════════════════════════════════════════════════════

export async function searchAllWithPubMed(q: string): Promise<Paper[]> {
  const [ss, oa, ax, pm] = await Promise.allSettled([
    fetchSemanticScholar(q),
    fetchOpenAlex(q),
    fetchArXiv(q),
    fetchPubMed(q),
  ]);

  const all = [
    ...(ss.status === "fulfilled" ? ss.value : []),
    ...(oa.status === "fulfilled" ? oa.value : []),
    ...(ax.status === "fulfilled" ? ax.value : []),
    ...(pm.status === "fulfilled" ? pm.value : []),
  ];

  // Deduplicate by normalised title prefix
  const seen = new Set<string>();
  return all
    .filter((p) => {
      const key = p.title
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 50);
      if (seen.has(key) || !p.title || !p.abstract) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
    .slice(0, 18);
}

// ══════════════════════════════════════════════════════════════
// 3. CHUNKING  — split each paper's abstract into overlapping windows
// ══════════════════════════════════════════════════════════════

export interface Chunk {
  paperId: string;
  paperIdx: number; // 1-based citation number
  title: string;
  source: string;
  year: number | null;
  text: string;
  url?: string;
  doi?: string;
}

export function chunkPapers(papers: Paper[]): Chunk[] {
  const chunks: Chunk[] = [];

  papers.forEach((paper, idx) => {
    const words = paper.abstract.split(/\s+/).filter(Boolean);
    if (words.length === 0) return;

    let start = 0;
    while (start < words.length) {
      const end = Math.min(start + CHUNK_SIZE, words.length);
      const text = words.slice(start, end).join(" ");
      chunks.push({
        paperId: paper.id,
        paperIdx: idx + 1,
        title: paper.title,
        source: paper.source,
        year: paper.year,
        text,
        url: paper.url,
        doi: paper.doi,
      });
      if (end === words.length) break;
      start += CHUNK_SIZE - CHUNK_OVERLAP; // overlap
    }
  });

  return chunks;
}

// ══════════════════════════════════════════════════════════════
// 4. RANKING  — BM25-inspired TF·IDF keyword scoring
//    No external vector DB needed; works entirely in memory.
// ══════════════════════════════════════════════════════════════

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

// BM25 constants
const K1 = 1.5;
const B = 0.75;

export function rankChunks(
  query: string,
  chunks: Chunk[],
  topK = TOP_K_CHUNKS,
): Chunk[] {
  if (chunks.length === 0) return [];

  const queryTokens = new Set(tokenize(query));
  const avgLen =
    chunks.reduce((s, c) => s + c.text.split(/\s+/).length, 0) / chunks.length;

  // Compute IDF for each query token
  const idf: Record<string, number> = {};
  for (const token of queryTokens) {
    const df = chunks.filter((c) =>
      c.text.toLowerCase().includes(token),
    ).length;
    idf[token] =
      df > 0 ? Math.log((chunks.length - df + 0.5) / (df + 0.5) + 1) : 0;
  }

  const scored = chunks.map((chunk) => {
    const words = chunk.text.split(/\s+/);
    const dl = words.length;
    const tf: Record<string, number> = {};
    for (const w of words) {
      const t = w.toLowerCase().replace(/[^a-z0-9]/g, "");
      tf[t] = (tf[t] ?? 0) + 1;
    }

    let score = 0;
    for (const token of queryTokens) {
      const freq = tf[token] ?? 0;
      const bm25 =
        (idf[token] * freq * (K1 + 1)) /
        (freq + K1 * (1 - B + B * (dl / avgLen)));
      score += bm25;
    }

    // Boost recent papers slightly
    if (chunk.year && chunk.year >= 2020) score *= 1.1;

    return { chunk, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.chunk);
}

// ══════════════════════════════════════════════════════════════
// 5. CONTEXT BUILDER — format top-K chunks into a prompt string
// ══════════════════════════════════════════════════════════════

export function buildRAGContext(topChunks: Chunk[]): string {
  return topChunks
    .map(
      (c, i) =>
        `[Chunk ${i + 1} | Ref ${c.paperIdx}: "${c.title}" (${c.source}, ${c.year ?? "n.d."})]\n${c.text}${c.url ? `\nURL: ${c.url}` : ""}${c.doi ? `\nDOI: https://doi.org/${c.doi}` : ""}`,
    )
    .join("\n\n---\n\n");
}

// ══════════════════════════════════════════════════════════════
// 6. RAG ANSWER GENERATOR
// ══════════════════════════════════════════════════════════════

const ant = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const RAG_SYSTEM = `You are Researchly, an elite academic research assistant for Indian students and researchers.
You ONLY help with academic, research, and study topics.

CONTEXT USAGE RULES:
- You are given ranked, relevant excerpts from academic papers retrieved via RAG (Retrieval-Augmented Generation).
- Each excerpt is labelled [Chunk N | Ref M: "Title" (Source, Year)].
- Cite facts using the Ref number: e.g. [2] or [1,3].
- If a chunk is not relevant to the question, ignore it.
- Never fabricate facts not present in the context.
- If the context is insufficient, supplement with your knowledge and say so explicitly.

WRITING RULES:
- Never start with "Great question!" or "Certainly!" or filler phrases.
- Use ## for main headings, bold **key terms** on first use.
- Research answers: 400-600 words.
- Study explanations: 300-500 words.
- Always end with ## What To Search Next (3 related query suggestions).`;

export async function generateRAGAnswer(
  query: string,
  papers: Paper[],
  stream = false,
): Promise<string | AsyncIterable<string>> {
  // Chunk + rank
  const chunks = chunkPapers(papers);
  const topChunks = rankChunks(query, chunks);
  const ragCtx = buildRAGContext(topChunks);

  // Full paper list for the citation index
  const paperList = papers
    .slice(0, 18)
    .map(
      (p, i) =>
        `[${i + 1}] "${p.title}" — ${p.authors.slice(0, 3).join(", ")}${p.authors.length > 3 ? " et al." : ""} (${p.year ?? "n.d."}) · ${p.source}${p.url ? ` · ${p.url}` : ""}`,
    )
    .join("\n");

  const userPrompt = `RESEARCH QUESTION: "${query}"

## RETRIEVED CONTEXT (RAG — top ${topChunks.length} chunks ranked by relevance)
${ragCtx}

## FULL PAPER INDEX (for citations)
${paperList}

## INSTRUCTIONS
1. Classify as: Research / Study Help / Exam Practice.
2. Answer using ONLY the retrieved context above; cite with [Ref M].
3. For research: cite every claim [n], end with ## Key Takeaways, ## Useful Links, ## What To Search Next.
4. For study help: clear structure with examples, ## Quick Revision Points, ## What To Search Next.
5. For exam practice: original questions, 4 options (A-D), correct answer, detailed explanation.
6. Make every sentence count — no filler, maximum insight.`;

  if (stream) {
    // Return an async generator that yields text chunks
    const streamResp = await ant.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      system: RAG_SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
    });

    async function* textGen(): AsyncIterable<string> {
      for await (const event of streamResp) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield event.delta.text;
        }
      }
    }
    return textGen();
  }

  // Non-streaming (used by /api/search)
  const response = await ant.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 3000,
    system: RAG_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  });
  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}

// ══════════════════════════════════════════════════════════════
// 7. CONVENIENCE RE-EXPORT (keeps existing imports working)
// ══════════════════════════════════════════════════════════════

/** Drop-in replacement for the old searchAll() — now includes PubMed */
export { searchAllWithPubMed as searchAll };
