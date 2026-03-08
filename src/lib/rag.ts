/**
 * RAG system for Researchly — Production-Grade v5
 *
 * Upgrades over v4:
 * 1.  FEAT: Real embeddings — OpenAI text-embedding-3-small with TF-IDF fallback
 * 2.  FEAT: Embedding provider abstraction — swap via OPENAI_API_KEY env presence
 * 3.  FEAT: Citation graph retrieval — SS references + citations for top 5 papers
 * 4.  FIX:  Foundational paper priority — boost checks ORIGINAL query (was rewritten)
 * 5.  FEAT: Robust deduplication — paperId + DOI + arXiv ID + URL + title
 * 6.  FEAT: Surgical domain filtering — precise ML/non-ML separation
 * 7.  FEAT: rankChunks is now async — uses real semantic embeddings
 * 8.  FEAT: Batch embeddings — single API call per ranking operation
 * 9.  FEAT: Embedding + citation graph caches
 *
 * Preserved from v4:
 * 10. Hybrid BM25 + semantic chunk ranking
 * 11. 4-query expansion + multi-hop related queries
 * 12. Answer verification pass (verifyAnswer)
 * 13. Fingerprint cache keys for rerankCache
 * 14. In-memory TTL cache system
 * 15. Static foundational paper library
 */

import Anthropic from "@anthropic-ai/sdk";
import { Paper } from "@/types";

// ── Constants ─────────────────────────────────────────────────
const CHUNK_SIZE = 300;
const CHUNK_OVERLAP = 80;
const TOP_K_CHUNKS = 15;
const MAX_CHUNKS_PER_PAPER = 4;
const FETCH_TIMEOUT = 9_000;
const CURRENT_YEAR = new Date().getFullYear();

// ── API Clients ───────────────────────────────────────────────
const ant = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// =============================================================
// SECTION 1 — IN-MEMORY CACHE
// =============================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class MemoryCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}

const paperSearchCache = new MemoryCache<Paper[]>(500);
const queryExpansionCache = new MemoryCache<string[]>(200);
const rerankCache = new MemoryCache<Chunk[]>(200);
const rewriteQueryCache = new MemoryCache<string>(200);
const relatedQueryCache = new MemoryCache<string[]>(200);
const embeddingCache = new MemoryCache<number[]>(2000); // v5: real embeddings
const citationGraphCache = new MemoryCache<Paper[]>(200); // v5: citation graph

// =============================================================
// SECTION 2 — UTILITY HELPERS
// =============================================================

function withTimeout<T>(p: Promise<T>, ms = FETCH_TIMEOUT): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), ms)),
  ]);
}

async function withRetry<T>(
  fn: () => Promise<T[]>,
  maxRetries = 2,
  baseDelayMs = 800,
): Promise<T[]> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch {
      if (attempt === maxRetries) return [];
      await new Promise((r) =>
        setTimeout(r, baseDelayMs * Math.pow(2, attempt)),
      );
    }
  }
  return [];
}

function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

// =============================================================
// SECTION 3 — KEYWORD EXTRACTION
// =============================================================

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "in",
  "of",
  "for",
  "to",
  "and",
  "or",
  "is",
  "are",
  "was",
  "were",
  "what",
  "how",
  "why",
  "when",
  "where",
  "which",
  "does",
  "do",
  "can",
  "will",
  "has",
  "have",
  "been",
  "be",
  "with",
  "from",
  "that",
  "this",
  "these",
  "those",
  "about",
  "explain",
  "describe",
  "tell",
  "show",
  "give",
  "compare",
  "difference",
  "between",
  "me",
  "my",
  "i",
  "we",
  "our",
  "your",
  "their",
  "its",
  "use",
  "uses",
  "used",
  "using",
  "work",
  "works",
  "makes",
  "make",
  "get",
  "gets",
  "need",
  "needs",
  "want",
]);

export function extractKeywords(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  return [...new Set(tokens)];
}

// =============================================================
// SECTION 4 — EMBEDDING PROVIDER ABSTRACTION  (v5 NEW)
//
// Providers:
//   1. OpenAI text-embedding-3-small  — when OPENAI_API_KEY is set
//   2. TF-IDF fallback                — always available
//
// Public API:
//   getEmbedding(text)                    → Promise<number[]>
//   getBatchEmbeddings(texts, vocabulary) → Promise<number[][]>
//
// To add a new provider: implement the embed() method pattern
// and update getActiveProvider().
// =============================================================

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA === 0 || normB === 0
    ? 0
    : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ── TF-IDF helpers (always-available fallback) ────────────────
function tfidfTokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function buildTFIDFVector(text: string, vocabulary: string[]): number[] {
  const tokens = tfidfTokenize(text);
  const tf: Record<string, number> = {};
  for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1;
  return vocabulary.map((term) => tf[term] ?? 0);
}

function buildVocabulary(texts: string[]): string[] {
  const counts: Record<string, number> = {};
  for (const text of texts)
    for (const t of tfidfTokenize(text)) counts[t] = (counts[t] ?? 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 300)
    .map(([t]) => t);
}

// ── Active provider selection ─────────────────────────────────
let _providerName: string | null = null;

function getActiveProvider(): "openai" | "tfidf" {
  if (_providerName) return _providerName as "openai" | "tfidf";
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  _providerName = hasOpenAI ? "openai" : "tfidf";
  if (hasOpenAI) {
    console.log("[Researchly] Embedding: OpenAI text-embedding-3-small");
  } else {
    console.log(
      "[Researchly] Embedding: TF-IDF fallback (set OPENAI_API_KEY for real embeddings)",
    );
  }
  return _providerName as "openai" | "tfidf";
}

// ── OpenAI batch embed ────────────────────────────────────────
async function openAIEmbed(texts: string[]): Promise<number[][]> {
  const BATCH = 96;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const resp = (await withTimeout(
      fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model: "text-embedding-3-small", input: batch }),
      }).then((r) => r.json()),
      12_000,
    )) as any;

    if (resp.error) throw new Error(`OpenAI: ${resp.error.message}`);
    const sorted = (resp.data as any[]).sort(
      (a: any, b: any) => a.index - b.index,
    );
    results.push(...sorted.map((d: any) => d.embedding as number[]));
  }

  return results;
}

// ── Public embedding API ──────────────────────────────────────

/** Single text embedding with cache. Falls back to TF-IDF on API error. */
export async function getEmbedding(
  text: string,
  vocabulary?: string[],
): Promise<number[]> {
  const provider = getActiveProvider();
  const cacheKey = `emb:${provider}:${hashString(text)}`;
  const cached = embeddingCache.get(cacheKey);
  if (cached) return cached;

  let result: number[];
  try {
    if (provider === "openai") {
      const [embedding] = await openAIEmbed([text]);
      result = embedding;
    } else {
      const vocab = vocabulary ?? buildVocabulary([text]);
      result = buildTFIDFVector(text, vocab);
    }
  } catch {
    // Fallback to TF-IDF on any error
    const vocab = vocabulary ?? buildVocabulary([text]);
    result = buildTFIDFVector(text, vocab);
  }

  embeddingCache.set(cacheKey, result, 30 * 60 * 1000);
  return result;
}

