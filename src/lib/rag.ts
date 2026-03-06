/**
 * RAG system for Researchly — Improved Version
 *
 * Improvements over original:
 * 1. FIX:  arXiv author regex corrected (<name> not <n>)
 * 2. FIX:  Abstract slice raised to 1200 chars
 * 3. FEAT: BM25 + title-keyword boost (1.1x per matching query token in title)
 * 4. FEAT: Source diversity — max MAX_CHUNKS_PER_PAPER chunks per paper
 * 5. FEAT: Sentence-aware chunking (no mid-sentence splits)
 * 6. FEAT: Chunk overlap raised to 80 words
 * 7. FEAT: TOP_K raised to 15
 * 8. FEAT: Query expansion returns 3 alt queries (was 2)
 * 9. FEAT: SemanticScholar fetches 10 papers (was 8)
 * 10. FEAT: Dual-fingerprint dedup (title + DOI)
 * 11. FEAT: Authors included in chunk headers for better citation grounding
 */

import Anthropic from "@anthropic-ai/sdk";
import { Paper } from "@/types";

const CHUNK_SIZE = 300;
const CHUNK_OVERLAP = 80;
const TOP_K_CHUNKS = 15;
const MAX_CHUNKS_PER_PAPER = 5;
const FETCH_TIMEOUT = 9_000;

const ant = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function withTimeout<T>(p: Promise<T>, ms = FETCH_TIMEOUT): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, r) =>
      setTimeout(() => r(new Error("timeout")), ms)
    ),
  ]);
}

// ── Source fetchers ───────────────────────────────────────────

