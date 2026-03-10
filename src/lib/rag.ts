/**
 * RAG System — Researchly v6 (Major Upgrade)
 *
 * New in v6:
 * #1  ENHANCED EvidenceBlock — authors, citationCount, doi, inlineCite
 * #2  CLAIM VERIFICATION PASS — Claude Haiku checks each claim (0-10 support score)
 * #3  SECTION-AWARE CHUNKING — fetches intro/methods/results/conclusion from SS
 * #5  CITATION GRAPH INTELLIGENCE — centrality scoring + velocity + "Influential Papers"
 * #10 PAPER BADGES — Highly Cited, Foundational, Recent Breakthrough, Survey, Influential
 *
 * Preserved from v5:
 * - OpenAI text-embedding-3-small with TF-IDF fallback
 * - Hybrid BM25 + semantic chunk ranking
 * - 4-query expansion + multi-hop related queries
 * - In-memory TTL cache system
 * - Static foundational paper library
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  Paper,
  EvidenceBlock,
  PaperBadge,
  BadgedPaper,
  CitationGraphNode,
  SectionType,
} from "@/types";

// ── Constants ─────────────────────────────────────────────────
const CHUNK_SIZE = 300;
const CHUNK_OVERLAP = 80;
const TOP_K_CHUNKS = 15;
const MAX_CHUNKS_PER_PAPER = 4;
const FETCH_TIMEOUT = 9_000;
const CURRENT_YEAR = new Date().getFullYear();

const ant = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// =============================================================
// SECTION 1 — IN-MEMORY CACHE (unchanged from v5)
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
const embeddingCache = new MemoryCache<number[]>(2000);
const citationGraphCache = new MemoryCache<Paper[]>(200);
const sectionCache = new MemoryCache<Record<string, string>>(200); // v6 NEW
const centralityCache = new MemoryCache<CitationGraphNode[]>(100); // v6 NEW

// =============================================================
// SECTION 2 — UTILITIES (unchanged)
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
// SECTION 3 — KEYWORD EXTRACTION (unchanged)
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
// SECTION 4 — INLINE CITATION FORMATTER  (v6 NEW — Upgrade #1)
//
// Generates "Author et al. (Year)" strings for the answer body.
// Rules:
//   1 author  → "Smith (2021)"
//   2 authors → "Smith & Jones (2021)"
//   3+ authors → "Smith et al. (2021)"
// =============================================================

export function formatInlineCite(
  authors: string[],
  year: number | null,
): string {
  const y = year ?? "n.d.";
  if (!authors.length) return `(${y})`;

  const lastName = (name: string) => name.trim().split(" ").pop() ?? name;

  if (authors.length === 1) return `${lastName(authors[0])} (${y})`;
  if (authors.length === 2)
    return `${lastName(authors[0])} & ${lastName(authors[1])} (${y})`;
  return `${lastName(authors[0])} et al. (${y})`;
}

// =============================================================
// SECTION 5 — PAPER BADGE SYSTEM  (v6 NEW — Upgrade #10)
//
// Assigns credibility badges to papers based on:
//   - Citation count thresholds
//   - Title patterns (survey detection)
//   - Year + velocity (recent breakthroughs)
//   - Known foundational paper IDs
//   - Venue quality
//   - Open access availability
// =============================================================

const HIGH_VENUE_RE =
  /\b(nature|science|neurips|nips|icml|acl|cvpr|iclr|emnlp|naacl|iccv|eccv|aaai|ijcai|cell|lancet|nejm|jama|bmj|ieee transactions|pnas)\b/i;

const SURVEY_TITLE_RE =
  /\b(survey|review|overview|tutorial|comprehensive|systematic review|recent advances|trends in|progress in|landscape of)\b/i;

export function assignBadges(paper: Paper): PaperBadge[] {
  const badges: PaperBadge[] = [];
  const citations = paper.citationCount ?? 0;
  const year = paper.year ?? 0;

  // Highly Cited
  if (citations >= 5000) badges.push("highly-cited");

  // Foundational (in our static library)
  if (STATIC_PAPER_IDS.has(paper.id)) badges.push("foundational");

  // Recent Breakthrough — high citation velocity for a new paper
  if (year >= CURRENT_YEAR - 2 && citations >= 500)
    badges.push("recent-breakthrough");

  // Survey Paper
  if (SURVEY_TITLE_RE.test(paper.title)) badges.push("survey-paper");

  // Influential — based on graph centrality if computed
  if ((paper.graphCentrality ?? 0) >= 0.6) badges.push("influential");

  // Open Access
  if (paper.url) badges.push("open-access");

  // Peer Reviewed (known top venue)
  if (HIGH_VENUE_RE.test(`${paper.journal ?? ""} ${paper.source ?? ""}`))
    badges.push("peer-reviewed");

  return badges;
}

export function badgePapers(papers: Paper[]): BadgedPaper[] {
  return papers.map((p) => ({ ...p, badges: assignBadges(p) }));
}

// Badge display labels for the UI
export const BADGE_LABELS: Record<
  PaperBadge,
  { label: string; color: string }
> = {
  "highly-cited": { label: "Highly Cited", color: "blue" },
  foundational: { label: "Foundational", color: "purple" },
  "recent-breakthrough": { label: "Recent Breakthrough", color: "green" },
  "survey-paper": { label: "Survey Paper", color: "yellow" },
  influential: { label: "Influential", color: "orange" },
  "open-access": { label: "Open Access", color: "teal" },
  "peer-reviewed": { label: "Peer Reviewed", color: "gray" },
};

// =============================================================
// SECTION 6 — CITATION GRAPH INTELLIGENCE  (v6 — Upgrade #5)
//
// Computes PageRank-style centrality for retrieved papers.
// Uses in-degree (citations received) as proxy for importance.
// Also estimates citation velocity from Semantic Scholar.
// =============================================================

export async function computeGraphCentrality(
  papers: Paper[],
): Promise<Paper[]> {
  if (!papers.length) return papers;
  const cacheKey = `centrality:${papers
    .map((p) => p.id)
    .sort()
    .join(",")}`;
  const cached = centralityCache.get(cacheKey);
  if (cached) {
    // Apply cached centrality scores
    const scoreMap = new Map(cached.map((n) => [n.paper_id, n]));
    return papers.map((p) => ({
      ...p,
      graphCentrality: scoreMap.get(p.id)?.centrality ?? 0,
      citationVelocity: scoreMap.get(p.id)?.velocity ?? 0,
    }));
  }

  const maxCitations = Math.max(...papers.map((p) => p.citationCount ?? 0), 1);

  // Iterative PageRank (2 iterations is enough for small graphs)
  let scores = new Map(papers.map((p) => [p.id, 1.0 / papers.length]));
  const dampening = 0.85;

  for (let iter = 0; iter < 3; iter++) {
    const newScores = new Map<string, number>();
    for (const paper of papers) {
      // Base score from normalized citation count
      const citScore = (paper.citationCount ?? 0) / maxCitations;
      // Incoming link score (papers that cite this paper)
      const inbound = papers
        .filter((p) => p.id !== paper.id)
        .reduce((sum, p) => {
          // Approximate: if p has many citations, it's more likely to cite paper
          const weight =
            (scores.get(p.id) ?? 0) *
            ((paper.citationCount ?? 0) / maxCitations);
          return sum + weight;
        }, 0);
      newScores.set(
        paper.id,
        (1 - dampening) / papers.length +
          dampening * (citScore * 0.7 + inbound * 0.3),
      );
    }
    scores = newScores;
  }

  // Normalize to [0, 1]
  const maxScore = Math.max(...scores.values(), 1e-9);

  const nodes: CitationGraphNode[] = papers.map((p) => ({
    paper_id: p.id,
    in_degree: p.citationCount ?? 0,
    out_degree: 0,
    centrality: (scores.get(p.id) ?? 0) / maxScore,
    velocity: estimateVelocity(p),
  }));

  centralityCache.set(cacheKey, nodes, 15 * 60 * 1000);

  return papers.map((p) => {
    const node = nodes.find((n) => n.paper_id === p.id);
    return {
      ...p,
      graphCentrality: node?.centrality ?? 0,
      citationVelocity: node?.velocity ?? 0,
    };
  });
}

function estimateVelocity(paper: Paper): number {
  if (!paper.year || !paper.citationCount) return 0;
  const age = Math.max(1, CURRENT_YEAR - paper.year);
  // Annual citation rate — recent papers with high citations have high velocity
  return paper.citationCount / age;
}

// "Influential Papers" categorisation — returns a named map [Upgrade #5]
export interface PaperCategories {
  mostInfluential: Paper[];
  foundational: Paper[];
  recentBreakthroughs: Paper[];
  surveyPapers: Paper[];
}

export function categorizePapers(papers: BadgedPaper[]): PaperCategories {
  return {
    mostInfluential: papers
      .filter(
        (p) =>
          p.badges.includes("influential") || p.badges.includes("highly-cited"),
      )
      .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
      .slice(0, 3),
    foundational: papers.filter((p) => p.badges.includes("foundational")),
    recentBreakthroughs: papers.filter((p) =>
      p.badges.includes("recent-breakthrough"),
    ),
    surveyPapers: papers.filter((p) => p.badges.includes("survey-paper")),
  };
}

// =============================================================
// SECTION 7 — SECTION-AWARE PAPER FETCHING  (v6 NEW — Upgrade #3)
//
// Attempts to fetch full-text sections from Semantic Scholar.
// Falls back to abstract-only gracefully.
// Sections fetched: abstract, tldr, introduction (~methods/results inferred)
// =============================================================

async function fetchPaperSections(
  paperId: string,
): Promise<Record<string, string> | null> {
  const cacheKey = `sections:${paperId}`;
  const cached = sectionCache.get(cacheKey);
  if (cached) return cached;

  // Skip static/non-SS paper IDs
  if (!paperId || paperId.length < 10 || paperId.startsWith("pubmed-"))
    return null;
  if (
    [
      "vaswani2017",
      "devlin2019",
      "brown2020",
      "raffel2020",
      "lewis2020",
      "he2016",
      "mikolov2013",
      "goodfellow2014",
      "kingma2015",
      "radford2018",
    ].includes(paperId)
  )
    return null;

  try {
    const url =
      `https://api.semanticscholar.org/graph/v1/paper/${paperId}` +
      `?fields=title,sections,tldr,abstract`;
    const data = (await withTimeout(
      fetch(url).then((r) => r.json()),
      8_000,
    )) as any;

    const sections: Record<string, string> = {};

    // TLDR provides a high-quality 1-sentence summary
    if (data.tldr?.text) sections["tldr"] = data.tldr.text;

    // Full sections if available (limited availability in public API)
    if (Array.isArray(data.sections)) {
      for (const sec of data.sections as {
        heading?: string;
        content?: string;
      }[]) {
        const heading = (sec.heading ?? "").toLowerCase();
        const content = (sec.content ?? "").slice(0, 1500);
        if (!content) continue;

        if (/intro/i.test(heading)) sections["introduction"] = content;
        else if (/method|approach|architecture/i.test(heading))
          sections["methods"] = content;
        else if (/result|experiment|eval/i.test(heading))
          sections["results"] = content;
        else if (/conclusion|summary/i.test(heading))
          sections["conclusion"] = content;
        else if (/discussion/i.test(heading)) sections["discussion"] = content;
      }
    }

    if (Object.keys(sections).length > 0) {
      sectionCache.set(cacheKey, sections, 30 * 60 * 1000);
      return sections;
    }
    return null;
  } catch {
    return null;
  }
}

// =============================================================
// SECTION 8 — EMBEDDING PROVIDER (unchanged from v5)
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

let _providerName: string | null = null;

function getActiveProvider(): "openai" | "tfidf" {
  if (_providerName) return _providerName as "openai" | "tfidf";
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  _providerName = hasOpenAI ? "openai" : "tfidf";
  console.log(
    hasOpenAI
      ? "[Researchly v6] Embedding: OpenAI text-embedding-3-small"
      : "[Researchly v6] Embedding: TF-IDF fallback",
  );
  return _providerName as "openai" | "tfidf";
}

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
    const vocab = vocabulary ?? buildVocabulary([text]);
    result = buildTFIDFVector(text, vocab);
  }
  embeddingCache.set(cacheKey, result, 30 * 60 * 1000);
  return result;
}

export async function getBatchEmbeddings(
  texts: string[],
  vocabulary?: string[],
): Promise<number[][]> {
  const provider = getActiveProvider();
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

export function generateEmbedding(
  text: string,
  vocabulary: string[],
): number[] {
  return buildTFIDFVector(text, vocabulary);
}

// =============================================================
// SECTION 9 — QUERY REWRITING & EXPANSION (unchanged from v5)
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
        { role: "user", content: `Rewrite for academic search:\n"${query}"` },
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
        "follow-up queries exploring different complementary aspects. " +
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

// v8: Rule-based query expansion seed — fires BEFORE the LLM expander.
// For well-known topic patterns, we inject high-quality expansions immediately
// so even if the LLM expander is slow/fails, we still get good queries.
// These target the "vocabulary gap" problem (user says "replace RNNs",
// papers say "self-attention advantages over recurrent networks").
function getRuleBasedExpansions(query: string): string[] {
  const q = query.toLowerCase();
  const seeds: string[] = [];

  if (/transformer.*replace.*rnn|why.*transformer|rnn.*vs.*transformer|attention.*vs.*recurrent/i.test(q)) {
    seeds.push(
      "self-attention advantages over recurrent neural networks",
      "attention mechanisms sequential modeling parallelization",
      "transformer architecture vs LSTM GRU sequence modeling",
    );
  }
  if (/\btransformer\b.*\b(work|architecture|mechanism|how)\b/i.test(q)) {
    seeds.push(
      "transformer architecture multi-head attention encoder decoder",
      "scaled dot product attention mechanism NLP",
    );
  }
  if (/\bbert\b.*\b(work|architecture|how|train)\b/i.test(q)) {
    seeds.push(
      "BERT masked language modeling pre-training fine-tuning",
      "bidirectional transformer representation learning",
    );
  }
  if (/\brag\b|retrieval.?augmented.*generat/i.test(q)) {
    seeds.push(
      "retrieval augmented generation knowledge-intensive NLP tasks",
      "dense passage retrieval open domain question answering",
    );
  }
  if (/\bllm\b|large language model/i.test(q)) {
    seeds.push(
      "large language model pre-training emergent capabilities",
      "scaling laws neural language models",
    );
  }

  return seeds.slice(0, 3);
}

async function expandQuery(
  query: string,
  keywords: string[],
): Promise<string[]> {
  const cacheKey = `expand:${query}`;
  const cached = queryExpansionCache.get(cacheKey);
  if (cached) return cached;

  // v8: prepend rule-based fast seeds
  const ruleBased = getRuleBasedExpansions(query);

  try {
    const kwHint =
      keywords.length > 0
        ? `Key technical terms: ${keywords.slice(0, 8).join(", ")}.`
        : "";
    const r = await ant.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 260,
      system: "You are an expert academic search query generator. " +
        "Focus on technical vocabulary that would appear in paper abstracts, NOT the user's casual phrasing.",
      messages: [
        {
          role: "user",
          content:
            `Generate 4 alternative academic search queries for: "${query}"\n${kwHint}\n\n` +
            `Each must use a DIFFERENT strategy:\n` +
            `1. FOUNDATIONAL: name the seminal paper or key author\n` +
            `2. TECHNICAL: use exact field terminology from paper abstracts\n` +
            `3. BROADER: wider umbrella topic\n` +
            `4. MECHANISM: focus on the core algorithm/mechanism\n\n` +
            `Return ONLY a valid JSON array of exactly 4 strings. No explanation, no markdown.`,
        },
      ],
    });
    const b = r.content[0];
    if (b.type !== "text") {
      const result = ruleBased;
      queryExpansionCache.set(cacheKey, result, 30 * 60 * 1000);
      return result;
    }
    const parsed = JSON.parse(
      b.text.trim().replace(/```json|```/g, "").trim(),
    ) as string[];
    const llmExpansions = Array.isArray(parsed) ? parsed.slice(0, 4) : [];
    // Merge: rule-based first (high precision) then LLM (broader coverage)
    const result = [...new Set([...ruleBased, ...llmExpansions])].slice(0, 6);
    queryExpansionCache.set(cacheKey, result, 30 * 60 * 1000);
    return result;
  } catch {
    queryExpansionCache.set(cacheKey, ruleBased, 30 * 60 * 1000);
    return ruleBased;
  }
}

// =============================================================
// SECTION 10 — FOUNDATIONAL PAPER BOOST
//
// v8 fixes:
// 1. Broadened trigger regex — "why did transformers replace RNNs" now fires
//    the transformer rule because the query contains the word "transformer".
//    Old regex required "attention.*transformer" — too narrow.
// 2. Boost value is now 2.0 (normalized units) instead of 5 (raw int).
//    In rerankPapersWithSemantic the final score is 0-1 range, so a
//    +2.0 additive boost guarantees foundational papers rank above noise.
// =============================================================

function foundationalBoost(paper: Paper, originalQuery: string): number {
  const q = originalQuery.toLowerCase();
  const title = paper.title.toLowerCase();

  // Each rule: trigger = fires if query matches, phrases = title substrings
  // boost = additive score bonus (in normalized 0-1 units, so 2.0 = guaranteed top)
  const RULES: Array<{ trigger: RegExp; phrases: string[]; boost: number }> = [
    {
      // v8: Broadened — matches "transformer", "why transformers", "replace RNN", etc.
      trigger:
        /\btransformer\b|attention.*mechanism|self.?attention|multi.?head|vaswani|replace.*rnn|rnn.*replace|encoder.*decoder.*attention|why.*transformer|how.*transformer|attention.*architecture/i,
      phrases: ["attention is all you need"],
      boost: 2.0,
    },
    {
      trigger:
        /\bbert\b|bidirectional.*transformer|masked.*language.*model|devlin|pre.?train.*nlp|language.*understanding/i,
      phrases: ["bert: pre-training of deep bidirectional transformers"],
      boost: 2.0,
    },
    {
      trigger: /\bgpt\b|\bgpt.?1\b|generative pre.?training|radford.*2018/i,
      phrases: ["improving language understanding by generative pre-training"],
      boost: 2.0,
    },
    {
      trigger:
        /gpt.?3|few.?shot.*language|language model.*few.?shot|brown.*2020|large language model.*few/i,
      phrases: ["language models are few-shot learners"],
      boost: 2.0,
    },
    {
      trigger: /\bt5\b|text.?to.?text|raffel|exploring.*limits.*transfer/i,
      phrases: [
        "exploring the limits of transfer learning with a unified text-to-text transformer",
      ],
      boost: 2.0,
    },
    {
      trigger: /\brag\b|retrieval.?augmented generation|retrieval.*llm|knowledge.*intensive/i,
      phrases: ["retrieval-augmented generation for knowledge-intensive"],
      boost: 2.0,
    },
    {
      trigger: /\bresnet\b|residual.*learning|deep residual|he.*kaiming|skip.*connection/i,
      phrases: ["deep residual learning for image recognition"],
      boost: 2.0,
    },
    {
      trigger: /\bgan\b|generative adversarial|goodfellow.*2014/i,
      phrases: ["generative adversarial networks"],
      boost: 2.0,
    },
    {
      trigger:
        /word2vec|word embeddings|skip.?gram|distributed representations.*words/i,
      phrases: ["distributed representations of words and phrases"],
      boost: 2.0,
    },
    {
      trigger: /\badam\b|adam optimizer|adaptive.*moment/i,
      phrases: ["adam: a method for stochastic optimization"],
      boost: 2.0,
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
// SECTION 11 — PAPER SCORING  (v8: all 6 improvements applied)
//
// Changes vs v7:
//   ① MIN_PAPER_RELEVANCE raised 0.08 → 0.15 (kills malware/security noise)
//   ② Formula rebalanced: 0.65 semantic / 0.25 citations / 0.10 recency
//      (academic papers should rank on relevance + impact, not freshness)
//   ③ Survey paper boost (+0.05 on score) when survey has ≥ 1k citations
//      and query asks for conceptual/overview explanation
//   ④ foundationalBoost now returns values in 0-2 range (matches score scale)
//      and is applied as a direct additive, NOT multiplied by 0.1 anymore
//   ⑤ Domain mismatch papers get score clamped to -1 (already handled in
//      passesAllFilters, but this is a safety net here too)
// =============================================================

// ① Raised from 0.08 — eliminates off-domain papers that have slight
//   embedding overlap (e.g. "network" appears in both NLP and security)
const MIN_PAPER_RELEVANCE = 0.15;

const HIGH_VENUE_RE_SCORE =
  /\b(nature|science|neurips|nips|icml|acl|cvpr|iclr|emnlp|naacl|iccv|eccv|aaai|ijcai|cell|lancet|nejm|jama|bmj|ieee transactions|pnas)\b/i;

const SURVEY_TITLE_RE_SCORE =
  /\b(survey|review|overview|tutorial|comprehensive|systematic review|recent advances|trends in|progress in|landscape of)\b/i;

// Queries that benefit from survey papers (explanatory / conceptual)
const SURVEY_HELPFUL_QUERY_RE =
  /\b(what is|how does|explain|overview|introduction|survey|review|compare|vs|versus|difference)\b/i;

function venueQuality(paper: Paper): number {
  return HIGH_VENUE_RE_SCORE.test(
    `${paper.journal ?? ""} ${paper.source ?? ""}`,
  )
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

// Legacy synchronous scorer (fallback when embeddings unavailable)
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
  const velocityScore = Math.log((paper.citationVelocity ?? 0) + 1) * 0.1;
  const centralityScore = (paper.graphCentrality ?? 0) * 0.1;

  // ② Updated weights
  let score =
    0.25 * citScore +
    0.10 * recency +
    0.20 * titleOvlp +
    0.20 * abstractOvlp +
    0.05 * venue +
    velocityScore +
    centralityScore;

  if (venue > 0) score *= 1.3;

  if (SURVEY_TITLE_RE_SCORE.test(paper.title)) {
    const citations = paper.citationCount ?? 0;
    if (citations >= 5000) score *= 0.7;
    else if (citations >= 1000) score *= 0.5;
    else score *= 0.3;
  }

  // ④ Fixed: foundationalBoost already returns 0-2, no extra scaling needed
  score += foundationalBoost(paper, originalQuery ?? rewrittenQuery);
  return score;
}

// Primary paper reranker — runs after initial retrieval
// All 6 improvements are active here.
export async function rerankPapersWithSemantic(
  papers: Paper[],
  query: string,
  originalQuery?: string,
): Promise<Paper[]> {
  if (!papers.length) return papers;

  // Foundational papers bypass the relevance threshold entirely
  // They are always included regardless of embedding similarity
  const foundational = papers.filter((p) => STATIC_PAPER_IDS.has(p.id));
  const regular = papers.filter((p) => !STATIC_PAPER_IDS.has(p.id));

  if (!regular.length) return papers;

  const texts = [
    query,
    ...regular.map((p) => `${p.title}. ${p.abstract}`.slice(0, 800)),
  ];

  let embeddings: number[][];
  try {
    embeddings = await getBatchEmbeddings(texts);
  } catch {
    return papers; // Graceful fallback
  }

  const queryEmb = embeddings[0] ?? [];
  if (queryEmb.length === 0) return papers;

  const maxCitations = Math.max(...regular.map((p) => p.citationCount ?? 0), 1);
  const isExplanatoryQuery = SURVEY_HELPFUL_QUERY_RE.test(originalQuery ?? query);

  const scored = regular.map((paper, i) => {
    const paperEmb = embeddings[i + 1] ?? [];
    const semantic =
      paperEmb.length > 0 ? cosineSimilarity(queryEmb, paperEmb) : 0;

    // ① Raise threshold — drop semantically irrelevant papers
    if (semantic < MIN_PAPER_RELEVANCE) return { paper, score: -1 };

    const normCitations =
      Math.log((paper.citationCount ?? 0) + 1) /
      Math.log(maxCitations + 1);
    const recency = recencyScore(paper);

    // ② Rebalanced formula: 0.65 semantic / 0.25 citations / 0.10 recency
    let score = 0.65 * semantic + 0.25 * normCitations + 0.10 * recency;

    // Top-venue bonus
    if (venueQuality(paper) > 0) score *= 1.15;

    // ③ Survey boost: high-citation surveys help explanatory queries
    if (SURVEY_TITLE_RE_SCORE.test(paper.title)) {
      const cit = paper.citationCount ?? 0;
      if (cit >= 1000 && isExplanatoryQuery) {
        score += 0.05; // useful survey for an "explain/overview" query
      } else if (cit >= 5000) {
        score *= 0.85; // highly cited survey — slight penalty to avoid crowding
      } else if (cit >= 1000) {
        score *= 0.70;
      } else {
        score *= 0.45; // low-citation survey likely off-topic filler
      }
    }

    // ④ Foundational boost — direct additive, no ×0.1 penalty
    // foundationalBoost returns 0 or 2.0, which puts canonical papers
    // comfortably ahead of any noise paper
    score += foundationalBoost(paper, originalQuery ?? query);

    return { paper, score };
  });

  const filtered = scored
    .filter((s) => s.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.paper);

  // Re-insert foundational papers at the front
  const dedup = new Set(filtered.map((p) => p.id));
  const foundationalToAdd = foundational.filter((p) => !dedup.has(p.id));

  return [...foundationalToAdd, ...filtered];
}

// =============================================================
// SECTION 11b — ANSWER QUALITY EVALUATOR  (v7 NEW — Upgrade #6)
//
// After generating an answer, Claude Haiku evaluates it on a 0-10
// scale across 4 dimensions:
//   - Relevance: does the answer address the actual question?
//   - Evidence: is every claim backed by retrieved chunks?
//   - Completeness: are major aspects of the topic covered?
//   - Clarity: is the answer well-structured and readable?
//
// If the overall score < QUALITY_THRESHOLD (7), the answer is
// regenerated once with a "fix" prompt listing specific issues.
// This mirrors production AI quality control systems.
// =============================================================

const QUALITY_THRESHOLD = 7;
const qualityEvalCache = new MemoryCache<number>(100);

export interface AnswerQualityResult {
  score: number; // 0–10
  relevance: number;
  evidence: number;
  completeness: number;
  clarity: number;
  issues: string[];
  passed: boolean;
}

export async function evaluateAnswerQuality(
  query: string,
  answer: string,
  evidenceContext: string,
): Promise<AnswerQualityResult> {
  const cacheKey = `quality:${hashString(query + answer.slice(0, 200))}`;
  const cached = qualityEvalCache.get(cacheKey);
  if (cached !== null) {
    return {
      score: cached,
      relevance: cached,
      evidence: cached,
      completeness: cached,
      clarity: cached,
      issues: [],
      passed: cached >= QUALITY_THRESHOLD,
    };
  }

  const answerSnippet = answer.slice(0, 2000);
  const contextSnippet = evidenceContext.slice(0, 2000);

  try {
    const r = await ant.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system:
        "You are an academic answer quality evaluator. " +
        "Given a question, evidence context, and a generated answer, " +
        "score the answer on 4 dimensions (0-10 each). " +
        "Return ONLY valid JSON with keys: relevance, evidence, completeness, clarity, issues (array of strings). " +
        "No markdown, no explanation.",
      messages: [
        {
          role: "user",
          content:
            `Question: "${query}"\n\n` +
            `Evidence (first 2000 chars): ${contextSnippet}\n\n` +
            `Answer (first 2000 chars): ${answerSnippet}\n\n` +
            `Score on:\n` +
            `- relevance (0-10): does the answer directly address the question?\n` +
            `- evidence (0-10): are claims grounded in the provided evidence?\n` +
            `- completeness (0-10): are major aspects of the topic covered?\n` +
            `- clarity (0-10): is the answer well-structured and easy to follow?\n` +
            `- issues: list up to 3 specific problems (empty array if score >= 7 on all)`,
        },
      ],
    });

    const b = r.content[0];
    if (b.type !== "text") throw new Error("no text");

    const parsed = JSON.parse(
      b.text.trim().replace(/```json|```/g, "").trim(),
    ) as {
      relevance: number;
      evidence: number;
      completeness: number;
      clarity: number;
      issues: string[];
    };

    const overall =
      (parsed.relevance + parsed.evidence + parsed.completeness + parsed.clarity) / 4;

    qualityEvalCache.set(cacheKey, overall, 5 * 60 * 1000);

    return {
      score: overall,
      relevance: parsed.relevance,
      evidence: parsed.evidence,
      completeness: parsed.completeness,
      clarity: parsed.clarity,
      issues: Array.isArray(parsed.issues) ? parsed.issues.slice(0, 3) : [],
      passed: overall >= QUALITY_THRESHOLD,
    };
  } catch {
    return {
      score: 8,
      relevance: 8,
      evidence: 8,
      completeness: 8,
      clarity: 8,
      issues: [],
      passed: true,
    };
  }
}

// =============================================================
// SECTION 12 — SOURCE FETCHERS (unchanged from v5)
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
// SECTION 13 — CITATION GRAPH RETRIEVAL (unchanged from v5)
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
      if (refResp.status === "fulfilled")
        for (const e of (refResp.value as any).data ?? []) {
          const p = mapPaper(e.citedPaper);
          if (p) papers.push(p);
        }
      if (citeResp.status === "fulfilled")
        for (const e of (citeResp.value as any).data ?? []) {
          const p = mapPaper(e.citingPaper);
          if (p) papers.push(p);
        }
    } catch {
      /* skip */
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
// SECTION 14 — STATIC FOUNDATIONAL PAPER LIBRARY (unchanged)
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
      "We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.",
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
      "We introduce BERT, designed to pre-train deep bidirectional representations from unlabeled text by jointly conditioning on both left and right context in all layers.",
    journal: "NAACL-HLT 2019",
    doi: "10.18653/v1/N19-1423",
    url: "https://arxiv.org/abs/1810.04805",
    citationCount: 90000,
    source: "arXiv",
  },
  gpt1: {
    id: "radford2018",
    title: "Improving Language Understanding by Generative Pre-Training",
    authors: [
      "Alec Radford",
      "Karthik Narasimhan",
      "Tim Salimans",
      "Ilya Sutskever",
    ],
    year: 2018,
    abstract:
      "We demonstrate that large gains on NLP tasks can be realized by generative pre-training of a language model on a diverse corpus of unlabeled text.",
    journal: "OpenAI Blog",
    url: "https://cdn.openai.com/research-covers/language-unsupervised/language_understanding_paper.pdf",
    citationCount: 10000,
    source: "OpenAI",
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
      "GPT-3 with 175 billion parameters achieves strong few-shot performance on many NLP datasets.",
    journal: "Advances in Neural Information Processing Systems (NeurIPS)",
    url: "https://arxiv.org/abs/2005.14165",
    citationCount: 50000,
    source: "arXiv",
  },
  t5: {
    id: "raffel2020",
    title:
      "Exploring the Limits of Transfer Learning with a Unified Text-to-Text Transformer",
    authors: [
      "Colin Raffel",
      "Noam Shazeer",
      "Adam Roberts",
      "Katherine Lee",
      "Sharan Narang",
      "Michael Matena",
      "Yanqi Zhou",
      "Wei Li",
      "Peter J. Liu",
    ],
    year: 2020,
    abstract:
      "We introduce a unified framework that converts every NLP problem into a text-to-text format.",
    journal: "Journal of Machine Learning Research",
    doi: "10.48550/arXiv.1910.10683",
    url: "https://arxiv.org/abs/1910.10683",
    citationCount: 20000,
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
      "We introduce Adam, an algorithm for first-order gradient-based optimization based on adaptive estimates of lower-order moments.",
    journal: "ICLR 2015",
    url: "https://arxiv.org/abs/1412.6980",
    citationCount: 130000,
    source: "arXiv",
  },
};