/** Batch embeddings — single API call for efficiency. Cache-aware. */
export async function getBatchEmbeddings(
  texts: string[],
  vocabulary?: string[],
): Promise<number[][]> {
  const provider = getActiveProvider();

  // Separate cached from uncached
  const results: (number[] | null)[] = texts.map((text) =>
    embeddingCache.get(`emb:${provider}:${hashString(text)}`),
  );
  const missIndices = results
    .map((r, i) => (r === null ? i : -1))
    .filter((i) => i >= 0);

  if (missIndices.length > 0) {
    const missTexts = missIndices.map((i) => texts[i]);
    let fresh: number[][];

    try {
      if (provider === "openai") {
        fresh = await openAIEmbed(missTexts);
      } else {
        const vocab = vocabulary ?? buildVocabulary(texts);
        fresh = missTexts.map((t) => buildTFIDFVector(t, vocab));
      }
    } catch {
      // Fallback to TF-IDF
      const vocab = vocabulary ?? buildVocabulary(texts);
      fresh = missTexts.map((t) => buildTFIDFVector(t, vocab));
    }

    missIndices.forEach((origIdx, freshIdx) => {
      const emb = fresh[freshIdx] ?? [];
      results[origIdx] = emb;
      embeddingCache.set(
        `emb:${provider}:${hashString(texts[origIdx])}`,
        emb,
        30 * 60 * 1000,
      );
    });
  }

  return results.map((r) => r ?? []);
}

/** Legacy sync TF-IDF embedding — kept for compatibility */
export function generateEmbedding(
  text: string,
  vocabulary: string[],
): number[] {
  return buildTFIDFVector(text, vocabulary);
}

// =============================================================
// SECTION 5 — QUERY REWRITING
// =============================================================

export async function rewriteQuery(query: string): Promise<string> {
  const cacheKey = `rewrite:${query}`;
  const cached = rewriteQueryCache.get(cacheKey);
  if (cached) return cached;

  try {
    const r = await ant.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 120,
      system:
        "You are an expert academic search query optimizer. " +
        "Rewrite the user query into a precise, academic-style search query " +
        "that retrieves the most relevant papers from Semantic Scholar, arXiv, and OpenAlex. " +
        "Include key technical terms, likely author names if well-known, and field-specific vocabulary. " +
        "Return ONLY the rewritten query as plain text — no quotes, no explanation.",
      messages: [
        {
          role: "user",
          content: `Rewrite this query for academic paper search:\n"${query}"`,
        },
      ],
    });

    const b = r.content[0];
    if (b.type !== "text" || !b.text.trim()) return query;
    const rewritten = b.text.trim().slice(0, 300);
    rewriteQueryCache.set(cacheKey, rewritten, 10 * 60 * 1000);
    return rewritten;
  } catch {
    return query;
  }
}

// =============================================================
// SECTION 6 — MULTI-HOP RELATED QUERIES
// =============================================================

export async function generateRelatedQueries(query: string): Promise<string[]> {
  const cacheKey = `related:${query}`;
  const cached = relatedQueryCache.get(cacheKey);
  if (cached) return cached;

  try {
    const r = await ant.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 160,
      system:
        "You are an expert academic research assistant. Given a research query, generate 2 related " +
        "follow-up queries exploring different complementary aspects (background, evaluation, applications). " +
        "Return ONLY a valid JSON array of exactly 2 strings. No explanation, no markdown.",
      messages: [
        {
          role: "user",
          content: `Generate 2 related academic search queries for:\n"${query}"\n\nExample: ["query one", "query two"]`,
        },
      ],
    });

    const b = r.content[0];
    if (b.type !== "text") return [];
    const parsed = JSON.parse(
      b.text
        .trim()
        .replace(/```json|```/g, "")
        .trim(),
    ) as string[];
    const result = Array.isArray(parsed)
      ? parsed.slice(0, 2).filter((s) => typeof s === "string" && s.trim())
      : [];
    relatedQueryCache.set(cacheKey, result, 10 * 60 * 1000);
    return result;
  } catch {
    return [];
  }
}

// =============================================================
// SECTION 7 — FOUNDATIONAL PAPER BOOST  (v5: fixed query source)
//
// BUG FIX: Now receives the ORIGINAL user query, not the rewritten
// query. The rewriter may drop terms like "transformer" in favour
// of "self-attention mechanism", causing the boost to silently fail.
//
// Boost raised from 3 → 5 so seminal papers always outrank
// high-citation derivatives (e.g. BERT for a Transformer query).
// =============================================================

function foundationalBoost(paper: Paper, originalQuery: string): number {
  const q = originalQuery.toLowerCase();
  const title = paper.title.toLowerCase();

  const RULES: Array<{ trigger: RegExp; phrases: string[]; boost: number }> = [
    {
      trigger:
        /transformer|attention.*mechanism|self.?attention|multi.?head|vaswani|how.*transformer/,
      phrases: ["attention is all you need"],
      boost: 5,
    },
    {
      trigger:
        /\bbert\b|bidirectional.*transformer|masked.*language.*model|devlin/,
      phrases: ["bert: pre-training of deep bidirectional transformers"],
      boost: 5,
    },
    {
      trigger: /gpt.?3|few.?shot.*language|language model.*few.?shot/,
      phrases: ["language models are few-shot learners"],
      boost: 5,
    },
    {
      trigger: /\brag\b|retrieval.?augmented generation/,
      phrases: ["retrieval-augmented generation for knowledge-intensive"],
      boost: 5,
    },
    {
      trigger: /\bresnet\b|residual.*learning|deep residual|he.*kaiming/,
      phrases: ["deep residual learning for image recognition"],
      boost: 5,
    },
    {
      trigger: /\bgan\b|generative adversarial|goodfellow.*2014/,
      phrases: ["generative adversarial networks"],
      boost: 5,
    },
    {
      trigger:
        /word2vec|word embeddings|skip.?gram|distributed representations.*words/,
      phrases: ["distributed representations of words and phrases"],
      boost: 5,
    },
    {
      trigger: /\badam\b|adam optimizer|adaptive.*moment/,
      phrases: ["adam: a method for stochastic optimization"],
      boost: 5,
    },
    {
      trigger: /\bdropout\b|dropout.*regularization/,
      phrases: ["dropout: a simple way to prevent neural networks"],
      boost: 4,
    },
    {
      trigger: /batch normalization|batchnorm/,
      phrases: ["batch normalization: accelerating deep network"],
      boost: 4,
    },
  ];

  for (const { trigger, phrases, boost } of RULES) {
    if (trigger.test(q)) {
      for (const phrase of phrases) {
        if (title.includes(phrase)) return boost;
      }
    }
  }
  return 0;
}

// =============================================================
// SECTION 8 — PAPER SCORING  (v5: originalQuery for boost)
//
// Formula:
//   score = 0.40 × log(citations+1)
//         + 0.25 × recencyScore
//         + 0.15 × titleOverlap
//         + 0.15 × abstractOverlap
//         + 0.05 × venueScore
//   × 1.3 for high-impact venues
//   + foundationalBoost(originalQuery)
// =============================================================

