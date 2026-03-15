/**
 * Researchly Types — Upgraded v2
 *
 * Upgrades:
 * 1. EvidenceBlock now carries full author/citation/doi metadata  [Upgrade #1]
 * 2. PaperBadge system for credibility indicators                 [Upgrade #10]
 * 3. SectionChunk for section-aware PDF/paper chunking            [Upgrade #3]
 * 4. ComparisonResult, ResearchGap, Timeline types                [Upgrade #6]
 * 5. ClaimVerification type for hallucination reduction           [Upgrade #2]
 * 6. ExportFormat extended                                        [Upgrade #9]
 */

// ─────────────────────────────────────────────────────────────
// CORE PAPER TYPE
// ─────────────────────────────────────────────────────────────

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  abstract: string;
  journal?: string;
  doi?: string;
  url?: string;
  citationCount?: number;
  citationVelocity?: number; // citations gained in last 12 months
  graphCentrality?: number; // computed from citation graph traversal
  source: string;
  sections?: PaperSections; // full-text sections when available [Upgrade #3]
  badges?: PaperBadge[]; // credibility indicators [Upgrade #10]
  _embedding?: number[];
}

// ─────────────────────────────────────────────────────────────
// UPGRADE #3 — Section-aware paper content
// ─────────────────────────────────────────────────────────────

export interface PaperSections {
  introduction?: string;
  methods?: string;
  results?: string;
  discussion?: string;
  conclusion?: string;
}

export type SectionType =
  | "abstract"
  | "introduction"
  | "methods"
  | "results"
  | "discussion"
  | "conclusion";

// ─────────────────────────────────────────────────────────────
// UPGRADE #1 — Enhanced EvidenceBlock with full citation metadata
// ─────────────────────────────────────────────────────────────

export interface EvidenceBlock {
  chunk_id: string; // e.g. "c01"
  paper_id: string;
  title: string;
  authors: string[]; // NEW: for "Vaswani et al." formatting
  year: number | null;
  venue: string;
  citationCount: number; // NEW: "80,000+ citations"
  doi?: string; // NEW: for DOI links
  url: string;
  text: string;
  section?: SectionType; // NEW: which section this chunk is from
  inlineCite: string; // NEW: pre-computed "Vaswani et al. (2017)"
}

// ─────────────────────────────────────────────────────────────
// UPGRADE #2 — Claim verification
// ─────────────────────────────────────────────────────────────

export interface ClaimVerification {
  claim: string;
  chunk_id: string;
  support_score: number; // 0–10
  verdict: "strong" | "weak" | "unsupported";
  action: "keep" | "flag" | "remove";
}

export interface VerificationResult {
  verified_answer: string;
  verifications: ClaimVerification[];
  removed_count: number;
  flagged_count: number;
}

// ─────────────────────────────────────────────────────────────
// UPGRADE #10 — Paper credibility badges
// ─────────────────────────────────────────────────────────────

export type PaperBadge =
  | "highly-cited" // citationCount >= 5000
  | "foundational" // in the static foundational library
  | "recent-breakthrough" // year >= currentYear - 2 AND citationCount >= 500
  | "survey-paper" // title matches survey/review patterns
  | "influential" // graphCentrality >= 0.7
  | "open-access" // url available and free
  | "peer-reviewed"; // published in known high-impact venue

export interface BadgedPaper extends Paper {
  badges: PaperBadge[];
}

// ─────────────────────────────────────────────────────────────
// UPGRADE #5 — Citation graph intelligence
// ─────────────────────────────────────────────────────────────

export interface CitationGraphNode {
  paper_id: string;
  in_degree: number; // how many papers cite this
  out_degree: number; // how many papers this cites
  centrality: number; // PageRank-style importance score
  velocity: number; // recent citation rate
}

// ─────────────────────────────────────────────────────────────
// UPGRADE #6 — Academic features: comparison, gaps, timeline
// ─────────────────────────────────────────────────────────────

export interface ComparisonRow {
  attribute: string;
  [modelKey: string]: string | number;
}

export interface ComparisonResult {
  models: string[];
  rows: ComparisonRow[];
  summary: string;
  papers: Paper[];
}

export interface ResearchGap {
  gap: string;
  evidence: string;
  opportunity: string;
  supporting_papers: string[]; // paper IDs
}

export interface ResearchGapsResult {
  topic: string;
  gaps: ResearchGap[];
  future_directions: string[];
  papers: Paper[];
}

export interface TimelineEvent {
  year: number;
  title: string;
  description: string;
  paper_id?: string;
  significance: "foundational" | "major" | "incremental";
}