export const STATIC_PAPER_IDS: ReadonlySet<string> = new Set([
  "vaswani2017",
  "devlin2019",
  "radford2018",
  "brown2020",
  "raffel2020",
  "lewis2020",
  "he2016",
  "mikolov2013",
  "goodfellow2014",
  "kingma2015",
]);

function getFoundationalPapers(query: string): Paper[] {
  const matched: Paper[] = [];

  // v8: broadened triggers — now catches "why did transformers replace RNNs",
  // "transformer architecture", "how attention works", etc.
  if (
    /\btransformer\b|attention.*mechanism|self.?attention|multi.?head|query.*key.*value|scaled dot|how.*attention|replace.*rnn|encoder.*decoder.*attn|attention.*architecture/i.test(
      query,
    )
  )
    matched.push(STATIC_PAPERS["attention-transformer"]);

  if (
    /\bbert\b|bidirectional.*transformer|masked.*language.*model|pre.?train.*nlp|language.*understanding.*pre/i.test(query)
  )
    matched.push(STATIC_PAPERS["bert"]);

  if (/\bgpt\b|\bgpt.?1\b|generative pre.?training|radford.*2018/i.test(query))
    matched.push(STATIC_PAPERS["gpt1"]);

  if (/gpt.?3|few.?shot.*language model|large language model.*few|brown.*2020/i.test(query))
    matched.push(STATIC_PAPERS["gpt3"]);

  if (/\bt5\b|text.?to.?text|raffel|unified.*transfer.*learning/i.test(query))
    matched.push(STATIC_PAPERS["t5"]);

  if (/\brag\b|retrieval.?augmented generation|retrieval.*llm.*generat/i.test(query))
    matched.push(STATIC_PAPERS["rag"]);

  if (/\bresnet\b|residual.*learning|deep residual|skip.*connection.*image/i.test(query))
    matched.push(STATIC_PAPERS["resnet"]);

  if (/word2vec|word embeddings|skip.?gram/i.test(query))
    matched.push(STATIC_PAPERS["word2vec"]);

  if (/\bgan\b|generative adversarial|goodfellow/i.test(query))
    matched.push(STATIC_PAPERS["gans"]);

  if (/\badam\b|adam optimizer|adaptive.*moment/i.test(query))
    matched.push(STATIC_PAPERS["adam"]);

  // Comparison queries: inject all relevant foundational papers
  if (
    /compare.*bert.*gpt|bert.*vs.*gpt|gpt.*vs.*bert|bert.*gpt.*t5/i.test(query)
  ) {
    for (const key of ["attention-transformer", "bert", "gpt1", "gpt3", "t5"]) {
      if (!matched.find((p) => p.id === STATIC_PAPERS[key].id))
        matched.push(STATIC_PAPERS[key]);
    }
  }

  return matched;
}

