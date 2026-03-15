/**
 * Researchly Regression Benchmark — Query Definitions
 *
 * Each entry defines one test query and the exact checks that must pass.
 * Run with: npm run benchmark
 *
 * Adding a new query:
 *   1. Give it a unique id.
 *   2. Set requiredBackbone to the paper IDs or title substrings that MUST
 *      appear in the cited-paper panel.
 *   3. Set requireAllBackbone: true for comparison queries where every
 *      backbone paper is non-negotiable.
 *   4. Leave forbiddenSoleDisplacement empty unless a specific derivative
 *      paper has a history of crowding out originals.
 */

export interface BackboneEntry {
  /**
   * What to match against. Use the canonical paper ID (e.g. "vaswani2017")
   * when available; otherwise a distinctive lowercase title substring.
   */
  match: string;
  matchBy: "id" | "titleSubstring";
  /** Human-readable label shown in failure output. */
  label: string;
}

export interface BenchmarkChecks {
  /** Inclusive lower bound on cited-paper count. */
  minCitedPapers: number;
  /** Inclusive upper bound on cited-paper count. */
  maxCitedPapers: number;
  /**
   * Papers that must appear in the cited-paper panel.
   * If requireAllBackbone is true, ALL entries must be present.
   * If false, at least one must be present (useful for "any original").
   */
  requiredBackbone: BackboneEntry[];
  requireAllBackbone: boolean;
  /**
   * Papers that must NOT be the sole citation displacing backbone originals.
   * Checked only when a required backbone paper is absent — flags when a
   * derivative/survey paper is the only thing cited for a topic that requires
   * an original.
   */
  forbiddenSoleDisplacement: BackboneEntry[];
  /**
   * No orphaned [CITATION:xxx] tags — i.e. every citation evidenceId in the
   * answer must appear in evidenceIdToPaperId. Orphaned ones silently vanish
   * on the client. Note: bare [CITATION:xxx] in the raw SSE text is normal;
   * only ones with no backing entry are failures.
   */
  noOrphanedCitations: boolean;
  /** No standalone digit lines (e.g. a bare "1" on its own line). */
  noStandaloneDigits: boolean;
  /** No double warning emoji ⚠️⚠️ on any citation. */
  noDoubleWarning: boolean;
}

export interface BenchmarkQuery {
  id: string;
  description: string;
  query: string;
  checks: BenchmarkChecks;
}

// ─────────────────────────────────────────────────────────────────────────────
// BENCHMARK SET
// Add or tighten entries here. Never loosen requiredBackbone without a comment.
// ─────────────────────────────────────────────────────────────────────────────

export const BENCHMARK_QUERIES: BenchmarkQuery[] = [
  // ── Named comparison: all four backbone papers must be present ──────────
  {
    id: "bert-gpt-t5-comparison",
    description:
      "Named comparison of BERT, GPT, and T5 — must cite all four originals, " +
      "not displace with survey papers.",
    query: "compare BERT GPT T5 transformer architecture",
    checks: {
      minCitedPapers: 3,
      maxCitedPapers: 8,
      requiredBackbone: [
        {
          match: "vaswani2017",
          matchBy: "id",
          label: "Attention Is All You Need (Vaswani 2017)",
        },
        {
          match: "devlin2019",
          matchBy: "id",
          label: "BERT (Devlin 2019)",
        },
        {
          match: "radford2018",
          matchBy: "id",
          label: "GPT (Radford 2018)",
        },
        {
          match: "raffel2020",
          matchBy: "id",
          label: "T5 (Raffel 2020)",
        },
      ],
      requireAllBackbone: true,
      forbiddenSoleDisplacement: [
        {
          match: "survey",
          matchBy: "titleSubstring",
          label: "Generic survey paper displacing backbone originals",
        },
      ],
      noOrphanedCitations: true,
      noStandaloneDigits: true,
      noDoubleWarning: true,
    },
  },

  // ── Transformer-only query ───────────────────────────────────────────────
  {
    id: "transformer-attention",
    description:
      "Query about self-attention / Transformer — must cite the Vaswani paper.",
    query: "self-attention mechanism in transformers",
    checks: {
      minCitedPapers: 1,
      maxCitedPapers: 6,
      requiredBackbone: [
        {
          match: "vaswani2017",
          matchBy: "id",
          label: "Attention Is All You Need (Vaswani 2017)",
        },
      ],
      requireAllBackbone: true,
      forbiddenSoleDisplacement: [],
      noOrphanedCitations: true,
      noStandaloneDigits: true,
      noDoubleWarning: true,
    },
  },

  // ── BERT standalone ──────────────────────────────────────────────────────
  {
    id: "bert-pretraining",
    description:
      "BERT pre-training query — must cite BERT original; Transformer is helpful.",
    query: "BERT pre-training bidirectional language model",
    checks: {
      minCitedPapers: 1,
      maxCitedPapers: 6,
      requiredBackbone: [
        {
          match: "devlin2019",
          matchBy: "id",
          label: "BERT (Devlin 2019)",
        },
      ],
      requireAllBackbone: true,
      forbiddenSoleDisplacement: [],
      noOrphanedCitations: true,
      noStandaloneDigits: true,
      noDoubleWarning: true,
    },
  },

  // ── GPT / few-shot ───────────────────────────────────────────────────────
  {
    id: "gpt3-few-shot",
    description:
      "GPT-3 few-shot learning query — must cite Brown 2020 (GPT-3).",
    query: "GPT-3 few-shot learning large language model",
    checks: {
      minCitedPapers: 1,
      maxCitedPapers: 6,
      requiredBackbone: [
        {
          match: "brown2020",
          matchBy: "id",
          label: "GPT-3 (Brown 2020)",
        },
      ],
      requireAllBackbone: true,
      forbiddenSoleDisplacement: [],
      noOrphanedCitations: true,
      noStandaloneDigits: true,
      noDoubleWarning: true,
    },
  },

  // ── T5 standalone ────────────────────────────────────────────────────────
  {
    id: "t5-text-to-text",
    description:
      "T5 text-to-text transfer learning query — must cite Raffel 2020.",
    query: "T5 text-to-text transfer learning unified framework",
    checks: {
      minCitedPapers: 1,
      maxCitedPapers: 6,
      requiredBackbone: [
        {
          match: "raffel2020",
          matchBy: "id",
          label: "T5 (Raffel 2020)",
        },
      ],
      requireAllBackbone: true,
      forbiddenSoleDisplacement: [],
      noOrphanedCitations: true,
      noStandaloneDigits: true,
      noDoubleWarning: true,
    },
  },

  // ── General quality check — no specific backbone, just artifact guards ───
  {
    id: "general-rag-quality",
    description:
      "General RAG quality check — no artifact regressions, sane citation count.",
    query: "neural network training optimization gradient descent",
    checks: {
      minCitedPapers: 1,
      maxCitedPapers: 8,
      requiredBackbone: [],
      requireAllBackbone: false,
      forbiddenSoleDisplacement: [],
      noOrphanedCitations: true,
      noStandaloneDigits: true,
      noDoubleWarning: true,
    },
  },
];