const HIGH_VENUE_RE =
  /\b(nature|science|neurips|nips|icml|acl|cvpr|iclr|emnlp|naacl|iccv|eccv|aaai|ijcai|cell|lancet|nejm|jama|bmj|ieee transactions|pnas)\b/i;

function venueQuality(paper: Paper): number {
  return HIGH_VENUE_RE.test(`${paper.journal ?? ""} ${paper.source ?? ""}`)
    ? 1.0
    : 0.0;
}

function recencyScore(paper: Paper): number {
  if (!paper.year) return 0;
  return 1 / (1 + Math.max(0, CURRENT_YEAR - paper.year));
}

function titleQueryOverlap(paper: Paper, terms: string[]): number {
  if (!terms.length) return 0;
  const t = paper.title.toLowerCase();
  return terms.filter((k) => t.includes(k)).length / terms.length;
}

function abstractQueryOverlap(paper: Paper, terms: string[]): number {
  if (!terms.length || !paper.abstract) return 0;
  const a = paper.abstract.toLowerCase();
  return terms.filter((k) => a.includes(k)).length / terms.length;
}

export function scorePaper(
  paper: Paper,
  rewrittenQuery: string,
  terms: string[],
  originalQuery?: string,
): number {
  const citScore = Math.log((paper.citationCount ?? 0) + 1);
  const recency = recencyScore(paper);
  const titleOvlp = titleQueryOverlap(paper, terms);
  const abstractOvlp = abstractQueryOverlap(paper, terms);
  const venue = venueQuality(paper);

  let score =
    0.4 * citScore +
    0.25 * recency +
    0.15 * titleOvlp +
    0.15 * abstractOvlp +
    0.05 * venue;

  if (venue > 0) score *= 1.3;
  score += foundationalBoost(paper, originalQuery ?? rewrittenQuery);
  return score;
}

// =============================================================
// SECTION 9 — QUERY EXPANSION
// =============================================================

async function expandQuery(
  query: string,
  keywords: string[],
): Promise<string[]> {
  const cacheKey = `expand:${query}`;
  const cached = queryExpansionCache.get(cacheKey);
  if (cached) return cached;

  try {
    const kwHint =
      keywords.length > 0
        ? `Key technical terms: ${keywords.slice(0, 8).join(", ")}.`
        : "";

    const r = await ant.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 260,
      system: "You are an expert academic search query generator.",
      messages: [
        {
          role: "user",
          content: `Generate 4 alternative academic search queries for: "${query}"
${kwHint}

Each must use a DIFFERENT strategy:
1. FOUNDATIONAL: target the seminal paper (e.g. "Vaswani attention is all you need transformer 2017")
2. ACRONYM: use field abbreviations (e.g. "MHA scaled dot-product attention QKV")
3. BROADER CONTEXT: wider umbrella query (e.g. "sequence to sequence neural network NLP")
4. TECHNICAL DEPTH: precise field-specific terminology

Return ONLY a valid JSON array of exactly 4 strings. No explanation, no markdown.
Example: ["query1","query2","query3","query4"]`,
        },
      ],
    });

    const b = r.content[0];
    if (b.type !== "text") return [];
    const parsed = JSON.parse(
      b.text
        .trim()
        .replace(/```json|```/g, "")
        .trim(),
    ) as string[];
    const result = Array.isArray(parsed) ? parsed.slice(0, 4) : [];
    queryExpansionCache.set(cacheKey, result, 30 * 60 * 1000);
    return result;
  } catch {
    return [];
  }
}

// =============================================================
// SECTION 10 — SOURCE FETCHERS
// =============================================================

async function fetchSemanticScholar(q: string, n = 12): Promise<Paper[]> {
  const cacheKey = `ss:${q}:${n}`;
  const hit = paperSearchCache.get(cacheKey);
  if (hit) return hit;

  try {
    const url =
      `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}` +
      `&limit=${n}&fields=paperId,title,authors,year,abstract,journal,externalIds,citationCount,openAccessPdf,url&sort=relevance`;
    const data = (await withTimeout(fetch(url).then((r) => r.json()))) as any;
    const result = (data.data ?? []).map((p: any) => ({
      id: p.paperId,
      title: p.title ?? "",
      authors: (p.authors ?? []).map((a: any) => a.name),
      year: p.year ?? null,
      abstract: (p.abstract ?? "").slice(0, 1200),
      journal: p.journal?.name,
      doi: p.externalIds?.DOI,
      url: p.openAccessPdf?.url ?? p.url,
      citationCount: p.citationCount ?? 0,
      source: "Semantic Scholar",
    }));
    paperSearchCache.set(cacheKey, result, 10 * 60 * 1000);
    return result;
  } catch {
    return [];
  }
}