// =============================================================
// SECTION 15 — DEDUPLICATION (unchanged from v5)
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

    if (idKey) this.ids.add(idKey);
    if (doiKey) this.dois.add(doiKey);
    if (arxivId) this.arxivIds.add(arxivId);
    if (urlKey && urlKey.length > 10) this.urls.add(urlKey);
    if (titleKey) this.titles.add(titleKey);
    return false;
  }
}

// =============================================================
// SECTION 16 — DOMAIN FILTERS  (v8: domain classifier + topic guard)
//
// Problem: NLP queries were getting malware detection, FPGA, CV papers.
// Solution:
//   1. JUNK_PATTERNS — hard regex blocks for known garbage titles
//   2. Domain classifier — detects query domain (NLP/CV/Security/etc.)
//   3. Domain guard — drops papers whose title/abstract signal a
//      completely different domain from the query
// =============================================================

const JUNK_PATTERNS = [
  /differential evolution.*mechanism/i,
  /spherical.*4r mechanism|planar mechanism/i,
  /handwritten character recognition|bank cheque/i,
  /eye blink detection/i,
  /ghost imaging.*gradient/i,
  // v8 NEW: additional known garbage patterns
  /malware.*detect|intrusion.*detect|network.*anomaly.*detect/i,
  /supply.?chain.*optim|inventory.*optim|logistics.*optim/i,
  /traffic.*flow.*predict|vehicle.*trajectory/i,
  /protein.*fold|drug.*discover|molecular.*dock/i,
  /power.*grid|smart.*grid|energy.*management.*system/i,
  /fault.*diagnos.*bearing|vibration.*signal.*fault/i,
  /solar.*panel|wind.*turbine.*predict/i,
];

