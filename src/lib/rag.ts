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

  if (
    /transformer.*replace.*rnn|why.*transformer|rnn.*vs.*transformer|attention.*vs.*recurrent/i.test(
      q,
    )
  ) {
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

  // mRNA vaccines
  if (
    /mrna vaccine|covid.*vaccine|sars.cov.2.*vaccine|lipid nanoparticle|spike protein.*vaccine|nucleoside/i.test(
      q,
    )
  ) {
    seeds.push(
      "mRNA vaccine mechanism lipid nanoparticle spike protein COVID-19",
      "Karikó Weissman nucleoside modification mRNA immunogenicity",
      "BNT162b2 Pfizer mRNA COVID-19 vaccine efficacy Phase 3 trial",
      "mRNA-1273 Moderna COVID-19 vaccine safety efficacy NEJM",
      "SARS-CoV-2 spike protein prefusion stabilized mRNA immunogen design",
    );
  }

  // Climate science
  if (
    /greenhouse gas|global warming|climate change|radiative forcing|carbon cycle|co2|ipcc/i.test(
      q,
    )
  ) {
    seeds.push(
      "greenhouse gas CO2 radiative forcing global warming mechanism",
      "climate change anthropogenic emissions temperature rise evidence",
      "IPCC climate science physical basis carbon budget warming",
      "CO2 doubling climate sensitivity equilibrium warming feedback",
      "climate carbon cycle feedback land ocean carbon uptake warming",
    );
  }

  // Economics / monetary policy
  if (
    /inflation|monetary policy|central bank|interest rate|price stabilit|money supply|phillips curve/i.test(
      q,
    )
  ) {
    seeds.push(
      "inflation causes demand pull cost push monetary theory",
      "central bank monetary policy interest rate inflation control",
      "Taylor rule federal funds rate inflation output gap",
      "Friedman monetary phenomenon inflation money supply",
      "New Keynesian monetary policy Phillips curve interest rate",
    );
  }

  // CAR-T cell therapy
  if (
    /car.?t|chimeric antigen receptor|t.cell.*cancer|adoptive.*cell.*therap/i.test(
      q,
    )
  ) {
    seeds.push(
      "chimeric antigen receptor CAR-T cell therapy cancer immunotherapy",
      "anti-CD19 CAR T cell leukemia lymphoma clinical trial",
      "CAR T cell design costimulatory domain CD3 zeta signaling",
      "axicabtagene tisagenlecleucel FDA approval B-cell lymphoma",
    );
  }

  // CNN / Computer Vision
  if (
    /convolutional neural network|cnn|computer vision|image classif|object detect/i.test(
      q,
    )
  ) {
    seeds.push(
      "convolutional neural network image classification deep learning",
      "AlexNet Krizhevsky ImageNet deep convolutional neural network",
      "object detection convolutional neural network PASCAL VOC COCO",
      "ResNet deep residual learning image recognition He 2016",
    );
  }
  if (/object detect|yolo|faster r.?cnn|region proposal/i.test(q)) {
    seeds.push(
      "Faster RCNN region proposal network real-time object detection",
      "YOLO unified real-time object detection",
    );
  }
  if (/vision transformer|vit|image.*transformer/i.test(q)) {
    seeds.push(
      "Vision Transformer ViT image patches self-attention classification",
    );
  }

  // CRISPR / gene editing
  if (/crispr|cas9|gene edit|genome edit/i.test(q)) {
    seeds.push(
      "CRISPR-Cas9 genome editing mechanism double-strand break repair",
      "Doudna Charpentier programmable genome editing RNA-guided nuclease",
      "CRISPR therapeutic applications clinical trials gene therapy",
      "Ran Hsu Wright genome engineering CRISPR-Cas9",
    );
  }

  // Neuroinflammation / Alzheimer's
  if (/neuroinflam|alzheimer|microglia|astrocyte|tau|amyloid/i.test(q)) {
    seeds.push(
      "neuroinflammation microglia Alzheimer disease pathology",
      "NLRP3 inflammasome neurodegeneration microglia activation",
      "amyloid tau neuroinflammation Alzheimer mechanisms",
    );
  }

  // General biomedical / gene therapy
  if (
    /gene therapy|therapeutic.*gene|genetic.*disorder|gene.*correction/i.test(q)
  ) {
    seeds.push(
      "gene therapy viral vector delivery clinical application",
      "AAV adeno-associated virus gene therapy",
    );
  }

  return seeds.slice(0, 5);
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
      system:
        "You are an expert academic search query generator. " +
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
      b.text
        .trim()
        .replace(/```json|```/g, "")
        .trim(),
    ) as string[];
    const llmExpansions = Array.isArray(parsed) ? parsed.slice(0, 4) : [];
    // Merge: rule-based first (high precision) then LLM (broader coverage)
    const result = [...new Set([...ruleBased, ...llmExpansions])].slice(0, 8);
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
  // boost = additive score bonus (0.8 = strong preference, not guaranteed top)
  const RULES: Array<{ trigger: RegExp; phrases: string[]; boost: number }> = [
    {
      // v8: Broadened — matches "transformer", "why transformers", "replace RNN", etc.
      trigger:
        /\btransformer\b|attention.*mechanism|self.?attention|multi.?head|vaswani|replace.*rnn|rnn.*replace|encoder.*decoder.*attention|why.*transformer|how.*transformer|attention.*architecture/i,
      phrases: ["attention is all you need"],
      boost: 0.8,
    },
    {
      trigger:
        /\bbert\b|bidirectional.*transformer|masked.*language.*model|devlin|pre.?train.*nlp|language.*understanding/i,
      phrases: ["bert: pre-training of deep bidirectional transformers"],
      boost: 0.8,
    },
    {
      trigger: /\bgpt\b|\bgpt.?1\b|generative pre.?training|radford.*2018/i,
      phrases: ["improving language understanding by generative pre-training"],
      boost: 0.8,
    },
    {
      trigger:
        /gpt.?3|few.?shot.*language|language model.*few.?shot|brown.*2020|large language model.*few/i,
      phrases: ["language models are few-shot learners"],
      boost: 0.8,
    },
    {
      trigger: /\bt5\b|text.?to.?text|raffel|exploring.*limits.*transfer/i,
      phrases: [
        "exploring the limits of transfer learning with a unified text-to-text transformer",
      ],
      boost: 0.8,
    },
    {
      trigger:
        /\brag\b|retrieval.?augmented generation|retrieval.*llm|knowledge.*intensive/i,
      phrases: ["retrieval-augmented generation for knowledge-intensive"],
      boost: 0.8,
    },
    {
      trigger:
        /\bresnet\b|residual.*learning|deep residual|he.*kaiming|skip.*connection/i,
      phrases: ["deep residual learning for image recognition"],
      boost: 0.8,
    },
    {
      trigger: /\bgan\b|generative adversarial|goodfellow.*2014/i,
      phrases: ["generative adversarial networks"],
      boost: 0.8,
    },
    {
      trigger:
        /word2vec|word embeddings|skip.?gram|distributed representations.*words/i,
      phrases: ["distributed representations of words and phrases"],
      boost: 0.8,
    },
    {
      trigger: /\badam\b|adam optimizer|adaptive.*moment/i,
      phrases: ["adam: a method for stochastic optimization"],
      boost: 0.8,
    },
    // CRISPR foundational papers
    {
      trigger: /crispr|cas9|gene edit|genome edit|rna.?guided/i,
      phrases: [
        "a programmable dual-rna-guided dna endonuclease",
        "multiplex genome engineering using crispr",
        "genome engineering using the crispr-cas9",
        "cpf1 is a single rna-guided endonuclease",
      ],
      boost: 0.8,
    },
    {
      trigger:
        /crispr.*therapeutic|gene therapy.*crispr|sickle.*cell.*crispr|crispr.*clinic/i,
      phrases: [
        "crispr-cas9 for medical genetic screens",
        "frangoul sickle cell disease",
        "in vivo crispr base editing",
      ],
      boost: 0.8,
    },
    {
      trigger: /base edit|prime edit|next.*generation.*crispr|beyond.*crispr/i,
      phrases: [
        "programmable editing of a target base",
        "search-and-replace genome editing",
        "prime editing",
      ],
      boost: 0.8,
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
    0.1 * recency +
    0.2 * titleOvlp +
    0.2 * abstractOvlp +
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

  // All papers (including foundational) go through semantic scoring.
  // Foundational papers get a strong preference boost (+0.8) rather than
  // a guaranteed bypass — this prevents them from crowding out the most
  // directly relevant papers on specific, narrow queries.
  const texts = [
    query,
    ...papers.map((p) => `${p.title}. ${p.abstract}`.slice(0, 800)),
  ];

  let embeddings: number[][];
  try {
    embeddings = await getBatchEmbeddings(texts);
  } catch {
    return papers; // Graceful fallback
  }

  const queryEmb = embeddings[0] ?? [];
  if (queryEmb.length === 0) return papers;

  const maxCitations = Math.max(...papers.map((p) => p.citationCount ?? 0), 1);
  const isExplanatoryQuery = SURVEY_HELPFUL_QUERY_RE.test(
    originalQuery ?? query,
  );

  // For named comparison queries (BERT vs GPT vs T5, etc.), apply a stricter
  // citation floor to prevent low-quality derivative papers from crowding prime
  // evidence slots. Non-static papers with fewer than 100 citations are dropped.
  const isComparisonQuery =
    /\bvs\b|\bversus\b|compare.*\b(bert|gpt|t5|llm|resnet|vit)\b|\b(bert|gpt|t5)\b.*\bvs\b/i.test(
      originalQuery ?? query,
    );
  const MIN_CITATIONS_COMPARISON = 10;

  const scored = papers.map((paper, i) => {
    const paperEmb = embeddings[i + 1] ?? [];
    const semantic =
      paperEmb.length > 0 ? cosineSimilarity(queryEmb, paperEmb) : 0;

    // Foundational papers: skip the relevance floor but still score semantically
    const isFoundational = STATIC_PAPER_IDS.has(paper.id);
    if (!isFoundational && semantic < MIN_PAPER_RELEVANCE)
      return { paper, score: -1 };

    // For comparison queries, drop non-foundational papers with very low citations
    // — they are almost always derivative surveys that don't belong in the evidence
    if (
      isComparisonQuery &&
      !isFoundational &&
      (paper.citationCount ?? 0) < MIN_CITATIONS_COMPARISON
    )
      return { paper, score: -1 };

    const normCitations =
      Math.log((paper.citationCount ?? 0) + 1) / Math.log(maxCitations + 1);
    const recency = recencyScore(paper);

    // Rebalanced formula: 0.65 semantic / 0.25 citations / 0.10 recency
    let score = 0.65 * semantic + 0.25 * normCitations + 0.1 * recency;

    // Top-venue bonus
    if (venueQuality(paper) > 0) score *= 1.15;

    // Survey handling
    if (SURVEY_TITLE_RE_SCORE.test(paper.title)) {
      const cit = paper.citationCount ?? 0;
      if (cit >= 1000 && isExplanatoryQuery) {
        score += 0.05;
      } else if (cit >= 5000) {
        score *= 0.85;
      } else if (cit >= 1000) {
        score *= 0.7;
      } else {
        score *= 0.45;
      }
    }

    // Foundational strong-preference boost (0.8, not 2.0) — keeps them near
    // the top without locking out highly-relevant retrieved papers
    score += foundationalBoost(paper, originalQuery ?? query);

    return { paper, score };
  });

  return scored
    .filter((s) => s.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.paper);
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
      b.text
        .trim()
        .replace(/```json|```/g, "")
        .trim(),
    ) as {
      relevance: number;
      evidence: number;
      completeness: number;
      clarity: number;
      issues: string[];
    };

    const overall =
      (parsed.relevance +
        parsed.evidence +
        parsed.completeness +
        parsed.clarity) /
      4;

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
    // Do not fake-pass quality control — return a failing score so the caller
    // can decide whether to regenerate rather than silently accept a bad answer.
    return {
      score: 0,
      relevance: 0,
      evidence: 0,
      completeness: 0,
      clarity: 0,
      issues: ["Quality evaluation failed — treat as unverified"],
      passed: false,
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

    // Enrich PubMed papers with citation counts from Semantic Scholar.
    // PubMed returns citationCount=0 which unfairly downranks biomedical papers
    // in mixed-source ranking. A DOI lookup lets us fix that cheaply.
    await Promise.all(
      papers.map(async (paper, idx) => {
        if (!paper.doi) return;
        try {
          const ssData = (await withTimeout(
            fetch(
              `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(paper.doi)}?fields=citationCount,externalIds`,
            ).then((r) => r.json()),
            5_000,
          )) as any;
          if (typeof ssData.citationCount === "number") {
            papers[idx] = { ...paper, citationCount: ssData.citationCount };
          }
        } catch {
          // silently skip — zero citations is better than crashing
        }
      }),
    );

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
  // ── Deep Learning Foundations ─────────────────────────────────
  "deep-learning-lecun": {
    id: "lecun2015",
    title: "Deep Learning",
    authors: ["Yann LeCun", "Yoshua Bengio", "Geoffrey Hinton"],
    year: 2015,
    abstract:
      "Deep learning allows computational models composed of multiple processing layers to learn representations of data with multiple levels of abstraction. These methods have dramatically improved the state of the art in speech recognition, visual object recognition, object detection, and many other domains.",
    journal: "Nature",
    doi: "10.1038/nature14539",
    url: "https://www.nature.com/articles/nature14539",
    citationCount: 50000,
    source: "Nature",
  },
  backprop: {
    id: "rumelhart1986",
    title: "Learning representations by back-propagating errors",
    authors: ["David E. Rumelhart", "Geoffrey E. Hinton", "Ronald J. Williams"],
    year: 1986,
    abstract:
      "We describe a new learning procedure, back-propagation, for networks of neuron-like units that adjusts connection weights to minimize the difference between actual and desired output. This procedure enables networks to learn internal representations that capture the statistical structure of the data.",
    journal: "Nature",
    doi: "10.1038/323533a0",
    url: "https://www.nature.com/articles/323533a0",
    citationCount: 25000,
    source: "Nature",
  },
  "transfer-learning-pan": {
    id: "pan2010",
    title: "A Survey on Transfer Learning",
    authors: ["Sinno Jialin Pan", "Qiang Yang"],
    year: 2010,
    abstract:
      "A major assumption in traditional machine learning is that training and test data share the same feature space and distribution. Transfer learning relaxes this assumption, allowing knowledge from source domains to improve learning in related target domains. This survey categorizes approaches and reviews progress in this field.",
    journal: "IEEE Transactions on Knowledge and Data Engineering",
    doi: "10.1109/TKDE.2009.191",
    url: "https://ieeexplore.ieee.org/document/5288526",
    citationCount: 25000,
    source: "IEEE",
  },
  "transferable-features": {
    id: "yosinski2014",
    title: "How transferable are features in deep neural networks?",
    authors: [
      "Jason Yosinski",
      "Jeff Clune",
      "Yoshua Bengio",
      "Hod Lipson",
    ],
    year: 2014,
    abstract:
      "We experimentally quantify the generality and specificity of neurons in each layer of a deep convolutional neural network, finding that transferability drops as the distance between source and target tasks increases. Fine-tuning transferred features significantly improves generalization even far from the original domain.",
    journal: "Advances in Neural Information Processing Systems (NeurIPS)",
    doi: "10.48550/arXiv.1411.1792",
    url: "https://arxiv.org/abs/1411.1792",
    citationCount: 10000,
    source: "arXiv",
  },
  lstm: {
    id: "hochreiter1997",
    title: "Long Short-Term Memory",
    authors: ["Sepp Hochreiter", "Jürgen Schmidhuber"],
    year: 1997,
    abstract:
      "Long short-term memory (LSTM) recurrent networks address the vanishing gradient problem by introducing a memory cell with gating mechanisms that regulate information flow. LSTMs can learn to bridge very long time lags and have become the dominant architecture for sequential data modeling.",
    journal: "Neural Computation",
    doi: "10.1162/neco.1997.9.8.1735",
    url: "https://www.mitpressjournals.org/doi/10.1162/neco.1997.9.8.1735",
    citationCount: 80000,
    source: "MIT Press",
  },
  "rnn-encoder-decoder": {
    id: "cho2014",
    title:
      "Learning Phrase Representations using RNN Encoder-Decoder for Statistical Machine Translation",
    authors: [
      "Kyunghyun Cho",
      "Bart van Merriënboer",
      "Caglar Gulcehre",
      "Dzmitry Bahdanau",
      "Fethi Bougares",
      "Holger Schwenk",
      "Yoshua Bengio",
    ],
    year: 2014,
    abstract:
      "We propose an RNN Encoder-Decoder consisting of two recurrent neural networks that encodes a variable-length sequence into a fixed-length vector and decodes the vector into another variable-length sequence. The model significantly improves translation performance and learns meaningful phrase representations.",
    journal: "EMNLP 2014",
    doi: "10.48550/arXiv.1406.1078",
    url: "https://arxiv.org/abs/1406.1078",
    citationCount: 25000,
    source: "arXiv",
  },
  dropout: {
    id: "srivastava2014",
    title:
      "Dropout: A Simple Way to Prevent Neural Networks from Overfitting",
    authors: [
      "Nitish Srivastava",
      "Geoffrey Hinton",
      "Alex Krizhevsky",
      "Ilya Sutskever",
      "Ruslan Salakhutdinov",
    ],
    year: 2014,
    abstract:
      "Dropout is a regularization technique that randomly drops units along with their connections from the neural network during training. This prevents units from co-adapting too much and significantly reduces overfitting, yielding major improvements across vision, speech, and text tasks.",
    journal: "Journal of Machine Learning Research",
    url: "https://jmlr.org/papers/v15/srivastava14a.html",
    citationCount: 55000,
    source: "JMLR",
  },
  "batch-norm": {
    id: "ioffe2015",
    title: "Batch Normalization: Accelerating Deep Network Training by Reducing Internal Covariate Shift",
    authors: ["Sergey Ioffe", "Christian Szegedy"],
    year: 2015,
    abstract:
      "Batch normalization normalizes layer inputs for each mini-batch, reducing internal covariate shift and allowing much higher learning rates. The technique acts as a regularizer and dramatically accelerates training of deep networks, becoming a standard component of modern architectures.",
    journal: "ICML 2015",
    doi: "10.48550/arXiv.1502.03167",
    url: "https://arxiv.org/abs/1502.03167",
    citationCount: 50000,
    source: "arXiv",
  },
  // ── Diffusion Models ──────────────────────────────────────────
  ddpm: {
    id: "ho2020",
    title: "Denoising Diffusion Probabilistic Models",
    authors: ["Jonathan Ho", "Ajay Jain", "Pieter Abbeel"],
    year: 2020,
    abstract:
      "We present high quality image synthesis results using diffusion probabilistic models, which are parameterized Markov chains trained using variational inference. By reweighting a variational lower bound, the models learn to reverse a gradual noising process and produce samples competitive with state-of-the-art generative models.",
    journal: "Advances in Neural Information Processing Systems (NeurIPS)",
    doi: "10.48550/arXiv.2006.11239",
    url: "https://arxiv.org/abs/2006.11239",
    citationCount: 20000,
    source: "arXiv",
  },
  "score-sde": {
    id: "song2021",
    title: "Score-Based Generative Modeling through Stochastic Differential Equations",
    authors: [
      "Yang Song",
      "Jascha Sohl-Dickstein",
      "Diederik P. Kingma",
      "Abhishek Kumar",
      "Stefano Ermon",
      "Ben Poole",
    ],
    year: 2021,
    abstract:
      "We present a unified framework for score-based generative models using stochastic differential equations (SDEs) that continuously transform data to noise and reverse the process. This formulation subsumes prior diffusion and score-matching approaches and enables flexible sampling procedures with controllable quality-speed tradeoffs.",
    journal: "ICLR 2021",
    doi: "10.48550/arXiv.2011.13456",
    url: "https://arxiv.org/abs/2011.13456",
    citationCount: 8000,
    source: "arXiv",
  },
  // ── Parameter-Efficient Fine-Tuning ───────────────────────────
  lora: {
    id: "hu2022",
    title: "LoRA: Low-Rank Adaptation of Large Language Models",
    authors: [
      "Edward J. Hu",
      "Yelong Shen",
      "Phillip Wallis",
      "Zeyuan Allen-Zhu",
      "Yuanzhi Li",
      "Shean Wang",
      "Lu Wang",
      "Weizhu Chen",
    ],
    year: 2022,
    abstract:
      "LoRA freezes pretrained model weights and injects trainable low-rank decomposition matrices into each layer of the Transformer architecture, reducing the number of trainable parameters for downstream tasks by up to 10,000-fold. This enables efficient fine-tuning of large language models with no added inference latency.",
    journal: "ICLR 2022",
    doi: "10.48550/arXiv.2106.09685",
    url: "https://arxiv.org/abs/2106.09685",
    citationCount: 15000,
    source: "arXiv",
  },
  // ── Reinforcement Learning ────────────────────────────────────
  dqn: {
    id: "mnih2015",
    title: "Human-level control through deep reinforcement learning",
    authors: [
      "Volodymyr Mnih",
      "Koray Kavukcuoglu",
      "David Silver",
      "Andrei A. Rusu",
      "Joel Veness",
      "Marc G. Bellemare",
      "Alex Graves",
      "Martin Riedmiller",
      "Andreas K. Fidjeland",
      "Georg Ostrovski",
      "Stig Petersen",
      "Charles Beattie",
      "Amir Sadik",
      "Ioannis Antonoglou",
      "Helen King",
      "Dharshan Kumaran",
      "Daan Wierstra",
      "Shane Legg",
      "Demis Hassabis",
    ],
    year: 2015,
    abstract:
      "We present a deep reinforcement learning agent that combines deep neural networks with Q-learning to achieve human-level performance on 49 Atari games from raw pixel inputs. The agent uses a replay memory and a separate target network to stabilize training and overcome instabilities in deep RL.",
    journal: "Nature",
    doi: "10.1038/nature14236",
    url: "https://www.nature.com/articles/nature14236",
    citationCount: 20000,
    source: "Nature",
  },
  ppo: {
    id: "schulman2017",
    title: "Proximal Policy Optimization Algorithms",
    authors: [
      "John Schulman",
      "Filip Wolski",
      "Prafulla Dhariwal",
      "Alec Radford",
      "Oleg Klimov",
    ],
    year: 2017,
    abstract:
      "We propose proximal policy optimization (PPO), a family of policy gradient methods that use clipped surrogate objectives to limit policy updates. PPO achieves state-of-the-art performance on continuous control and Atari tasks while being simpler and more sample-efficient than prior methods.",
    journal: "arXiv",
    doi: "10.48550/arXiv.1707.06347",
    url: "https://arxiv.org/abs/1707.06347",
    citationCount: 15000,
    source: "arXiv",
  },
  // ── RLHF / Instruction Tuning ─────────────────────────────────
  instruct: {
    id: "ouyang2022",
    title: "Training language models to follow instructions with human feedback",
    authors: [
      "Long Ouyang",
      "Jeff Wu",
      "Xu Jiang",
      "Diogo Almeida",
      "Carroll L. Wainwright",
      "Pamela Mishkin",
      "Chong Zhang",
      "Sandhini Agarwal",
      "Katarina Slama",
      "Alex Ray",
    ],
    year: 2022,
    abstract:
      "We fine-tune GPT-3 using reinforcement learning from human feedback (RLHF) to align it with human intent, producing InstructGPT. InstructGPT models are preferred over GPT-3 by human evaluators while being more truthful and less toxic, despite having fewer parameters.",
    journal: "Advances in Neural Information Processing Systems (NeurIPS)",
    doi: "10.48550/arXiv.2203.02155",
    url: "https://arxiv.org/abs/2203.02155",
    citationCount: 15000,
    source: "arXiv",
  },
  rlhf: {
    id: "christiano2017",
    title: "Deep Reinforcement Learning from Human Preferences",
    authors: [
      "Paul Christiano",
      "Jan Leike",
      "Tom B. Brown",
      "Miljan Martic",
      "Shane Legg",
      "Dario Amodei",
    ],
    year: 2017,
    abstract:
      "We propose training RL agents from human preferences by learning a reward model from comparisons between pairs of trajectory segments. This approach achieves good performance on complex tasks with only a small number of human evaluations and provides a scalable alternative to hand-engineered reward functions.",
    journal: "Advances in Neural Information Processing Systems (NeurIPS)",
    doi: "10.48550/arXiv.1706.03741",
    url: "https://arxiv.org/abs/1706.03741",
    citationCount: 5000,
    source: "arXiv",
  },
  // ── Chain-of-Thought / Prompting ──────────────────────────────
  cot: {
    id: "wei2022",
    title: "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models",
    authors: [
      "Jason Wei",
      "Xuezhi Wang",
      "Dale Schuurmans",
      "Maarten Bosma",
      "Brian Ichter",
      "Fei Xia",
      "Ed Chi",
      "Quoc Le",
      "Denny Zhou",
    ],
    year: 2022,
    abstract:
      "We show that generating a chain of intermediate reasoning steps substantially improves the ability of large language models to perform complex reasoning. Chain-of-thought prompting is a simple and emergent capability that arises in sufficiently large language models and requires no additional training.",
    journal: "Advances in Neural Information Processing Systems (NeurIPS)",
    doi: "10.48550/arXiv.2201.11903",
    url: "https://arxiv.org/abs/2201.11903",
    citationCount: 10000,
    source: "arXiv",
  },
  // ── Attention / Seq2Seq ───────────────────────────────────────
  bahdanau: {
    id: "bahdanau2015",
    title: "Neural Machine Translation by Jointly Learning to Align and Translate",
    authors: ["Dzmitry Bahdanau", "Kyunghyun Cho", "Yoshua Bengio"],
    year: 2015,
    abstract:
      "We propose an attention mechanism for neural machine translation that allows the model to jointly learn to align source words with output words. By focusing on relevant parts of the source sentence at each decoding step, the model handles long sequences much more effectively than fixed-length encoder vectors.",
    journal: "ICLR 2015",
    doi: "10.48550/arXiv.1409.0473",
    url: "https://arxiv.org/abs/1409.0473",
    citationCount: 30000,
    source: "arXiv",
  },
  // ── Word Embeddings ───────────────────────────────────────────
  glove: {
    id: "pennington2014",
    title: "GloVe: Global Vectors for Word Representation",
    authors: ["Jeffrey Pennington", "Richard Socher", "Christopher D. Manning"],
    year: 2014,
    abstract:
      "GloVe is an unsupervised learning algorithm that obtains word vector representations by training on aggregated global word-word co-occurrence statistics from a corpus. The resulting vectors exhibit meaningful linear substructures in the word vector space and outperform prior methods on word analogy tasks.",
    journal: "EMNLP 2014",
    doi: "10.3115/v1/D14-1162",
    url: "https://aclanthology.org/D14-1162",
    citationCount: 35000,
    source: "ACL Anthology",
  },
  // ── Image Segmentation ────────────────────────────────────────
  unet: {
    id: "ronneberger2015",
    title: "U-Net: Convolutional Networks for Biomedical Image Segmentation",
    authors: ["Olaf Ronneberger", "Philipp Fischer", "Thomas Brox"],
    year: 2015,
    abstract:
      "U-Net is a convolutional network architecture with a contracting path to capture context and a symmetric expanding path that enables precise localization. The network is trained end-to-end with very few images and outperforms prior methods in biomedical image segmentation tasks.",
    journal: "MICCAI 2015",
    doi: "10.1007/978-3-319-24574-4_28",
    url: "https://arxiv.org/abs/1505.04597",
    citationCount: 70000,
    source: "arXiv",
  },
  fcn: {
    id: "long2015",
    title: "Fully Convolutional Networks for Semantic Segmentation",
    authors: ["Jonathan Long", "Evan Shelhamer", "Trevor Darrell"],
    year: 2015,
    abstract:
      "We adapt contemporary classification networks (AlexNet, VGG, GoogLeNet) into fully convolutional networks that produce dense predictions for any input size. By combining fine and coarse layer predictions, FCNs achieve state-of-the-art segmentation on PASCAL VOC, NYUDv2, and SIFT Flow.",
    journal: "CVPR 2015",
    doi: "10.1109/CVPR.2015.7298965",
    url: "https://arxiv.org/abs/1411.4038",
    citationCount: 35000,
    source: "arXiv",
  },
  fpn: {
    id: "lin2017",
    title: "Feature Pyramid Networks for Object Detection",
    authors: [
      "Tsung-Yi Lin",
      "Piotr Dollár",
      "Ross Girshick",
      "Kaiming He",
      "Bharath Hariharan",
      "Serge Belongie",
    ],
    year: 2017,
    abstract:
      "Feature Pyramid Networks (FPN) exploit the inherent multi-scale, pyramidal hierarchy of deep convolutional networks to construct feature pyramids with marginal extra cost. FPN achieves state-of-the-art results on COCO object detection and segmentation tasks by enabling detection at multiple scales.",
    journal: "CVPR 2017",
    doi: "10.1109/CVPR.2017.106",
    url: "https://arxiv.org/abs/1612.03144",
    citationCount: 20000,
    source: "arXiv",
  },
  // ── Generative Models ─────────────────────────────────────────
  vae: {
    id: "kingma2014",
    title: "Auto-Encoding Variational Bayes",
    authors: ["Diederik P. Kingma", "Max Welling"],
    year: 2014,
    abstract:
      "We introduce the variational autoencoder (VAE), a directed probabilistic model whose continuous latent variables are inferred with an approximate posterior learned by an encoder network. The model is trained by maximizing a variational lower bound and enables efficient generation and representation learning.",
    journal: "ICLR 2014",
    doi: "10.48550/arXiv.1312.6114",
    url: "https://arxiv.org/abs/1312.6114",
    citationCount: 30000,
    source: "arXiv",
  },
  // ── Graph Neural Networks ─────────────────────────────────────
  gcn: {
    id: "kipf2017",
    title: "Semi-Supervised Classification with Graph Convolutional Networks",
    authors: ["Thomas N. Kipf", "Max Welling"],
    year: 2017,
    abstract:
      "We introduce graph convolutional networks (GCN), a scalable approach to semi-supervised classification on graph-structured data. GCNs use a simple layer-wise propagation rule derived from spectral graph convolutions and achieve state-of-the-art results on several benchmark datasets.",
    journal: "ICLR 2017",
    doi: "10.48550/arXiv.1609.02907",
    url: "https://arxiv.org/abs/1609.02907",
    citationCount: 20000,
    source: "arXiv",
  },
  gat: {
    id: "velickovic2018",
    title: "Graph Attention Networks",
    authors: [
      "Petar Veličković",
      "Guillem Cucurull",
      "Arantxa Casanova",
      "Adriana Romero",
      "Pietro Liò",
      "Yoshua Bengio",
    ],
    year: 2018,
    abstract:
      "Graph attention networks (GAT) leverage masked self-attention to aggregate neighborhood features with learned, node-varying attention weights. GAT matches or outperforms GCN-based methods on transductive and inductive node classification benchmarks while being more flexible and computationally efficient.",
    journal: "ICLR 2018",
    doi: "10.48550/arXiv.1710.10903",
    url: "https://arxiv.org/abs/1710.10903",
    citationCount: 15000,
    source: "arXiv",
  },
  // ── Federated Learning ────────────────────────────────────────
  fedavg: {
    id: "mcmahan2017",
    title: "Communication-Efficient Learning of Deep Networks from Decentralized Data",
    authors: [
      "H. Brendan McMahan",
      "Eider Moore",
      "Daniel Ramage",
      "Seth Hampson",
      "Blaise Agüera y Arcas",
    ],
    year: 2017,
    abstract:
      "We introduce FedAvg, a practical federated learning algorithm that trains a shared global model by averaging locally computed updates from decentralized data. FedAvg dramatically reduces communication rounds compared to naive parameter averaging while maintaining accuracy on image and text classification tasks.",
    journal: "AISTATS 2017",
    doi: "10.48550/arXiv.1602.05629",
    url: "https://arxiv.org/abs/1602.05629",
    citationCount: 15000,
    source: "arXiv",
  },
  // ── CRISPR / Gene Editing ─────────────────────────────────────
  "crispr-doudna": {
    id: "doudna2012",
    title:
      "A Programmable Dual-RNA-Guided DNA Endonuclease in Adaptive Bacterial Immunity",
    authors: [
      "Martin Jinek",
      "Krzysztof Chylinski",
      "Ines Fonfara",
      "Michael Hauer",
      "Jennifer A. Doudna",
      "Emmanuelle Charpentier",
    ],
    year: 2012,
    abstract:
      "Clustered regularly interspaced short palindromic repeats (CRISPR) together with associated Cas proteins constitute an adaptive immune system in prokaryotes. We show that Cas9 from Streptococcus pyogenes can be programmed with guide RNA to cleave specific DNA sites, enabling genome editing. A dual-RNA structure directs Cas9 to introduce double-strand breaks at specific sites in the genome.",
    journal: "Science",
    doi: "10.1126/science.1225829",
    url: "https://www.science.org/doi/10.1126/science.1225829",
    citationCount: 38000,
    source: "Science",
  },
  "crispr-ran": {
    id: "ran2013",
    title: "Genome Engineering Using the CRISPR-Cas9 System",
    authors: [
      "F. Ann Ran",
      "Patrick D. Hsu",
      "Jason Wright",
      "Vineeta Agarwala",
      "David A. Scott",
      "Feng Zhang",
    ],
    year: 2013,
    abstract:
      "The CRISPR-Cas9 system has been adapted for use in eukaryotic cells for genome editing. This protocol provides a step-by-step guide to genome engineering using CRISPR-Cas9, including design of guide RNAs, delivery into cells, and detection of genome modifications by NHEJ or HDR.",
    journal: "Nature Protocols",
    doi: "10.1038/nprot.2013.143",
    url: "https://www.nature.com/articles/nprot.2013.143",
    citationCount: 42000,
    source: "Nature Protocols",
  },
  "crispr-base-editing": {
    id: "komor2016",
    title:
      "Programmable editing of a target base in genomic DNA without double-stranded DNA cleavage",
    authors: [
      "Alexis C. Komor",
      "Yongjoo B. Kim",
      "Michael S. Packer",
      "John A. Zuris",
      "David R. Liu",
    ],
    year: 2016,
    abstract:
      "We describe base editors — fusions of CRISPR-Cas9 and a cytidine deaminase enzyme — that enable direct, irreversible conversion of one target DNA base into another in a programmable manner, without requiring double-stranded DNA cleavage or a donor template.",
    journal: "Nature",
    doi: "10.1038/nature17946",
    url: "https://www.nature.com/articles/nature17946",
    citationCount: 8000,
    source: "Nature",
  },
  "crispr-prime-editing": {
    id: "anzalone2019",
    title:
      "Search-and-replace genome editing without double-strand breaks or donor DNA",
    authors: [
      "Andrew V. Anzalone",
      "Peyton B. Randolph",
      "Jessie R. Davis",
      "Alexander A. Sousa",
      "Luke W. Koblan",
      "Jonathan M. Levy",
      "Peter J. Chen",
      "Christopher Wilson",
      "Gregory A. Newby",
      "Aditya Raguram",
      "David R. Liu",
    ],
    year: 2019,
    abstract:
      "Prime editing uses a reverse transcriptase fused to Cas9 nickase and a prime editing guide RNA to write new genetic information into a specified DNA site without double-strand breaks or donor DNA templates, enabling all 12 types of point mutations plus small insertions and deletions.",
    journal: "Nature",
    doi: "10.1038/s41586-019-1711-4",
    url: "https://www.nature.com/articles/s41586-019-1711-4",
    citationCount: 5000,
    source: "Nature",
  },
  "crispr-sickle-cell": {
    id: "frangoul2021",
    title: "CRISPR-Cas9 Gene Editing for Sickle Cell Disease and β-Thalassemia",
    authors: [
      "Haydar Frangoul",
      "David Altshuler",
      "M. Domenica Cappellini",
      "Yi-Shan Chen",
      "Jennifer Domm",
      "Brenda K. Eustace",
      "Juergen Foell",
      "Joanna de la Fuente",
      "Stephan Grupp",
      "Rupa Handgretinger",
    ],
    year: 2021,
    abstract:
      "We report the results of a phase 1/2 trial of CTX001, a CRISPR-Cas9-edited autologous hematopoietic stem cell therapy for transfusion-dependent β-thalassemia and severe sickle cell disease. Editing induced fetal hemoglobin production and eliminated disease manifestations in treated patients.",
    journal: "New England Journal of Medicine",
    doi: "10.1056/NEJMoa2031054",
    url: "https://www.nejm.org/doi/full/10.1056/NEJMoa2031054",
    citationCount: 2500,
    source: "NEJM",
  },
  // ── CAR-T Cell Therapy ───────────────────────────────────────
  "cart-june": {
    id: "june2011",
    title: "Chimeric Antigen Receptor Therapy",
    authors: [
      "Carl H. June",
      "Roddy S. O'Connor",
      "Omkar U. Kawalekar",
      "Saba Ghassemi",
      "Michael C. Milone",
    ],
    year: 2018,
    abstract:
      "Chimeric antigen receptor (CAR) T-cell therapy has achieved remarkable results in hematologic malignancies. CARs are synthetic receptors that redirect T-cell specificity and function. CAR T-cell therapy targeting CD19 has produced durable remissions in patients with relapsed or refractory leukemia and lymphoma, leading to FDA approvals.",
    journal: "Science",
    doi: "10.1126/science.aar6711",
    url: "https://www.science.org/doi/10.1126/science.aar6711",
    citationCount: 3000,
    source: "Science",
  },
  "cart-neelapu": {
    id: "neelapu2017",
    title:
      "Axicabtagene Ciloleucel CAR T-Cell Therapy in Refractory Large B-Cell Lymphoma",
    authors: [
      "Sattva S. Neelapu",
      "Frederick L. Locke",
      "Nancy L. Bartlett",
      "Lazaros J. Lekakis",
      "David B. Miklos",
      "Caron A. Jacobson",
      "Ira Braunschweig",
      "Othmane Oran",
      "Brian T. Hill",
      "Jeffrey A. Timmerman",
    ],
    year: 2017,
    abstract:
      "In the ZUMA-1 trial, axicabtagene ciloleucel (axi-cel), an anti-CD19 CAR T-cell therapy, produced an objective response rate of 82% in patients with refractory large B-cell lymphoma, with 54% achieving complete responses. Median duration of response was not reached at median follow-up.",
    journal: "New England Journal of Medicine",
    doi: "10.1056/NEJMoa1707447",
    url: "https://www.nejm.org/doi/full/10.1056/NEJMoa1707447",
    citationCount: 5000,
    source: "NEJM",
  },
  "cart-sadelain": {
    id: "sadelain2013",
    title: "The Basic Principles of Chimeric Antigen Receptor Design",
    authors: ["Michel Sadelain", "Renier Brentjens", "Isabelle Rivière"],
    year: 2013,
    abstract:
      "Chimeric antigen receptors (CARs) are recombinant receptors that provide both antigen-binding and T-cell-activating functions. CAR design incorporates an antigen-recognition domain fused to T-cell signaling domains. The choice of antigen-binding domain, hinge, transmembrane region, and signaling domains all critically affect CAR T-cell function, persistence, and safety.",
    journal: "Cancer Discovery",
    doi: "10.1158/2159-8290.CD-12-0548",
    url: "https://cancerdiscovery.aacrjournals.org/content/3/4/388",
    citationCount: 4000,
    source: "Cancer Discovery",
  },
  // ── mRNA Vaccines ─────────────────────────────────────────────
  "mrna-kariko": {
    id: "kariko2005",
    title:
      "Suppression of RNA Recognition by Toll-like Receptors: The Impact of Nucleoside Modification and the Evolutionary Origin of RNA",
    authors: [
      "Katalin Karikó",
      "Michael Buckstein",
      "Houping Ni",
      "Drew Weissman",
    ],
    year: 2005,
    abstract:
      "In vitro-transcribed RNA activates immune signaling via Toll-like receptors (TLRs), which has limited therapeutic mRNA use. We show that incorporation of naturally occurring modified nucleosides — pseudouridine, 5-methylcytidine, 2-thiouridine, and others — into mRNA suppresses TLR activation and dramatically reduces immunogenicity while preserving translational capacity. This nucleoside modification strategy enabled safe and effective mRNA therapeutics and vaccines, forming the foundational basis for COVID-19 mRNA vaccines.",
    journal: "Immunity",
    doi: "10.1016/j.immuni.2005.06.008",
    url: "https://www.cell.com/immunity/fulltext/S1074-7613(05)00242-3",
    citationCount: 5000,
    source: "Immunity",
  },
  "mrna-polack": {
    id: "polack2020",
    title: "Safety and Efficacy of the BNT162b2 mRNA Covid-19 Vaccine",
    authors: [
      "Fernando P. Polack",
      "Stephen J. Thomas",
      "Nicholas Kitchin",
      "Judith Absalon",
      "Alejandra Gurtman",
      "Stephen Lockhart",
      "John L. Perez",
      "Gonzalo Pérez Marc",
      "Edson D. Moreira",
      "Cristiano Zerbini",
    ],
    year: 2020,
    abstract:
      "In a multinational, placebo-controlled, observer-blinded Phase 3 trial involving 43,548 participants, two doses of BNT162b2 (Pfizer–BioNTech COVID-19 vaccine) conferred 95% protection against COVID-19 with an onset of effect by day 12 after the first dose. The vaccine was well tolerated, with the majority of adverse events being mild to moderate and transient. BNT162b2 encodes a prefusion-stabilized full-length SARS-CoV-2 spike protein using modified mRNA delivered in lipid nanoparticles.",
    journal: "New England Journal of Medicine",
    doi: "10.1056/NEJMoa2034577",
    url: "https://www.nejm.org/doi/full/10.1056/NEJMoa2034577",
    citationCount: 10000,
    source: "NEJM",
  },
  "mrna-baden": {
    id: "baden2021",
    title: "Efficacy and Safety of the mRNA-1273 SARS-CoV-2 Vaccine",
    authors: [
      "Lindsey R. Baden",
      "Hana M. El Sahly",
      "Brandon Essink",
      "Karen Kotloff",
      "Sharon Frey",
      "Rick Novak",
      "David Diemert",
      "Stephen A. Spector",
      "Nadine Rouphael",
      "C. Buddy Creech",
    ],
    year: 2021,
    abstract:
      "In a Phase 3 randomized, placebo-controlled trial of 30,420 participants, the mRNA-1273 vaccine (Moderna) showed 94.1% efficacy at preventing COVID-19 illness. Two doses of 100 μg were administered 28 days apart. The vaccine uses lipid nanoparticle-formulated mRNA encoding the prefusion-stabilized spike protein. Severe adverse events were rare and similar in frequency between vaccine and placebo groups.",
    journal: "New England Journal of Medicine",
    doi: "10.1056/NEJMoa2035389",
    url: "https://www.nejm.org/doi/full/10.1056/NEJMoa2035389",
    citationCount: 8000,
    source: "NEJM",
  },
  "mrna-corbett": {
    id: "corbett2020",
    title:
      "SARS-CoV-2 mRNA Vaccine Design Enabled by Prototype Pathogen Preparedness",
    authors: [
      "Kizzmekia S. Corbett",
      "Darin Edwards",
      "Sarah R. Leist",
      "Olubukola M. Abiona",
      "Seyhan Boyoglu-Barnum",
      "Rebecca A. Gillespie",
      "Sunny Himansu",
      "Alexandra Schäfer",
      "Cynthia T. Ziwawo",
      "Anthony T. DiPiazza",
    ],
    year: 2020,
    abstract:
      "The mRNA-1273 vaccine encoding the prefusion-stabilized SARS-CoV-2 spike protein was designed using prototype pathogen preparedness research on related betacoronaviruses. In mice, mRNA-1273 induced robust neutralizing antibody responses and CD4 and CD8 T cell responses. The vaccine protected against SARS-CoV-2 replication in lungs and noses of challenged mice. The 2-P stabilizing mutations derived from prior MERS-CoV spike studies were key to the immunogen design.",
    journal: "Nature",
    doi: "10.1038/s41586-020-2622-0",
    url: "https://www.nature.com/articles/s41586-020-2622-0",
    citationCount: 3000,
    source: "Nature",
  },
  // ── Climate Science ───────────────────────────────────────────
  "climate-hansen": {
    id: "hansen1988",
    title:
      "Global Climate Changes as Forecast by Goddard Institute for Space Studies Three-Dimensional Model",
    authors: [
      "James Hansen",
      "Ingrid Fung",
      "A. Lacis",
      "Drew Shindell",
      "Sergej Lebedeff",
      "Reto Ruedy",
      "Gary Russell",
      "Phil Stone",
    ],
    year: 1988,
    abstract:
      "Calculations with a general circulation model show that greenhouse warming should be clearly identifiable in the 1980s, given current trends in greenhouse gas growth. Global surface air temperature has increased by 0.5–0.7°C in the past century, consistent with the greenhouse effect. Projections indicate continued warming of 0.5–1°C per decade in the next century under business-as-usual emissions, with the greatest warming at high latitudes. CO₂ doubling produces an equilibrium warming of about 4°C in this model.",
    journal: "Journal of Geophysical Research",
    doi: "10.1029/JD093iD08p09341",
    url: "https://agupubs.onlinelibrary.wiley.com/doi/10.1029/JD093iD08p09341",
    citationCount: 8000,
    source: "Journal of Geophysical Research",
  },
  "climate-manabe": {
    id: "manabe1967",
    title:
      "Thermal Equilibrium of the Atmosphere with a Given Distribution of Relative Humidity",
    authors: ["Syukuro Manabe", "Richard T. Wetherald"],
    year: 1967,
    abstract:
      "We investigate the thermal equilibrium of the atmosphere as a function of CO₂ concentration using a radiative-convective model. Doubling atmospheric CO₂ produces a surface warming of approximately 2°C. The stratosphere cools while the troposphere and surface warm, consistent with the greenhouse mechanism. Water vapor feedback amplifies the direct CO₂ effect, and the lapse rate adjusts to maintain convective equilibrium.",
    journal: "Journal of the Atmospheric Sciences",
    doi: "10.1175/1520-0469(1967)024<0241:TEOTAW>2.0.CO;2",
    url: "https://journals.ametsoc.org/view/journals/atsc/24/3/1520-0469_1967_024_0241_teotaw_2_0_co_2.xml",
    citationCount: 6000,
    source: "Journal of the Atmospheric Sciences",
  },
  "climate-keeling": {
    id: "keeling1976",
    title:
      "Atmospheric carbon dioxide variations at Mauna Loa Observatory, Hawaii",
    authors: [
      "Charles D. Keeling",
      "Robert B. Bacastow",
      "Arnold E. Bainbridge",
      "C. A. Ekdahl",
      "Peter R. Guenther",
      "Lee S. Waterman",
    ],
    year: 1976,
    abstract:
      "Continuous measurements of atmospheric CO₂ at Mauna Loa Observatory since 1958 reveal a consistent annual rise superimposed on seasonal oscillations. The Keeling Curve demonstrates the steady anthropogenic increase in atmospheric CO₂ concentration, rising from 315 ppm in 1958 to over 330 ppm by 1976, with the rate of increase itself accelerating. This record provides the foundational empirical evidence for human-caused changes in atmospheric composition.",
    journal: "Tellus",
    doi: "10.3402/tellusa.v28i6.11288",
    url: "https://www.tandfonline.com/doi/abs/10.3402/tellusa.v28i6.11288",
    citationCount: 4000,
    source: "Tellus",
  },
  "climate-ipcc": {
    id: "ipcc2021",
    title:
      "Climate Change 2021: The Physical Science Basis (IPCC Sixth Assessment Report)",
    authors: [
      "IPCC",
      "V. Masson-Delmotte",
      "P. Zhai",
      "A. Pirani",
      "S. L. Connors",
      "C. Péan",
      "S. Berger",
      "N. Caud",
      "Y. Chen",
      "L. Goldfarb",
    ],
    year: 2021,
    abstract:
      "The IPCC Sixth Assessment Report synthesizes the latest physical science of climate change. It is unequivocal that human influence has warmed the atmosphere, ocean and land. Global surface temperature increased faster since 1970 than in any other 50-year period over at least the last 2000 years. Global mean sea level rise is accelerating. Limiting global warming to 1.5°C requires net zero CO₂ emissions by around 2050. Each increment of warming brings increasingly severe impacts.",
    journal: "Cambridge University Press",
    doi: "10.1017/9781009157896",
    url: "https://www.ipcc.ch/report/ar6/wg1/",
    citationCount: 20000,
    source: "IPCC",
  },
  // ── Economics / Monetary Policy ──────────────────────────────
  "econ-friedman": {
    id: "friedman1968",
    title: "The Role of Monetary Policy",
    authors: ["Milton Friedman"],
    year: 1968,
    abstract:
      "Monetary policy has two roles: preventing money from being a major source of economic disturbance, and providing a stable background for the economy. Inflation is always and everywhere a monetary phenomenon. The monetary authority controls nominal quantities but cannot peg real quantities permanently. The natural rate of unemployment is the level consistent with the Walrasian general equilibrium equations.",
    journal: "American Economic Review",
    doi: "10.2307/1831652",
    url: "https://www.jstor.org/stable/1831652",
    citationCount: 12000,
    source: "American Economic Review",
  },
  "econ-taylor-rule": {
    id: "taylor1993",
    title: "Discretion versus policy rules in practice",
    authors: ["John B. Taylor"],
    year: 1993,
    abstract:
      "This paper examines how policy rules for the federal funds rate can be used in the actual conduct of monetary policy. A simple policy rule — setting the federal funds rate based on inflation and the output gap — is shown to describe Federal Reserve policy reasonably well and to have good performance properties. The Taylor rule has become a benchmark for monetary policy evaluation worldwide.",
    journal: "Carnegie-Rochester Conference Series on Public Policy",
    doi: "10.1016/0167-2231(93)90009-L",
    url: "https://www.sciencedirect.com/science/article/pii/016722319390009L",
    citationCount: 15000,
    source: "Carnegie-Rochester",
  },
  "econ-clarida": {
    id: "clarida1999",
    title: "The Science of Monetary Policy: A New Keynesian Perspective",
    authors: ["Richard Clarida", "Jordi Galí", "Mark Gertler"],
    year: 1999,
    abstract:
      "We review the recent literature on monetary policy rules using a simple New Keynesian framework. The optimal policy problem involves a tradeoff between inflation and output gap stabilization. Central bank credibility and commitment to rules yield better macroeconomic outcomes than discretionary policy. Interest rate rules that respond to inflation and the output gap — the Taylor rule — approximate optimal policy well.",
    journal: "Journal of Economic Literature",
    doi: "10.1257/jel.37.4.1661",
    url: "https://www.aeaweb.org/articles?id=10.1257/jel.37.4.1661",
    citationCount: 8000,
    source: "Journal of Economic Literature",
  },
  "econ-bernanke": {
    id: "bernanke1995",
    title:
      "Inside the Black Box: The Credit Channel of Monetary Policy Transmission",
    authors: ["Ben S. Bernanke", "Mark Gertler"],
    year: 1995,
    abstract:
      "The credit channel of monetary policy transmission operates through two mechanisms: the balance sheet channel and the bank lending channel. Monetary tightening reduces borrower net worth and bank lending capacity, amplifying the effects of policy on real activity. These financial accelerator effects help explain why small changes in monetary policy can have large real effects.",
    journal: "Journal of Economic Perspectives",
    doi: "10.1257/jep.9.4.27",
    url: "https://www.aeaweb.org/articles?id=10.1257/jep.9.4.27",
    citationCount: 6000,
    source: "Journal of Economic Perspectives",
  },
  // ── Computer Vision ───────────────────────────────────────────
  alexnet: {
    id: "krizhevsky2012",
    title: "ImageNet Classification with Deep Convolutional Neural Networks",
    authors: ["Alex Krizhevsky", "Ilya Sutskever", "Geoffrey E. Hinton"],
    year: 2012,
    abstract:
      "We trained a large, deep convolutional neural network to classify 1.2 million high-resolution ImageNet images into 1000 classes. The network has 60 million parameters, five convolutional layers with max-pooling, and three fully connected layers. Using non-saturating neurons, GPU convolution, and dropout regularization, we achieved a top-5 error rate of 15.3% on ILSVRC-2012, outperforming the second-best entry by 10.9 percentage points.",
    journal: "Advances in Neural Information Processing Systems (NeurIPS)",
    doi: "10.1145/3065386",
    url: "https://papers.nips.cc/paper/2012/hash/c399862d3b9d6b76c8436e924a68c45b-Abstract.html",
    citationCount: 120000,
    source: "NeurIPS",
  },
  vgg: {
    id: "simonyan2014",
    title: "Very Deep Convolutional Networks for Large-Scale Image Recognition",
    authors: ["Karen Simonyan", "Andrew Zisserman"],
    year: 2014,
    abstract:
      "We investigate the effect of convolutional network depth on accuracy in large-scale image recognition. Using very small 3×3 convolution filters, we show that depth is a critical component, achieving top performance with 16-19 weight layers. Our VGGNet won first and second place in localisation and classification tracks of ILSVRC-2014.",
    journal: "ICLR 2015",
    doi: "10.48550/arXiv.1409.1556",
    url: "https://arxiv.org/abs/1409.1556",
    citationCount: 80000,
    source: "arXiv",
  },
  yolo: {
    id: "redmon2016",
    title: "You Only Look Once: Unified, Real-Time Object Detection",
    authors: [
      "Joseph Redmon",
      "Santosh Divvala",
      "Ross Girshick",
      "Ali Farhadi",
    ],
    year: 2016,
    abstract:
      "We present YOLO, a new approach to object detection that frames detection as a regression problem from image pixels to bounding box coordinates and class probabilities. A single neural network predicts bounding boxes and class probabilities directly from full images in one evaluation, enabling real-time detection at 45 frames per second.",
    journal: "CVPR 2016",
    doi: "10.1109/CVPR.2016.91",
    url: "https://arxiv.org/abs/1506.02640",
    citationCount: 30000,
    source: "arXiv",
  },
  vit: {
    id: "dosovitskiy2020",
    title:
      "An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale",
    authors: [
      "Alexey Dosovitskiy",
      "Lucas Beyer",
      "Alexander Kolesnikov",
      "Dirk Weissenborn",
      "Xiaohua Zhai",
      "Thomas Unterthiner",
      "Mostafa Dehghani",
      "Matthias Minderer",
      "Georg Heigold",
      "Sylvain Gelly",
      "Jakob Uszkoreit",
      "Neil Houlsby",
    ],
    year: 2020,
    abstract:
      "We show that a pure transformer applied directly to sequences of image patches can perform very well on image classification tasks. Vision Transformer (ViT) attains excellent results compared to state-of-the-art CNNs while requiring substantially fewer computational resources to train.",
    journal: "ICLR 2021",
    doi: "10.48550/arXiv.2010.11929",
    url: "https://arxiv.org/abs/2010.11929",
    citationCount: 40000,
    source: "arXiv",
  },
  // ── Computer Networks ─────────────────────────────────────────
  "tcp-rfc793": {
    id: "postel1981",
    title: "Transmission Control Protocol",
    authors: ["Jon Postel"],
    year: 1981,
    abstract:
      "The Transmission Control Protocol (TCP) provides reliable, ordered, and error-checked delivery of a stream of octets between applications running on hosts communicating over an IP network. TCP uses a three-way handshake to establish connections, sequence numbers for ordering, and acknowledgment with retransmission for reliability. RFC 793 defines the foundational specification that remains the dominant transport protocol for internet applications.",
    journal: "RFC 793, IETF",
    doi: "10.17487/RFC0793",
    url: "https://www.rfc-editor.org/rfc/rfc793",
    citationCount: 15000,
    source: "IETF RFC",
  },
  "udp-rfc768": {
    id: "postel1980",
    title: "User Datagram Protocol",
    authors: ["Jon Postel"],
    year: 1980,
    abstract:
      "The User Datagram Protocol (UDP) is a connectionless transport-layer protocol that provides a minimal, unreliable datagram delivery service without establishing a connection or guaranteeing delivery, ordering, or duplicate protection. UDP is suitable for latency-sensitive applications where some packet loss is acceptable and the overhead of TCP connection management is undesirable. It is widely used for DNS queries, video streaming, VoIP, and online gaming where application-layer reliability can be implemented selectively.",
    journal: "RFC 768, IETF",
    doi: "10.17487/RFC0768",
    url: "https://www.rfc-editor.org/rfc/rfc768",
    citationCount: 5000,
    source: "IETF RFC",
  },
  "rest-fielding": {
    id: "fielding2000",
    title: "Architectural Styles and the Design of Network-based Software Architectures",
    authors: ["Roy Thomas Fielding"],
    year: 2000,
    abstract:
      "Fielding's doctoral dissertation introduces Representational State Transfer (REST), an architectural style for distributed hypermedia systems derived from analyzing the design principles of the World Wide Web. REST defines six architectural constraints — statelessness, client-server separation, cacheability, uniform interface, layered system, and code-on-demand — that collectively produce scalable, reliable, and evolvable web services. The REST architectural style has become the dominant paradigm for web API design and underpins the modern internet.",
    journal: "University of California, Irvine (PhD Thesis)",
    url: "https://ics.uci.edu/~fielding/pubs/dissertation/top.htm",
    citationCount: 20000,
    source: "UC Irvine",
  },
  "www-berners-lee": {
    id: "bernerslee1994",
    title: "The World Wide Web",
    authors: ["Tim Berners-Lee", "Robert Cailliau", "Ari Luotonen", "Henrik Frystyk Nielsen", "Arthur Secret"],
    year: 1994,
    abstract:
      "Berners-Lee and colleagues describe the World Wide Web as a wide-area hypermedia information retrieval initiative providing universal access to a large universe of documents linked via uniform resource locators (URLs). The paper describes the architecture of the Web — including URLs, HTTP, and HTML — and the design goals of universality, decentralization, and interoperability that enabled the Web to scale globally. This paper traces the evolution from a CERN internal project to a global information system that transformed communication and commerce.",
    journal: "Communications of the ACM",
    doi: "10.1145/179606.179671",
    url: "https://dl.acm.org/doi/10.1145/179606.179671",
    citationCount: 8000,
    source: "ACM",
  },
  "quic-rfc9000": {
    id: "iyengar2021",
    title: "QUIC: A UDP-Based Multiplexed and Secure Transport",
    authors: ["Jana Iyengar", "Martin Thomson"],
    year: 2021,
    abstract:
      "QUIC is a transport protocol built on UDP that provides reliable, ordered delivery with reduced connection establishment latency through 0-RTT and 1-RTT handshakes, subsetting the capabilities of TCP+TLS while adding stream multiplexing without head-of-line blocking. QUIC encrypts all transport header fields and payload by default, preventing ossification by middleboxes and improving privacy. RFC 9000 standardizes QUIC as the transport for HTTP/3, addressing many TCP limitations for modern latency-sensitive web applications.",
    journal: "RFC 9000, IETF",
    doi: "10.17487/RFC9000",
    url: "https://www.rfc-editor.org/rfc/rfc9000",
    citationCount: 3000,
    source: "IETF RFC",
  },
  // ── Operating Systems ─────────────────────────────────────────
  "unix-ritchie": {
    id: "ritchie1974",
    title: "The UNIX Time-Sharing System",
    authors: ["Dennis M. Ritchie", "Ken Thompson"],
    year: 1974,
    abstract:
      "Ritchie and Thompson describe the UNIX time-sharing system, a general-purpose, multi-user, interactive operating system featuring a hierarchical file system, separate processes for each user command, a shell command language, and a uniform interface through file descriptors. UNIX introduced foundational abstractions — pipes for process communication, fork for process creation, and the everything-is-a-file philosophy — that have shaped operating system design for five decades. The paper remains a landmark in systems software for its emphasis on simplicity and composability.",
    journal: "Communications of the ACM",
    doi: "10.1145/361011.361061",
    url: "https://dl.acm.org/doi/10.1145/361011.361061",
    citationCount: 12000,
    source: "ACM",
  },
  "cooperating-dijkstra": {
    id: "dijkstra1965",
    title: "Cooperating Sequential Processes",
    authors: ["Edsger W. Dijkstra"],
    year: 1965,
    abstract:
      "Dijkstra introduces the concept of cooperating sequential processes sharing memory and presents the mutual exclusion problem, defining semaphores as a synchronization primitive to coordinate concurrent access to shared resources. The paper demonstrates semaphores solving the producer-consumer and dining philosophers problems, establishing key abstractions for concurrent programming. This work laid the mathematical foundation for concurrency theory and remains a cornerstone of operating systems and programming language design.",
    journal: "Technical Report EWD-123, Eindhoven University of Technology",
    url: "https://www.cs.utexas.edu/users/EWD/transcriptions/EWD01xx/EWD123.html",
    citationCount: 8000,
    source: "EWD",
  },
  "time-clocks-lamport": {
    id: "lamport1978",
    title: "Time, Clocks, and the Ordering of Events in a Distributed System",
    authors: ["Leslie Lamport"],
    year: 1978,
    abstract:
      "Lamport introduces logical clocks — a mechanism for assigning timestamps to events in a distributed system — and defines the 'happened-before' partial ordering relation consistent with causality. The paper shows how logical clocks can impose a total ordering on all events and uses this to solve distributed mutual exclusion without a central coordinator. This foundational result underpins distributed systems theory including vector clocks, eventual consistency, and distributed database design.",
    journal: "Communications of the ACM",
    doi: "10.1145/359545.359563",
    url: "https://dl.acm.org/doi/10.1145/359545.359563",
    citationCount: 15000,
    source: "ACM",
  },
  "mapreduce-dean": {
    id: "dean2004",
    title: "MapReduce: Simplified Data Processing on Large Clusters",
    authors: ["Jeffrey Dean", "Sanjay Ghemawat"],
    year: 2004,
    abstract:
      "MapReduce is a programming model and implementation for processing and generating large datasets across clusters of commodity machines, in which users specify a map function producing intermediate key-value pairs and a reduce function merging values for each key. The runtime system automatically partitions input, schedules execution, handles machine failures, and manages inter-machine communication, enabling non-expert programmers to harness large distributed systems. MapReduce became Google's primary data processing framework and inspired Apache Hadoop, transforming large-scale data engineering.",
    journal: "OSDI 2004",
    doi: "10.1145/1327452.1327492",
    url: "https://dl.acm.org/doi/10.1145/1327452.1327492",
    citationCount: 18000,
    source: "ACM",
  },
  "gfs-ghemawat": {
    id: "ghemawat2003",
    title: "The Google File System",
    authors: ["Sanjay Ghemawat", "Howard Gobioff", "Shun-Tak Leung"],
    year: 2003,
    abstract:
      "The Google File System (GFS) is a scalable distributed file system designed for large data-intensive applications on clusters of inexpensive commodity hardware, making design choices including a single master for metadata, 64 MB chunks, and atomic record append operations optimized for large sequential reads and appends. GFS relaxes POSIX consistency to achieve high throughput and fault tolerance across thousands of machines through replication and master-coordinated recovery. GFS has influenced subsequent distributed storage systems including Hadoop HDFS and serves as a foundational design in cloud storage architecture.",
    journal: "SOSP 2003",
    doi: "10.1145/945445.945450",
    url: "https://dl.acm.org/doi/10.1145/945445.945450",
    citationCount: 14000,
    source: "ACM",
  },
  // ── Database Systems ──────────────────────────────────────────
  "relational-codd": {
    id: "codd1970",
    title: "A Relational Model of Data for Large Shared Data Banks",
    authors: ["Edgar F. Codd"],
    year: 1970,
    abstract:
      "Codd proposes a relational model of data based on mathematical set theory and first-order predicate logic, in which data is represented as relations (tables) with rows and columns and operations such as selection, projection, and join are defined as set operations. The model decouples the physical storage representation of data from its logical structure, enabling data independence and a foundation for declarative query languages. This paper gave rise to relational database management systems and SQL, transforming enterprise data management.",
    journal: "Communications of the ACM",
    doi: "10.1145/362384.362685",
    url: "https://dl.acm.org/doi/10.1145/362384.362685",
    citationCount: 22000,
    source: "ACM",
  },
  "dynamo-decandia": {
    id: "decandia2007",
    title: "Dynamo: Amazon's Highly Available Key-value Store",
    authors: [
      "Giuseppe DeCandia",
      "Deniz Hastorun",
      "Madan Jampani",
      "Gunavardhan Kakulapati",
      "Avinash Lakshman",
      "Alex Pilchin",
      "Swaminathan Sivasubramanian",
      "Peter Vosshall",
      "Werner Vogels",
    ],
    year: 2007,
    abstract:
      "Amazon's Dynamo is a highly available key-value storage system that sacrifices consistency under certain failure scenarios in favor of availability and partition tolerance, combining consistent hashing for data partitioning, vector clocks for versioning, anti-entropy with Merkle trees for replica synchronization, and a gossip protocol for failure detection. Dynamo's always-writable design ensures that shopping carts and other critical services remain available even during network partitions or server failures. This paper has been foundational in the design of NoSQL databases and the formulation of the CAP theorem trade-offs.",
    journal: "SOSP 2007",
    doi: "10.1145/1294261.1294281",
    url: "https://dl.acm.org/doi/10.1145/1294261.1294281",
    citationCount: 8000,
    source: "ACM",
  },
  "bigtable-chang": {
    id: "chang2006",
    title: "Bigtable: A Distributed Storage System for Structured Data",
    authors: [
      "Fay Chang",
      "Jeffrey Dean",
      "Sanjay Ghemawat",
      "Wilson C. Hsieh",
      "Deborah A. Wallach",
      "Mike Burrows",
      "Tushar Chandra",
      "Andrew Fikes",
      "Robert E. Gruber",
    ],
    year: 2006,
    abstract:
      "Bigtable is a distributed storage system for structured data at Google, designed to scale to petabytes across thousands of commodity servers, organized as a sparse, distributed, persistent, multi-dimensional sorted map indexed by row key, column key, and timestamp. Bigtable supports a wide range of demanding workloads across Google Search, Google Maps, and Google Analytics by providing flexible schema and tunable performance characteristics. Bigtable has inspired subsequent wide-column stores including Apache HBase and Apache Cassandra.",
    journal: "OSDI 2006",
    doi: "10.1145/1365815.1365816",
    url: "https://dl.acm.org/doi/10.1145/1365815.1365816",
    citationCount: 10000,
    source: "ACM",
  },
  "nosql-stonebraker": {
    id: "stonebraker2011",
    title: "Ten Rules for Scalable Performance in 'Simple Operation' Datastores",
    authors: ["Michael Stonebraker", "Rick Cattel"],
    year: 2011,
    abstract:
      "Stonebraker and Cattel identify ten rules that distinguish scalable 'simple operation' datastores — including key-value stores and document databases — from traditional relational systems, covering schema-less data models, horizontal partitioning and replication, distributed query processing, and relaxed ACID semantics. The rules explain why certain high-throughput workloads benefit from NoSQL architectures and frame the trade-offs between consistency, availability, and performance at scale. This paper provides a principled framework for evaluating and selecting modern database systems.",
    journal: "Communications of the ACM",
    doi: "10.1145/1995376.1995400",
    url: "https://dl.acm.org/doi/10.1145/1995376.1995400",
    citationCount: 1500,
    source: "ACM",
  },
  "cassandra-lakshman": {
    id: "lakshman2010",
    title: "Cassandra: A Decentralized Structured Storage System",
    authors: ["Avinash Lakshman", "Prashant Malik"],
    year: 2010,
    abstract:
      "Apache Cassandra is a highly scalable, high-performance distributed storage system for managing very large amounts of structured data across commodity servers, combining the distributed hash table approach of Amazon's Dynamo with the column-family data model of Google's Bigtable. Cassandra provides tunable consistency levels, allowing operators to trade consistency for availability on a per-request basis, and was designed for Facebook's Inbox Search to handle massive write throughput with no single point of failure. The system's decentralized peer-to-peer architecture and linear scalability made it a foundational technology for internet-scale applications.",
    journal: "ACM SIGOPS Operating Systems Review",
    doi: "10.1145/1773912.1773922",
    url: "https://dl.acm.org/doi/10.1145/1773912.1773922",
    citationCount: 6000,
    source: "ACM",
  },
  // ── Cybersecurity ─────────────────────────────────────────────
  "rsa-rivest": {
    id: "rivest1978",
    title: "A Method for Obtaining Digital Signatures and Public-Key Cryptosystems",
    authors: ["Ronald L. Rivest", "Adi Shamir", "Leonard Adleman"],
    year: 1978,
    abstract:
      "Rivest, Shamir, and Adleman introduce the RSA public-key cryptosystem based on the computational difficulty of factoring the product of two large prime numbers, providing both encryption and digital signature functionality. A message encrypted with a recipient's public key can only be decrypted with their private key, enabling secure communication without prior shared secret exchange. RSA has become the most widely deployed public-key cryptosystem, forming the basis of HTTPS, PGP, digital certificates, and secure internet infrastructure.",
    journal: "Communications of the ACM",
    doi: "10.1145/359340.359342",
    url: "https://dl.acm.org/doi/10.1145/359340.359342",
    citationCount: 18000,
    source: "ACM",
  },
  "diffie-hellman": {
    id: "diffie1976",
    title: "New Directions in Cryptography",
    authors: ["Whitfield Diffie", "Martin E. Hellman"],
    year: 1976,
    abstract:
      "Diffie and Hellman introduce the concept of public-key cryptography, in which communicating parties can share a public key while keeping a private key secret, eliminating the need for a previously exchanged secret key. The paper proposes a key exchange protocol based on the computational difficulty of discrete logarithms, allowing two parties to establish a shared secret over an insecure channel that an eavesdropper cannot compute. This work revolutionized cryptography, laid the mathematical foundation for secure communications on public networks, and predates the RSA algorithm.",
    journal: "IEEE Transactions on Information Theory",
    doi: "10.1109/TIT.1976.1055638",
    url: "https://ieeexplore.ieee.org/document/1055638",
    citationCount: 25000,
    source: "IEEE",
  },
  "tls13-rescorla": {
    id: "rescorla2018",
    title: "The Transport Layer Security (TLS) Protocol Version 1.3",
    authors: ["Eric Rescorla"],
    year: 2018,
    abstract:
      "TLS 1.3, standardized in RFC 8446, is a major revision of the TLS protocol that reduces handshake latency to one round-trip time (1-RTT) by default and supports 0-RTT session resumption, while removing obsolete and insecure cryptographic constructs including RSA key transport, CBC-mode ciphers, and MD5/SHA-1. All traffic is forward-secret by default, preventing decryption of recorded traffic even if long-term keys are later compromised. TLS 1.3 is the foundation of secure web communications and has been rapidly adopted across HTTPS, email, and VPN protocols.",
    journal: "RFC 8446, IETF",
    doi: "10.17487/RFC8446",
    url: "https://www.rfc-editor.org/rfc/rfc8446",
    citationCount: 3000,
    source: "IETF RFC",
  },
  "security-engineering-anderson": {
    id: "anderson2020",
    title: "Security Engineering: A Guide to Building Dependable Distributed Systems",
    authors: ["Ross J. Anderson"],
    year: 2020,
    abstract:
      "Anderson's Security Engineering provides a comprehensive treatment of how to build dependable distributed systems that are secure against both technical attacks and human and organizational factors, covering threat modeling, cryptographic protocols, access control, network security, and psychological aspects of security failures. The book synthesizes decades of real-world security incidents into practical design principles for trustworthy systems across banking, healthcare, military, and critical infrastructure. The third edition reflects lessons from modern adversarial environments including nation-state attacks, ransomware, and privacy regulation.",
    journal: "Wiley",
    url: "https://www.cl.cam.ac.uk/~rja14/book.html",
    citationCount: 5000,
    source: "Wiley",
  },
  "shor-quantum": {
    id: "shor1994",
    title: "Algorithms for Quantum Computation: Discrete Logarithms and Factoring",
    authors: ["Peter W. Shor"],
    year: 1994,
    abstract:
      "Shor presents polynomial-time quantum algorithms for integer factorization and the discrete logarithm problem, both of which underlie the security of RSA and Diffie-Hellman cryptosystems used throughout internet security. The algorithms exploit quantum parallelism and the quantum Fourier transform to find the period of a modular function exponentially faster than any known classical algorithm. Shor's algorithm demonstrates that sufficiently large quantum computers would render current public-key cryptography insecure, directly motivating the field of post-quantum cryptography.",
    journal: "Proceedings of the 35th Annual Symposium on Foundations of Computer Science (FOCS)",
    doi: "10.1109/SFCS.1994.365700",
    url: "https://ieeexplore.ieee.org/document/365700",
    citationCount: 12000,
    source: "IEEE",
  },
  // ── Cloud Computing ───────────────────────────────────────────
  "cloud-armbrust": {
    id: "armbrust2010",
    title: "A View of Cloud Computing",
    authors: [
      "Michael Armbrust",
      "Armando Fox",
      "Rean Griffith",
      "Anthony D. Joseph",
      "Randy Katz",
      "Andy Konwinski",
      "Gunho Lee",
      "David Patterson",
      "Ariel Rabkin",
      "Ion Stoica",
      "Matei Zaharia",
    ],
    year: 2010,
    abstract:
      "Armbrust and colleagues from UC Berkeley define cloud computing as the delivery of computing resources — servers, storage, networking, and software — over the internet with on-demand access and pay-per-use pricing, and identify ten obstacles and opportunities including data confidentiality, software licensing, data transfer bottlenecks, and unpredictable performance. The paper distinguishes cloud computing from prior outsourcing by its elasticity and the illusion of infinite compute resources, and characterizes three cloud service models: IaaS, PaaS, and SaaS. This work has become a canonical definition and analysis of cloud computing concepts and economic trade-offs.",
    journal: "Communications of the ACM",
    doi: "10.1145/1721654.1721672",
    url: "https://dl.acm.org/doi/10.1145/1721654.1721672",
    citationCount: 15000,
    source: "ACM",
  },
  "xen-barham": {
    id: "barham2003",
    title: "Xen and the Art of Virtualization",
    authors: [
      "Paul Barham",
      "Boris Dragovic",
      "Keir Fraser",
      "Steven Hand",
      "Tim Harris",
      "Alex Ho",
      "Rolf Neugebauer",
      "Ian Pratt",
      "Andrew Warfield",
    ],
    year: 2003,
    abstract:
      "Xen introduces paravirtualization, a technique that allows multiple operating systems to run simultaneously on a single physical machine with near-native performance by modifying the guest OS to use a thin virtual machine monitor (VMM) API instead of privileged hardware instructions. Xen achieves much lower overhead than full virtualization — within a few percent of native performance for most workloads — while supporting strong isolation between guest domains. Xen formed the basis of commercial cloud infrastructure, including early Amazon EC2, and demonstrated the viability of virtual machine technology for data center workloads.",
    journal: "SOSP 2003",
    doi: "10.1145/945445.945462",
    url: "https://dl.acm.org/doi/10.1145/945445.945462",
    citationCount: 8000,
    source: "ACM",
  },
  "docker-merkel": {
    id: "merkel2014",
    title: "Docker: Lightweight Linux Containers for Consistent Development and Deployment",
    authors: ["Dirk Merkel"],
    year: 2014,
    abstract:
      "Docker is an open platform for building, shipping, and running distributed applications using Linux container technology — namespaces and cgroups — providing lightweight process isolation without the overhead of full virtual machines, enabling faster startup and higher density per host. Docker's layered image format, Dockerfile build specification, and registry ecosystem made application packaging and environment reproducibility accessible to developers without deep systems knowledge. Docker revolutionized software deployment practices and became the foundation of cloud-native application delivery and container orchestration.",
    journal: "Linux Journal",
    url: "https://www.linuxjournal.com/content/docker-lightweight-linux-containers-consistent-development-and-deployment",
    citationCount: 4000,
    source: "Linux Journal",
  },
  "kubernetes-burns": {
    id: "burns2016",
    title: "Borg, Omega, and Kubernetes",
    authors: ["Brendan Burns", "Brian Grant", "David Oppenheimer", "Eric Brewer", "John Wilkes"],
    year: 2016,
    abstract:
      "Burns and colleagues describe the evolution from Google's Borg and Omega internal cluster management systems to Kubernetes, an open-source container orchestration platform incorporating lessons learned from a decade of production cluster management at scale. The paper explains key design decisions in Kubernetes including pods as the unit of scheduling, label selectors for grouping, service abstraction for discovery, and declarative configuration for desired state management. Kubernetes has become the de facto standard for container orchestration and has shaped how distributed applications are deployed in production cloud environments.",
    journal: "ACM Queue",
    doi: "10.1145/2898442.2898444",
    url: "https://dl.acm.org/doi/10.1145/2898442.2898444",
    citationCount: 3000,
    source: "ACM",
  },
  "cluster-fox": {
    id: "fox1997",
    title: "Cluster-Based Scalable Network Services",
    authors: [
      "Armando Fox",
      "Steven D. Gribble",
      "Yatin Chawathe",
      "Eric A. Brewer",
      "Paul Gauthier",
    ],
    year: 1997,
    abstract:
      "Fox and colleagues present the design of cluster-based scalable network services using a base station architecture that partitions services into stateless front ends and stateful back ends across commodity PC clusters, introducing fast restartable processes and the BASE (basically available, soft state, eventually consistent) properties as an alternative to strict ACID for high-availability internet services. The paper demonstrates that commodity hardware clusters can deliver high availability and scalability for web services at a fraction of the cost of specialized hardware. This work anticipated key principles of modern microservices and cloud architecture and laid the intellectual groundwork for the CAP theorem.",
    journal: "SOSP 1997",
    doi: "10.1145/268998.269023",
    url: "https://dl.acm.org/doi/10.1145/268998.269023",
    citationCount: 2000,
    source: "ACM",
  },
  // ── Computer Vision (new) ─────────────────────────────────────
  "fast-rcnn": {
    id: "girshick2015",
    title: "Fast R-CNN",
    authors: ["Ross Girshick"],
    year: 2015,
    abstract:
      "Fast R-CNN improves upon R-CNN and SPPnet for object detection by jointly training a convolutional feature extractor, a region of interest (RoI) pooling layer, and classification and bounding-box regression heads in a single end-to-end network, eliminating the multi-stage training pipeline. The unified architecture processes the entire image with a single ConvNet forward pass and achieves 9× faster training and 213× faster inference than R-CNN while improving detection accuracy. Fast R-CNN achieved state-of-the-art results on PASCAL VOC 2010-12 and formed the basis of subsequent two-stage object detectors including Faster R-CNN.",
    journal: "ICCV 2015",
    doi: "10.1109/ICCV.2015.169",
    url: "https://arxiv.org/abs/1504.08083",
    citationCount: 20000,
    source: "arXiv",
  },
  // ── NLP Advanced ──────────────────────────────────────────────
  "roberta-liu": {
    id: "liu2019roberta",
    title: "RoBERTa: A Robustly Optimized BERT Pretraining Approach",
    authors: [
      "Yinhan Liu",
      "Myle Ott",
      "Naman Goyal",
      "Jingfei Du",
      "Mandar Joshi",
      "Danqi Chen",
      "Omer Levy",
      "Mike Lewis",
      "Luke Zettlemoyer",
      "Veselin Stoyanov",
    ],
    year: 2019,
    abstract:
      "RoBERTa revisits the BERT pretraining procedure and demonstrates that BERT was significantly undertrained, showing that training longer with bigger batches, removing the next sentence prediction objective, training on longer sequences, and using a larger byte-pair encoding vocabulary substantially improves performance. RoBERTa matches or exceeds the performance of all post-BERT methods on GLUE, SQuAD, and RACE benchmarks without architectural changes. The study establishes rigorous baselines for BERT-style pretraining and shows that data and compute choices matter as much as architecture.",
    journal: "arXiv",
    doi: "10.48550/arXiv.1907.11692",
    url: "https://arxiv.org/abs/1907.11692",
    citationCount: 18000,
    source: "arXiv",
  },
  "llama-touvron": {
    id: "touvron2023",
    title: "LLaMA: Open and Efficient Foundation Language Models",
    authors: [
      "Hugo Touvron",
      "Thibaut Lavril",
      "Gautier Izacard",
      "Xavier Martinet",
      "Marie-Anne Lachaux",
      "Timothée Lacroix",
      "Baptiste Rozière",
      "Naman Goyal",
      "Eric Hambro",
      "Faisal Azhar",
    ],
    year: 2023,
    abstract:
      "LLaMA introduces a collection of foundation language models ranging from 7B to 65B parameters trained exclusively on publicly available datasets, demonstrating that training smaller models on more data yields better performance per inference compute than training larger models on less data. LLaMA-13B outperforms GPT-3 (175B) on most NLP benchmarks, and LLaMA-65B is competitive with Chinchilla and PaLM-540B. By releasing model weights to the research community, LLaMA enabled a wave of open research on large language model fine-tuning, alignment, and applications.",
    journal: "arXiv",
    doi: "10.48550/arXiv.2302.13971",
    url: "https://arxiv.org/abs/2302.13971",
    citationCount: 20000,
    source: "arXiv",
  },
  "xlnet-yang": {
    id: "yang2019xlnet",
    title: "XLNet: Generalized Autoregressive Pretraining for Language Understanding",
    authors: [
      "Zhilin Yang",
      "Zihang Dai",
      "Yiming Yang",
      "Jaime Carbonell",
      "Ruslan Salakhutdinov",
      "Quoc V. Le",
    ],
    year: 2019,
    abstract:
      "XLNet is a generalized autoregressive language model that overcomes the pretrain-finetune discrepancy of masked language models by learning to predict tokens in all possible permutation orders of the input sequence. By combining permutation language modeling with Transformer-XL's segment-level recurrence, XLNet captures bidirectional context without relying on the corrupting [MASK] token, avoiding the independence assumption of BERT's masked positions. XLNet outperforms BERT on 20 tasks including question answering, natural language inference, sentiment analysis, and document ranking.",
    journal: "NeurIPS 2019",
    doi: "10.48550/arXiv.1906.08237",
    url: "https://arxiv.org/abs/1906.08237",
    citationCount: 8000,
    source: "arXiv",
  },
  "bart-lewis": {
    id: "lewis2020bart",
    title: "BART: Denoising Sequence-to-Sequence Pre-training for Natural Language Generation, Translation, and Comprehension",
    authors: [
      "Mike Lewis",
      "Yinhan Liu",
      "Naman Goyal",
      "Marjan Ghazvininejad",
      "Abdelrahman Mohamed",
      "Omer Levy",
      "Veselin Stoyanov",
      "Luke Zettlemoyer",
    ],
    year: 2020,
    abstract:
      "BART is a denoising autoencoder for pretraining sequence-to-sequence models, trained by corrupting text with arbitrary noising functions — token masking, deletion, permutation, and document rotation — and learning to reconstruct the original text with a bidirectional encoder and autoregressive decoder. The architecture generalizes BERT (bidirectional encoder) and GPT (left-to-right decoder), making it effective for both text understanding and generation tasks. BART achieves state-of-the-art results on abstractive summarization (CNN/DM, XSum), machine translation, and conversational question answering.",
    journal: "ACL 2020",
    doi: "10.18653/v1/2020.acl-main.703",
    url: "https://arxiv.org/abs/1910.13461",
    citationCount: 8000,
    source: "arXiv",
  },
  "electra-clark": {
    id: "clark2020electra",
    title: "ELECTRA: Pre-training Text Encoders as Discriminators Rather Than Generators",
    authors: ["Kevin Clark", "Minh-Thang Luong", "Quoc V. Le", "Christopher D. Manning"],
    year: 2020,
    abstract:
      "ELECTRA introduces a more sample-efficient pretraining method that trains a discriminator to distinguish real input tokens from plausible but synthetically generated replacements produced by a small generator network, rather than predicting masked tokens. Unlike BERT's masked language modeling objective — which only learns from 15% of tokens per step — ELECTRA's replaced token detection loss applies to every input token, yielding significantly better performance with the same compute budget. A small ELECTRA model trained on one GPU for four days outperforms GPT on the GLUE benchmark, and ELECTRA-Large matches RoBERTa with only 25% of the compute.",
    journal: "ICLR 2020",
    doi: "10.48550/arXiv.2003.10555",
    url: "https://arxiv.org/abs/2003.10555",
    citationCount: 5000,
    source: "arXiv",
  },
  // ── Software Engineering ──────────────────────────────────────
  "microservices-fowler": {
    id: "fowler2014microservices",
    title: "Microservices",
    authors: ["Martin Fowler", "James Lewis"],
    year: 2014,
    abstract:
      "Fowler and Lewis define the microservices architectural style as an approach to developing a single application as a suite of small, independently deployable services, each running in its own process and communicating with lightweight mechanisms such as HTTP APIs, organized around business capabilities. Microservices enable independent deployment, technology heterogeneity, and fine-grained scalability, but introduce distributed systems complexity including network latency, partial failure, and operational overhead compared to monolithic architectures. The article has been widely cited as the defining reference for microservices architecture and the trade-offs compared to monoliths.",
    journal: "martinfowler.com",
    url: "https://martinfowler.com/articles/microservices.html",
    citationCount: 3000,
    source: "martinfowler.com",
  },
  "agile-manifesto": {
    id: "beck2001agile",
    title: "Manifesto for Agile Software Development",
    authors: [
      "Kent Beck",
      "Mike Beedle",
      "Arie van Bennekum",
      "Alistair Cockburn",
      "Ward Cunningham",
      "Martin Fowler",
      "James Grenning",
      "Jim Highsmith",
      "Andrew Hunt",
      "Ron Jeffries",
    ],
    year: 2001,
    abstract:
      "The Agile Manifesto articulates four values — individuals and interactions over processes and tools, working software over comprehensive documentation, customer collaboration over contract negotiation, and responding to change over following a plan — and twelve principles for iterative, customer-centric software delivery. The manifesto synthesizes practices from extreme programming, Scrum, DSDM, and related lightweight methods into a shared philosophical foundation for software teams. It catalyzed the worldwide adoption of agile methodologies and fundamentally transformed software engineering practice and project management.",
    journal: "agilemanifesto.org",
    url: "https://agilemanifesto.org",
    citationCount: 5000,
    source: "agilemanifesto.org",
  },
  "continuous-delivery-humble": {
    id: "humble2010",
    title: "Continuous Delivery: Reliable Software Releases through Build, Test, and Deployment Automation",
    authors: ["Jez Humble", "David Farley"],
    year: 2010,
    abstract:
      "Humble and Farley present continuous delivery, a discipline in which software is always in a releasable state by keeping the build, test, and deployment pipeline automated and fast enough to support multiple production releases per day. The book covers deployment pipelines, automated testing strategies including unit, acceptance, and exploratory tests, configuration management, environment provisioning, and the organizational changes needed to adopt continuous delivery practices. Continuous delivery has become foundational to modern DevOps practice, cloud-native application development, and site reliability engineering.",
    journal: "Addison-Wesley Professional",
    url: "https://continuousdelivery.com",
    citationCount: 4000,
    source: "Addison-Wesley",
  },
  // ── Blockchain ────────────────────────────────────────────────
  "bitcoin-nakamoto": {
    id: "nakamoto2008",
    title: "Bitcoin: A Peer-to-Peer Electronic Cash System",
    authors: ["Satoshi Nakamoto"],
    year: 2008,
    abstract:
      "Nakamoto proposes Bitcoin, a peer-to-peer electronic cash system that allows online payments to be sent directly between parties without going through a financial institution, using a chain of digital signatures to transfer ownership and a proof-of-work consensus mechanism to prevent double-spending. Nodes in the network collect transactions into blocks, compete to solve a cryptographic puzzle to append the next block, and accept the longest chain as the authoritative history. Bitcoin introduced blockchain technology and demonstrated the viability of decentralized digital currency secured by cryptography and economic incentives.",
    journal: "bitcoin.org",
    url: "https://bitcoin.org/bitcoin.pdf",
    citationCount: 25000,
    source: "bitcoin.org",
  },
  "ethereum-buterin": {
    id: "buterin2014",
    title: "Ethereum: A Next-Generation Smart Contract and Decentralized Application Platform",
    authors: ["Vitalik Buterin"],
    year: 2014,
    abstract:
      "Buterin proposes Ethereum as a blockchain platform with a Turing-complete scripting language enabling arbitrary stateful computations through smart contracts — self-executing code stored on-chain — that generalize Bitcoin's scripting capabilities to support decentralized applications, tokens, and governance. The white paper describes the account model, gas pricing for computation, and the Ethereum Virtual Machine (EVM) as a sandboxed execution environment replicated across all nodes. Ethereum has become the foundational infrastructure for decentralized finance (DeFi), non-fungible tokens (NFTs), and decentralized autonomous organizations (DAOs).",
    journal: "ethereum.org",
    url: "https://ethereum.org/en/whitepaper/",
    citationCount: 10000,
    source: "ethereum.org",
  },
  "smart-contracts-szabo": {
    id: "szabo1997",
    title: "Formalizing and Securing Relationships on Public Networks",
    authors: ["Nick Szabo"],
    year: 1997,
    abstract:
      "Szabo defines smart contracts as computerized transaction protocols that execute the terms of a contract, embedding contractual clauses in hardware and software to make breach costly and minimize reliance on trusted intermediaries. The paper extends the concept to digital cash, payment networks, and financial derivatives, demonstrating how protocols can cryptographically enforce contractual obligations without central authorities. This foundational article anticipated blockchain-based smart contracts by more than a decade and introduced the vocabulary and conceptual framework now used throughout distributed ledger technology.",
    journal: "First Monday",
    doi: "10.5210/fm.v2i9.548",
    url: "https://firstmonday.org/ojs/index.php/fm/article/view/548",
    citationCount: 3000,
    source: "First Monday",
  },
  "hyperledger-androulaki": {
    id: "androulaki2018",
    title: "Hyperledger Fabric: A Distributed Operating System for Permissioned Blockchains",
    authors: [
      "Elli Androulaki",
      "Artem Barger",
      "Vita Bortnikov",
      "Christian Cachin",
      "Konstantinos Christidis",
      "Angelo De Caro",
      "David Enyeart",
      "Christopher Ferris",
      "Gennady Laventman",
      "Yacov Manevich",
    ],
    year: 2018,
    abstract:
      "Hyperledger Fabric is a permissioned blockchain platform for enterprise use cases that separates transaction execution, ordering, and validation into distinct phases carried out by separate node types — peers, orderers, and endorsers — enabling modular consensus and pluggable membership services. Unlike public blockchains, Fabric supports private channels for data confidentiality, fine-grained access control, and chaincode (smart contracts) in general-purpose programming languages. The execute-order-validate architecture achieves high throughput and horizontal scalability while maintaining Byzantine fault tolerance for enterprise blockchain applications.",
    journal: "EuroSys 2018",
    doi: "10.1145/3190508.3190538",
    url: "https://dl.acm.org/doi/10.1145/3190508.3190538",
    citationCount: 4000,
    source: "ACM",
  },
  // ── IoT & Edge Computing ──────────────────────────────────────
  "iot-atzori": {
    id: "atzori2010",
    title: "The Internet of Things: A Survey",
    authors: ["Luigi Atzori", "Antonio Iera", "Giacomo Morabito"],
    year: 2010,
    abstract:
      "Atzori and colleagues provide a comprehensive survey of the Internet of Things, characterizing it as a convergence of sensing, communication, and information processing technologies that enable physical objects to sense, communicate, and act in their environment across RFID, sensor networks, embedded systems, and middleware platforms. The survey covers IoT applications in smart cities, healthcare, transportation, and industrial automation, and identifies key research challenges in scalability, security, privacy, and standardization. This paper remains a foundational reference that defined the IoT research agenda and has been widely cited across computer science, engineering, and policy communities.",
    journal: "Computer Networks",
    doi: "10.1016/j.comnet.2010.05.010",
    url: "https://www.sciencedirect.com/science/article/pii/S1389128610001568",
    citationCount: 20000,
    source: "Elsevier",
  },
  "edge-computing-shi": {
    id: "shi2016",
    title: "Edge Computing: Vision and Challenges",
    authors: ["Weisong Shi", "Jie Cao", "Quan Zhang", "Youhuizi Li", "Lanyu Xu"],
    year: 2016,
    abstract:
      "Shi and colleagues introduce edge computing as a paradigm that pushes computation, storage, and networking from centralized cloud data centers to the edge of the network, near where data is produced and consumed by IoT devices, to reduce latency, conserve bandwidth, and enable real-time processing that cloud round-trip delays cannot support. The paper defines the edge computing architecture, distinguishes it from related paradigms including fog computing and cloudlets, and discusses enabling technologies and open challenges including heterogeneity, security, and resource management. This paper has become the standard reference for edge computing research and shaped the development of MEC (mobile edge computing) standards.",
    journal: "IEEE Internet of Things Journal",
    doi: "10.1109/JIOT.2016.2579198",
    url: "https://ieeexplore.ieee.org/document/7488250",
    citationCount: 10000,
    source: "IEEE",
  },
  "iot-vision-gubbi": {
    id: "gubbi2013",
    title: "Internet of Things (IoT): A Vision, Architectural Elements, and Future Directions",
    authors: ["Jayavardhana Gubbi", "Rajkumar Buyya", "Slaven Marusic", "Marimuthu Palaniswami"],
    year: 2013,
    abstract:
      "Gubbi and colleagues present a vision and three-layer architecture for the Internet of Things comprising sensing, network transport, and cloud back-end layers, positioning cloud computing as the infrastructure for IoT data storage, processing, and analytics at scale. The paper surveys smart environment applications — smart homes, smart cities, connected health, and intelligent transportation — and identifies open research challenges including scalability, interoperability, security, and privacy. This widely cited paper helped crystallize the IoT ecosystem concept and motivated subsequent work on IoT platforms, cloud integration, and large-scale sensor data management.",
    journal: "Future Generation Computer Systems",
    doi: "10.1016/j.future.2013.01.010",
    url: "https://www.sciencedirect.com/science/article/pii/S0167739X13000241",
    citationCount: 12000,
    source: "Elsevier",
  },
  // ── Data Structures & Algorithms ──────────────────────────────
  "intro-algorithms-cormen": {
    id: "cormen2009",
    title: "Introduction to Algorithms",
    authors: [
      "Thomas H. Cormen",
      "Charles E. Leiserson",
      "Ronald L. Rivest",
      "Clifford Stein",
    ],
    year: 2009,
    abstract:
      "Introduction to Algorithms (CLRS) is the definitive algorithms textbook covering a broad range of algorithms in depth using design techniques including divide-and-conquer, dynamic programming, greedy algorithms, and amortized analysis, with rigorous mathematical proofs of correctness and complexity. The book spans sorting and searching, graph algorithms (BFS, DFS, shortest paths, minimum spanning trees), data structures (heaps, hash tables, balanced BSTs), NP-completeness, and approximation algorithms. CLRS has been the standard algorithms reference for computer science students and practitioners for three decades across undergraduate and graduate education.",
    journal: "MIT Press",
    url: "https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/",
    citationCount: 30000,
    source: "MIT Press",
  },
  "bloom-filter": {
    id: "bloom1970",
    title: "Space/Time Trade-offs in Hash Coding with Allowable Errors",
    authors: ["Burton H. Bloom"],
    year: 1970,
    abstract:
      "Bloom introduces a space-efficient probabilistic data structure — the Bloom filter — that tests set membership using a bit array and multiple hash functions, allowing false positives (an element may be reported as present when it is not) but never false negatives (a truly present element is always found). The false positive rate is controllable by tuning the bit array size and the number of hash functions, enabling dramatic memory savings compared to exact membership structures at the cost of a small configurable error rate. Bloom filters have become a foundational component in database systems, network routers, distributed caches, and stream processing where memory efficiency is critical.",
    journal: "Communications of the ACM",
    doi: "10.1145/362686.362692",
    url: "https://dl.acm.org/doi/10.1145/362686.362692",
    citationCount: 8000,
    source: "ACM",
  },
  "hyperloglog-flajolet": {
    id: "flajolet2007",
    title: "HyperLogLog: The Analysis of a Near-Optimal Cardinality Estimation Algorithm",
    authors: ["Philippe Flajolet", "Éric Fusy", "Olivier Gandouet", "Frédéric Meunier"],
    year: 2007,
    abstract:
      "Flajolet and colleagues present HyperLogLog, an algorithm for estimating the cardinality (count of distinct elements) of a multiset using a fixed amount of memory by exploiting the statistical regularity of hash values — specifically, the expected position of the leading zero run — to estimate the number of distinct inputs with a standard error of approximately 1.04/√m for m registers. The algorithm uses stochastic averaging across multiple hash sub-streams to reduce variance while maintaining the sub-linear memory footprint. HyperLogLog is widely deployed in analytics databases such as BigQuery and Redis, stream processing systems, and distributed counting applications where exact counts are infeasible.",
    journal: "Discrete Mathematics and Theoretical Computer Science (DMTCS)",
    url: "https://hal.science/hal-00406166",
    citationCount: 2000,
    source: "DMTCS",
  },
  // ── Genetics & Biotech ────────────────────────────────────────
  "dna-watson-crick": {
    id: "watson1953",
    title: "Molecular Structure of Nucleic Acids: A Structure for Deoxyribose Nucleic Acid",
    authors: ["James D. Watson", "Francis H. C. Crick"],
    year: 1953,
    abstract:
      "Watson and Crick report the double helix structure of deoxyribonucleic acid (DNA), showing that DNA consists of two anti-parallel helical chains coiled around a common axis with complementary base pairing — adenine with thymine, and guanine with cytosine — held together by hydrogen bonds. This specific base-pairing mechanism immediately suggests a copying mechanism for genetic material in which each strand serves as a template for a complementary strand, explaining the faithful transmission of hereditary information. This 900-word letter launched the field of molecular biology and is one of the most cited papers in all of science.",
    journal: "Nature",
    doi: "10.1038/171737a0",
    url: "https://www.nature.com/articles/171737a0",
    citationCount: 15000,
    source: "Nature",
  },
  "human-genome-lander": {
    id: "lander2001",
    title: "Initial Sequencing and Analysis of the Human Genome",
    authors: [
      "Eric S. Lander",
      "Lauren M. Linton",
      "Bruce Birren",
      "Chad Nusbaum",
      "Michael C. Zody",
      "Jennifer Baldwin",
      "Keri Devon",
      "Ken Dewar",
      "Michael Doyle",
      "William FitzHugh",
    ],
    year: 2001,
    abstract:
      "The International Human Genome Sequencing Consortium reports the initial draft sequence of the human genome comprising approximately 2.91 billion base pairs, revealing approximately 30,000–40,000 protein-coding genes — far fewer than anticipated — along with extensive repetitive element content and structural variation across populations. The analysis characterizes genome organization, gene density, and patterns of genetic variation that illuminate human evolution, population history, and the genetic basis of disease. This landmark paper provides the foundational reference sequence for understanding human biology and catalyzed the genomics era of biomedical research.",
    journal: "Nature",
    doi: "10.1038/35057062",
    url: "https://www.nature.com/articles/35057062",
    citationCount: 25000,
    source: "Nature",
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
  // CRISPR
  "doudna2012",
  "ran2013",
  "komor2016",
  "anzalone2019",
  "frangoul2021",
  // CAR-T
  "june2011",
  "neelapu2017",
  "sadelain2013",
  // mRNA Vaccines
  "kariko2005",
  "polack2020",
  "baden2021",
  "corbett2020",
  // Climate Science
  "hansen1988",
  "manabe1967",
  "keeling1976",
  "ipcc2021",
  // Economics
  "friedman1968",
  "taylor1993",
  "clarida1999",
  "bernanke1995",
  // Computer Vision
  "krizhevsky2012",
  "simonyan2014",
  "redmon2016",
  "dosovitskiy2020",
  // Deep Learning Foundations
  "lecun2015",
  "rumelhart1986",
  "pan2010",
  "yosinski2014",
  "hochreiter1997",
  "cho2014",
  "srivastava2014",
  "ioffe2015",
  // Diffusion Models
  "ho2020",
  "song2021",
  // Parameter-Efficient Fine-Tuning
  "hu2022",
  // Reinforcement Learning
  "mnih2015",
  "schulman2017",
  // RLHF / Instruction Tuning
  "ouyang2022",
  "christiano2017",
  // Chain-of-Thought
  "wei2022",
  // Attention / Seq2Seq
  "bahdanau2015",
  // Word Embeddings
  "pennington2014",
  // Image Segmentation
  "ronneberger2015",
  "long2015",
  "lin2017",
  // Generative Models
  "kingma2014",
  // Graph Neural Networks
  "kipf2017",
  "velickovic2018",
  // Federated Learning
  "mcmahan2017",
  // Computer Networks
  "postel1981",
  "postel1980",
  "fielding2000",
  "bernerslee1994",
  "iyengar2021",
  // Operating Systems
  "ritchie1974",
  "dijkstra1965",
  "lamport1978",
  "dean2004",
  "ghemawat2003",
  // Database Systems
  "codd1970",
  "decandia2007",
  "chang2006",
  "stonebraker2011",
  "lakshman2010",
  // Cybersecurity
  "rivest1978",
  "diffie1976",
  "rescorla2018",
  "anderson2020",
  "shor1994",
  // Cloud Computing
  "armbrust2010",
  "barham2003",
  "merkel2014",
  "burns2016",
  "fox1997",
  // Computer Vision (new)
  "girshick2015",
  // NLP Advanced
  "liu2019roberta",
  "touvron2023",
  "yang2019xlnet",
  "lewis2020bart",
  "clark2020electra",
  // Software Engineering
  "fowler2014microservices",
  "beck2001agile",
  "humble2010",
  // Blockchain
  "nakamoto2008",
  "buterin2014",
  "szabo1997",
  "androulaki2018",
  // IoT & Edge Computing
  "atzori2010",
  "shi2016",
  "gubbi2013",
  // Data Structures & Algorithms
  "cormen2009",
  "bloom1970",
  "flajolet2007",
  // Genetics & Biotech
  "watson1953",
  "lander2001",
]);

// Foundational injection levels:
//   "required"  — named-entity match (BERT, GPT-3, T5, etc.) — always inject
//   "helpful"   — broad overview query — inject if space allows
//   "optional"  — extra context — inject only after required + helpful are in
type FoundationalLevel = "required" | "helpful" | "optional";
interface FoundationalMatch {
  paper: Paper;
  level: FoundationalLevel;
}

function getFoundationalPapers(query: string): {
  papers: Paper[];
  requiredIds: Set<string>;
} {
  const raw: FoundationalMatch[] = [];

  const add = (key: string, level: FoundationalLevel) => {
    const p = STATIC_PAPERS[key];
    if (p) raw.push({ paper: p, level });
  };

  // ── NLP / Transformers ───────────────────────────────────────
  if (
    /\btransformer\b|attention.*mechanism|self.?attention|multi.?head|query.*key.*value|scaled dot|how.*attention|replace.*rnn|encoder.*decoder.*attn|attention.*architecture/i.test(
      query,
    )
  )
    add(
      "attention-transformer",
      /vaswani|attention is all you need/i.test(query) ? "required" : "helpful",
    );

  if (
    /\bbert\b|bidirectional.*transformer|masked.*language.*model|pre.?train.*nlp|language.*understanding.*pre/i.test(
      query,
    )
  )
    add("bert", /\bbert\b/i.test(query) ? "required" : "helpful");

  if (/\bgpt\b|\bgpt.?1\b|generative pre.?training|radford.*2018/i.test(query))
    add(
      "gpt1",
      /\bgpt.?1\b|radford.*2018/i.test(query) ? "required" : "helpful",
    );

  if (
    /gpt.?3|few.?shot.*language model|large language model.*few|brown.*2020/i.test(
      query,
    )
  )
    add("gpt3", /gpt.?3|brown.*2020/i.test(query) ? "required" : "helpful");

  if (/\bt5\b|text.?to.?text|raffel|unified.*transfer.*learning/i.test(query))
    add("t5", /\bt5\b|raffel/i.test(query) ? "required" : "helpful");

  // BERT, GPT, and T5 are all Transformer derivatives — guarantee "Attention Is All You Need"
  // whenever any of them is named. The query may not contain the word "transformer" even
  // though the architecture paper is essential context (e.g. "BERT vs GPT vs T5" query).
  // This prevents survey papers from filling the shared-architecture citation slot.
  if (
    /\bbert\b/i.test(query) ||
    /\bgpt[\s\-]?\d?\b|\bgpt\b/i.test(query) ||
    /\bt5\b/i.test(query)
  )
    add("attention-transformer", "required");

  if (
    /\brag\b|retrieval.?augmented generation|retrieval.*llm.*generat/i.test(
      query,
    )
  )
    add("rag", /\brag\b|lewis.*2020/i.test(query) ? "required" : "helpful");

  // ── Computer Vision ──────────────────────────────────────────
  if (
    /\bresnet\b|residual.*learning|deep residual|skip.*connection/i.test(query)
  )
    add("resnet", /\bresnet\b|he.*2016/i.test(query) ? "required" : "helpful");

  if (
    /\balexnet\b|krizhevsky|imagenet.*classif|deep.*convolutional.*classif|cnn.*imagenet/i.test(
      query,
    )
  )
    add(
      "alexnet",
      /\balexnet\b|krizhevsky/i.test(query) ? "required" : "helpful",
    );

  if (
    /\bvgg\b|simonyan|very deep.*convolutional|3x3.*convolution.*deep/i.test(
      query,
    )
  )
    add("vgg", "required");

  if (
    /\byolo\b|you only look once|real.?time.*object detect|unified.*object detect/i.test(
      query,
    )
  )
    add("yolo", /\byolo\b/i.test(query) ? "required" : "helpful");

  if (
    /\bvit\b|vision transformer|image.*16x16|image patch.*transformer|dosovitskiy/i.test(
      query,
    )
  )
    add("vit", "required");

  if (
    /convolutional neural network|how.*cnn.*work|cnn.*computer vision|deep learning.*computer vision|image classif.*deep|object detect.*deep/i.test(
      query,
    )
  ) {
    add("alexnet", "helpful");
    add("resnet", "helpful");
    add("vgg", "optional");
    add("yolo", "optional");
  }

  // ── mRNA Vaccines ────────────────────────────────────────────
  if (
    /mrna vaccine|mrna.*covid|covid.*vaccine|sars.cov.2.*vaccine|bnt162|mrna.1273|lipid nanoparticle.*vaccine|nucleoside.*mrna|mrna.*immunogen|spike.*vaccine|pfizer.*vaccine|moderna.*vaccine/i.test(
      query,
    )
  ) {
    add("mrna-kariko", "required");
    add("mrna-polack", "required");
    add("mrna-baden", "helpful");
    add("mrna-corbett", "helpful");
  }
  if (
    /how.*mrna.*work|mrna.*mechanism|nucleoside.*modif|kariko|weissman.*mrna/i.test(
      query,
    )
  )
    add("mrna-kariko", "required");

  // ── Climate Science ──────────────────────────────────────────
  if (
    /greenhouse gas|global warming|climate change|radiative forcing|carbon cycle|co2.*atmosphere|atmospheric.*co2|ipcc|climate model|earth.*warming/i.test(
      query,
    )
  ) {
    add("climate-hansen", "helpful");
    add("climate-manabe", "helpful");
    add("climate-keeling", "optional");
    add("climate-ipcc", "helpful");
  }
  if (
    /sea level|ice sheet|arctic.*warming|permafrost|tipping point.*climate/i.test(
      query,
    )
  ) {
    add("climate-ipcc", "helpful");
    add("climate-hansen", "helpful");
  }

  // ── Economics / Monetary Policy ──────────────────────────────
  if (
    /inflation|monetary policy|central bank|interest rate.*policy|price stability|money supply/i.test(
      query,
    )
  ) {
    add("econ-friedman", "helpful");
    add("econ-taylor-rule", "helpful");
    add("econ-clarida", "optional");
    add("econ-bernanke", "optional");
  }
  if (/taylor rule|federal funds rate|policy rule.*interest/i.test(query))
    add("econ-taylor-rule", "required");
  if (
    /credit channel|financial accelerator|bank lending.*monetary/i.test(query)
  )
    add("econ-bernanke", "required");

  // ── CAR-T Cell Therapy ───────────────────────────────────────
  if (
    /car.?t|chimeric antigen receptor|cart.*cell|t.cell.*therapy.*cancer|adoptive.*cell.*therapy/i.test(
      query,
    )
  ) {
    add("cart-june", "helpful");
    add("cart-neelapu", "helpful");
    add("cart-sadelain", "optional");
  }
  if (
    /cd19.*car|anti.cd19|b.cell.*lymphoma.*car|leukemia.*car.?t|all.*car.?t/i.test(
      query,
    )
  )
    add("cart-neelapu", "required");

  // ── CRISPR / Gene Editing ────────────────────────────────────
  if (/crispr|cas9|gene edit|genome edit|rna.?guided.*nuclease/i.test(query)) {
    add("crispr-doudna", "required");
    add("crispr-ran", "helpful");
  }
  if (
    /base edit|cytidine deaminase|adenine base|C.*T.*edit|A.*G.*edit/i.test(
      query,
    )
  )
    add("crispr-base-editing", "required");
  if (
    /prime edit|search.?and.?replace.*genome|pegRNA|reverse transcriptase.*cas9/i.test(
      query,
    )
  )
    add("crispr-prime-editing", "required");
  if (
    /sickle cell|thalassemia|crispr.*clinic|fetal hemoglobin|CTX001|clinical.*crispr/i.test(
      query,
    )
  )
    add("crispr-sickle-cell", "required");
  if (
    /crispr.*therapeutic|crispr.*application|crispr.*gene therapy|how.*crispr.*work/i.test(
      query,
    )
  ) {
    add("crispr-doudna", "required");
    add("crispr-ran", "helpful");
    add("crispr-base-editing", "helpful");
    add("crispr-prime-editing", "helpful");
    add("crispr-sickle-cell", "optional");
  }

  // ── Deep Learning Foundations ────────────────────────────────
  if (
    /\bdeep learning\b|neural network.*overview|history.*neural|lecun.*bengio.*hinton|deep.*representation/i.test(
      query,
    )
  )
    add(
      "deep-learning-lecun",
      /lecun.*2015|nature.*deep learning/i.test(query) ? "required" : "helpful",
    );

  if (
    /\bback.?prop|backpropagation|gradient.*descent.*neural|rumelhart|learning.*representations.*back/i.test(
      query,
    )
  )
    add("backprop", /rumelhart|backprop.*1986/i.test(query) ? "required" : "helpful");

  if (
    /transfer learning|domain adaptation|fine.?tun.*pretrain|pan.*yang.*transfer|survey.*transfer/i.test(
      query,
    )
  )
    add(
      "transfer-learning-pan",
      /pan.*yang|survey.*transfer.*learn/i.test(query) ? "required" : "helpful",
    );

  if (
    /transferable.*features|yosinski|how.*features.*transfer|feature.*reuse.*deep/i.test(
      query,
    )
  )
    add("transferable-features", "required");

  if (
    /\blstm\b|long short.?term memory|hochreiter|schmidhuber|vanishing gradient.*rnn|gated.*recurrent/i.test(
      query,
    )
  )
    add("lstm", /\blstm\b|hochreiter/i.test(query) ? "required" : "helpful");

  if (
    /rnn encoder.?decoder|cho.*2014|gru.*encoder|sequence.?to.?sequence.*rnn|seq2seq.*rnn/i.test(
      query,
    )
  )
    add("rnn-encoder-decoder", /cho.*2014/i.test(query) ? "required" : "helpful");

  if (
    /\bdropout\b|srivastava.*dropout|regulariz.*neural.*overfitting|drop.*units.*training/i.test(
      query,
    )
  )
    add("dropout", /\bdropout\b|srivastava/i.test(query) ? "required" : "helpful");

  if (
    /batch norm|batch normalization|ioffe.*szegedy|internal covariate shift|batchnorm/i.test(
      query,
    )
  )
    add("batch-norm", /ioffe|batch norm/i.test(query) ? "required" : "helpful");

  // ── Diffusion Models ─────────────────────────────────────────
  if (
    /diffusion model|denoising diffusion|ddpm|score.*based.*generat|probabilistic.*diffusion|latent diffusion|stable diffusion/i.test(
      query,
    )
  ) {
    add("ddpm", /\bddpm\b|ho.*2020|denoising diffusion probabilistic/i.test(query) ? "required" : "helpful");
    add("score-sde", "helpful");
  }
  if (
    /score.?based.*generat|stochastic.*differential.*generat|song.*sde|sde.*generat/i.test(
      query,
    )
  )
    add("score-sde", /song.*2021|score.*sde/i.test(query) ? "required" : "helpful");

  // ── Parameter-Efficient Fine-Tuning ──────────────────────────
  if (
    /\blora\b|low.?rank adaptation|parameter.?efficient.*fine.?tun|peft.*lora|hu.*2022/i.test(
      query,
    )
  )
    add("lora", /\blora\b|hu.*2022/i.test(query) ? "required" : "helpful");

  // ── Reinforcement Learning ────────────────────────────────────
  if (
    /\bdqn\b|deep q.?network|deep reinforcement learning.*atari|mnih.*2015|human.level.*atari|q.?learn.*deep/i.test(
      query,
    )
  )
    add("dqn", /\bdqn\b|mnih.*2015/i.test(query) ? "required" : "helpful");

  if (
    /\bppo\b|proximal policy optim|schulman.*2017|policy gradient.*clip|policy optim.*rl/i.test(
      query,
    )
  )
    add("ppo", /\bppo\b|schulman.*2017/i.test(query) ? "required" : "helpful");

  if (
    /deep reinforcement learning|reinforcement learning.*neural|rl.*policy gradient|actor.?critic.*deep/i.test(
      query,
    )
  ) {
    add("dqn", "helpful");
    add("ppo", "helpful");
  }

  // ── RLHF / Instruction Tuning ────────────────────────────────
  if (
    /\brlhf\b|reinforcement learning.*human feedback|instruct.*gpt|instructgpt|ouyang.*2022|align.*language model/i.test(
      query,
    )
  )
    add("instruct", /\brlhf\b|ouyang.*2022|instructgpt/i.test(query) ? "required" : "helpful");

  if (
    /human preference.*rl|rl.*human preference|christiano.*2017|reward.*human.*comparison/i.test(
      query,
    )
  )
    add("rlhf", /christiano.*2017/i.test(query) ? "required" : "helpful");

  if (/\brlhf\b|reinforcement learning.*human feedback/i.test(query)) {
    add("rlhf", "helpful");
    add("instruct", "helpful");
    add("ppo", "optional");
  }

  // ── Chain-of-Thought / Prompting ─────────────────────────────
  if (
    /chain.?of.?thought|cot prompting|wei.*2022.*reasoning|step.?by.?step.*reasoning.*llm|few.?shot.*reasoning.*chain/i.test(
      query,
    )
  )
    add("cot", /chain.?of.?thought|wei.*2022/i.test(query) ? "required" : "helpful");

  // ── Attention / Seq2Seq ───────────────────────────────────────
  if (
    /\bbahdanau\b|neural machine translation.*align|attention.*nmt|jointly.*learn.*align|seq2seq.*attention/i.test(
      query,
    )
  )
    add("bahdanau", /bahdanau/i.test(query) ? "required" : "helpful");

  // ── Word Embeddings ───────────────────────────────────────────
  if (/\bglove\b|global vectors.*word|pennington.*2014|word.*co.?occurrence.*vector/i.test(query))
    add("glove", /\bglove\b|pennington/i.test(query) ? "required" : "helpful");

  // ── Image Segmentation ────────────────────────────────────────
  if (
    /\bu.?net\b|ronneberger|biomedical.*segment|medical.*image.*segment|encoder.*decoder.*segment/i.test(
      query,
    )
  )
    add("unet", /\bu.?net\b|ronneberger/i.test(query) ? "required" : "helpful");

  if (
    /fully convolutional|semantic segmentation|fcn.*segment|long.*shelhamer|pixel.*classif.*cnn/i.test(
      query,
    )
  )
    add("fcn", /\bfcn\b|long.*shelhamer/i.test(query) ? "required" : "helpful");

  if (
    /segmentation.*deep|semantic.*segment.*deep|instance.*segment/i.test(query)
  ) {
    add("unet", "helpful");
    add("fcn", "helpful");
  }

  if (
    /\bfpn\b|feature pyramid|lin.*2017.*detect|multi.?scale.*detect.*pyramid/i.test(
      query,
    )
  )
    add("fpn", /\bfpn\b|lin.*2017/i.test(query) ? "required" : "helpful");

  // ── Generative Models ─────────────────────────────────────────
  if (
    /\bvae\b|variational autoencoder|auto.?encoding variational|kingma.*welling|latent variable.*encoder/i.test(
      query,
    )
  )
    add("vae", /\bvae\b|kingma.*welling/i.test(query) ? "required" : "helpful");

  // ── Graph Neural Networks ─────────────────────────────────────
  if (
    /\bgcn\b|graph convolutional network|kipf.*welling|semi.?supervised.*graph|spectral.*graph.*convol/i.test(
      query,
    )
  )
    add("gcn", /\bgcn\b|kipf/i.test(query) ? "required" : "helpful");

  if (
    /graph attention|graph neural network|gnn.*attention|\bgat\b|velickovic/i.test(
      query,
    )
  )
    add("gat", /\bgat\b|velickovic/i.test(query) ? "required" : "helpful");

  if (
    /graph neural network|message passing.*graph|node classif.*graph|gnn.*overview/i.test(
      query,
    )
  ) {
    add("gcn", "helpful");
    add("gat", "helpful");
  }

  // ── Federated Learning ────────────────────────────────────────
  if (
    /federated learning|fedavg|mcmahan.*2017|decentralized.*training|privacy.?preserving.*machine learn|local.*sgd.*federat/i.test(
      query,
    )
  )
    add("fedavg", /fedavg|mcmahan.*2017/i.test(query) ? "required" : "helpful");

  // ── Computer Networks ─────────────────────────────────────────
  if (
    /\btcp\b|transmission control protocol|tcp.*handshake|tcp.*reliability|tcp.*congestion|postel.*1981|rfc.*793/i.test(
      query,
    )
  )
    add("tcp-rfc793", /postel.*1981|rfc.*793/i.test(query) ? "required" : "helpful");

  if (
    /\budp\b|user datagram protocol|connectionless.*transport|datagram.*protocol|postel.*1980|rfc.*768/i.test(
      query,
    )
  )
    add("udp-rfc768", /postel.*1980|rfc.*768/i.test(query) ? "required" : "helpful");

  if (
    /\brest\b|restful|representational state transfer|fielding.*dissert|rest.*api.*design|rest.*architectural/i.test(
      query,
    )
  )
    add("rest-fielding", /fielding.*2000|rest.*dissert/i.test(query) ? "required" : "helpful");

  if (
    /world wide web|www.*berners|berners.?lee|history.*web|http.*html.*url|web.*architecture.*1994/i.test(
      query,
    )
  )
    add("www-berners-lee", /berners.?lee/i.test(query) ? "required" : "helpful");

  if (
    /\bquic\b|http\/3|http3|udp.*transport.*reliable|quic.*protocol|rfc.*9000/i.test(
      query,
    )
  )
    add("quic-rfc9000", /\bquic\b|rfc.*9000/i.test(query) ? "required" : "helpful");

  if (
    /tcp.*udp|network.*protocol.*compare|transport.*layer.*protocol|tcp vs udp|latency.*transport/i.test(
      query,
    )
  ) {
    add("tcp-rfc793", "helpful");
    add("udp-rfc768", "helpful");
    add("quic-rfc9000", "optional");
  }

  // ── Operating Systems ─────────────────────────────────────────
  if (
    /\bunix\b|unix.*operating system|ritchie.*thompson|unix.*design|everything.*file.*os|pipe.*process.*unix/i.test(
      query,
    )
  )
    add("unix-ritchie", /ritchie|thompson.*1974|unix.*1974/i.test(query) ? "required" : "helpful");

  if (
    /\bsemaphore\b|mutual exclusion|cooperating.*sequential|dijkstra.*1965|dining philosophers|producer.*consumer.*os/i.test(
      query,
    )
  )
    add("cooperating-dijkstra", /dijkstra.*1965/i.test(query) ? "required" : "helpful");

  if (
    /logical clock|happened.?before|lamport.*clock|distributed.*ordering|causal.*ordering.*event|vector clock/i.test(
      query,
    )
  )
    add(
      "time-clocks-lamport",
      /lamport.*1978|lamport.*clock/i.test(query) ? "required" : "helpful",
    );

  if (
    /\bmapreduce\b|map.*reduce.*google|dean.*ghemawat|hadoop.*mapreduce|distributed.*data.*processing.*google/i.test(
      query,
    )
  )
    add("mapreduce-dean", /mapreduce|dean.*ghemawat/i.test(query) ? "required" : "helpful");

  if (
    /google file system|\bgfs\b|ghemawat.*2003|distributed.*file.*system.*google|chunk.*server.*gfs/i.test(
      query,
    )
  )
    add("gfs-ghemawat", /\bgfs\b|ghemawat.*2003/i.test(query) ? "required" : "helpful");

  if (
    /distributed systems.*fundamentals|operating system.*overview|systems.*research.*classic/i.test(
      query,
    )
  ) {
    add("unix-ritchie", "helpful");
    add("lamport1978", "helpful");
    add("mapreduce-dean", "optional");
  }

  // ── Database Systems ──────────────────────────────────────────
  if (
    /relational model|relational database|codd.*1970|sql.*origin|rdbms.*history|relation.*tuple.*attribute/i.test(
      query,
    )
  )
    add("relational-codd", /codd.*1970/i.test(query) ? "required" : "helpful");

  if (
    /\bdynamo\b|amazon.*key.?value|dynamodb.*origin|decandia.*2007|consistent hashing.*amazon|eventual consistency.*amazon/i.test(
      query,
    )
  )
    add("dynamo-decandia", /dynamo|decandia.*2007/i.test(query) ? "required" : "helpful");

  if (
    /\bbigtable\b|google.*wide.?column|chang.*2006|bigtable.*storage|row.*column.*timestamp.*google/i.test(
      query,
    )
  )
    add("bigtable-chang", /bigtable|chang.*2006/i.test(query) ? "required" : "helpful");

  if (
    /\bcassandra\b|lakshman.*malik|apache.*cassandra|decentralized.*storage.*nosql|tunable consistency/i.test(
      query,
    )
  )
    add("cassandra-lakshman", /cassandra|lakshman.*2010/i.test(query) ? "required" : "helpful");

  if (
    /nosql.*database|key.?value.*store|document.*database|wide.?column.*store|nosql.*vs.*sql/i.test(
      query,
    )
  ) {
    add("dynamo-decandia", "helpful");
    add("bigtable-chang", "helpful");
    add("cassandra-lakshman", "optional");
    add("relational-codd", "optional");
  }

  if (
    /stonebraker.*scalable|ten rules.*scalable|new.*sql.*rules|nosql.*performance.*rules/i.test(
      query,
    )
  )
    add("nosql-stonebraker", "required");

  // ── Cybersecurity ─────────────────────────────────────────────
  if (
    /\brsa\b|public.?key cryptosystem|rivest.*shamir.*adleman|rsa.*encrypt|rsa.*signature|integer factoring.*crypto/i.test(
      query,
    )
  )
    add("rsa-rivest", /\brsa\b|rivest.*shamir|1978.*crypto/i.test(query) ? "required" : "helpful");

  if (
    /diffie.?hellman|key exchange.*public|new directions.*cryptography|discrete logarithm.*crypto|dh.*key.*agreement/i.test(
      query,
    )
  )
    add(
      "diffie-hellman",
      /diffie.?hellman|diffie.*1976/i.test(query) ? "required" : "helpful",
    );

  if (
    /\btls\b.*1\.3|\btls1\.3\b|rfc.*8446|transport layer security.*1\.3|tls.*handshake.*1rtt|forward secrecy.*tls/i.test(
      query,
    )
  )
    add("tls13-rescorla", /tls.*1\.3|rfc.*8446/i.test(query) ? "required" : "helpful");

  if (
    /security engineering|anderson.*security|building.*secure.*system|threat model.*overview|security.*survey.*book/i.test(
      query,
    )
  )
    add("security-engineering-anderson", "helpful");

  if (
    /shor.*algorithm|quantum.*factor|quantum.*cryptography.*break|post.?quantum|quantum.*rsa|quantum.*discrete.?log/i.test(
      query,
    )
  )
    add("shor-quantum", /shor.*algorithm|shor.*1994/i.test(query) ? "required" : "helpful");

  if (
    /cryptography.*overview|public.?key cryptography|asymmetric.*encrypt|secure.*communication.*protocol/i.test(
      query,
    )
  ) {
    add("diffie-hellman", "helpful");
    add("rsa-rivest", "helpful");
    add("tls13-rescorla", "optional");
  }

  // ── Cloud Computing ───────────────────────────────────────────
  if (
    /cloud computing.*overview|view.*cloud.*computing|armbrust.*2010|iaas.*paas.*saas|cloud.*elasticity.*survey/i.test(
      query,
    )
  )
    add("cloud-armbrust", /armbrust.*2010/i.test(query) ? "required" : "helpful");

  if (
    /\bxen\b|paravirtualization|barham.*2003|virtual machine.*hypervisor.*performance|xen.*virtualization/i.test(
      query,
    )
  )
    add("xen-barham", /\bxen\b|barham.*2003/i.test(query) ? "required" : "helpful");

  if (
    /\bdocker\b|linux container|container.*deploy|merkel.*2014|dockerfile|container.*image.*layer/i.test(
      query,
    )
  )
    add("docker-merkel", /\bdocker\b|merkel.*2014/i.test(query) ? "required" : "helpful");

  if (
    /\bkubernetes\b|\bk8s\b|container orchestrat|burns.*2016|borg.*omega.*kubernetes|pod.*scheduling.*cluster/i.test(
      query,
    )
  )
    add("kubernetes-burns", /\bkubernetes\b|\bk8s\b|burns.*2016/i.test(query) ? "required" : "helpful");

  if (
    /cluster.*network.*service|fox.*brewer.*1997|BASE.*properties|basically available.*soft state|scalable.*web.*service.*cluster/i.test(
      query,
    )
  )
    add("cluster-fox", /fox.*1997|brewer.*fox/i.test(query) ? "required" : "helpful");

  if (
    /cloud.*infrastructure|virtualization.*overview|container.*vs.*vm|devops.*cloud|cloud.*native/i.test(
      query,
    )
  ) {
    add("cloud-armbrust", "helpful");
    add("docker-merkel", "helpful");
    add("kubernetes-burns", "helpful");
    add("xen-barham", "optional");
  }

  // ── Computer Vision (Fast R-CNN) ──────────────────────────────
  if (
    /fast.*r.?cnn|\bfaster.*rcnn\b|girshick.*2015|region.*proposal.*detect|roi.*pool|two.?stage.*detect/i.test(
      query,
    )
  )
    add("fast-rcnn", /girshick.*2015|fast.*r.?cnn/i.test(query) ? "required" : "helpful");

  if (
    /object detection.*overview|r.?cnn.*family|region.*based.*detect/i.test(query)
  ) {
    add("fast-rcnn", "helpful");
    add("yolo", "helpful");
  }

  // ── NLP Advanced ──────────────────────────────────────────────
  if (
    /\broberta\b|robustly optimized.*bert|liu.*2019.*roberta|bert.*pretraining.*optimiz/i.test(
      query,
    )
  )
    add("roberta-liu", /\broberta\b|liu.*2019.*roberta/i.test(query) ? "required" : "helpful");

  if (
    /\bllama\b|touvron.*2023|open.*foundation.*llm|llama.*language model|meta.*llm.*open/i.test(
      query,
    )
  )
    add("llama-touvron", /\bllama\b|touvron.*2023/i.test(query) ? "required" : "helpful");

  if (
    /\bxlnet\b|permutation.*language model|yang.*2019.*xlnet|autoregressive.*pretraining.*bidirectional/i.test(
      query,
    )
  )
    add("xlnet-yang", /\bxlnet\b|yang.*2019.*xlnet/i.test(query) ? "required" : "helpful");

  if (
    /\bbart\b|denoising.*seq2seq|lewis.*2020.*bart|bart.*summariz|sequence.?to.?sequence.*pretrain.*denoise/i.test(
      query,
    )
  )
    add("bart-lewis", /\bbart\b.*model|lewis.*2020.*bart/i.test(query) ? "required" : "helpful");

  if (
    /\belectra\b|replaced token detection|clark.*2020.*electra|discriminator.*pretraining.*nlp/i.test(
      query,
    )
  )
    add("electra-clark", /\belectra\b|clark.*2020/i.test(query) ? "required" : "helpful");

  if (
    /nlp.*pretrained.*model|language model.*comparison|bert.*variant|post.?bert.*model/i.test(
      query,
    )
  ) {
    add("roberta-liu", "helpful");
    add("xlnet-yang", "helpful");
    add("electra-clark", "optional");
    add("bart-lewis", "optional");
  }

  // ── Software Engineering ──────────────────────────────────────
  if (
    /microservice.*architecture|microservices.*monolith|fowler.*lewis.*microservic|service.*decomposition.*deploy/i.test(
      query,
    )
  )
    add(
      "microservices-fowler",
      /fowler.*lewis.*microservic|microservices.*fowler/i.test(query) ? "required" : "helpful",
    );

  if (
    /agile.*manifest|agile.*software.*development|agile.*principles|scrum.*xp.*agile.*origin|beck.*2001.*agile/i.test(
      query,
    )
  )
    add(
      "agile-manifesto",
      /agile.*manifest|beck.*2001/i.test(query) ? "required" : "helpful",
    );

  if (
    /continuous delivery|continuous deployment|deployment pipeline|humble.*farley|devops.*release.*automat/i.test(
      query,
    )
  )
    add(
      "continuous-delivery-humble",
      /humble.*farley|continuous delivery.*book/i.test(query) ? "required" : "helpful",
    );

  // ── Blockchain ────────────────────────────────────────────────
  if (
    /blockchain|bitcoin|ethereum|smart contract|distributed ledger|cryptocurrency|defi/i.test(
      query,
    )
  ) {
    add("bitcoin-nakamoto", "required");
    add("ethereum-buterin", "required");
  }

  if (
    /smart contract.*origin|szabo.*1997|formalizing.*securing.*relationships|contract.*code.*blockchain.*history/i.test(
      query,
    )
  )
    add("smart-contracts-szabo", /szabo.*1997/i.test(query) ? "required" : "helpful");

  if (
    /hyperledger fabric|permissioned blockchain|androulaki.*2018|enterprise.*blockchain|fabric.*chaincode/i.test(
      query,
    )
  )
    add("hyperledger-androulaki", /hyperledger.*fabric|androulaki/i.test(query) ? "required" : "helpful");

  // ── IoT & Edge Computing ──────────────────────────────────────
  if (
    /internet of things.*survey|iot.*overview|atzori.*2010|iot.*sensor.*network.*survey|smart.*devices.*survey/i.test(
      query,
    )
  )
    add("iot-atzori", /atzori.*2010/i.test(query) ? "required" : "helpful");

  if (
    /edge computing|mobile.*edge.*computing|\bmec\b|fog computing|shi.*2016.*edge|edge.*latency.*iot/i.test(
      query,
    )
  )
    add("edge-computing-shi", /shi.*2016|edge computing.*vision/i.test(query) ? "required" : "helpful");

  if (
    /iot.*cloud.*architecture|internet.*things.*vision|gubbi.*2013|smart city.*iot.*architecture|iot.*platform.*cloud/i.test(
      query,
    )
  )
    add("iot-vision-gubbi", /gubbi.*2013/i.test(query) ? "required" : "helpful");

  if (
    /\biot\b|internet of things|connected devices|sensor.*network.*application/i.test(
      query,
    )
  ) {
    add("iot-atzori", "helpful");
    add("edge-computing-shi", "helpful");
    add("iot-vision-gubbi", "optional");
  }

  // ── Data Structures & Algorithms ──────────────────────────────
  if (
    /\bclrs\b|introduction.*algorithms.*cormen|cormen.*leiserson.*rivest|algorithms.*textbook|clrs.*algorithm/i.test(
      query,
    )
  )
    add("intro-algorithms-cormen", /cormen|clrs/i.test(query) ? "required" : "helpful");

  if (
    /bloom filter|space.*time.*hash.*allowable.*error|bloom.*1970|probabilistic.*membership|false positive.*membership/i.test(
      query,
    )
  )
    add("bloom-filter", /bloom.*filter|bloom.*1970/i.test(query) ? "required" : "helpful");

  if (
    /\bhyperloglog\b|cardinality estimation|count distinct.*approximate|flajolet.*2007|hll.*algorithm|distinct.*elements.*sketch/i.test(
      query,
    )
  )
    add("hyperloglog-flajolet", /hyperloglog|flajolet.*2007/i.test(query) ? "required" : "helpful");

  if (
    /probabilistic data structure|approximate.*counting|streaming.*algorithm|sketch.*data structure/i.test(
      query,
    )
  ) {
    add("bloom-filter", "helpful");
    add("hyperloglog-flajolet", "helpful");
  }

  // ── Genetics & Biotech ────────────────────────────────────────
  if (
    /\bdna\b.*double helix|watson.*crick|deoxyribonucleic acid.*structure|base pairing.*dna|dna.*molecular structure/i.test(
      query,
    )
  )
    add("dna-watson-crick", /watson.*crick|1953.*dna/i.test(query) ? "required" : "helpful");

  if (
    /human genome.*sequenc|genome.*sequencing.*project|lander.*2001|hgp.*human genome|genome.*draft.*sequence/i.test(
      query,
    )
  )
    add("human-genome-lander", /lander.*2001|human genome.*project/i.test(query) ? "required" : "helpful");

  if (
    /genomics.*overview|molecular biology.*central dogma|dna.*rna.*protein|genetics.*sequencing/i.test(
      query,
    )
  ) {
    add("dna-watson-crick", "helpful");
    add("human-genome-lander", "helpful");
  }

  // ── Misc ─────────────────────────────────────────────────────
  if (/word2vec|word embeddings|skip.?gram/i.test(query))
    add("word2vec", "required");
  if (/\bgan\b|generative adversarial|goodfellow/i.test(query))
    add("gans", "required");
  if (/\badam\b|adam optimizer|adaptive.*moment/i.test(query))
    add("adam", "required");

  // ── Comparison queries — require backbone papers for every named model ────
  // Fires when: (a) at least 2 of {BERT, GPT, T5} appear AND there is a
  // comparison word, OR (b) all three appear together in any order.
  // Only marks papers required for models actually named — avoids over-requiring
  // GPT papers when the query is "BERT vs T5".
  {
    const mentionsBert = /\bbert\b/i.test(query);
    const mentionsGpt = /\bgpt[\s\-]?\d*\b/i.test(query);
    const mentionsT5 = /\bt5\b/i.test(query);
    const namedCount = +mentionsBert + +mentionsGpt + +mentionsT5;
    const hasComparisonWord =
      /\bvs\.?\b|\bversus\b|\bcompar|\bdiffer|\bcontrast/i.test(query);
    if ((namedCount >= 2 && hasComparisonWord) || namedCount === 3) {
      // Transformer is the shared foundation — always required when comparing derivatives
      add("attention-transformer", "required");
      if (mentionsBert) add("bert", "required");
      if (mentionsGpt) {
        add("gpt1", "required");
        add("gpt3", "required");
      }
      if (mentionsT5) add("t5", "required");
    }
  }

  // ── Priority order: required first, then helpful, then optional ──
  const order: FoundationalLevel[] = ["required", "helpful", "optional"];
  const sorted = [...raw].sort(
    (a, b) => order.indexOf(a.level) - order.indexOf(b.level),
  );

  // Auto-deduplicate by paper id — first occurrence wins (highest priority level)
  const seen = new Set<string>();
  const deduped = sorted.filter(({ paper }) => {
    if (seen.has(paper.id)) return false;
    seen.add(paper.id);
    return true;
  });

  const requiredIds = new Set(
    deduped.filter((m) => m.level === "required").map((m) => m.paper.id),
  );

  return {
    papers: deduped.map(({ paper }) => paper),
    requiredIds,
  };
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
      .replace(/\\n/g, " ")
      .replace(/\n/g, " ")
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
  // v9 NEW: ML-methodology papers for disease prediction (not about mechanisms)
  /spatio.?temporal.*graph.*deep learning.*alzheimer/i,
  /deep.*learning.*model.*alzheimer.*progression.*real.?world/i,
  /graph.*neural.*network.*alzheimer.*progression/i,
  /stochastic.*differential.*equation.*alzheimer/i,
  /multimodal.*multi.?task.*deep learning.*alzheimer/i,
  /convolutional.*neural.*network.*alzheimer.*predict/i,
  /machine learning.*predict.*alzheimer.*progression/i,
  // v10 NEW: robotics, embodied AI, graph-structure learning noise
  /vision language action|grasping foundation model|robotic.*grasp|syngrasp/i,
  /graph structure learning.*language|LangGSL|graph.*llm.*node.*feature/i,
  /embodied.*foundation model|sim.?to.?real.*robot|robot.*manipulation.*llm/i,
  // v10 NEW: pure CV scaling papers that appear on NLP queries
  /scaling vision transformer|ViT.*billion.*parameter|open.*clip.*scaling/i,
  /contrastive language.?image.*scaling|clip.*scaling law/i,
  // v10 NEW: pre-2005 CV/signal papers (LeCun 1998 type noise)
  /gradient.?based learning.*document recognition|multilayer.*backpropagation.*handwrit/i,
  // v11 NEW: federated learning, MAML/meta-learning, RL noise on NLP queries
  /reproducible scaling.*contrastive|contrastive.*language.*image.*learning.*scaling/i,
  /federated learning.*open problems|advances.*open problems.*federated/i,
  /alpha maml|negative adaptation.*meta.?learning|regression network.*meta.?learning/i,
  /tapnet.*few.?shot|task.?adaptive projection.*few.?shot/i,
  /transfer learning.*deep reinforcement|survey.*deep reinforcement.*transfer/i,
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
  | "neuroscience"
  | "hardware"
  | "general_ml"
  | "other";

interface DomainDef {
  querySignals: RegExp;
  paperSignals: RegExp;
  incompatible: Domain[];
}

const DOMAIN_DEFS: Record<Domain, DomainDef> = {
  neuroscience: {
    querySignals:
      /\b(neuroinflammation|alzheimer|dementia|parkinson|neurodegeneration|microglia|astrocyte|tau protein|amyloid|blood.brain barrier|synapse|neuronal|brain inflammation|glia|hippocampus|cortex|dopamine|serotonin|neurotransmitter|brain disorder|cognitive decline|nlrp3.*brain|cgas.sting.*brain)\b/i,
    paperSignals:
      /\b(neuroinflammation|microglia|astrocyte|alzheimer|tau|amyloid.beta|blood.brain barrier|neurodegeneration|synaptic|hippocampal|cortical|dopaminergic|serotonergic|nlrp3|inflammasome|neurofibrillary|glial|neuroprotect|neurotoxic|brain.*inflammation|cognitive.*impairment)\b/i,
    incompatible: [
      "security",
      "hardware",
      "time_series",
      "nlp",
      "computer_vision",
    ],
  },
  nlp: {
    querySignals:
      /\b(transformer|attention|bert|gpt|llm|language model|rnn|lstm|seq2seq|nlp|natural language|text generation|machine translation|summarization|question answering|sentiment|tokeniz|embedding|word2vec|glove|rag|retrieval.*augment|few.?shot|in.?context learning|prompt|pre.?train)\b/i,
    paperSignals:
      /\b(language model|text|nlp|natural language|transformer|attention|bert|gpt|sentiment|translation|summariz|question answer|tokeniz|word embed|seq2seq|dialogue|corpus|vocabulary|pretraining|few.?shot.*nlp|prompt.*learning|in.?context)\b/i,
    incompatible: [
      "security",
      "time_series",
      "biomedical",
      "hardware",
      "computer_vision",
    ],
  },
  computer_vision: {
    querySignals:
      /\b(image classif|object detect|segmentation|cnn|resnet|vgg|vision transformer|vit|image recognition|convolutional|yolo|depth estimation|pose estimation)\b/i,
    paperSignals:
      /\b(image classif|object detect|bounding box|feature map|pooling layer|vgg|inception|yolo|depth estimation|pose estimation|semantic segmentation|instance segmentation|image.*recogni)\b/i,
    incompatible: ["security", "time_series", "biomedical", "nlp"],
  },
  security: {
    querySignals:
      /\b(malware|intrusion detect|cybersecurity|vulnerability|exploit|phishing|ransomware|botnet|network security|threat detect|anomaly detect.*network)\b/i,
    paperSignals:
      /\b(malware|intrusion|cybersecurity|vulnerability|exploit|phishing|ransomware|botnet|threat|cyberattack|network security|anomaly.*network|ids|ips)\b/i,
    incompatible: [
      "nlp",
      "computer_vision",
      "time_series",
      "biomedical",
      "neuroscience",
    ],
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
    incompatible: ["security", "biomedical", "time_series", "neuroscience"],
  },
  general_ml: {
    querySignals:
      /\b(machine learning|deep learning|neural network|gradient|backprop|optimizer|loss function|overfitting|regularization)\b/i,
    paperSignals:
      /\b(machine learning|deep learning|neural network|gradient|backpropagation|optimizer|regularization|overfitting)\b/i,
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
    "neuroscience",
    "nlp",
    "computer_vision",
    "security",
    "time_series",
    "biomedical",
    "hardware",
    "general_ml",
  ];
  for (const d of order) {
    if (DOMAIN_DEFS[d].querySignals.test(query)) return d;
  }
  return "other";
}

function detectPaperDomain(paper: Paper): Domain {
  const text = `${paper.title} ${paper.abstract ?? ""}`;
  const order: Domain[] = [
    "security",
    "biomedical",
    "hardware",
    "time_series",
    "computer_vision",
    "neuroscience",
    "nlp",
    "general_ml",
  ];
  for (const d of order) {
    if (DOMAIN_DEFS[d].paperSignals.test(text)) return d;
  }
  return "other";
}

function isMLQuery(q: string): boolean {
  return /transformer|attention|bert|gpt|llm|neural|deep learning|embedding|gradient|backprop|optimizer|reinforcement|machine learning|computer vision|natural language|NLP/i.test(
    q,
  );
}

function passesAllFilters(paper: Paper, originalQuery: string): boolean {
  // 1. Hard junk pattern block — checked against title AND abstract to catch
  //    papers that hide irrelevance behind a clean-sounding title
  const titleAndAbstract = `${paper.title} ${(paper.abstract ?? "").slice(0, 500)}`;
  if (JUNK_PATTERNS.some((p) => p.test(titleAndAbstract))) return false;

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

  // 3. For neuroscience queries: block pure ML prediction/modeling papers
  //    that use AD as a dataset but don't study biological mechanisms
  if (queryDomain === "neuroscience") {
    const titleLower = paper.title.toLowerCase();
    const absLower = (paper.abstract ?? "").toLowerCase();
    const ML_AD_PREDICT_RE =
      /\b(spatio.?temporal|graph neural|graph deep|deep learning.*predict.*progression|machine learning.*predict.*progression|stochastic differential|multimodal.*predict|fmri.*predict|mri.*predict|neuroimaging.*classif|convolutional.*classif.*alzheimer)\b/i;
    const BIO_MECHANISM_RE =
      /\b(neuroinflammation|microglia|astrocyte|tau|amyloid|inflammasome|cytokine|nlrp3|blood.brain barrier|synaptic|glial|neuropathol)\b/i;
    if (
      ML_AD_PREDICT_RE.test(titleLower) &&
      !BIO_MECHANISM_RE.test(titleLower + " " + absLower.slice(0, 300))
    ) {
      return false;
    }
  }

  // 4. For NLP/LLM queries: additional hard filters
  if (queryDomain === "nlp") {
    const titleLower = paper.title.toLowerCase();

    // Block pre-2010 papers — only if low citation count (not classics)
    if (
      paper.year &&
      paper.year < 2010 &&
      (paper.citationCount ?? 0) < 1000 &&
      !STATIC_PAPER_IDS.has(paper.id)
    )
      return false;

    // Block pre-2020 papers with low citations unless they are key NLP papers
    const isKeyNLPTitle =
      /\b(bert|gpt|transformer|attention|word2vec|elmo|xlnet|language model)\b/i.test(
        titleLower,
      );
    if (
      paper.year &&
      paper.year < 2020 &&
      (paper.citationCount ?? 0) < 500 &&
      !STATIC_PAPER_IDS.has(paper.id) &&
      !isKeyNLPTitle
    )
      return false;

    // Block clinical/medical LLM papers — TITLE ONLY, very specific terms
    const isMedicalQuery =
      /\b(medical|clinical|health|patient|diagnosis|drug)\b/i.test(
        originalQuery,
      );
    if (!isMedicalQuery) {
      const CLINICAL_TITLE_RE =
        /\b(clinical.*knowledge|medical.*qa|health.*search|medqa|pubmedqa|medical.*licens|multimedqa|ehr.*language|biomedical.*qa|medical.*question)\b/i;
      if (CLINICAL_TITLE_RE.test(titleLower)) return false;
    }

    // Block robotics / embodied AI — TITLE ONLY
    if (
      /\b(robot(?:ic)?|grasping|manipulation.*model|embodied.*agent|syngrasp|sim.?to.?real)\b/i.test(
        titleLower,
      )
    )
      return false;

    // Block pure CV / contrastive image-text scaling papers — TITLE ONLY
    if (
      /\b(scaling vision transformer|contrastive language.?image.*scaling|contrastive.*image.*learning.*scaling|reproducible.*scaling.*clip|clip.*scaling|imagenet.*top.?1 accuracy)\b/i.test(
        titleLower,
      )
    )
      return false;

    // Block RL / policy gradient papers unless query asks for RL
    const isRLQuery =
      /reinforcement learning|policy gradient|reward function|Q-learning/i.test(
        originalQuery,
      );
    if (
      !isRLQuery &&
      /\b(reinforcement learning|policy gradient|reward.*function|Q-learning|markov decision|actor.?critic|deep RL|transfer.*reinforcement)\b/i.test(
        titleLower,
      )
    )
      return false;

    // Block vision meta-learning / MAML papers unless query asks for it
    const isMetaQuery = /\bMAML\b|model.?agnostic meta|meta.?learning/i.test(
      originalQuery,
    );
    if (
      !isMetaQuery &&
      /\b(MAML|model.?agnostic meta|meta.?learning.*classif|meta.?learn.*image|prototypical network|matching network|tapnet|regression network.*few.?shot|alpha maml)\b/i.test(
        titleLower,
      )
    )
      return false;

    // Block federated learning papers
    if (
      /\b(federated learning|federated optimization|federated.*privacy)\b/i.test(
        titleLower,
      )
    )
      return false;

    // Block semi-supervised learning surveys
    if (
      /\b(semi.?supervised learning.*survey|survey.*semi.?supervised)\b/i.test(
        titleLower,
      )
    )
      return false;

    // Block graph-structure papers not about NLP tasks — TITLE ONLY
    const GRAPH_NLP_RE =
      /\b(graph.*nlp|knowledge graph.*language|graph.*text classif|graph.*question)\b/i;
    const GRAPH_NON_NLP_RE =
      /\b(graph neural network|graph convolutional|GCN|spectral.*graph|node classif|link predict|graph structure.*learn)\b/i;
    if (GRAPH_NON_NLP_RE.test(titleLower) && !GRAPH_NLP_RE.test(titleLower))
      return false;
  }

  // 5. For mRNA vaccine queries: block low-citation niche papers
  const isMrnaQuery =
    /\b(mrna vaccine|covid.*vaccine|sars.cov.2.*vaccine|lipid nanoparticle.*vaccine|bnt162|mrna.1273|spike.*vaccine|nucleoside.*mrna)\b/i.test(
      originalQuery,
    );
  if (isMrnaQuery) {
    const titleLower = paper.title.toLowerCase();
    // Block very low citation papers (< 20) unless static
    if ((paper.citationCount ?? 0) < 20 && !STATIC_PAPER_IDS.has(paper.id))
      return false;
    // Block unrelated domain papers
    if (
      /\b(climate|monetary policy|neural network.*image|crispr|car.t cell|graph neural)\b/i.test(
        titleLower,
      )
    )
      return false;
    // Block mouse-only adjuvant studies unless query specifically asks
    const isAdjuvantQuery = /adjuvant|tlr|toll.like/i.test(originalQuery);
    if (
      !isAdjuvantQuery &&
      /\b(adjuvant.*mice|mice.*adjuvant|mouse.*immuniz|murine.*vaccine)\b/i.test(
        titleLower,
      )
    )
      return false;
  }

  // 5b. For climate science queries: block off-topic and low-quality papers
  const isClimateQuery =
    /\b(greenhouse gas|global warming|climate change|radiative forcing|carbon cycle|co2.*warming|ipcc|climate model|earth.*warming|sea level rise|arctic|ice sheet)\b/i.test(
      originalQuery,
    );
  if (isClimateQuery) {
    const titleLower = paper.title.toLowerCase();
    // Block paleo/Archean papers unless query asks for ancient climate
    const isPaleoQuery =
      /archean|proterozoic|paleoclimate|faint young sun|billion year|gyr/i.test(
        originalQuery,
      );
    if (
      !isPaleoQuery &&
      /\b(archean|proterozoic|faint young sun|gyr bp|billion year|precambrian|hadean)\b/i.test(
        titleLower,
      )
    )
      return false;
    // Block low-citation arXiv papers on climate queries
    if (
      paper.source === "arXiv" &&
      (paper.citationCount ?? 0) < 100 &&
      !STATIC_PAPER_IDS.has(paper.id)
    )
      return false;
    // Block ML/economics/biology papers on climate queries
    if (
      /\b(neural network|deep learning|monetary policy|central bank|cancer|immunotherapy|crispr)\b/i.test(
        titleLower,
      )
    )
      return false;
  }

  // 5b. For economics / monetary policy queries: block low-quality papers
  const isEconQuery =
    /\b(inflation|monetary policy|central bank|interest rate.*policy|gdp|fiscal policy|macroeconomic|phillips curve|taylor rule|quantitative easing|money supply)\b/i.test(
      originalQuery,
    );
  if (isEconQuery) {
    const titleLower = paper.title.toLowerCase();
    // Block low-citation arXiv papers (not peer reviewed, not well cited)
    if (
      paper.source === "arXiv" &&
      (paper.citationCount ?? 0) < 50 &&
      !STATIC_PAPER_IDS.has(paper.id)
    )
      return false;
    // Block any very recent (2024+) papers with < 30 citations from any source
    if (
      paper.year &&
      paper.year >= 2024 &&
      (paper.citationCount ?? 0) < 30 &&
      !STATIC_PAPER_IDS.has(paper.id)
    )
      return false;
    // Block niche single-country case studies with very low citations
    if ((paper.citationCount ?? 0) < 10 && !STATIC_PAPER_IDS.has(paper.id))
      return false;
    // Block ML/DL papers on economics queries
    if (
      /\b(neural network|deep learning|machine learning|transformer.*model|bert|gpt|llm)\b/i.test(
        titleLower,
      ) &&
      !/\b(forecast|predict.*inflation|economic.*forecast|gdp.*predict)\b/i.test(
        titleLower,
      )
    )
      return false;
    // Block pure Islamic banking papers unless query mentions it
    const isIslamicQuery = /islamic|sharia|halal|riba/i.test(originalQuery);
    if (
      !isIslamicQuery &&
      /\b(islamic bank|sharia.*finance|halal.*finance)\b/i.test(titleLower)
    )
      return false;
  }

  // 6. Age + citation floor for ML queries
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

// Pattern 6: Extract individual entities from comparison queries.
// "TCP vs UDP" → ["TCP", "UDP"]
// "Kubernetes vs Docker Swarm" → ["Kubernetes", "Docker Swarm"]
function parseComparisonEntities(query: string): string[] {
  if (!/\bvs\.?\b|\bversus\b|\bcompare\b|\bcomparison\b/i.test(query))
    return [];
  const stripped = query
    .replace(/^(compare|comparison\s+of|difference\s+between)\s+/i, "")
    .replace(/\bvs\.?\b|\bversus\b/gi, "|||");
  return stripped
    .split("|||")
    .map((p) => p.trim())
    .filter((p) => p.length > 1 && !/^(the|and|or|a|an|is|are)$/i.test(p));
}

export async function searchAllWithPubMed(
  q: string,
): Promise<{ papers: Paper[]; requiredIds: Set<string> }> {
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

  const foundResult =
    foundRes.status === "fulfilled"
      ? foundRes.value
      : { papers: [], requiredIds: new Set<string>() };

  const foundationalPapers: Paper[] = foundResult.papers;
  const requiredFoundationalIds: Set<string> = foundResult.requiredIds;

  // Pattern 6: For comparison queries, run entity-specific searches to ensure
  // both sides of the comparison have retrieved papers.
  const comparisonEntities = parseComparisonEntities(q);
  let entityPapers: Paper[] = [];
  if (comparisonEntities.length >= 2) {
    const entityFetches = await Promise.allSettled(
      comparisonEntities.flatMap((entity) => [
        withRetry(() => fetchSemanticScholar(entity, 6)),
        withRetry(() => fetchOpenAlex(entity, 5)),
        withRetry(() => fetchArXiv(entity, 4)),
      ]),
    );
    entityPapers = entityFetches.flatMap((r) =>
      r.status === "fulfilled" ? r.value : [],
    );
  }

  const all: Paper[] = [
    ...primarySS,
    ...(oaRes.status === "fulfilled" ? oaRes.value : []),
    ...(axRes.status === "fulfilled" ? axRes.value : []),
    ...(pmRes.status === "fulfilled" ? pmRes.value : []),
    ...extraResults.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
    ...citationPapers,
    ...entityPapers,
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

  const withCentrality = await computeGraphCentrality(allCandidates);
  const semanticRanked = await rerankPapersWithSemantic(
    withCentrality,
    rewritten,
    q,
  );

  // Pin required papers at the front before applying the 15-paper cap.
  // guaranteeFoundationalChunks can only inject chunks from papers that were
  // passed to chunkPapersWithSections. If a required paper is sliced out here
  // it has no chunks in the pool, so guaranteeFoundationalChunks has nothing
  // to work with and the paper can never be cited.
  const requiredSet = new Set(Array.from(requiredFoundationalIds));
  const requiredInRanked = semanticRanked.filter((p) => requiredSet.has(p.id));
  const otherPapers = semanticRanked.filter((p) => !requiredSet.has(p.id));
  // Allow the list to grow beyond 15 to fit all required papers, then fill
  // remaining slots with the highest-ranked non-required papers.
  const capped = [...requiredInRanked, ...otherPapers].slice(
    0,
    Math.max(15, requiredInRanked.length),
  );

  return {
    papers: capped,
    requiredIds: requiredFoundationalIds,
  };
}

// =============================================================
// SECTION 18 — SECTION-AWARE CHUNKING  (v6 NEW — Upgrade #3)
//
// Attempts to fetch full-text sections for the top papers.
// If sections are available, creates section-typed chunks.
// Falls back to abstract-only for papers without sections.
// =============================================================

export interface Chunk {
  evidenceId: string; // stable ID assigned at chunk-creation time; never changes after ranking
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
  section?: SectionType;
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
  let localIdx = 0; // per-paper, per-section counter for stable ID

  const pushChunk = () => {
    if (current.length === 0) return;
    const chunkText = current.join(" ");
    const textLower = chunkText.toLowerCase();
    const keywordDensity = queryKeywords.filter((k) =>
      textLower.includes(k),
    ).length;
    // Stable evidenceId: derived from paper identity + section + position within that section.
    // This never changes regardless of rerank order.
    const evidenceId = `e${hashString(`${paper.id}:${section ?? "abstract"}:${localIdx}`).slice(0, 6)}`;
    chunks.push({
      evidenceId,
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
    localIdx++;
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
  sectionFetchLimit = 8, // only fetch full-text sections for top N papers
): Promise<Chunk[]> {
  const chunks: Chunk[] = [];

  await Promise.all(
    papers.map(async (paper, idx) => {
      // Fetch sections only for the top sectionFetchLimit papers — broad fetching
      // adds noisy context that hurts precision more than it helps recall.
      const sections =
        idx < sectionFetchLimit
          ? await fetchPaperSections(paper.id).catch(() => null)
          : null;

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
    // True token-based document frequency — avoids spurious substring matches
    const df = chunks.filter((c) => {
      const toks = tokenize(c.text);
      return toks.some((tok) => tok === t);
    }).length;
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
  const scoredToUse =
    relevantScored.length >= Math.min(topK, 3) ? relevantScored : scored;

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

const MAX_EVIDENCE_CHUNKS = 15;

// Papers that are "required" for a query (named-entity match) get a special
// guarantee: they are always injected into the evidence regardless of whether
// they survived semantic reranking. This fixes the BERT/GPT/T5 comparison case
// where the 0.8 boost wasn't always enough to beat retrieved papers.
export function guaranteeFoundationalChunks(
  topChunks: Chunk[],
  allChunks: Chunk[],
  papers: Paper[],
  requiredPaperIds?: Set<string>,
): Chunk[] {
  const coveredIds = new Set(topChunks.map((c) => c.paperId));

  // Step 1: inject "required" foundational papers first — they must be present
  // regardless of how many chunks we already have.
  const requiredMissing = papers.filter(
    (p) => requiredPaperIds?.has(p.id) && !coveredIds.has(p.id),
  );

  // Step 2: inject other STATIC foundational papers that are present in allChunks
  // but didn't survive ranking — they go in only if there's still room.
  const optionalMissing = papers.filter(
    (p) =>
      STATIC_PAPER_IDS.has(p.id) &&
      !coveredIds.has(p.id) &&
      !requiredPaperIds?.has(p.id),
  );

  if (requiredMissing.length === 0 && optionalMissing.length === 0)
    return topChunks;

  const result = [...topChunks];

  for (const paper of requiredMissing) {
    // Required papers are injected even beyond the normal cap — they are needed
    // for correctness, not just quality. Cap at MAX_EVIDENCE_CHUNKS + required count.
    const paperChunks = allChunks.filter((c) => c.paperId === paper.id);
    if (paperChunks.length === 0) continue;
    result.push(paperChunks[0]);
    coveredIds.add(paper.id);
  }

  for (const paper of optionalMissing) {
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
  return topChunks.map((chunk) => {
    const paper = paperMap.get(chunk.paperId);
    const authors = chunk.authors ?? paper?.authors ?? [];
    const year = chunk.year ?? paper?.year ?? null;
    const citationCount = paper?.citationCount ?? 0;

    return {
      chunk_id: chunk.evidenceId, // use stable ID — never position-derived
      paper_id: chunk.paperId,
      title: chunk.title,
      authors,
      year,
      venue: paper?.journal ?? chunk.source ?? "Unknown",
      citationCount,
      doi: paper?.doi ?? chunk.doi,
      url: chunk.url ?? paper?.url ?? "Not available",
      text: chunk.text,
      section: chunk.section,
      inlineCite: formatInlineCite(authors, year),
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

  // Build context for Haiku — include paper title so it can do attribution checks
  const blockMap = new Map(evidenceBlocks.map((b) => [b.chunk_id, b]));
  const claimsCtx = claims
    .slice(0, 12) // cap to avoid token limit
    .map((c, i) => {
      const chunkTexts = c.citations
        .map((cid) => {
          const block = blockMap.get(cid);
          return block
            ? `  [${cid}] from paper "${block.title}" (${block.inlineCite}):\n    "${block.text.slice(0, 300)}"`
            : `  [${cid}]: NOT FOUND`;
        })
        .join("\n");
      return `Claim ${i + 1}: "${c.claim}"\nCited chunks:\n${chunkTexts}`;
    })
    .join("\n\n---\n\n");

  try {
    const r = await ant.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system:
        "You are a strict academic citation auditor. For each claim-citation pair, score how directly the cited chunk supports the specific claim (0-10). " +
        "Return ONLY valid JSON: an array of objects {claim_index, chunk_id, score, action} " +
        "where action is:\n" +
        "  'keep'   — score >= 7: chunk directly supports the claim\n" +
        "  'flag'   — score 4-6: chunk is topically related but does not directly support the claim\n" +
        "  'remove' — score <= 3: chunk does not support the claim or is from an unrelated field\n\n" +
        "CROSS-PAPER ATTRIBUTION RULE (highest priority): If the claim names a specific author, " +
        "model, or paper (e.g. 'Vaswani introduced the Transformer', 'BERT uses masked language modeling', " +
        "'GPT-3 has 175B parameters'), the cited chunk MUST be from that exact paper. " +
        "If the chunk is from a different paper — even one in the same field — score <= 2 and action 'remove'. " +
        "Topical similarity does NOT compensate for wrong-paper attribution.\n\n" +
        "Do NOT default to 'keep' when uncertain — use 'flag'. No markdown.",
      messages: [
        {
          role: "user",
          content: `Verify each claim is directly supported by its cited chunk:\n\n${claimsCtx}`,
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

      if (v.action === "remove" || v.score <= 3) {
        // Remove both bare and already-flagged forms so no dangling ⚠️ is left behind
        verifiedAnswer = verifiedAnswer.replace(
          new RegExp(`\\[CITATION:${cid}\\](?:⚠️)?`, "g"),
          "",
        );
        removed++;
        log.push(`REMOVED ${tag} (score: ${v.score})`);
      } else if (v.action === "flag" || (v.score >= 4 && v.score <= 6)) {
        // Weak citation — flag visibly so users know support is indirect.
        // Replace only bare [CITATION:id] (not already-flagged [CITATION:id]⚠️)
        // so repeated calls to verifyClaimCitations remain idempotent.
        verifiedAnswer = verifiedAnswer.replace(
          new RegExp(`\\[CITATION:${cid}\\](?!⚠️)`, "g"),
          `${tag}⚠️`,
        );
        flagged++;
        log.push(`FLAGGED ${tag} (score: ${v.score})`);
      }
      // score >= 7 → keep unchanged
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
  // Always verify — short answers are just as likely to have hallucinated citations
  try {
    const r = await ant.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      system: `You are an academic answer verifier. Your task:
1. Remove any 📄 citation cards that reference papers NOT mentioned in the provided context.
2. Remove fabricated URLs, DOIs, or author names absent from the context.
3. If a claim has no citation but COULD be supported by an evidence block about the same topic, KEEP IT unchanged — a later pass will add the citation. Only remove claims that are completely fabricated or contradicted by the evidence.
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
        `[Chunk ${i + 1} | ${c.evidenceId}: "${c.title}" (${c.source}, ${c.year ?? "n.d."})${authorStr}` +
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

// =============================================================
// SECTION 26 — UNIFIED RAG SYSTEM PROMPT
//
// Single prompt contract used everywhere. Key rules:
//   - Every factual sentence must end with [CITATION:evidenceId]
//   - NO LLM-generated citation cards, bibliography YAML, or paper metadata
//   - citedPapers is built in code from usedEvidenceIds after generation
//   - For named comparison queries, original papers must appear before derivatives
// =============================================================

export const RAG_SYSTEM = `You are Researchly, a citation-grounded academic research assistant for Indian students and researchers.
You ONLY help with academic, research, and study topics.
You must answer the user using ONLY the retrieved evidence blocks provided below.

GROUNDING RULES
1. Every factual sentence must end with one or more citations: [CITATION:evidenceId]
2. Only cite evidence IDs that appear in the EVIDENCE BLOCKS section.
3. Use the inline_cite field from the evidence block for the first mention of each paper.
   Example: "The Transformer uses only attention mechanisms. Vaswani et al. (2017) [CITATION:e3a1f2]"
   Subsequent uses of the same paper: just [CITATION:evidenceId] (no repeated inline_cite)
4. If a claim is supported by multiple chunks, cite all: [CITATION:e3a1f2][CITATION:e9b4c1]
5. If evidence is insufficient, write exactly: "I cannot support that from the retrieved papers."
6. Never invent authors, years, venues, URLs, DOI values, or paper titles.
7. Never cite a paper unless at least one cited evidence block belongs to that paper.
8. For comparison queries (e.g. BERT vs GPT vs T5), cite the original paper for each model
   before citing any derivative or survey papers.
9. NAMED-MODEL COMPARISON RULE — when the query compares BERT, GPT, or T5:
   a. ## Overview MUST cite only original model papers (Vaswani 2017, Devlin 2019, Radford 2018,
      Brown 2020, Raffel 2020). A survey that discusses these models is NOT a substitute — citing
      a survey (e.g. Zhao et al., 2023) in the Overview instead of an original paper is a violation.
   b. If the evidence contains a chunk from "Attention Is All You Need" (Vaswani et al., 2017),
      you MUST cite it for any claim about encoder/decoder structure, multi-head attention, or the
      shared architectural foundation of BERT, GPT, and T5.
   c. Reserve survey citations strictly for ## Technical Details or Comparison — never in ## Overview.
   d. In ## Key Concepts for a BERT/GPT/T5 comparison query, the ONLY permitted primary concept
      items are the four backbone models: Transformer (Vaswani 2017), BERT (Devlin 2019),
      GPT (Radford 2018 / Brown 2020), and T5 (Raffel 2020). Each must be a separate bullet.
      FORBIDDEN as primary Key Concept items: TinyBERT, DistilBERT, RoBERTa, ALBERT, XLNet,
      MPNet, BART, ELECTRA, DeBERTa, BitFit, adapter tuning, or any other fine-tuning variant.
      Those derivative models may appear only inside ## Technical Details or Comparison as
      brief supporting evidence — never as a named Key Concept.

MANDATORY RESPONSE STRUCTURE — output ALL 7 sections in order:
1. ## Overview
2. ## Key Concepts
3. ## System Architecture  (ASCII diagram for any AI system or pipeline)
4. ## Technical Details or Comparison  (comparison table when comparing 2+ models)
5. ## Limitations
6. ## Key Takeaways
7. ## What To Search Next  (3 query suggestions, no citations needed here)

CITATION PLACEMENT — hard limits per section:
- ## Overview: max 2 citations
- ## Key Concepts: EVERY concept sub-item MUST have at least 1 citation. Max 4 total.
- ## System Architecture: 0 citations
- ## Technical Details or Comparison: max 3 citations
- ## Limitations: max 2 citations — every factual limitation claim must cite its evidence
- ## Key Takeaways: every factual takeaway MUST have exactly 1 citation; max 5 citations total
- ## What To Search Next: 0 citations
- TOTAL across whole answer: maximum 16 [CITATION:*] markers

KEY CONCEPTS RULE: For EVERY named concept in ## Key Concepts, you MUST append [CITATION:evidenceId] at the end of its description. No exceptions — not even for well-known models.
Example of correct formatting for a comparison query:
  - BERT (...description...) Devlin et al. (2019) [CITATION:eXXXXXX]
  - GPT (...description...) Radford et al. (2018) [CITATION:eXXXXXX]
  - T5 (...description...) Raffel et al. (2020) [CITATION:eXXXXXX]
If a concept has no matching evidence block, write "I cannot support that from the retrieved papers." instead of leaving it uncited.

UNCITED SENTENCE RULE: Every factual sentence in ## Overview, ## Key Concepts, ## Technical Details or Comparison, ## Limitations, and ## Key Takeaways that does not end with a [CITATION:evidenceId] tag is a VIOLATION. Before finalising your answer, scan every sentence in those five sections and confirm each one ends with a citation tag. A sentence without a citation MUST be deleted — do not include uncited factual claims.

IMPORTANT — DO NOT output any of the following:
- Citation cards like "> **[N]** Author et al. (Year) — Title — Venue..."
- A "## Cited Papers" section, bibliography, YAML block, or references list
- Any paper metadata section at the end of your answer
The system builds the citation list from the evidence IDs you used — you do not need to write it.

EXAMPLE OF PERFECTLY CITED SECTIONS — follow this pattern exactly:

## Overview
The Transformer architecture relies solely on attention mechanisms, dispensing with recurrence and convolutions entirely. Vaswani et al. (2017) [CITATION:e10ufee] Building on this foundation, BERT, GPT, and T5 each adapt the Transformer for distinct pre-training paradigms. [CITATION:e1ywxwk][CITATION:elyuh92][CITATION:e1ddrwe]

## Key Concepts
- **Transformer** — A network architecture based solely on attention mechanisms. Vaswani et al. (2017) [CITATION:e10ufee]
- **BERT** — Pre-trains deep bidirectional representations by jointly conditioning on left and right context. Devlin et al. (2019) [CITATION:e1ywxwk]
- **GPT** — Demonstrates large gains via generative pre-training on unlabeled text. Radford et al. (2018) [CITATION:elyuh92]
- **T5** — Converts every NLP problem into a text-to-text format. Raffel et al. (2020) [CITATION:e1ddrwe]

## Key Takeaways
- The Transformer is the shared foundation for all three models. [CITATION:e10ufee]
- BERT excels at language understanding tasks through bidirectional context. [CITATION:e1ywxwk]
- GPT-3 achieves strong few-shot performance at 175B parameters. [CITATION:ebrown1]
- T5 unifies all NLP tasks into a single text-to-text framework. [CITATION:e1ddrwe]

NOTICE: Every single sentence ends with [CITATION:evidenceId]. Every Key Concept has an inline_cite + citation. Every Key Takeaway has a citation. Follow this pattern for ALL your answers.

WRITING RULES
- Never start with filler phrases like "Great question!" or "Certainly!".
- Bold **key terms** on first use.
- Research answers: 600–900 words. Study: 400–600 words.`;

// =============================================================
// SECTION 27 — RAG ANSWER GENERATOR
//
// Changes vs v6:
//   - lastChunkIdToPaperId is now request-local (no global mutable state)
//   - Returns { answer, chunkIdToPaperId, evidenceBlocks } so callers can
//     build citedPapers entirely in code from usedEvidenceIds
//   - After regeneration: re-runs BOTH verifyAnswer + verifyClaimCitations
//   - Stream mode passes chunkIdToPaperId back via returned object
// =============================================================

export interface RAGAnswerResult {
  answer: string;
  chunkIdToPaperId: Map<string, string>;
  evidenceBlocks: EvidenceBlock[];
  usedEvidenceIds: Set<string>;
  citedPapers: Paper[];
}

export async function generateRAGAnswer(
  query: string,
  papers: Paper[],
  stream = false,
  requiredIds?: Set<string>,
): Promise<string | AsyncIterable<string>> {
  const keywords = extractKeywords(query);
  const chunks = await chunkPapersWithSections(papers, keywords);
  const bm25Chunks = await rankChunks(query, chunks);
  const reranked = await rerankChunks(query, bm25Chunks, 8);
  const topChunks = guaranteeFoundationalChunks(
    reranked,
    chunks,
    papers,
    requiredIds,
  );

  const evidenceBlocks = buildEvidenceBlocks(topChunks, papers);
  const formattedEvidence = formatEvidenceBlocks(evidenceBlocks);

  // Request-local map — never touches global state
  const chunkIdToPaperId = new Map(
    evidenceBlocks.map((b) => [b.chunk_id, b.paper_id]),
  );

  const PROMPT = buildRAGPrompt(query, formattedEvidence);

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

  // Pass 1: hallucination guard
  rawAnswer = await verifyAnswer(rawAnswer, formattedEvidence);
  // Pass 2: per-citation strength check
  const { verified_answer: verifiedAnswer } = await verifyClaimCitations(
    rawAnswer,
    evidenceBlocks,
  );

  // Quality gate: if score < threshold, regenerate once and re-verify both passes
  const quality = await evaluateAnswerQuality(
    query,
    verifiedAnswer,
    formattedEvidence,
  );

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
      const retryRaw = rb.type === "text" ? rb.text : verifiedAnswer;
      if (retryRaw.length > verifiedAnswer.length * 0.8) {
        // Re-run BOTH verification passes on the regenerated answer
        const retryVerified1 = await verifyAnswer(
          retryRaw,
          formattedEvidence,
        ).catch(() => retryRaw);
        const { verified_answer: retryVerified2 } = await verifyClaimCitations(
          retryVerified1,
          evidenceBlocks,
        ).catch(() => ({ verified_answer: retryVerified1 }));
        return retryVerified2;
      }
    } catch {
      // Fall back to first verified answer
    }
  }

  return verifiedAnswer;
}

// Shared prompt builder — used by both generateRAGAnswer and stream/route.ts
export function buildRAGPrompt(
  query: string,
  formattedEvidence: string,
  intentAddendum = "",
): string {
  const intentSection = intentAddendum ? `\n\n${intentAddendum}` : "";
  return `You are Researchly, a citation-grounded research assistant.
You must answer the user using ONLY the retrieved evidence blocks provided below.
Do not use prior knowledge, world knowledge, or unstated assumptions.

GROUNDING RULES
1. Every factual sentence must end with one or more citations: [CITATION:evidenceId]
2. Only cite evidence IDs that appear in the EVIDENCE BLOCKS section.
3. Use the inline_cite field for the FIRST mention of each paper:
   "Vaswani et al. (2017) [CITATION:e3a1f2]"
4. For subsequent mentions of the same paper: just [CITATION:evidenceId]
5. If the evidence is insufficient: "I cannot support that from the retrieved papers."
6. If sources conflict, state the conflict explicitly and cite both sides.
7. Never invent authors, years, venues, URLs, DOI values, or paper titles.
8. For comparison queries, cite each model's original paper at least once before citing derivatives.
9. Do not output citation cards, bibliography YAML, or a Cited Papers section —
   the system builds the citation list from the evidence IDs you use.

EVIDENCE BLOCKS
${formattedEvidence}

USER QUESTION
${query}${intentSection}`;
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
// SECTION 29 — UNCITED SENTENCE REPAIR
//
// After generation + verification, scans ## Overview and ## Key Concepts
// for factual sentences that have no [CITATION:evidenceId] tag.
// For each one, asks Haiku which evidence block best supports it and
// inserts the tag. This catches the T5-has-no-citation failure mode
// where the model forgot to tag a concept it actually had evidence for.
// =============================================================

export async function repairUncitedSentences(
  answer: string,
  evidenceBlocks: EvidenceBlock[],
): Promise<string> {
  if (!evidenceBlocks.length) return answer;

  // ── Lookup maps built from evidenceBlocks ──────────────────────────────────
  const validChunkIds = new Set(evidenceBlocks.map((b) => b.chunk_id));
  const paperIdToChunkId = new Map<string, string>();
  for (const b of evidenceBlocks) {
    if (!paperIdToChunkId.has(b.paper_id))
      paperIdToChunkId.set(b.paper_id, b.chunk_id);
  }

  // ── Deterministic rules (defined early — used in both scanning and augmentation) ──

  // Bug A: sentences about Transformer architecture misattributed to Devlin.
  // If a sentence matches TRANSFORMER_ARCH_RE but NOT BERT_SPECIFIC_RE, swap
  // any Devlin chunk to Vaswani.
  const TRANSFORMER_ARCH_RE =
    /\btransformer architecture\b|\bshared foundation\b|\battention mechanism\b|\bbackbone\b|\bself.?attention\b|\bmulti.?head\b|\bencoder.{0,30}decoder\b/i;
  const BERT_SPECIFIC_RE =
    /\bBERT\b|\bbidirectional\b|\bmasked language\b|\bMLM\b|\bNSP\b/i;

  const devlinChunk = paperIdToChunkId.get("devlin2019");
  const vaswaniChunk = paperIdToChunkId.get("vaswani2017");

  // Bug B: explicit backbone-model rules — ordered so GPT-3 check precedes
  // generic GPT so "GPT-3" does not double-match both patterns.
  // paperIds is an ordered list: use the FIRST paper that exists in evidenceBlocks.
  // This allows a graceful fallback (e.g. radford2018 → brown2020 for generic "GPT"
  // when only the GPT-3 paper was retrieved).
  const BACKBONE_MODEL_RULES: Array<{ re: RegExp; paperIds: string[] }> = [
    { re: /\bBERT\b/, paperIds: ["devlin2019"] },
    {
      re: /\bGPT[-\s]?3\b|\bGPT3\b|\bfew.?shot learner\b|\b175.{0,10}billion\b/,
      paperIds: ["brown2020"],
    },
    {
      re: /\bGPT(?![-\s]?3)\b|\bGPT[-\s]?1\b|\bgenerative pre.?training\b/,
      paperIds: ["radford2018", "brown2020"],
    },
    { re: /\bT5\b|\btext.?to.?text\b/, paperIds: ["raffel2020"] },
    {
      re: /\btransformer architecture\b|\battention is all you need\b|\bVaswani\b/i,
      paperIds: ["vaswani2017"],
    },
  ];

  // Collective-reference rule: "these three models" / "all three" / "each model"
  // in a BERT+GPT+T5 answer should cite all three backbone papers.
  // Detected by scanning the full answer for all three model names.
  const isThreeWayBERTGPTT5 =
    /\bBERT\b/.test(answer) && /\bGPT\b/.test(answer) && /\bT5\b/.test(answer);
  const COLLECTIVE_REF_RE =
    /\bthese three models?\b|\ball three models?\b|\beach of the three\b|\beach model\b/i;

  // Title-keyword rules: for papers not in STATIC_PAPERS (e.g. MPNet, RoBERTa)
  // we find their chunk by matching against evidenceBlock titles at runtime.
  const TITLE_KEYWORD_RULES: Array<{ sentenceRe: RegExp; titleRe: RegExp }> = [
    { sentenceRe: /\bMPNet\b/i, titleRe: /mpnet/i },
    { sentenceRe: /\bRoBERTa\b/i, titleRe: /roberta/i },
    { sentenceRe: /\bXLNet\b/i, titleRe: /xlnet/i },
    { sentenceRe: /\bALBERT\b/i, titleRe: /albert/i },
    { sentenceRe: /\bELECTRA\b/i, titleRe: /electra/i },
  ];

  // ── Section scanning with sub-sentence splitting ───────────────────────────
  // Root cause of Issues 2+3: the old scanner did `if (line.has_citation) skip_line`.
  // This silently dropped the uncited sentences that were "lumped" on the same
  // line as a cited one (e.g. "BERT pre-trains... GPT-3 achieves 175B. [CITATION:x]").
  // Fix: split each line at sentence boundaries first, then check each sub-sentence
  // independently for citations.
  const targetSections = [
    "overview",
    "key concepts",
    "technical details or comparison",
    "technical details",
    "limitations",
    "key takeaways",
  ];
  const sectionParts = answer.split(/(^##\s+.+$)/m);

  // uncited: sentences with 0 citations → sent to Haiku AND Phase 2 backbone pass
  // partiallyCited: sentences with ≥1 citation that name multiple models → Phase 2 only
  // Root cause of sentences 1+2: the old scanner did `if (hasCitation) skip` which
  // prevented multi-model sentences that already had ONE citation from ever receiving
  // additional citations for the other models they mentioned.
  const uncited: Array<{
    sentence: string;
    sectionIdx: number;
    sectionName: string;
  }> = [];
  const partiallyCited: Array<{
    sentence: string;
    sectionIdx: number;
    sectionName: string;
  }> = [];

  for (let si = 0; si < sectionParts.length; si++) {
    const part = sectionParts[si];
    if (!/^##\s+/.test(part)) continue;
    const heading = part
      .replace(/^##\s+/, "")
      .trim()
      .toLowerCase();
    if (!targetSections.includes(heading)) continue;

    const bodyIdx = si + 1;
    const body = sectionParts[bodyIdx] ?? "";

    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length < 20) continue;
      if (/^[#|]/.test(trimmed)) continue; // markdown headers, table pipes
      if (/[│├└┐┘┌─▼]/.test(trimmed)) continue; // diagram chars
      if (/^\|.+\|$/.test(trimmed)) continue; // full table rows

      // Split line into sub-sentences at `. ` / `! ` / `? ` boundaries followed
      // by an uppercase letter. Em-dashes (—) are intentionally NOT sentence breaks.
      const subSentences = trimmed.split(/(?<=[.!?])\s+(?=[A-Z])/);

      for (const raw of subSentences) {
        const s = raw.trim();
        if (s.length < 20) continue;

        const hasCitation = /\[CITATION:[a-z0-9]+\]/.test(s);
        // Pattern 3: Key Concepts definitions may not end with standard punctuation
        // (e.g. "**BERT** — bidirectional pre-trained model for NLU tasks")
        // Accept them if they have ≥5 words and are in the key concepts section.
        const isKeyConceptsSection = heading === "key concepts";
        const endsOk =
          /[.!?]$/.test(s) ||
          /\(\d{4}\)$/.test(s) ||
          /\[CITATION:[a-z0-9]+\]$/.test(s) ||
          (isKeyConceptsSection && s.split(/\s+/).length >= 5);
        if (!endsOk) continue;

        if (!hasCitation) {
          uncited.push({
            sentence: s,
            sectionIdx: bodyIdx,
            sectionName: heading,
          });
        } else {
          // Already has at least one citation — may still need more for other
          // named models in the same sentence (the primary multi-citation bug).
          partiallyCited.push({
            sentence: s,
            sectionIdx: bodyIdx,
            sectionName: heading,
          });
        }
      }
    }
  }

  // DEBUG: log extracted sentences by section — helps diagnose missing Key Concepts citations
  const keyConcepts = uncited.filter((u) => u.sectionName === "key concepts");
  if (keyConcepts.length > 0) {
    console.log(
      "[repairUncited] Key Concepts uncited sentences:",
      keyConcepts.map((u) => u.sentence),
    );
  }
  const keyConceptsPartial = partiallyCited.filter(
    (u) => u.sectionName === "key concepts",
  );
  if (keyConceptsPartial.length > 0) {
    console.log(
      "[repairUncited] Key Concepts partially-cited sentences:",
      keyConceptsPartial.map((u) => u.sentence),
    );
  }
  console.log("[repairUncited] evidenceBlock paperIds:", [
    ...new Set(evidenceBlocks.map((b) => b.paper_id)),
  ]);

  if (uncited.length === 0 && partiallyCited.length === 0) return answer;

  // ── Haiku primary citation matching (uncited sentences only) ─────────────
  const evidenceSummary = evidenceBlocks
    .map(
      (b) =>
        `[${b.chunk_id}] "${b.title}" (${b.inlineCite}): ${b.text.slice(0, 200)}`,
    )
    .join("\n");

  type HaikuRaw = {
    sentence_index: number;
    chunk_ids?: (string | null)[];
    chunk_id?: string | null; // backward compat: old single-id format
    confidence: number;
  };

  let haikuRaw: HaikuRaw[] = [];
  if (uncited.length > 0) {
    const sentencesCtx = uncited
      .map((u, i) => `Sentence ${i + 1}: "${u.sentence}"`)
      .join("\n");
    try {
      const r = await ant.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2500,
        system:
          "You are a citation matcher. For each sentence, find ALL evidence blocks that support it (up to 3). " +
          "Return ONLY valid JSON: array of {sentence_index, chunk_ids: string[], confidence} " +
          "where confidence is 0-10 and chunk_ids is [] if confidence < 5. No markdown.",
        messages: [
          {
            role: "user",
            content: `EVIDENCE BLOCKS:\n${evidenceSummary}\n\nUNCITED SENTENCES:\n${sentencesCtx}\n\nMatch each sentence to ALL supporting evidence blocks.`,
          },
        ],
      });
      const b = r.content[0];
      if (b.type === "text") {
        haikuRaw = JSON.parse(
          b.text
            .trim()
            .replace(/```json|```/g, "")
            .trim(),
        ) as HaikuRaw[];
      }
    } catch {
      // Haiku failed — Phase 2 deterministic pass will still run
    }

    // Pattern 1: Tail-retry — if Haiku's JSON omitted any sentences (truncation),
    // re-send only the missing ones in a second, smaller request.
    if (haikuRaw.length > 0 && uncited.length > 0) {
      const returnedIndices = new Set(haikuRaw.map((m) => m.sentence_index));
      const missingIndices = uncited
        .map((_, i) => i + 1)
        .filter((idx) => !returnedIndices.has(idx));
      if (missingIndices.length > 0) {
        console.warn(
          `[repairUncited] tail-retry: ${missingIndices.length} sentences not covered by Haiku`,
        );
        const tailCtx = missingIndices
          .map((idx) => `Sentence ${idx}: "${uncited[idx - 1].sentence}"`)
          .join("\n");
        try {
          const r2 = await ant.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 800,
            system:
              "You are a citation matcher. For each sentence, find ALL evidence blocks that support it (up to 3). " +
              "Return ONLY valid JSON: array of {sentence_index, chunk_ids: string[], confidence} " +
              "where confidence is 0-10 and chunk_ids is [] if confidence < 5. No markdown.",
            messages: [
              {
                role: "user",
                content: `EVIDENCE BLOCKS:\n${evidenceSummary}\n\nUNCITED SENTENCES:\n${tailCtx}\n\nMatch each sentence to ALL supporting evidence blocks.`,
              },
            ],
          });
          const b2 = r2.content[0];
          if (b2.type === "text") {
            const tailRaw = JSON.parse(
              b2.text
                .trim()
                .replace(/```json|```/g, "")
                .trim(),
            ) as HaikuRaw[];
            haikuRaw.push(...tailRaw);
          }
        } catch {
          // tail retry failed — deterministic pass will cover these
        }
      }
    }
  }

  // Normalize + Bug C: filter hallucinated chunk_ids not in evidenceBlocks
  type HaikuNorm = {
    sentence_index: number;
    chunk_ids: string[];
    confidence: number;
  };
  const haikuMatches: HaikuNorm[] = haikuRaw.map((m) => {
    const raw = m.chunk_ids ?? (m.chunk_id ? [m.chunk_id] : []);
    return {
      sentence_index: m.sentence_index,
      confidence: m.confidence,
      chunk_ids: raw.filter(
        (id): id is string => typeof id === "string" && validChunkIds.has(id),
      ),
    };
  });

  // ── Phase 1: Apply Haiku primary citations + Bug A re-attribution ──────────
  const perSentence = new Map<number, Set<string>>(); // 1-based index → chunk_ids

  for (const m of haikuMatches) {
    if (m.confidence < 6) continue;
    const target = uncited[m.sentence_index - 1];
    if (!target) continue;

    const chunkSet = new Set<string>(m.chunk_ids);

    // Bug A: re-attribute Devlin → Vaswani for general Transformer-arch sentences
    if (
      devlinChunk &&
      vaswaniChunk &&
      chunkSet.has(devlinChunk) &&
      TRANSFORMER_ARCH_RE.test(target.sentence) &&
      !BERT_SPECIFIC_RE.test(target.sentence)
    ) {
      chunkSet.delete(devlinChunk);
      chunkSet.add(vaswaniChunk);
    }

    perSentence.set(m.sentence_index, chunkSet);
  }

  // Pattern 5: Title overlap verification — after Haiku assigns citations, swap
  // any chunk whose paper title has ZERO key-term overlap with the sentence.
  // Only applies when the sentence has 3+ key terms (to avoid over-swapping).
  // For Key Concepts sentences naming a technique, the title MUST contain it.
  const sentenceKeyTerms = (s: string): string[] =>
    s
      .toLowerCase()
      .replace(/\[CITATION:[a-z0-9]+\]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 5 && !STOP_WORDS.has(w));

  for (const [sidx, chunkSet] of perSentence) {
    const target = uncited[sidx - 1];
    if (!target) continue;
    const terms = sentenceKeyTerms(target.sentence);
    if (terms.length < 3) continue;

    for (const chunkId of [...chunkSet]) {
      const block = evidenceBlocks.find((b) => b.chunk_id === chunkId);
      if (!block) continue;
      const titleLower = block.title.toLowerCase();
      const hasOverlap = terms.some((t) => titleLower.includes(t));
      if (!hasOverlap) {
        // Try to find a better-matching block
        const betterBlock = evidenceBlocks.find(
          (b) =>
            !chunkSet.has(b.chunk_id) &&
            terms.some((t) => b.title.toLowerCase().includes(t)),
        );
        if (betterBlock) {
          chunkSet.delete(chunkId);
          chunkSet.add(betterBlock.chunk_id);
        }
      }
    }
  }

  // ── Phase 2: Deterministic backbone augmentation — independent of Haiku ────
  // Root cause of Issues 1, 4, 5, 6: Bug B augmentation was INSIDE the Haiku
  // confidence gate, so sentences Haiku scored < 6 (or skipped entirely) never
  // got backbone citations injected. Fix: run this pass over ALL uncited sentences
  // regardless of whether Haiku produced a match.
  for (let i = 0; i < uncited.length; i++) {
    const target = uncited[i];
    const sidx = i + 1;
    const chunkSet = perSentence.get(sidx) ?? new Set<string>();
    let modified = false;

    // Named backbone models — try each paperId in order, use first available
    for (const { re, paperIds } of BACKBONE_MODEL_RULES) {
      if (!re.test(target.sentence)) continue;
      const matched = paperIds.find((pid) => paperIdToChunkId.has(pid));
      console.log(
        `[repairUncited] backbone match: re=${re} sentence="${target.sentence.slice(0, 60)}" tried=${paperIds.join(",")} found=${matched ?? "NONE"}`,
      );
      for (const paperId of paperIds) {
        const chunkId = paperIdToChunkId.get(paperId);
        if (chunkId && !chunkSet.has(chunkId)) {
          chunkSet.add(chunkId);
          modified = true;
          break;
        }
      }
    }

    // Collective references ("these three models", "all three") in BERT/GPT/T5 answers
    if (isThreeWayBERTGPTT5 && COLLECTIVE_REF_RE.test(target.sentence)) {
      for (const pid of ["devlin2019", "radford2018", "raffel2020"]) {
        const chunkId = paperIdToChunkId.get(pid);
        if (chunkId && !chunkSet.has(chunkId)) {
          chunkSet.add(chunkId);
          modified = true;
        }
      }
    }

    // Non-backbone papers: look up by title keyword in evidenceBlocks
    for (const { sentenceRe, titleRe } of TITLE_KEYWORD_RULES) {
      if (!sentenceRe.test(target.sentence)) continue;
      const block = evidenceBlocks.find((b) => titleRe.test(b.title));
      if (block && !chunkSet.has(block.chunk_id)) {
        chunkSet.add(block.chunk_id);
        modified = true;
      }
    }

    // Pattern 3+7: Inline author mention → look up matching evidence block and
    // add its citation. This handles "Chang et al. (2023)" with no [CITATION:xxx].
    const INLINE_AUTHOR_RE = /([A-Z][a-z]+)\s+et\s+al\.\s*\((\d{4})\)/g;
    let authorMatch: RegExpExecArray | null;
    INLINE_AUTHOR_RE.lastIndex = 0;
    while ((authorMatch = INLINE_AUTHOR_RE.exec(target.sentence)) !== null) {
      const lastName = authorMatch[1].toLowerCase();
      const year = parseInt(authorMatch[2]);
      const matchingBlock = evidenceBlocks.find(
        (b) =>
          b.authors.length > 0 &&
          b.authors[0].toLowerCase().includes(lastName) &&
          b.year === year,
      );
      if (matchingBlock && !chunkSet.has(matchingBlock.chunk_id)) {
        chunkSet.add(matchingBlock.chunk_id);
        modified = true;
      }
    }

    if (modified) perSentence.set(sidx, chunkSet);
  }

  // Pattern 4: First-sentence-per-section fallback — if the first sentence in any
  // section makes a broad definitional claim and has no citation, assign the
  // primary paper (most-cited paper in the retrieved evidence set).
  {
    const paperFreq = new Map<string, number>();
    for (const b of evidenceBlocks) {
      paperFreq.set(b.paper_id, (paperFreq.get(b.paper_id) ?? 0) + 1);
    }
    const primaryPaperId = [...paperFreq.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0];
    const primaryChunkId = primaryPaperId
      ? paperIdToChunkId.get(primaryPaperId)
      : undefined;

    if (primaryChunkId) {
      const seenSections = new Set<number>();
      const BROAD_CLAIM_RE =
        /\bhas been\b|\bis a\b|\benables\b|\bcombines\b|\bapplied to\b|\bcan be\b|\bwas proposed\b|\bare used\b|\bintroduce[sd]?\b|\bpresent[s]?\b/i;
      for (let i = 0; i < uncited.length; i++) {
        const { sentence, sectionIdx } = uncited[i];
        if (seenSections.has(sectionIdx)) continue;
        seenSections.add(sectionIdx);
        const sidx = i + 1;
        if (!perSentence.has(sidx) && BROAD_CLAIM_RE.test(sentence)) {
          perSentence.set(sidx, new Set([primaryChunkId]));
        }
      }
    }
  }

  // ── Phase 2b: backbone augmentation for partially-cited sentences ──────────
  // Sentences that already have ≥1 citation from the LLM may still be missing
  // citations for OTHER named models in the same sentence (the multi-citation bug).
  // We skip chunk_ids already present as literal [CITATION:xxx] text in the sentence.
  type Insertion = { pos: number; sentenceLen: number; chunks: string[] };
  const partialInsertions: Insertion[] = [];
  for (const target of partiallyCited) {
    const newChunks = new Set<string>();

    // Named backbone models — try each paperId in order, use first available
    for (const { re, paperIds } of BACKBONE_MODEL_RULES) {
      if (!re.test(target.sentence)) continue;
      for (const paperId of paperIds) {
        const chunkId = paperIdToChunkId.get(paperId);
        if (!chunkId) continue;
        if (target.sentence.includes(`[CITATION:${chunkId}]`)) break; // already cited — stop
        newChunks.add(chunkId);
        break; // use first available only
      }
    }

    // Collective references ("these three models", "all three")
    if (isThreeWayBERTGPTT5 && COLLECTIVE_REF_RE.test(target.sentence)) {
      for (const pid of ["devlin2019", "radford2018", "raffel2020"]) {
        const chunkId = paperIdToChunkId.get(pid);
        if (
          chunkId &&
          !newChunks.has(chunkId) &&
          !target.sentence.includes(`[CITATION:${chunkId}]`)
        ) {
          newChunks.add(chunkId);
        }
      }
    }

    // Non-backbone papers: look up by title keyword
    for (const { sentenceRe, titleRe } of TITLE_KEYWORD_RULES) {
      if (!sentenceRe.test(target.sentence)) continue;
      const block = evidenceBlocks.find((b) => titleRe.test(b.title));
      if (
        block &&
        !newChunks.has(block.chunk_id) &&
        !target.sentence.includes(`[CITATION:${block.chunk_id}]`)
      ) {
        newChunks.add(block.chunk_id);
      }
    }

    // Pattern 2: Generic evidence-block title matching — scan ALL retrieved paper
    // titles for key terms that appear in the sentence. This catches multi-concept
    // sentences where the second/third concept is not in BACKBONE_MODEL_RULES.
    {
      const sentLower = target.sentence.toLowerCase();
      for (const block of evidenceBlocks) {
        if (target.sentence.includes(`[CITATION:${block.chunk_id}]`)) continue;
        if (newChunks.has(block.chunk_id)) continue;
        const titleTerms = block.title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length >= 5 && !STOP_WORDS.has(w));
        // Require 2+ title terms to appear in the sentence to avoid spurious matches
        const matchCount = titleTerms.filter((t) =>
          sentLower.includes(t),
        ).length;
        if (matchCount >= 2) {
          newChunks.add(block.chunk_id);
        }
      }
    }

    if (newChunks.size === 0) continue;
    const pos = answer.indexOf(target.sentence);
    if (pos < 0) continue;
    partialInsertions.push({
      pos,
      sentenceLen: target.sentence.length,
      chunks: [...newChunks],
    });
  }

  // ── Insertion: apply chunk_ids per sentence in document order ──────────────
  const insertions: Insertion[] = [];
  for (const [sidx, chunkSet] of perSentence) {
    if (chunkSet.size === 0) continue;
    const target = uncited[sidx - 1];
    if (!target) continue;
    const pos = answer.indexOf(target.sentence);
    if (pos < 0) {
      console.log(
        `[repairUncited] indexOf MISS: sentence="${target.sentence.slice(0, 80)}" section=${target.sectionName}`,
      );
      continue;
    }
    insertions.push({
      pos,
      sentenceLen: target.sentence.length,
      chunks: [...chunkSet],
    });
  }
  // Merge partial insertions and sort all by document position
  insertions.push(...partialInsertions);
  insertions.sort((a, b) => a.pos - b.pos);

  let repaired = answer;
  let cumulativeOffset = 0;
  for (const ins of insertions) {
    const insertAt = ins.pos + cumulativeOffset + ins.sentenceLen;
    if (/^\s*\[CITATION:/.test(repaired.slice(insertAt, insertAt + 20)))
      continue;
    const tag = ins.chunks.map((cid) => ` [CITATION:${cid}]`).join("");
    repaired = repaired.slice(0, insertAt) + tag + repaired.slice(insertAt);
    cumulativeOffset += tag.length;
  }

  // Pattern 7: Inline author mention scrubbing — remove "Author et al. (Year)"
  // mentions that don't match any retrieved paper (hallucinated from parametric knowledge).
  const INLINE_AUTHOR_GLOBAL_RE = /([A-Z][a-z]+)\s+et\s+al\.\s*\((\d{4})\)/g;
  repaired = repaired.replace(
    INLINE_AUTHOR_GLOBAL_RE,
    (match, lastName, year) => {
      // Check if this mention matches any retrieved paper's inlineCite
      const isRetrieved = evidenceBlocks.some((b) => {
        const cite = b.inlineCite.toLowerCase();
        return cite.includes(lastName.toLowerCase()) && cite.includes(year);
      });
      if (!isRetrieved) {
        // Replace with closest retrieved paper's inlineCite if one is nearby,
        // otherwise remove the hallucinated mention.
        return "";
      }
      return match;
    },
  );
  // Clean up double spaces left by removed mentions
  // Only collapse multiple SPACES — never touch newlines (\n) which carry markdown structure.
  repaired = repaired
    .replace(/ {2,}/g, " ")
    .replace(/ \./g, ".")
    .replace(/ ,/g, ",");

  return repaired;
}

// =============================================================
// EXPORTS
// =============================================================

export { searchAllWithPubMed as searchAll };