async function fetchSemanticScholar(q: string, n = 10): Promise<Paper[]> {
  try {
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=${n}&fields=paperId,title,authors,year,abstract,journal,externalIds,citationCount,openAccessPdf,url`;
    const data = (await withTimeout(fetch(url).then((r) => r.json()))) as any;
    return (data.data ?? []).map((p: any) => ({
      id: p.paperId,
      title: p.title ?? "",
      authors: (p.authors ?? []).map((a: any) => a.name),
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
        r.json()
      )
    )) as any;
    return (data.results ?? []).map((p: any) => {
      let abstract = "";
      if (p.abstract_inverted_index) {
        const pos: Record<number, string> = {};
        for (const [word, positions] of Object.entries(
          p.abstract_inverted_index as Record<string, number[]>
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
          .map((a: any) => a.author?.display_name),
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

async function fetchArXiv(q: string, n = 5): Promise<Paper[]> {
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

      // ✅ FIXED: was /<n>[\s\S]*?<\/name>/g — wrong opening tag caused empty authors
      const authorMatches = [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)];
      const authors = authorMatches.map((a) => a[1].trim());

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

async function fetchPubMed(q: string, n = 6): Promise<Paper[]> {
  try {
    const searchData = (await withTimeout(
      fetch(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(q)}&retmax=${n}&retmode=json&sort=relevance`
      ).then((r) => r.json())
    )) as any;
    const ids = searchData.esearchresult?.idlist ?? [];
    if (!ids.length) return [];
    const xml = await withTimeout(
      fetch(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml`
      ).then((r) => r.text())
    );
    const papers: Paper[] = [];
    const articleRe = /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g;
    let m: RegExpExecArray | null;
    while ((m = articleRe.exec(xml)) !== null) {
      const a = m[1];
      const title =
        a
          .match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/)?.[1]
          ?.replace(/<[^>]+>/g, "")
          .trim() ?? "";
      const abstract = [
        ...a.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g),
      ]
        .map((x) => x[1].replace(/<[^>]+>/g, "").trim())
        .join(" ");
      const authors = [
        ...a.matchAll(
          /<Author[^>]*>[\s\S]*?<LastName>([\s\S]*?)<\/LastName>(?:[\s\S]*?<ForeName>([\s\S]*?)<\/ForeName>)?/g
        ),
      ]
        .slice(0, 6)
        .map((x) => `${x[1]} ${x[2] ?? ""}`.trim());
      const year = a.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/)?.[1]
        ? parseInt(a.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/)![1])
        : null;
      const journal = a.match(/<Title>([\s\S]*?)<\/Title>/)?.[1]?.trim();
      const pmid = a.match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1] ?? "";
      const doi = a
        .match(/<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/)?.[1]
        ?.trim();
      if (title && abstract)
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
    return papers;
  } catch {
    return [];
  }
}

// ── Query expansion ───────────────────────────────────────────
// IMPROVED: 3 alternative queries (was 2)

async function expandQuery(query: string): Promise<string[]> {
  try {
    const r = await ant.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 180,
      system: "You are an academic search query expert.",
      messages: [
        {
          role: "user",
          content: `Generate 3 alternative academic search queries for: "${query}"
Vary vocabulary using synonyms, acronyms, and related technical terms.
Return ONLY a JSON array of 3 strings, nothing else.
Example: ["alt query one","alt query two","alt query three"]`,
        },
      ],
    });
    const b = r.content[0];
    if (b.type !== "text") return [];
    const parsed = JSON.parse(
      b.text
        .trim()
        .replace(/```json|```/g, "")
        .trim()
    ) as string[];
    return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
  } catch {
    return [];
  }
}

// ── Unified search ────────────────────────────────────────────

export async function searchAllWithPubMed(q: string): Promise<Paper[]> {
  const [expandedRes, ss, oa, ax, pm] = await Promise.allSettled([
    expandQuery(q),
    fetchSemanticScholar(q),
    fetchOpenAlex(q),
    fetchArXiv(q),
    fetchPubMed(q),
  ]);

  const expandedQueries =
    expandedRes.status === "fulfilled" ? expandedRes.value : [];

  const extraResults = await Promise.allSettled(
    expandedQueries.flatMap((eq) => [
      fetchSemanticScholar(eq, 4),
      fetchOpenAlex(eq, 4),
    ])
  );

  const all = [
    ...(ss.status === "fulfilled" ? ss.value : []),
    ...(oa.status === "fulfilled" ? oa.value : []),
    ...(ax.status === "fulfilled" ? ax.value : []),
    ...(pm.status === "fulfilled" ? pm.value : []),
    ...extraResults.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
  ];

  // IMPROVED: dual-fingerprint deduplication (title AND DOI)
  const seenTitles = new Set<string>();
  const seenDois = new Set<string>();

  return all
    .filter((p) => {
      if (!p.title || !p.abstract) return false;
      const titleKey = p.title
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 60);
      const doiKey = p.doi ? p.doi.toLowerCase().trim() : null;
      if (seenTitles.has(titleKey)) return false;
      if (doiKey && seenDois.has(doiKey)) return false;
      seenTitles.add(titleKey);
      if (doiKey) seenDois.add(doiKey);
      return true;
    })
    .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
    .slice(0, 25);
}

// ── Chunking ──────────────────────────────────────────────────
// IMPROVED: sentence-aware boundaries; authors propagated to chunks

export interface Chunk {
  paperId: string;
  paperIdx: number;
  title: string;
  source: string;
  year: number | null;
  text: string;
  url?: string;
  doi?: string;
  authors?: string[];
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+(?=[A-Z0-9\("])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
}

export function chunkPapers(papers: Paper[]): Chunk[] {
  const chunks: Chunk[] = [];

  papers.forEach((paper, idx) => {
    const sentences = splitIntoSentences(paper.abstract);
    if (!sentences.length) return;

    let current: string[] = [];
    let currentWordCount = 0;

    const pushChunk = () => {
      if (current.length === 0) return;
      chunks.push({
        paperId: paper.id,
        paperIdx: idx + 1,
        title: paper.title,
        source: paper.source,
        year: paper.year,
        text: current.join(" "),
        url: paper.url,
        doi: paper.doi,
        authors: paper.authors,
      });
    };

    for (const sentence of sentences) {
      const wordCount = sentence.split(/\s+/).length;
      if (currentWordCount + wordCount > CHUNK_SIZE && current.length > 0) {
        pushChunk();
        // Overlap: keep last CHUNK_OVERLAP words
        const prevText = current.join(" ");
        const overlapWords = prevText.split(/\s+/).slice(-CHUNK_OVERLAP);
        current = [overlapWords.join(" "), sentence];
        currentWordCount = overlapWords.length + wordCount;
      } else {
        current.push(sentence);
        currentWordCount += wordCount;
      }
    }
    pushChunk();
  });

  return chunks;
}

// ── Ranking ───────────────────────────────────────────────────
// IMPROVED: BM25 + title-keyword boost + source diversity

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

const K1 = 1.5,
  B = 0.75;

export function rankChunks(
  query: string,
  chunks: Chunk[],
  topK = TOP_K_CHUNKS
): Chunk[] {
  if (!chunks.length) return [];

  const qTokens = new Set(tokenize(query));
  const avgLen =
    chunks.reduce((s, c) => s + c.text.split(/\s+/).length, 0) / chunks.length;

  const idf: Record<string, number> = {};
  for (const t of qTokens) {
    const df = chunks.filter((c) => c.text.toLowerCase().includes(t)).length;
    idf[t] = df > 0 ? Math.log((chunks.length - df + 0.5) / (df + 0.5) + 1) : 0;
  }

  const scored = chunks.map((chunk) => {
    const words = chunk.text.split(/\s+/);
    const tf: Record<string, number> = {};
    for (const w of words) {
      const t = w.toLowerCase().replace(/[^a-z0-9]/g, "");
      tf[t] = (tf[t] ?? 0) + 1;
    }

    // BM25 score
    let score = 0;
    for (const t of qTokens) {
      const f = tf[t] ?? 0;
      score +=
        (idf[t] * f * (K1 + 1)) /
        (f + K1 * (1 - B + B * (words.length / avgLen)));
    }

    // IMPROVED: Title-keyword boost
    const titleTokens = new Set(tokenize(chunk.title));
    const titleOverlap = [...qTokens].filter((t) => titleTokens.has(t)).length;
    if (titleOverlap > 0) score *= 1 + 0.1 * Math.min(titleOverlap, 3); // max 1.3x

    // Recency boost
    if (chunk.year && chunk.year >= 2020) score *= 1.1;

    return { chunk, score };
  });

  // IMPROVED: Source diversity enforcement
  const paperChunkCount: Record<string, number> = {};
  const result: Chunk[] = [];

  for (const { chunk } of scored.sort((a, b) => b.score - a.score)) {
    const count = paperChunkCount[chunk.paperId] ?? 0;
    if (count < MAX_CHUNKS_PER_PAPER) {
      result.push(chunk);
      paperChunkCount[chunk.paperId] = count + 1;
    }
    if (result.length >= topK) break;
  }

  return result;
}

// ── Context builder ───────────────────────────────────────────
// IMPROVED: authors in header; DOI in footer

export function buildRAGContext(topChunks: Chunk[]): string {
  return topChunks
    .map((c, i) => {
      const authorStr =
        c.authors && c.authors.length > 0
          ? ` | ${c.authors.slice(0, 3).join(", ")}${c.authors.length > 3 ? " et al." : ""}`
          : "";
      return `[Chunk ${i + 1} | Ref ${c.paperIdx}: "${c.title}" (${c.source}, ${c.year ?? "n.d."})${authorStr}]
${c.text}${c.url ? `\nURL: ${c.url}` : ""}${c.doi ? `\nDOI: https://doi.org/${c.doi}` : ""}`;
    })
    .join("\n\n---\n\n");
}

// ── RAG answer generator ──────────────────────────────────────

const RAG_SYSTEM = `You are Researchly, an expert academic research assistant for Indian students and researchers.
You ONLY help with academic, research, and study topics.

RULE 1 — MANDATORY RESPONSE STRUCTURE
Every research answer MUST use these 7 sections in order:
1. ## Overview
2. ## Key Concepts
3. ## System Architecture  ← always include ASCII diagram (Rule 4)
4. ## Technical Details or Comparison  ← include table when comparing (Rule 5)
5. ## Key Research Papers
6. ## Limitations
7. ## Key Takeaways  +  ## What To Search Next

For study or exam queries: adapt structure but keep ## Overview and ## Key Takeaways mandatory.

RULE 2 — CITATION FORMAT (MANDATORY — NO EXCEPTIONS)
NEVER use [1], [2], [n] or any numeric citation style.
After every factual claim supported by a paper, insert this card inline:

> 📄 **Paper:** <full paper title — never truncate>
> **Authors:** <up to 3 names, then "et al.">
> **Year:** <year or n.d.>
> **Source:** <arXiv / Semantic Scholar / PubMed / OpenAlex / Journal / Conference>
> **Link:** <full DOI or URL, or "Not available">
> **Key Contribution:** <1–2 sentence description>

- One card per paper per paragraph — multiple consecutive sentences from the same paper get ONE card after the last sentence.
- Cards go inline after the claim, NOT in a references section at the bottom.
- Use ONLY metadata from the FULL PAPER METADATA section provided. Never fabricate titles, authors, or links.

RULE 3 — HANDLING MISSING CONTEXT
If retrieved context does not cover the concept asked:
1. Use retrieved papers as primary evidence where relevant.
2. Supplement with established scientific knowledge — label it: "(From general knowledge)"
3. Never fabricate citations to fill gaps.

RULE 4 — MANDATORY ASCII DIAGRAMS
Whenever discussing an AI system, architecture, pipeline, or model workflow, ALWAYS include an ASCII diagram.

Example:
\`\`\`
User Query
    |
    v
[Retriever] --> Top-K Documents
    |
    v
[LLM Generator]
    |
    v
Final Answer
\`\`\`

RULE 5 — COMPARISON TABLES
When comparing 2+ models or methods, include a markdown table:
| Model | Time Complexity | Memory | Strengths | Limitations |
|---|---|---|---|---|

RULE 6 — NO OVERCONFIDENT CLAIMS
Avoid absolute statements. Provide context and scope.
WRONG: "RNNs are outdated."
RIGHT: "RNNs are less commonly used for large-scale NLP compared to Transformers, but remain useful for streaming tasks such as speech recognition."

RULE 7 — RESEARCH-USEFUL OUTPUT
Focus on: key innovations, technical mechanisms, limitations, real-world applications.

WRITING RULES
- Never start with filler phrases like "Great question!" or "Certainly!".
- Bold **key terms** on first use.
- Research answers: 600–900 words. Study answers: 400–600 words.
- Always end with ## What To Search Next (3 query suggestions).`

export async function generateRAGAnswer(
  query: string,
  papers: Paper[],
  stream = false
): Promise<string | AsyncIterable<string>> {
  const chunks = chunkPapers(papers);
  const topChunks = rankChunks(query, chunks);
  const ragCtx = buildRAGContext(topChunks);

  // Build a rich paper lookup with all metadata the model needs for citation cards
  const paperList = papers
    .slice(0, 25)
    .map(
      (p, i) =>
        `[REF-${i + 1}]
Title: "${p.title}"
Authors: ${p.authors.slice(0, 3).join(", ")}${p.authors.length > 3 ? " et al." : ""}
Year: ${p.year ?? "n.d."}
Source: ${p.source}
Link: ${p.doi ? `https://doi.org/${p.doi}` : p.url ? p.url : "Not available"}`
    )
    .join("\n\n");

  const userPrompt = `RESEARCH QUESTION: "${query}"

## RETRIEVED CONTEXT (top ${topChunks.length} chunks — each chunk is labelled with its REF number)
${ragCtx}

## FULL PAPER METADATA (use this to build citation cards)
${paperList}

IMPORTANT: Every factual claim must be followed by a full citation card in the format specified in your instructions. Do NOT use [n] numbers. Use the full paper title, authors, year, source, and link from the metadata above.

Classify and respond:
- Research: inline citation cards after every claim, end with ## Key Takeaways, ## What To Search Next
- Study help: clear structure, real examples, ## Quick Revision Points, ## What To Search Next
- Exam: original questions, 4 options (A-D), correct answer, detailed explanations`;

  if (stream) {
    const s = await ant.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 3500,
      system: RAG_SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
    });
    async function* gen(): AsyncIterable<string> {
      for await (const e of s)
        if (e.type === "content_block_delta" && e.delta.type === "text_delta")
          yield e.delta.text;
    }
    return gen();
  }

  const res = await ant.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3500,
    system: RAG_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  });
  const b = res.content[0];
  return b.type === "text" ? b.text : "";
}

export { searchAllWithPubMed as searchAll };