// ── Domain taxonomy ──────────────────────────────────────────
// Each domain has:
//   querySignals  — regex that fires if the query is ABOUT this domain
//   paperSignals  — regex that fires if a paper BELONGS to this domain
//   incompatible  — list of other domains that should be excluded
//
// Logic:
//   detect query domain → drop papers whose domain is in incompatible list

type Domain =
  | "nlp"
  | "computer_vision"
  | "security"
  | "time_series"
  | "biomedical"
  | "hardware"
  | "general_ml"
  | "other";

interface DomainDef {
  querySignals: RegExp;
  paperSignals: RegExp;
  incompatible: Domain[];
}

const DOMAIN_DEFS: Record<Domain, DomainDef> = {
  nlp: {
    querySignals:
      /\b(transformer|attention|bert|gpt|llm|language model|rnn|lstm|seq2seq|nlp|natural language|text generation|machine translation|summarization|question answering|sentiment|tokeniz|embedding|word2vec|glove|rag|retrieval.*augment)\b/i,
    paperSignals:
      /\b(language model|text|nlp|natural language|transformer|attention|bert|gpt|sentiment|translation|summariz|question answer|tokeniz|word embed|seq2seq|dialogue|corpus|vocabulary|pretraining)\b/i,
    incompatible: ["security", "time_series", "biomedical", "hardware"],
  },
  computer_vision: {
    querySignals:
      /\b(image classif|object detect|segmentation|cnn|resnet|vgg|vision transformer|vit|image recognition|convolutional|yolo|depth estimation|pose estimation)\b/i,
    paperSignals:
      /\b(image|visual|pixel|convolution|cnn|resnet|segmentation|object detect|bounding box|feature map|pooling layer|vgg|inception|yolo|depth|pose)\b/i,
    incompatible: ["security", "time_series", "biomedical"],
  },
  security: {
    querySignals:
      /\b(malware|intrusion detect|cybersecurity|vulnerability|exploit|phishing|ransomware|botnet|network security|threat detect|anomaly detect.*network)\b/i,
    paperSignals:
      /\b(malware|intrusion|cybersecurity|vulnerability|exploit|phishing|ransomware|botnet|threat|cyberattack|network security|anomaly.*network|ids|ips)\b/i,
    incompatible: ["nlp", "computer_vision", "time_series", "biomedical"],
  },
  time_series: {
    querySignals:
      /\b(time series|forecasting|temporal|stock predict|weather predict|anomaly.*sensor|signal processing|sequence predict)\b/i,
    paperSignals:
      /\b(time series|temporal|forecasting|stock|weather predict|sensor.*anomaly|multivariate.*time|univariate)\b/i,
    incompatible: ["security", "biomedical", "hardware"],
  },
  biomedical: {
    querySignals:
      /\b(medical imaging|clinical|patient|diagnosis|drug|protein|genomic|ehr|electronic health|radiology|tumor|cancer|mri|ct scan)\b/i,
    paperSignals:
      /\b(clinical|patient|medical|diagnosis|drug|protein|genomic|ehr|radiology|tumor|cancer|mri|ct scan|biomedical|healthcare|hospital)\b/i,
    incompatible: ["security", "hardware"],
  },
  hardware: {
    querySignals:
      /\b(fpga|hardware accelerat|chip design|asic|neural.*processor|edge.*deploy|quantiz|pruning.*hardware)\b/i,
    paperSignals:
      /\b(fpga|hardware|chip|asic|silicon|processor|accelerat|energy.?efficient.*hardware|inference.*hardware)\b/i,
    incompatible: ["security", "biomedical", "time_series"],
  },
  general_ml: {
    querySignals: /\b(machine learning|deep learning|neural network|gradient|backprop|optimizer|loss function|overfitting|regularization)\b/i,
    paperSignals: /\b(machine learning|deep learning|neural network|gradient|backpropagation|optimizer|regularization|overfitting)\b/i,
    incompatible: [],
  },
  other: {
    querySignals: /^$/,
    paperSignals: /^$/,
    incompatible: [],
  },
};