async function fetchOpenAlex(q: string, n = 8): Promise<Paper[]> {
  const cacheKey = `oa:${q}:${n}`;
  const hit = paperSearchCache.get(cacheKey);
  if (hit) return hit;

  try {
    const url =
      `https://api.openalex.org/works?search=${encodeURIComponent(q)}` +
      `&per_page=${n}&select=id,title,authorships,publication_year,abstract_inverted_index,primary_location,doi,cited_by_count,open_access`;
    const data = (await withTimeout(
      fetch(url, { headers: { "User-Agent": "Researchly/1.0" } }).then((r) =>
        r.json(),
      ),
    )) as any;
    const result = (data.results ?? []).map((p: any) => {
      let abstract = "";
      if (p.abstract_inverted_index) {
        const pos: Record<number, string> = {};
        for (const [word, positions] of Object.entries(
          p.abstract_inverted_index as Record<string, number[]>,
        ))
          for (const idx of positions) pos[idx] = word;
        abstract = Object.keys(pos)
          .sort((a, b) => +a - +b)
          .map((k) => pos[+k])
          .join(" ")
          .slice(0, 1200);
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
    paperSearchCache.set(cacheKey, result, 10 * 60 * 1000);
    return result;
  } catch {
    return [];
  }
}

async function fetchArXiv(q: string, n = 5): Promise<Paper[]> {
  const cacheKey = `arxiv:${q}:${n}`;
  const hit = paperSearchCache.get(cacheKey);
  if (hit) return hit;

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
          .replace(/\s+/g, " ")
          .slice(0, 1200) ?? "";
      const published = e.match(/<published>([\s\S]*?)<\/published>/)?.[1];
      const id = e.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() ?? "";
      const authorMatches = [...e.matchAll(/<n>([\s\S]*?)<\/name>/g)];
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
    paperSearchCache.set(cacheKey, papers, 10 * 60 * 1000);
    return papers;
  } catch {
    return [];
  }
}

async function fetchPubMed(q: string, n = 6): Promise<Paper[]> {
  const cacheKey = `pm:${q}:${n}`;
  const hit = paperSearchCache.get(cacheKey);
  if (hit) return hit;

  try {
    const searchData = (await withTimeout(
      fetch(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(q)}&retmax=${n}&retmode=json&sort=relevance`,
      ).then((r) => r.json()),
    )) as any;
    const ids = searchData.esearchresult?.idlist ?? [];
    if (!ids.length) return [];
    const xml = await withTimeout(
      fetch(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml`,
      ).then((r) => r.text()),
    );
    const papers: Paper[] = [];
    const articleRe = /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g;
    let art: RegExpExecArray | null;
    while ((art = articleRe.exec(xml)) !== null) {
      const a = art[1];
      const title =
        a
          .match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/)?.[1]
          ?.replace(/<[^>]+>/g, "")
          .trim() ?? "";
      const abstract = [
        ...a.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g),
      ]
        .map((x) => x[1].replace(/<[^>]+>/g, "").trim())
        .join(" ")
        .slice(0, 1200);
      const authors = [
        ...a.matchAll(
          /<Author[^>]*>[\s\S]*?<LastName>([\s\S]*?)<\/LastName>(?:[\s\S]*?<ForeName>([\s\S]*?)<\/ForeName>)?/g,
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
    paperSearchCache.set(cacheKey, papers, 10 * 60 * 1000);
    return papers;
  } catch {
    return [];
  }
}

// =============================================================
// SECTION 11 — CITATION GRAPH RETRIEVAL  (v5 NEW)
//
// For top 5 Semantic Scholar papers, fetches their references
// and citing papers. Adds highly-related papers that the initial
// query search may have missed.
//
// Cached 5 min per unique set of paper IDs.
// =============================================================

async function fetchCitationGraph(ssIds: string[]): Promise<Paper[]> {
  if (!ssIds.length) return [];

  const cacheKey = `cg:${[...ssIds].sort().join(",")}`;
  const cached = citationGraphCache.get(cacheKey);
  if (cached) return cached;

  const fields =
    "paperId,title,authors,year,abstract,journal,externalIds,citationCount,openAccessPdf,url";

  const mapPaper = (core: any): Paper | null => {
    if (!core?.paperId || !core?.title || !core?.abstract) return null;
    return {
      id: core.paperId,
      title: core.title,
      authors: (core.authors ?? []).map((a: any) => a.name),
      year: core.year ?? null,
      abstract: (core.abstract ?? "").slice(0, 1200),
      journal: core.journal?.name,
      doi: core.externalIds?.DOI,
      url: core.openAccessPdf?.url ?? core.url,
      citationCount: core.citationCount ?? 0,
      source: "Semantic Scholar",
    };
  };

  const fetchOne = async (paperId: string): Promise<Paper[]> => {
    const papers: Paper[] = [];
    try {
      const [refResp, citeResp] = await Promise.allSettled([
        withTimeout(
          fetch(
            `https://api.semanticscholar.org/graph/v1/paper/${paperId}/references?limit=8&fields=${fields}`,
          ).then((r) => r.json()),
          8_000,
        ),
        withTimeout(
          fetch(
            `https://api.semanticscholar.org/graph/v1/paper/${paperId}/citations?limit=5&fields=${fields}`,
          ).then((r) => r.json()),
          8_000,
        ),
      ]);

      if (refResp.status === "fulfilled") {
        for (const e of (refResp.value as any).data ?? []) {
          const p = mapPaper(e.citedPaper);
          if (p) papers.push(p);
        }
      }
      if (citeResp.status === "fulfilled") {
        for (const e of (citeResp.value as any).data ?? []) {
          const p = mapPaper(e.citingPaper);
          if (p) papers.push(p);
        }
      }
    } catch {
      /* silently skip */
    }
    return papers;
  };

  try {
    const batches = await Promise.allSettled(ssIds.slice(0, 5).map(fetchOne));
    const result = batches.flatMap((b) =>
      b.status === "fulfilled" ? b.value : [],
    );
    citationGraphCache.set(cacheKey, result, 5 * 60 * 1000);
    return result;
  } catch {
    return [];
  }
}

// =============================================================
// SECTION 12 — STATIC FOUNDATIONAL PAPER LIBRARY
// =============================================================

const STATIC_PAPERS: Record<string, Paper> = {
  "attention-transformer": {
    id: "vaswani2017",
    title: "Attention Is All You Need",
    authors: [
      "Ashish Vaswani",
      "Noam Shazeer",
      "Niki Parmar",
      "Jakob Uszkoreit",
      "Llion Jones",
      "Aidan N. Gomez",
      "Lukasz Kaiser",
      "Illia Polosukhin",
    ],
    year: 2017,
    abstract:
      "We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train.",
    journal: "Advances in Neural Information Processing Systems (NeurIPS)",
    doi: "10.48550/arXiv.1706.03762",
    url: "https://arxiv.org/abs/1706.03762",
    citationCount: 120000,
    source: "arXiv",
  },
  bert: {
    id: "devlin2019",
    title:
      "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
    authors: [
      "Jacob Devlin",
      "Ming-Wei Chang",
      "Kenton Lee",
      "Kristina Toutanova",
    ],
    year: 2019,
    abstract:
      "We introduce BERT, designed to pre-train deep bidirectional representations from unlabeled text by jointly conditioning on both left and right context in all layers. BERT obtains new state-of-the-art results on eleven NLP tasks.",
    journal: "NAACL-HLT 2019",
    doi: "10.18653/v1/N19-1423",
    url: "https://arxiv.org/abs/1810.04805",
    citationCount: 90000,
    source: "arXiv",
  },
  gpt3: {
    id: "brown2020",
    title: "Language Models are Few-Shot Learners",
    authors: [
      "Tom B. Brown",
      "Benjamin Mann",
      "Nick Ryder",
      "Melanie Subbiah",
      "Jared Kaplan",
    ],
    year: 2020,
    abstract:
      "GPT-3 with 175 billion parameters achieves strong few-shot performance on many NLP datasets, sometimes matching fine-tuned models.",
    journal: "Advances in Neural Information Processing Systems (NeurIPS)",
    url: "https://arxiv.org/abs/2005.14165",
    citationCount: 50000,
    source: "arXiv",
  },
  rag: {
    id: "lewis2020",
    title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
    authors: [
      "Patrick Lewis",
      "Ethan Perez",
      "Aleksandra Piktus",
      "Fabio Petroni",
      "Vladimir Karpukhin",
    ],
    year: 2020,
    abstract:
      "We introduce retrieval-augmented generation (RAG) models combining pre-trained parametric and non-parametric memory for language generation.",
    journal: "Advances in Neural Information Processing Systems (NeurIPS)",
    url: "https://arxiv.org/abs/2005.11401",
    citationCount: 12000,
    source: "arXiv",
  },
  resnet: {
    id: "he2016",
    title: "Deep Residual Learning for Image Recognition",
    authors: ["Kaiming He", "Xiangyu Zhang", "Shaoqing Ren", "Jian Sun"],
    year: 2016,
    abstract:
      "We present a residual learning framework to ease training of networks substantially deeper than those previously used, winning ILSVRC 2015.",
    journal: "CVPR 2016",
    doi: "10.1109/CVPR.2016.90",
    url: "https://arxiv.org/abs/1512.03385",
    citationCount: 170000,
    source: "arXiv",
  },
  word2vec: {
    id: "mikolov2013",
    title:
      "Distributed Representations of Words and Phrases and their Compositionality",
    authors: [
      "Tomas Mikolov",
      "Ilya Sutskever",
      "Kai Chen",
      "Greg Corrado",
      "Jeffrey Dean",
    ],
    year: 2013,
    abstract:
      "Extensions to the Skip-gram model improve quality and speed of word vector training, enabling phrase representations.",
    journal: "Advances in Neural Information Processing Systems (NeurIPS)",
    url: "https://arxiv.org/abs/1310.4546",
    citationCount: 35000,
    source: "arXiv",
  },
  gans: {
    id: "goodfellow2014",
    title: "Generative Adversarial Networks",
    authors: [
      "Ian Goodfellow",
      "Jean Pouget-Abadie",
      "Mehdi Mirza",
      "Bing Xu",
      "David Warde-Farley",
      "Sherjil Ozair",
      "Aaron Courville",
      "Yoshua Bengio",
    ],
    year: 2014,
    abstract:
      "We propose a generative model framework via adversarial training between a generator and discriminator network.",
    journal: "Advances in Neural Information Processing Systems (NeurIPS)",
    url: "https://arxiv.org/abs/1406.2661",
    citationCount: 60000,
    source: "arXiv",
  },
  adam: {
    id: "kingma2015",
    title: "Adam: A Method for Stochastic Optimization",
    authors: ["Diederik P. Kingma", "Jimmy Ba"],
    year: 2015,
    abstract:
      "We introduce Adam, an algorithm for first-order gradient-based optimization of stochastic objective functions based on adaptive estimates of lower-order moments.",
    journal: "ICLR 2015",
    url: "https://arxiv.org/abs/1412.6980",
    citationCount: 130000,
    source: "arXiv",
  },
};

function getFoundationalPapers(query: string): Paper[] {
  const matched: Paper[] = [];
  if (
    /attention.*transformer|transformer.*attention|self.?attention|multi.?head|query key value|scaled dot|how.*transformer|transformer.*work/i.test(
      query,
    )
  )
    matched.push(STATIC_PAPERS["attention-transformer"]);
  if (
    /\bbert\b|bidirectional.*transformer|masked.*language.*model/i.test(query)
  )
    matched.push(STATIC_PAPERS["bert"]);
  if (/gpt.?3|few.?shot.*language model/i.test(query))
    matched.push(STATIC_PAPERS["gpt3"]);
  if (/\brag\b|retrieval.?augmented generation/i.test(query))
    matched.push(STATIC_PAPERS["rag"]);
  if (/\bresnet\b|residual.*learning|deep residual/i.test(query))
    matched.push(STATIC_PAPERS["resnet"]);
  if (
    /word2vec|word embeddings|skip.?gram|distributed representations.*words/i.test(
      query,
    )
  )
    matched.push(STATIC_PAPERS["word2vec"]);
  if (/\bgan\b|generative adversarial|goodfellow/i.test(query))
    matched.push(STATIC_PAPERS["gans"]);
  if (/\badam\b|adam optimizer|adaptive.*moment/i.test(query))
    matched.push(STATIC_PAPERS["adam"]);
  return matched;
}

// =============================================================
// SECTION 13 — ROBUST DEDUPLICATION  (v5 NEW)
//
// A paper is a duplicate if ANY of these match:
//   1. Semantic Scholar paperId
//   2. Normalised DOI
//   3. arXiv ID (extracted from URL or id field)
//   4. Normalised URL
//   5. Normalised title (first 60 alphanum chars)
// =============================================================

function extractArxivId(s: string): string | null {
  const m = s.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)/i);
  return m ? m[1].replace(/v\d+$/, "") : null;
}

class PaperDeduplicator {
  private ids = new Set<string>();
  private dois = new Set<string>();
  private arxivIds = new Set<string>();
  private urls = new Set<string>();
  private titles = new Set<string>();

  isDuplicate(paper: Paper): boolean {
    const titleKey = paper.title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 60);
    const doiKey = paper.doi
      ? paper.doi
          .toLowerCase()
          .replace(/^https?:\/\/doi\.org\//i, "")
          .trim()
      : null;
    const arxivId =
      (paper.url ? extractArxivId(paper.url) : null) ??
      extractArxivId(paper.id ?? "");
    const urlKey = paper.url
      ? paper.url
          .replace(/^https?:\/\/(www\.)?/, "")
          .replace(/\/$/, "")
          .toLowerCase()
      : null;
    const idKey =
      paper.id && !paper.id.startsWith("pubmed-") && paper.id.length > 10
        ? paper.id
        : null;

    if (idKey && this.ids.has(idKey)) return true;
    if (doiKey && this.dois.has(doiKey)) return true;
    if (arxivId && this.arxivIds.has(arxivId)) return true;
    if (urlKey && urlKey.length > 10 && this.urls.has(urlKey)) return true;
    if (titleKey && this.titles.has(titleKey)) return true;

    // Register all keys
    if (idKey) this.ids.add(idKey);
    if (doiKey) this.dois.add(doiKey);
    if (arxivId) this.arxivIds.add(arxivId);
    if (urlKey && urlKey.length > 10) this.urls.add(urlKey);
    if (titleKey) this.titles.add(titleKey);
    return false;
  }
}

// =============================================================
// SECTION 14 — DOMAIN & NOISE FILTERS  (v5: surgical precision)
// =============================================================

const JUNK_PATTERNS = [
  /differential evolution.*mechanism|mechanism.*differential evolution/i,
  /spherical.*4r mechanism|planar mechanism/i,
  /torsion balance|electric charge.*gravity/i,
  /speed.?adaptive.*vehicle|connected.*automated vehicle/i,
  /handwritten character recognition|bank cheque/i,
  /emoatt|emotion intensity.*shared task/i,
  /eye blink detection/i,
  /energy.*forecast.*transformer|transformer.*energy forecast/i,
  /absolute pose regression.*transformer/i,
  /ghost imaging.*gradient/i,
  /deep dyslexia|connectionist neuropsychology/i,
  /babylonian journal/i,
];

const DOMAIN_BLOCKS: Array<{ pattern: RegExp; exemptTrigger: RegExp }> = [
  {
    pattern:
      /chemical engineering|process engineering|AIChE|reaction kinetics/i,
    exemptTrigger: /chemical|reaction|process engineer/i,
  },
  {
    pattern:
      /vehicle routing problem|3d component packing|bin packing.*NP.?hard/i,
    exemptTrigger: /packing|routing|combinatorial optimization/i,
  },
  {
    pattern:
      /postoperative delirium|intraoperative.*anesthesia|surgical complication/i,
    exemptTrigger: /medical|clinical|surgery|hospital/i,
  },
  {
    pattern: /FPGA.*accelerat|field.?programmable.*gate.*array.*design|ReRAM/i,
    exemptTrigger: /hardware|FPGA|chip|accelerat/i,
  },
  {
    pattern:
      /mechanical engineering.*design|civil engineering|structural.*finite element/i,
    exemptTrigger: /mechanical|civil|structural engineer/i,
  },
  {
    pattern: /quantum computing|qubit.*error|fault.?tolerant quantum circuit/i,
    exemptTrigger: /quantum/i,
  },
];

function isMLQuery(q: string): boolean {
  return /transformer|attention|bert|gpt|llm|neural|deep learning|embedding|gradient|backprop|optimizer|reinforcement|machine learning|computer vision|natural language|NLP/i.test(
    q,
  );
}

function passesAllFilters(paper: Paper, originalQuery: string): boolean {
  const text = `${paper.title} ${paper.abstract ?? ""}`;

  // Junk patterns — always blocked
  if (JUNK_PATTERNS.some((p) => p.test(paper.title))) return false;

  // Domain blocks — only for ML queries
  if (isMLQuery(originalQuery)) {
    for (const { pattern, exemptTrigger } of DOMAIN_BLOCKS) {
      if (!exemptTrigger.test(originalQuery) && pattern.test(text))
        return false;
    }

    // Optimization query: must have ML keywords
    if (
      /gradient descent|sgd|backprop|optimizer|learning rate/i.test(
        originalQuery,
      )
    ) {
      const abs = (paper.abstract ?? "").toLowerCase();
      const mlKw = [
        "neural network",
        "deep learning",
        "machine learning",
        "training",
        "optimizer",
        "loss function",
        "stochastic gradient",
        "backpropagation",
      ];
      if (mlKw.filter((k) => abs.includes(k)).length < 2) return false;
    }

    // Citation threshold for ML queries
    if (
      paper.year &&
      paper.year < CURRENT_YEAR - 2 &&
      (paper.citationCount ?? 0) < 100
    )
      return false;
    if (
      paper.year &&
      paper.year >= CURRENT_YEAR - 2 &&
      (paper.citationCount ?? 0) < 25 &&
      paper.citationCount !== undefined
    )
      return false;
    if (paper.year && paper.year < 2000) return false;
  }

  return true;
}

// =============================================================
// SECTION 15 — UNIFIED SEARCH  (v5: + citation graph)
//
// Pipeline:
//   original → rewrite → expand + relatedQueries
//   → [SS, OA, arXiv, PubMed, static] all parallel
//   → citation graph for top SS papers
//   → robust dedup → domain filter → relevance gate
//   → score(originalQuery for boost) → top 15
// =============================================================

export async function searchAllWithPubMed(q: string): Promise<Paper[]> {
  // ① Rewrite — keep original for foundational boost
  const rewritten = await rewriteQuery(q);
  const keywords = extractKeywords(rewritten);

  // ② All primary fetches in parallel
  const [expandedRes, relatedRes, ssRes, oaRes, axRes, pmRes, foundRes] =
    await Promise.allSettled([
      expandQuery(rewritten, keywords),
      generateRelatedQueries(rewritten),
      withRetry(() => fetchSemanticScholar(rewritten)),
      withRetry(() => fetchOpenAlex(rewritten)),
      withRetry(() => fetchArXiv(rewritten)),
      withRetry(() => fetchPubMed(rewritten)),
      Promise.resolve(getFoundationalPapers(q)), // original query
    ]);

  const expandedQueries =
    expandedRes.status === "fulfilled" ? expandedRes.value : [];
  const relatedQueries =
    relatedRes.status === "fulfilled" ? relatedRes.value : [];
  const primarySS = ssRes.status === "fulfilled" ? ssRes.value : [];

  // ③ Citation graph for top 5 Semantic Scholar papers
  const ssIds = primarySS
    .filter((p) => p.id && p.id.length > 10 && !p.id.startsWith("pubmed-"))
    .slice(0, 5)
    .map((p) => p.id);

  const [extraResults, citationPapers] = await Promise.all([
    Promise.allSettled([
      ...expandedQueries.flatMap((eq) => [
        withRetry(() => fetchSemanticScholar(eq, 6)),
        withRetry(() => fetchOpenAlex(eq, 5)),
        withRetry(() => fetchArXiv(eq, 4)),
      ]),
      ...relatedQueries.flatMap((rq) => [
        withRetry(() => fetchSemanticScholar(rq, 5)),
        withRetry(() => fetchOpenAlex(rq, 4)),
      ]),
    ]),
    fetchCitationGraph(ssIds),
  ]);

  const all: Paper[] = [
    ...(foundRes.status === "fulfilled" ? foundRes.value : []),
    ...primarySS,
    ...(oaRes.status === "fulfilled" ? oaRes.value : []),
    ...(axRes.status === "fulfilled" ? axRes.value : []),
    ...(pmRes.status === "fulfilled" ? pmRes.value : []),
    ...extraResults.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
    ...citationPapers,
  ];

  // ④ Robust dedup + filter
  const dedup = new PaperDeduplicator();
  const filtered = all.filter((p) => {
    if (!p.title || !p.abstract) return false;
    if (p.abstract.split(" ").length < 10) return false;
    if (!passesAllFilters(p, q)) return false;
    if (dedup.isDuplicate(p)) return false;
    return true;
  });

  // ⑤ Relevance gate
  const origKw = extractKeywords(q);
  const qWords = [...new Set([...keywords, ...origKw])].filter(
    (w) => w.length > 3,
  );
  const relevant = filtered.filter((p) => {
    if (qWords.length === 0) return true;
    const title = (p.title ?? "").toLowerCase();
    const abs = (p.abstract ?? "").toLowerCase();
    return (
      qWords.filter((w) => title.includes(w)).length > 0 ||
      qWords.filter((w) => abs.includes(w)).length >= 2
    );
  });

  // ⑥ Score — pass ORIGINAL query for correct foundational boost
  return relevant
    .map((p) => ({ p, score: scorePaper(p, rewritten, qWords, q) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .map(({ p }) => p);
}

// =============================================================
// SECTION 16 — CHUNKING
// =============================================================

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
  keywordDensity: number;
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+(?=[A-Z0-9\("])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
}

export function chunkPapers(
  papers: Paper[],
  queryKeywords: string[] = [],
): Chunk[] {
  const chunks: Chunk[] = [];

  papers.forEach((paper, idx) => {
    const sentences = splitIntoSentences(paper.abstract);
    if (!sentences.length) return;

    let current: string[] = [];
    let currentWordCount = 0;

    const pushChunk = () => {
      if (current.length === 0) return;
      const text = current.join(" ");
      const textLower = text.toLowerCase();
      const keywordDensity = queryKeywords.filter((k) =>
        textLower.includes(k),
      ).length;
      chunks.push({
        paperId: paper.id,
        paperIdx: idx + 1,
        title: paper.title,
        source: paper.source,
        year: paper.year,
        text,
        url: paper.url,
        doi: paper.doi,
        authors: paper.authors,
        keywordDensity,
      });
    };

    for (const sentence of sentences) {
      const wordCount = sentence.split(/\s+/).length;
      if (currentWordCount + wordCount > CHUNK_SIZE && current.length > 0) {
        pushChunk();
        const overlapWords = current
          .join(" ")
          .split(/\s+/)
          .slice(-CHUNK_OVERLAP);
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

// =============================================================
// SECTION 17 — HYBRID CHUNK RANKING  (v5: async, real embeddings)
//
// Score = 0.35 × normBM25
//       + 0.55 × cosineSimilarity   ← real embeddings are much better
//       + 0.10 × normDensity
//
// getBatchEmbeddings() issues a single API call for query + all chunks.
// Falls back gracefully to TF-IDF if embedding API unavailable.
// =============================================================

const K1 = 1.5;
const B = 0.75;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

export async function rankChunks(
  query: string,
  chunks: Chunk[],
  topK = TOP_K_CHUNKS,
): Promise<Chunk[]> {
  if (!chunks.length) return [];

  const qTokens = new Set(tokenize(query));
  const avgLen =
    chunks.reduce((s, c) => s + c.text.split(/\s+/).length, 0) / chunks.length;

  const idf: Record<string, number> = {};
  for (const t of qTokens) {
    const df = chunks.filter((c) => c.text.toLowerCase().includes(t)).length;
    idf[t] = df > 0 ? Math.log((chunks.length - df + 0.5) / (df + 0.5) + 1) : 0;
  }

  // ── Build vocabulary for TF-IDF fallback ─────────────────
  const allTokenCounts: Record<string, number> = {};
  for (const chunk of chunks)
    for (const t of tokenize(chunk.text))
      allTokenCounts[t] = (allTokenCounts[t] ?? 0) + 1;
  const vocabulary: string[] = [
    ...qTokens,
    ...Object.entries(allTokenCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 150)
      .map(([t]) => t),
  ].filter((v, i, a) => a.indexOf(v) === i);

  // ── Batch embeddings (query + all chunks in one call) ─────
  const allTexts = [query, ...chunks.map((c) => c.text)];
  let embeddings: number[][];
  try {
    embeddings = await getBatchEmbeddings(allTexts, vocabulary);
  } catch {
    embeddings = allTexts.map(() => []);
  }
  const queryEmb = embeddings[0] ?? [];
  const chunkEmbeddings = embeddings.slice(1);

  // ── BM25 + semantic scoring ───────────────────────────────
  let maxBM25 = 1e-9,
    maxDensity = 1;

  const rawScores = chunks.map((chunk, idx) => {
    const words = chunk.text.split(/\s+/);
    const tf: Record<string, number> = {};
    for (const w of words) {
      const t = w.toLowerCase().replace(/[^a-z0-9]/g, "");
      tf[t] = (tf[t] ?? 0) + 1;
    }

    let bm25 = 0;
    for (const t of qTokens) {
      const f = tf[t] ?? 0;
      bm25 +=
        (idf[t] * f * (K1 + 1)) /
        (f + K1 * (1 - B + B * (words.length / avgLen)));
    }

    const titleToks = new Set(tokenize(chunk.title));
    const titleOverlap = [...qTokens].filter((t) => titleToks.has(t)).length;
    if (titleOverlap > 0) bm25 *= 1 + 0.15 * Math.min(titleOverlap, 3);
    if (chunk.year && chunk.year >= 2020) bm25 *= 1.05;

    if (bm25 > maxBM25) maxBM25 = bm25;
    const density = chunk.keywordDensity ?? 0;
    if (density > maxDensity) maxDensity = density;

    const chunkEmb = chunkEmbeddings[idx] ?? [];
    const semantic =
      queryEmb.length > 0 && chunkEmb.length > 0
        ? cosineSimilarity(queryEmb, chunkEmb)
        : 0;

    return { chunk, bm25, semantic };
  });

  // v5: 0.35 BM25 + 0.55 cosine + 0.10 density
  const scored = rawScores.map(({ chunk, bm25, semantic }) => ({
    chunk,
    score:
      0.35 * (bm25 / maxBM25) +
      0.55 * semantic +
      0.1 * ((chunk.keywordDensity ?? 0) / maxDensity),
  }));

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

// =============================================================
// SECTION 18 — LLM RE-RANKER
// =============================================================

export async function rerankChunks(
  query: string,
  chunks: Chunk[],
  topN = 8,
): Promise<Chunk[]> {
  if (chunks.length <= topN) return chunks;

  const fingerprint = hashString(
    query +
      chunks.map((c) => c.title).join("|") +
      chunks.map((c) => c.text.slice(0, 80)).join("|"),
  );
  const cacheKey = `rerank:${fingerprint}`;
  const cached = rerankCache.get(cacheKey);
  if (cached) return cached;

  try {
    const items = chunks
      .map((c, i) => {
        const authors = c.authors?.length
          ? c.authors.slice(0, 2).join(", ") +
            (c.authors.length > 2 ? " et al." : "")
          : "";
        return (
          `[${i}] "${c.title}" (${c.year ?? "n.d."}${authors ? " | " + authors : ""})\n` +
          c.text.slice(0, 450)
        );
      })
      .join("\n---\n");

    const r = await ant.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 240,
      system:
        "You are a relevance scoring expert for academic research. Score each chunk 0-10 based on how directly it answers the query. Return only valid JSON.",
      messages: [
        {
          role: "user",
          content: `Query: "${query}"\n\nScore each chunk 0-10.\nReturn ONLY a JSON object: {"0": score, "1": score, ...}\n\nChunks:\n${items}`,
        },
      ],
    });

    const b = r.content[0];
    if (b.type !== "text") return chunks.slice(0, topN);

    const scores = JSON.parse(
      b.text
        .trim()
        .replace(/```json|```/g, "")
        .trim(),
    ) as Record<string, number>;
    const result = chunks
      .map((chunk, i) => ({
        chunk,
        score:
          typeof scores[String(i)] === "number"
            ? scores[String(i)]
            : (chunks.length - i) * 0.1,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
      .map((s) => s.chunk);

    rerankCache.set(cacheKey, result, 5 * 60 * 1000);
    return result;
  } catch {
    return chunks.slice(0, topN);
  }
}

// =============================================================
// SECTION 19 — CONTEXT BUILDER
// =============================================================

export function buildRAGContext(
  topChunks: Chunk[],
  queryKeywords: string[] = [],
): string {
  return topChunks
    .map((c, i) => {
      let authorStr = "";
      if (c.authors && c.authors.length > 0) {
        const firstName = c.authors[0];
        const lastName = firstName.includes(" ")
          ? firstName.split(" ").pop()!
          : firstName;
        authorStr =
          c.authors.length > 1 ? ` | ${lastName} et al.` : ` | ${lastName}`;
      }

      let chunkText = c.text;
      if (queryKeywords.length > 0) {
        const sentences = c.text
          .split(/(?<=[.?!])\s+/)
          .filter((s) => s.length > 10);
        const kwLower = queryKeywords.map((k) => k.toLowerCase());
        const withKw = sentences.filter((s) =>
          kwLower.some((k) => s.toLowerCase().includes(k)),
        );
        const withoutKw = sentences.filter(
          (s) => !kwLower.some((k) => s.toLowerCase().includes(k)),
        );
        chunkText = [...withKw, ...withoutKw].join(" ");
      }

      return (
        `[Chunk ${i + 1} | Ref ${c.paperIdx}: "${c.title}" (${c.source}, ${c.year ?? "n.d."})${authorStr}]\n` +
        chunkText +
        (c.url ? `\nURL: ${c.url}` : "") +
        (c.doi ? `\nDOI: https://doi.org/${c.doi}` : "")
      );
    })
    .join("\n\n---\n\n");
}

// =============================================================
// SECTION 20 — ANSWER VERIFICATION
// =============================================================

export async function verifyAnswer(
  answer: string,
  context: string,
): Promise<string> {
  if (answer.split(" ").length < 80) return answer;

  try {
    const r = await ant.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      system: `You are an academic answer verifier. Your task:
1. Remove any 📄 citation cards that reference papers NOT mentioned in the provided context.
2. Remove fabricated URLs, DOIs, or author names absent from the context.
3. Mark claims unsupported by context with "(From general knowledge)" — do NOT delete them.
4. Preserve the original section structure, headings, and all supported content exactly.
5. Never add new content or alter correct, well-supported claims.
Return the cleaned answer only. If the answer is already accurate, return it unchanged.`,
      messages: [
        {
          role: "user",
          content: `## RETRIEVED CONTEXT (ground truth):\n${context.slice(0, 8000)}\n\n---\n\n## ANSWER TO VERIFY:\n${answer}\n\n---\n\nReturn the verified answer. Preserve structure. Only remove hallucinated citations.`,
        },
      ],
    });

    const b = r.content[0];
    if (b.type !== "text" || !b.text.trim()) return answer;
    const verified = b.text.trim();
    if (verified.split(/\s+/).length < answer.split(/\s+/).length * 0.5)
      return answer;
    return verified;
  } catch {
    return answer;
  }
}

// =============================================================
// SECTION 21 — RAG SYSTEM PROMPT
// =============================================================

const RAG_SYSTEM = `You are Researchly, an expert academic research assistant for Indian students and researchers.
You ONLY help with academic, research, and study topics.

RULE 1 — MANDATORY RESPONSE STRUCTURE
Every research answer MUST use these 6 sections in order:
1. ## Overview
2. ## Key Concepts
3. ## System Architecture  ← always include ASCII diagram (Rule 4)
4. ## Technical Details or Comparison  ← include table when comparing (Rule 5)
5. ## Limitations
6. ## Key Takeaways  +  ## What To Search Next

DO NOT create a "## Key Research Papers" section — citations appear INLINE throughout the answer.

RULE 2 — INLINE CITATIONS (HIGHEST PRIORITY RULE)
Insert a 📄 citation card IMMEDIATELY after EVERY factual sentence.

FORMAT:
> 📄 **Paper:** <title>
> **Authors:** <up to 3, then et al.>
> **Year:** <year>
> **Source:** <source>
> **Link:** <URL or "Not available">
> **Key Contribution:** <one sentence>

PATTERN: [sentence] → [card] → [sentence] → [card]. Never break this pattern.

RULE 3 — HANDLING MISSING CONTEXT
Never fabricate citations. Use "(From general knowledge)" for well-known facts not in metadata.

RULE 4 — MANDATORY ASCII DIAGRAMS for any AI system, architecture, pipeline, or workflow.

RULE 5 — COMPARISON TABLES when comparing 2+ models:
| Model | Time Complexity | Memory | Strengths | Limitations |

RULE 6 — NO OVERCONFIDENT CLAIMS. Provide context and scope.

RULE 7 — RESEARCH-USEFUL OUTPUT. Focus on key innovations, mechanisms, limitations, applications.

RULE 8 — FOUNDATIONAL PAPERS FIRST. Cite the original paper before any derivative.
Priority: Foundational → Major improvement → Benchmark/evaluation

RULE 10 — CITATION SAFETY — HARD RULES:
  - MAXIMUM 3–5 total citations per answer. NEVER exceed 5.
  - Cite ONLY papers from the FULL PAPER METADATA section. NEVER invent paper details.
  - If a foundational paper is NOT in metadata: write "(From general knowledge)" as Source, "Not available" as Link.
  - Never produce large lists of loosely related references.

WRITING RULES
- Never start with filler phrases.
- Bold **key terms** on first use.
- Research: 600–900 words. Study: 400–600 words.
- End with ## What To Search Next (3 query suggestions).`;

// =============================================================
// SECTION 22 — RAG ANSWER GENERATOR
// =============================================================

export async function generateRAGAnswer(
  query: string,
  papers: Paper[],
  stream = false,
): Promise<string | AsyncIterable<string>> {
  const keywords = extractKeywords(query);
  const chunks = chunkPapers(papers, keywords);
  const bm25Chunks = await rankChunks(query, chunks); // v5: await (now async)
  const topChunks = await rerankChunks(query, bm25Chunks, 8);
  const ragCtx = buildRAGContext(topChunks, keywords);

  const qWords = [...new Set([...keywords])].filter((w) => w.length > 3);
  const scoredPapers = papers
    .slice(0, 25)
    .map((p) => ({ p, score: scorePaper(p, query, qWords, query) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ p }) => p);

  const paperList = scoredPapers
    .map(
      (p, i) =>
        `[REF-${i + 1}]\nTitle: "${p.title}"\nAuthors: ${p.authors.slice(0, 3).join(", ")}${p.authors.length > 3 ? " et al." : ""}\nYear: ${p.year ?? "n.d."}\nSource: ${p.source}\nJournal: ${p.journal ?? p.source}\nCitations: ${p.citationCount ?? "N/A"}\nLink: ${p.doi ? `https://doi.org/${p.doi}` : p.url ? p.url : "Not available"}`,
    )
    .join("\n\n");

  const userPrompt = `RESEARCH QUESTION: "${query}"

## EXTRACTED KEYWORDS
${keywords.slice(0, 10).join(", ")}

## RETRIEVED CONTEXT (top ${topChunks.length} chunks)
${ragCtx}

## FULL PAPER METADATA — CITE ONLY THESE PAPERS
(Never cite a paper not listed here. Never fabricate titles, authors, or links.)
${paperList}

CITATION INSTRUCTIONS:
1. Insert citation card IMMEDIATELY after every factual sentence.
2. Do NOT create a "References" section — all citations INLINE.
3. SAFETY: Only use metadata from above. Foundational papers not in list → "(From general knowledge)".
4. HARD LIMIT: 3–5 papers cited total. Quality over quantity.
5. PRIORITY: Foundational → Major improvement → Benchmark/evaluation.`;

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
  const rawAnswer = b.type === "text" ? b.text : "";
  return verifyAnswer(rawAnswer, ragCtx);
}

// =============================================================
// SECTION 23 — FULL-TEXT ENRICHMENT
// =============================================================

export async function enrichWithFullText(
  papers: Paper[],
  topN = 3,
): Promise<Paper[]> {
  const enriched = [...papers];
  let fetched = 0;

  for (let i = 0; i < enriched.length && fetched < topN; i++) {
    const p = enriched[i];
    if (!p.url || !p.url.includes(".pdf")) continue;
    try {
      const res = await withTimeout(fetch(p.url), 8000);
      if (!res.ok) continue;
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("pdf")) continue;
      enriched[i] = {
        ...p,
        abstract: p.abstract + " [Full text available at: " + p.url + "]",
      };
      fetched++;
    } catch {
      /* silently skip */
    }
  }
  return enriched;
}

// =============================================================
// EXPORTS
// =============================================================

export { searchAllWithPubMed as searchAll };