export interface ResearchTimeline {
  topic: string;
  events: TimelineEvent[];
  papers: Paper[];
}

// ─────────────────────────────────────────────────────────────
// UPGRADE #9 — Extended export formats
// ─────────────────────────────────────────────────────────────

export type CitationFormat =
  | "apa"
  | "mla"
  | "ieee"
  | "chicago"
  | "harvard"
  | "vancouver"
  | "bibtex";

export interface ExportResult {
  format: CitationFormat;
  content: string; // full formatted string
  papers: Paper[];
}

// ─────────────────────────────────────────────────────────────
// PAPER ARRAY CONTRACT — v2
//
// Two distinct arrays replace the old ambiguous `papers` field:
//
//   citedPapers    — papers whose evidenceId appears in the answer
//                    body. Rendered in the user-facing Sources panel.
//
//   retrievedPapers — full BM25/rerank output before citation
//                    filtering. Only shown in a labelled
//                    "Retrieved papers" / debug section.
//
// The bare field name `papers` is banned on all API responses,
// Mongo documents, frontend Turn/Message interfaces, and component
// props that feed a citation panel. TypeScript will catch violations
// because no shared interface exposes a field called `papers` for
// that purpose.
// ─────────────────────────────────────────────────────────────

/** A Paper that was actually cited in the answer body. */
export interface CitedPaper extends Paper {
  /** The evidenceId whose [CITATION:evidenceId] tag appears in the answer. */
  evidenceId: string;
}

/** A Paper that was fetched and ranked but may not have been cited. */
export interface RetrievedPaper extends Paper {
  /** 1-indexed position in the BM25/rerank output. */
  rank: number;
}

// ─── SSE event payload (type: "papers") ──────────────────────
// Sent from /api/search/stream after the answer is finalised.
export interface SSEPapersEvent {
  type: "papers";
  citedPapers: CitedPaper[];
  retrievedPapers: RetrievedPaper[];
  evidenceIdToPaperId: Record<string, string>;
  usedEvidenceIds: string[];
}

// ─── API response: /api/conversations/[id] messages ──────────
// What the frontend receives for each message in a conversation.
export interface MessageRecord {
  _id: string;
  role: "user" | "assistant";
  content: string;
  /** Papers actually cited in the answer. Empty array for user messages. */
  citedPapers: CitedPaper[];
  /** Full retrieval set. Empty for user messages and legacy v1 records. */
  retrievedPapers: RetrievedPaper[];
  /** 1 = legacy record where only `papers` was saved; 2 = split contract. */
  schemaVersion: 1 | 2;
  createdAt: string;
}

// ─── Frontend: one search turn in search/page.tsx state ──────
export interface SearchTurn {
  query: string;
  answer: string;
  /** Papers actually cited in the answer — rendered in the Sources panel. */
  citedPapers: CitedPaper[];
  /** Full retrieval set — available for a "Retrieved papers" expand section. */
  retrievedPapers: RetrievedPaper[];
  evidenceIdToPaperId: Record<string, string>;
  streaming?: boolean;
  related?: string[];
  status?: string;
  feedback?: "up" | "down" | null;
}

// ─── Mongo: User.searchHistory entry ─────────────────────────
export interface HistoryRecord {
  query: string;
  answer: string;
  citedPapers: Paper[];
  retrievedPapers: Paper[];
  searchedAt: Date;
  schemaVersion: 2;
}

// ─── Mongo: legacy history entry (schemaVersion absent or 1) ─
// Read-time normalization maps this → HistoryRecord:
//   citedPapers = papers, retrievedPapers = []
export interface LegacyHistoryRecord {
  query: string;
  answer: string;
  papers: Paper[];
  searchedAt: Date;
  schemaVersion?: 1;
}

// ─── Normalizer: call this on every DB read ───────────────────
// Never let LegacyHistoryRecord reach the rendering layer raw.
export function normalizeHistoryRecord(
  raw: HistoryRecord | LegacyHistoryRecord,
): HistoryRecord {
  if (raw.schemaVersion === 2) return raw as HistoryRecord;
  const legacy = raw as LegacyHistoryRecord;
  return {
    query: legacy.query,
    answer: legacy.answer,
    citedPapers: legacy.papers ?? [],
    retrievedPapers: [],
    searchedAt: legacy.searchedAt,
    schemaVersion: 2,
  };
}

// ─────────────────────────────────────────────────────────────
// UNCHANGED TYPES
// ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SavedPaper {
  paperId: string;
  title: string;
  authors: string[];
  year: number | null;
  journal?: string;
  doi?: string;
  url?: string;
  abstract?: string;
  savedAt: string;
}