function detectQueryDomain(query: string): Domain {
  const order: Domain[] = [
    "nlp", "computer_vision", "security", "time_series",
    "biomedical", "hardware", "general_ml",
  ];
  for (const d of order) {
    if (DOMAIN_DEFS[d].querySignals.test(query)) return d;
  }
  return "other";
}

function detectPaperDomain(paper: Paper): Domain {
  const text = `${paper.title} ${paper.abstract ?? ""}`;
  const order: Domain[] = [
    "security", "biomedical", "hardware", "time_series",
    "computer_vision", "nlp", "general_ml",
  ];
  for (const d of order) {
    if (DOMAIN_DEFS[d].paperSignals.test(text)) return d;
  }
  return "other";
}

function isMLQuery(q: string): boolean {
  return /transformer|attention|bert|gpt|llm|neural|deep learning|embedding|gradient|backprop|optimizer|reinforcement|machine learning|computer vision|natural language|NLP/i.test(q);
}

function passesAllFilters(paper: Paper, originalQuery: string): boolean {
  // 1. Hard junk pattern block
  if (JUNK_PATTERNS.some((p) => p.test(paper.title))) return false;

  // 2. Domain guard — drop papers from incompatible domains
  const queryDomain = detectQueryDomain(originalQuery);
  if (queryDomain !== "other") {
    const paperDomain = detectPaperDomain(paper);
    if (
      paperDomain !== "other" &&
      paperDomain !== "general_ml" &&
      DOMAIN_DEFS[queryDomain].incompatible.includes(paperDomain)
    ) {
      return false;
    }
  }

  // 3. Age + citation floor for ML queries
  if (isMLQuery(originalQuery)) {
    if (
      paper.year &&
      paper.year < CURRENT_YEAR - 2 &&
      (paper.citationCount ?? 0) < 100
    )
      return false;
    if (paper.year && paper.year < 2000) return false;
  }

  return true;
}

// =============================================================
// SECTION 17 — UNIFIED SEARCH  (v6: + centrality computation)
// =============================================================

export async function searchAllWithPubMed(q: string): Promise<Paper[]> {
  const rewritten = await rewriteQuery(q);
  const keywords = extractKeywords(rewritten);

  const [expandedRes, relatedRes, ssRes, oaRes, axRes, pmRes, foundRes] =
    await Promise.allSettled([
      expandQuery(rewritten, keywords),
      generateRelatedQueries(rewritten),
      withRetry(() => fetchSemanticScholar(rewritten)),
      withRetry(() => fetchOpenAlex(rewritten)),
      withRetry(() => fetchArXiv(rewritten)),
      withRetry(() => fetchPubMed(rewritten)),
      Promise.resolve(getFoundationalPapers(q)),
    ]);

  const expandedQueries =
    expandedRes.status === "fulfilled" ? expandedRes.value : [];
  const relatedQueries =
    relatedRes.status === "fulfilled" ? relatedRes.value : [];
  const primarySS = ssRes.status === "fulfilled" ? ssRes.value : [];

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

  const foundationalPapers: Paper[] =
    foundRes.status === "fulfilled" ? foundRes.value : [];

  const all: Paper[] = [
    ...primarySS,
    ...(oaRes.status === "fulfilled" ? oaRes.value : []),
    ...(axRes.status === "fulfilled" ? axRes.value : []),
    ...(pmRes.status === "fulfilled" ? pmRes.value : []),
    ...extraResults.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
    ...citationPapers,
  ];

  const dedup = new PaperDeduplicator();
  for (const fp of foundationalPapers) dedup.isDuplicate(fp);

  const filtered = all.filter((p) => {
    if (!p.title || !p.abstract) return false;
    if (p.abstract.split(" ").length < 10) return false;
    if (!passesAllFilters(p, q)) return false;
    if (dedup.isDuplicate(p)) return false;
    return true;
  });

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

  const allCandidates = [...foundationalPapers, ...relevant];

  // v7: Compute centrality, then semantic-primary reranking
  const withCentrality = await computeGraphCentrality(allCandidates);

  // Semantic-primary reranking: 0.6 * semantic + 0.2 * citations + 0.2 * recency
  // Papers below relevance threshold are dropped to prevent irrelevant results.
  const semanticRanked = await rerankPapersWithSemantic(withCentrality, rewritten, q);

  return semanticRanked.slice(0, 15);
}

// =============================================================
// SECTION 18 — SECTION-AWARE CHUNKING  (v6 NEW — Upgrade #3)
//
// Attempts to fetch full-text sections for the top papers.
// If sections are available, creates section-typed chunks.
// Falls back to abstract-only for papers without sections.
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
  section?: SectionType; // v6 NEW
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+(?=[A-Z0-9\("])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
}

function makeChunksFromText(
  text: string,
  paper: Paper,
  idx: number,
  queryKeywords: string[],
  section?: SectionType,
): Chunk[] {
  const chunks: Chunk[] = [];
  const sentences = splitIntoSentences(text);
  if (!sentences.length) return [];

  let current: string[] = [];
  let currentWordCount = 0;

  const pushChunk = () => {
    if (current.length === 0) return;
    const chunkText = current.join(" ");
    const textLower = chunkText.toLowerCase();
    const keywordDensity = queryKeywords.filter((k) =>
      textLower.includes(k),
    ).length;
    chunks.push({
      paperId: paper.id,
      paperIdx: idx + 1,
      title: paper.title,
      source: paper.source,
      year: paper.year,
      text: chunkText,
      url: paper.url,
      doi: paper.doi,
      authors: paper.authors,
      keywordDensity,
      section,
    });
  };

  for (const sentence of sentences) {
    const wordCount = sentence.split(/\s+/).length;
    if (currentWordCount + wordCount > CHUNK_SIZE && current.length > 0) {
      pushChunk();
      const overlapWords = current.join(" ").split(/\s+/).slice(-CHUNK_OVERLAP);
      current = [overlapWords.join(" "), sentence];
      currentWordCount = overlapWords.length + wordCount;
    } else {
      current.push(sentence);
      currentWordCount += wordCount;
    }
  }
  pushChunk();
  return chunks;
}

// Section priority — methods + results are most informative
const SECTION_PRIORITY: Record<string, number> = {
  methods: 1.3,
  results: 1.2,
  conclusion: 1.1,
  introduction: 1.0,
  discussion: 1.0,
  abstract: 0.9,
};

export async function chunkPapersWithSections(
  papers: Paper[],
  queryKeywords: string[] = [],
): Promise<Chunk[]> {
  const chunks: Chunk[] = [];

  await Promise.all(
    papers.map(async (paper, idx) => {
      // Try to get full-text sections for top papers
      const sections = await fetchPaperSections(paper.id).catch(() => null);

      if (sections && Object.keys(sections).length > 1) {
        // Section-aware chunking — use each available section
        const sectionOrder: Array<[string, SectionType]> = [
          ["introduction", "introduction"],
          ["methods", "methods"],
          ["results", "results"],
          ["discussion", "discussion"],
          ["conclusion", "conclusion"],
        ];

        for (const [key, secType] of sectionOrder) {
          const text = sections[key];
          if (text) {
            chunks.push(
              ...makeChunksFromText(text, paper, idx, queryKeywords, secType),
            );
          }
        }
        // Also include abstract chunk for foundational papers
        chunks.push(
          ...makeChunksFromText(
            paper.abstract,
            paper,
            idx,
            queryKeywords,
            "abstract",
          ),
        );
      } else {
        // Fallback: abstract-only chunking
        chunks.push(
          ...makeChunksFromText(
            paper.abstract,
            paper,
            idx,
            queryKeywords,
            "abstract",
          ),
        );
      }
    }),
  );

  return chunks;
}

// Legacy sync version for backwards compat
export function chunkPapers(
  papers: Paper[],
  queryKeywords: string[] = [],
): Chunk[] {
  const chunks: Chunk[] = [];
  papers.forEach((paper, idx) => {
    chunks.push(
      ...makeChunksFromText(
        paper.abstract,
        paper,
        idx,
        queryKeywords,
        "abstract",
      ),
    );
  });
  return chunks;
}

// =============================================================
// SECTION 19 — HYBRID CHUNK RANKING (unchanged from v5, + section boost)
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

  const allTexts = [query, ...chunks.map((c) => c.text)];
  let embeddings: number[][];
  try {
    embeddings = await getBatchEmbeddings(allTexts, vocabulary);
  } catch {
    embeddings = allTexts.map(() => []);
  }
  const queryEmb = embeddings[0] ?? [];
  const chunkEmbeddings = embeddings.slice(1);

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

    // v6: section priority boost
    const sectionBoost = SECTION_PRIORITY[chunk.section ?? "abstract"] ?? 1.0;
    bm25 *= sectionBoost;

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

  const scored = rawScores.map(({ chunk, bm25, semantic }) => ({
    chunk,
    score:
      0.35 * (bm25 / maxBM25) +
      0.55 * semantic +
      0.1 * ((chunk.keywordDensity ?? 0) / maxDensity),
    semantic, // keep for threshold filtering
  }));

  // v7 NEW: filter out chunks with near-zero relevance to avoid polluting context.
  // A chunk must have either non-trivial semantic similarity OR strong BM25 keyword match.
  const MIN_CHUNK_RELEVANCE = 0.05;
  const relevantScored = scored.filter(
    (s) => s.semantic >= MIN_CHUNK_RELEVANCE || s.score >= 0.15,
  );
  const scoredToUse = relevantScored.length >= Math.min(topK, 3) ? relevantScored : scored;

  const paperChunkCount: Record<string, number> = {};
  const result: Chunk[] = [];
  for (const { chunk } of scoredToUse.sort((a, b) => b.score - a.score)) {
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
// SECTION 20 — LLM RE-RANKER (unchanged from v5)
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
          `[${i}] "${c.title}" (${c.year ?? "n.d."}${authors ? " | " + authors : ""})` +
          (c.section ? ` [${c.section}]` : "") +
          `\n` +
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
// SECTION 21 — GUARANTEE FOUNDATIONAL CHUNKS (unchanged)
// =============================================================

const MAX_EVIDENCE_CHUNKS = 12;

export function guaranteeFoundationalChunks(
  topChunks: Chunk[],
  allChunks: Chunk[],
  papers: Paper[],
): Chunk[] {
  const coveredIds = new Set(topChunks.map((c) => c.paperId));
  const missingFoundational = papers.filter(
    (p) => STATIC_PAPER_IDS.has(p.id) && !coveredIds.has(p.id),
  );
  if (missingFoundational.length === 0) return topChunks;

  const result = [...topChunks];
  for (const paper of missingFoundational) {
    if (result.length >= MAX_EVIDENCE_CHUNKS) break;
    const paperChunks = allChunks.filter((c) => c.paperId === paper.id);
    if (paperChunks.length === 0) continue;
    result.push(paperChunks[0]);
  }
  return result;
}

// =============================================================
// SECTION 22 — ENHANCED EVIDENCE BLOCKS  (v6 — Upgrade #1)
//
// Now includes: authors, citationCount, doi, inlineCite
// The inlineCite field provides pre-formatted "Author et al. (Year)"
// strings ready to embed in the answer.
// =============================================================

export function buildEvidenceBlocks(
  topChunks: Chunk[],
  papers: Paper[],
): EvidenceBlock[] {
  const paperMap = new Map(papers.map((p) => [p.id, p]));
  return topChunks.map((chunk, idx) => {
    const paper = paperMap.get(chunk.paperId);
    const authors = chunk.authors ?? paper?.authors ?? [];
    const year = chunk.year ?? paper?.year ?? null;
    const citationCount = paper?.citationCount ?? 0;

    return {
      chunk_id: `c${String(idx + 1).padStart(2, "0")}`,
      paper_id: chunk.paperId,
      title: chunk.title,
      authors, // v6 NEW
      year,
      venue: paper?.journal ?? chunk.source ?? "Unknown",
      citationCount, // v6 NEW
      doi: paper?.doi ?? chunk.doi, // v6 NEW
      url: chunk.url ?? paper?.url ?? "Not available",
      text: chunk.text,
      section: chunk.section, // v6 NEW
      inlineCite: formatInlineCite(authors, year), // v6 NEW
    };
  });
}

export function formatEvidenceBlocks(blocks: EvidenceBlock[]): string {
  return blocks
    .map(
      (b) =>
        `---\n` +
        `chunk_id: ${b.chunk_id}\n` +
        `paper_id: ${b.paper_id}\n` +
        `title: ${b.title}\n` +
        `authors: ${b.authors.slice(0, 3).join(", ")}${b.authors.length > 3 ? " et al." : ""}\n` +
        `year: ${b.year ?? "n.d."}\n` +
        `venue: ${b.venue}\n` +
        `citations: ${b.citationCount.toLocaleString()}\n` + // v6 NEW
        `doi: ${b.doi ?? "Not available"}\n` + // v6 NEW
        `url: ${b.url}\n` +
        `section: ${b.section ?? "abstract"}\n` + // v6 NEW
        `inline_cite: ${b.inlineCite}\n` + // v6 NEW
        `text: ${b.text}\n` +
        `---`,
    )
    .join("\n\n");
}

// =============================================================
// SECTION 23 — CLAIM VERIFICATION PASS  (v6 NEW — Upgrade #2)
//
// After answer generation, Claude Haiku audits each [CITATION:cXX]
// in the answer and scores whether the cited chunk actually supports
// the surrounding claim (0–10). Weak citations (<6) are flagged
// or removed. This reduces hallucinated citations significantly.
// =============================================================

export interface ClaimVerificationResult {
  verified_answer: string;
  removed_citations: number;
  flagged_citations: number;
  verification_log: string;
}

export async function verifyClaimCitations(
  answer: string,
  evidenceBlocks: EvidenceBlock[],
): Promise<ClaimVerificationResult> {
  // Extract all [CITATION:cXX] with their surrounding context
  const citationPattern =
    /([^.!?\n]{10,200})\s*(\[CITATION:[a-z0-9]+\](?:\[CITATION:[a-z0-9]+\])*)/g;
  const claims: Array<{
    claim: string;
    citations: string[];
    fullMatch: string;
  }> = [];

  let m: RegExpExecArray | null;
  const answerForScan = answer.slice(0, 8000); // avoid token explosion
  while ((m = citationPattern.exec(answerForScan)) !== null) {
    const claimText = m[1].trim();
    const citMatches = [...m[2].matchAll(/\[CITATION:([a-z0-9]+)\]/g)];
    if (citMatches.length > 0) {
      claims.push({
        claim: claimText,
        citations: citMatches.map((c) => c[1]),
        fullMatch: m[0],
      });
    }
  }

  if (claims.length === 0) {
    return {
      verified_answer: answer,
      removed_citations: 0,
      flagged_citations: 0,
      verification_log: "",
    };
  }

  // Build context for Haiku
  const blockMap = new Map(evidenceBlocks.map((b) => [b.chunk_id, b]));
  const claimsCtx = claims
    .slice(0, 12) // cap to avoid token limit
    .map((c, i) => {
      const chunkTexts = c.citations
        .map((cid) => {
          const block = blockMap.get(cid);
          return block
            ? `  [${cid}]: "${block.text.slice(0, 300)}"`
            : `  [${cid}]: NOT FOUND`;
        })
        .join("\n");
      return `Claim ${i + 1}: "${c.claim}"\nCited chunks:\n${chunkTexts}`;
    })
    .join("\n\n---\n\n");

  try {
    const r = await ant.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system:
        "You are an academic citation auditor. For each claim-citation pair, score support 0-10 and decide action. " +
        "Return ONLY valid JSON: an array of objects {claim_index, chunk_id, score, action} " +
        "where action is 'keep' (score>=6), 'flag' (score 3-5), or 'remove' (score<3). No markdown.",
      messages: [
        {
          role: "user",
          content: `Verify each claim is supported by its cited chunk:\n\n${claimsCtx}`,
        },
      ],
    });

    const b = r.content[0];
    if (b.type !== "text") {
      return {
        verified_answer: answer,
        removed_citations: 0,
        flagged_citations: 0,
        verification_log: "",
      };
    }

    const verifications = JSON.parse(
      b.text
        .trim()
        .replace(/```json|```/g, "")
        .trim(),
    ) as Array<{
      claim_index: number;
      chunk_id: string;
      score: number;
      action: string;
    }>;

    let verifiedAnswer = answer;
    let removed = 0;
    let flagged = 0;
    const log: string[] = [];

    for (const v of verifications) {
      const cid = v.chunk_id;
      const tag = `[CITATION:${cid}]`;

      if (v.action === "remove") {
        verifiedAnswer = verifiedAnswer.replaceAll(tag, "");
        removed++;
        log.push(`REMOVED ${tag} (score: ${v.score})`);
      } else if (v.action === "flag") {
        // Add a ⚠️ flag to weak citations so users can spot them
        verifiedAnswer = verifiedAnswer.replaceAll(tag, `${tag}⚠️`);
        flagged++;
        log.push(`FLAGGED ${tag} (score: ${v.score})`);
      }
    }

    return {
      verified_answer: verifiedAnswer,
      removed_citations: removed,
      flagged_citations: flagged,
      verification_log: log.join("; "),
    };
  } catch {
    return {
      verified_answer: answer,
      removed_citations: 0,
      flagged_citations: 0,
      verification_log: "",
    };
  }
}

// =============================================================
// SECTION 24 — ANSWER VERIFICATION (unchanged from v5)
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
    const bv = r.content[0];
    if (bv.type !== "text" || !bv.text.trim()) return answer;
    const verified = bv.text.trim();
    if (verified.split(/\s+/).length < answer.split(/\s+/).length * 0.5)
      return answer;
    return verified;
  } catch {
    return answer;
  }
}

// =============================================================
// SECTION 25 — CONTEXT BUILDER (unchanged)
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
      return (
        `[Chunk ${i + 1} | Ref ${c.paperIdx}: "${c.title}" (${c.source}, ${c.year ?? "n.d."})${authorStr}` +
        (c.section ? ` [${c.section}]` : "") +
        `]\n` +
        c.text +
        (c.url ? `\nURL: ${c.url}` : "") +
        (c.doi ? `\nDOI: https://doi.org/${c.doi}` : "")
      );
    })
    .join("\n\n---\n\n");
}

// =============================================================
// SECTION 26 — RAG SYSTEM PROMPT (v6: includes inline_cite field)
// =============================================================

const RAG_SYSTEM = `You are Researchly, a citation-grounded academic research assistant for Indian students and researchers.
You ONLY help with academic, research, and study topics.
You must answer the user using ONLY the retrieved evidence blocks provided below.

GROUNDING RULES
1. Every factual sentence must end with one or more citations in this exact format: [CITATION:chunk_id]
2. Only cite chunk IDs that appear in the EVIDENCE BLOCKS section.
3. Use the inline_cite field from the evidence block for the readable citation (e.g. "Vaswani et al. (2017)").
4. When you first use a paper, write its inline_cite before the [CITATION:chunk_id] tag.
   Example: "The Transformer uses only attention mechanisms. Vaswani et al. (2017) [CITATION:c01]"
   Subsequent uses of the same paper: just [CITATION:cXX] (no repeated inline_cite)
5. If a claim is supported by multiple chunks, cite all: [CITATION:c01][CITATION:c03]
6. If evidence is insufficient, write: "I cannot support that from the retrieved papers."
7. Never invent authors, years, venues, URLs, DOI values, or paper titles.
8. Never cite a paper unless at least one cited chunk belongs to that paper.

CITATION FORMAT FOR REFERENCE PANEL
After every paper cited for the first time, insert a structured citation card:
> **[N]** Author et al. (Year) — *Title* — Venue — Citations: X — DOI: ...

MANDATORY RESPONSE STRUCTURE — output ALL 7 sections in order:
1. ## Overview
2. ## Key Concepts
3. ## System Architecture  (ASCII diagram for any AI system or pipeline)
4. ## Technical Details or Comparison  (comparison table when comparing 2+ models)
5. ## Limitations
6. ## Key Takeaways
7. ## What To Search Next  (3 query suggestions, no citations needed)

CITATION PLACEMENT — hard limits per section:
- ## Overview: max 2 citations
- ## Key Concepts: max 3 citations
- ## System Architecture: 0 citations
- ## Technical Details or Comparison: max 3 citations
- ## Limitations: 0 citations
- ## Key Takeaways: max 2 citations on first two takeaways only
- ## What To Search Next: 0 citations
- TOTAL across whole answer: maximum 8 [CITATION:*] markers

At the end of your answer, output a "## Cited Papers" section in YAML format:
## Cited Papers
- paper_id: <paper_id>
  title: <title>
  authors: <Author et al.>
  year: <year>
  venue: <venue>
  citations: <citationCount>
  doi: <doi or "Not available">
  url: <url>
  cited_chunk_ids: [<chunk_id>, ...]

Include ONLY papers that were actually cited in the answer body. Then STOP.

WRITING RULES
- Never start with filler phrases like "Great question!" or "Certainly!".
- Bold **key terms** on first use.
- Research answers: 600–900 words. Study: 400–600 words.`;

// =============================================================
// SECTION 27 — RAG ANSWER GENERATOR  (v6: + claim verification)
// =============================================================

export let lastChunkIdToPaperId: Map<string, string> = new Map();

export async function generateRAGAnswer(
  query: string,
  papers: Paper[],
  stream = false,
): Promise<string | AsyncIterable<string>> {
  const keywords = extractKeywords(query);
  // v6: use section-aware chunking
  const chunks = await chunkPapersWithSections(papers, keywords);
  const bm25Chunks = await rankChunks(query, chunks);
  const reranked = await rerankChunks(query, bm25Chunks, 8);
  const topChunks = guaranteeFoundationalChunks(reranked, chunks, papers);

  const evidenceBlocks = buildEvidenceBlocks(topChunks, papers);
  const formattedEvidence = formatEvidenceBlocks(evidenceBlocks);

  lastChunkIdToPaperId = new Map(
    evidenceBlocks.map((b) => [b.chunk_id, b.paper_id]),
  );

  const PROMPT = `You are Researchly, a citation-grounded research assistant.
You must answer the user using ONLY the retrieved evidence blocks provided below.

GROUNDING RULES
1. Every factual sentence must end with [CITATION:chunk_id]
2. Only cite chunk IDs in the EVIDENCE BLOCKS section.
3. Use inline_cite field for the first mention: "Vaswani et al. (2017) [CITATION:c01]"
4. Subsequent mentions of same paper: just [CITATION:cXX]
5. If evidence is insufficient: "I cannot support that from the retrieved papers."
6. Never invent metadata.
7. When comparing models, cite each model's original paper at least once.

OUTPUT RULES
- Write in 4 to 6 short sections with clear headings.
- Append citation tags after every factual sentence.
- At the end, output "## Cited Papers" with full metadata for each cited paper including:
  paper_id, title, authors, year, venue, citations, doi, url, cited_chunk_ids.

EVIDENCE BLOCKS
${formattedEvidence}

USER QUESTION
${query}`;

  if (stream) {
    const s = await ant.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 3500,
      system: RAG_SYSTEM,
      messages: [{ role: "user", content: PROMPT }],
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
    messages: [{ role: "user", content: PROMPT }],
  });
  const bv = res.content[0];
  let rawAnswer = bv.type === "text" ? bv.text : "";

  // v5 verification
  rawAnswer = await verifyAnswer(rawAnswer, formattedEvidence);

  // v6 claim-level citation verification
  const { verified_answer: verifiedAnswer } = await verifyClaimCitations(
    rawAnswer,
    evidenceBlocks,
  );

  // v7 NEW: Answer Quality Control — Upgrade #6
  // Evaluate answer quality (0-10). If score < QUALITY_THRESHOLD (7),
  // regenerate once with targeted fix instructions listing specific issues.
  const quality = await evaluateAnswerQuality(query, verifiedAnswer, formattedEvidence);

  if (!quality.passed && quality.issues.length > 0) {
    const fixPrompt =
      `${PROMPT}\n\n` +
      `QUALITY REVIEW — Your previous answer scored ${quality.score.toFixed(1)}/10. ` +
      `Please improve it by addressing these specific issues:\n` +
      quality.issues.map((issue, i) => `${i + 1}. ${issue}`).join("\n") +
      `\n\nRegenerate the complete improved answer below:`;

    try {
      const retryRes = await ant.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 3500,
        system: RAG_SYSTEM,
        messages: [{ role: "user", content: fixPrompt }],
      });
      const rb = retryRes.content[0];
      const retryAnswer = rb.type === "text" ? rb.text : verifiedAnswer;
      // Only use the regenerated answer if it's substantially longer (better)
      if (retryAnswer.length > verifiedAnswer.length * 0.8) {
        const { verified_answer: retryVerified } = await verifyClaimCitations(
          retryAnswer,
          evidenceBlocks,
        ).catch(() => ({ verified_answer: retryAnswer }));
        return retryVerified;
      }
    } catch {
      // Fall back to the first answer if retry fails
    }
  }

  return verifiedAnswer;
}

// =============================================================
// SECTION 28 — FULL TEXT ENRICHMENT (preserved from v5)
// Attempts to fetch PDF full text for open-access papers.
// Appends a note to the abstract when a PDF URL is found.
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
