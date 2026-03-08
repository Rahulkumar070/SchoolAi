"use client";

import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────

interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  abstract: string;
  journal?: string;
  citationCount?: number;
  source: string;
  url?: string;
  doi?: string;
}

interface ScoreBreakdown {
  citScore: number;
  recency: number;
  titleOvlp: number;
  abstractOvlp: number;
  venue: number;
  foundationalBoost: number;
}

interface ScoredPaper {
  paper: Paper;
  total: number;
  breakdown: ScoreBreakdown;
  isFoundational: boolean;
}

interface DedupResult {
  paper: Paper;
  isDup: boolean;
  reason: string | null;
}

interface FilterResult {
  paper: Paper;
  blocked: string | null;
}

interface DedupState {
  ids: Set<string>;
  dois: Set<string>;
  arxivIds: Set<string>;
  urls: Set<string>;
  titles: Set<string>;
}

// ─── v5 Logic ────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();

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

function extractKeywords(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .replace(/[^a-z0-9\s\-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
    ),
  ];
}

const HIGH_VENUE_RE =
  /\b(nature|science|neurips|nips|icml|acl|cvpr|iclr|emnlp|naacl|iccv|eccv|aaai|ijcai|ieee transactions|pnas)\b/i;

function venueQuality(p: Paper): number {
  return HIGH_VENUE_RE.test(`${p.journal ?? ""} ${p.source ?? ""}`) ? 1.0 : 0.0;
}

function recencyScore(p: Paper): number {
  return p.year ? 1 / (1 + Math.max(0, CURRENT_YEAR - p.year)) : 0;
}

function titleOverlap(p: Paper, terms: string[]): number {
  if (!terms.length) return 0;
  const t = p.title.toLowerCase();
  return terms.filter((k) => t.includes(k)).length / terms.length;
}

function abstractOverlap(p: Paper, terms: string[]): number {
  if (!terms.length || !p.abstract) return 0;
  const a = p.abstract.toLowerCase();
  return terms.filter((k) => a.includes(k)).length / terms.length;
}

interface BoostRule {
  trigger: RegExp;
  phrases: string[];
  boost: number;
}

const BOOST_RULES: BoostRule[] = [
  {
    trigger:
      /transformer|attention.*mechanism|self.?attention|multi.?head|vaswani|how.*transformer/,
    phrases: ["attention is all you need"],
    boost: 5,
  },
  {
    trigger: /\bbert\b|bidirectional.*transformer|masked.*language.*model/,
    phrases: ["bert: pre-training of deep bidirectional transformers"],
    boost: 5,
  },
  {
    trigger: /gpt.?3|few.?shot.*language/,
    phrases: ["language models are few-shot learners"],
    boost: 5,
  },
  {
    trigger: /\brag\b|retrieval.?augmented/,
    phrases: ["retrieval-augmented generation for knowledge-intensive"],
    boost: 5,
  },
  {
    trigger: /\bresnet\b|residual.*learning|deep residual/,
    phrases: ["deep residual learning for image recognition"],
    boost: 5,
  },
  {
    trigger: /\bgan\b|generative adversarial/,
    phrases: ["generative adversarial networks"],
    boost: 5,
  },
  {
    trigger: /\badam\b|adam optimizer/,
    phrases: ["adam: a method for stochastic optimization"],
    boost: 5,
  },
];

function foundationalBoost(paper: Paper, originalQuery: string): number {
  const q = originalQuery.toLowerCase();
  const title = paper.title.toLowerCase();
  for (const { trigger, phrases, boost } of BOOST_RULES) {
    if (trigger.test(q)) {
      for (const phrase of phrases) {
        if (title.includes(phrase)) return boost;
      }
    }
  }
  return 0;
}

function scorePaper(
  paper: Paper,
  query: string,
  terms: string[],
): { total: number; breakdown: ScoreBreakdown } {
  const citScore = Math.log((paper.citationCount ?? 0) + 1);
  const recency = recencyScore(paper);
  const titleOvlp = titleOverlap(paper, terms);
  const abstractOvlp = abstractOverlap(paper, terms);
  const venue = venueQuality(paper);
  let score =
    0.4 * citScore +
    0.25 * recency +
    0.15 * titleOvlp +
    0.15 * abstractOvlp +
    0.05 * venue;
  if (venue > 0) score *= 1.3;
  const boost = foundationalBoost(paper, query);
  return {
    total: score + boost,
    breakdown: {
      citScore: 0.4 * citScore,
      recency: 0.25 * recency,
      titleOvlp: 0.15 * titleOvlp,
      abstractOvlp: 0.15 * abstractOvlp,
      venue: 0.05 * venue,
      foundationalBoost: boost,
    },
  };
}

function extractArxivId(s: string): string | null {
  const m = s?.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)/i);
  return m ? m[1].replace(/v\d+$/, "") : null;
}

function checkDuplicate(paper: Paper, state: DedupState): string | null {
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
    (paper.id ? extractArxivId(paper.id) : null);
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

  const reasons: string[] = [];
  if (idKey && state.ids.has(idKey)) reasons.push(`paperId`);
  if (doiKey && state.dois.has(doiKey)) reasons.push(`DOI: ${doiKey}`);
  if (arxivId && state.arxivIds.has(arxivId))
    reasons.push(`arXiv ID: ${arxivId}`);
  if (urlKey && urlKey.length > 10 && state.urls.has(urlKey))
    reasons.push(`URL`);
  if (titleKey && state.titles.has(titleKey)) reasons.push(`title`);

  if (reasons.length > 0) return reasons.join(", ");

  if (idKey) state.ids.add(idKey);
  if (doiKey) state.dois.add(doiKey);
  if (arxivId) state.arxivIds.add(arxivId);
  if (urlKey && urlKey.length > 10) state.urls.add(urlKey);
  if (titleKey) state.titles.add(titleKey);
  return null;
}

// ─── Mock Data ────────────────────────────────────────────────

const MOCK_PAPERS: Record<string, Paper[]> = {
  transformer: [
    {
      id: "vaswani2017",
      title: "Attention Is All You Need",
      authors: ["Ashish Vaswani", "Noam Shazeer", "Niki Parmar"],
      year: 2017,
      abstract:
        "We propose the Transformer, based solely on attention mechanisms, dispensing with recurrence entirely.",
      journal: "NeurIPS",
      citationCount: 120000,
      source: "arXiv",
      url: "https://arxiv.org/abs/1706.03762",
      doi: "10.48550/arXiv.1706.03762",
    },
    {
      id: "devlin2019",
      title:
        "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
      authors: ["Jacob Devlin", "Ming-Wei Chang", "Kenton Lee"],
      year: 2019,
      abstract:
        "BERT pre-trains deep bidirectional representations from unlabeled text. Achieves state-of-the-art on eleven NLP tasks.",
      journal: "NAACL",
      citationCount: 90000,
      source: "arXiv",
      url: "https://arxiv.org/abs/1810.04805",
    },
    {
      id: "survey2023",
      title: "A Comprehensive Survey of Transformer Architectures",
      authors: ["John Smith", "Jane Doe"],
      year: 2023,
      abstract:
        "We survey transformer architectures across NLP, vision and multimodal tasks. Attention mechanism has become dominant in deep learning.",
      citationCount: 850,
      source: "arXiv",
      url: "https://arxiv.org/abs/2301.99999",
    },
    {
      id: "vit2021",
      title:
        "An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale",
      authors: ["Alexey Dosovitskiy", "Lucas Beyer"],
      year: 2021,
      abstract:
        "We apply a pure transformer directly to sequences of image patches for image classification. ViT attains excellent results on large data.",
      journal: "ICLR",
      citationCount: 28000,
      source: "arXiv",
      url: "https://arxiv.org/abs/2010.11929",
    },
    {
      id: "fpga2022",
      title: "FTRANS: Energy-Efficient Acceleration of Transformers Using FPGA",
      authors: ["He Li", "Shen Gui"],
      year: 2022,
      abstract:
        "We propose FTRANS, a FPGA-based accelerator for transformers using field-programmable gate arrays for self-attention computation.",
      journal: "IEEE TCAD",
      citationCount: 300,
      source: "IEEE",
      url: "https://ieeexplore.ieee.org/fpga-ftrans",
    },
    {
      id: "medical2023",
      title: "UNETR: Transformers for 3D Medical Image Segmentation",
      authors: ["Ali Hatamizadeh"],
      year: 2023,
      abstract:
        "UNETR leverages transformers for volumetric 3D medical image segmentation using a transformer encoder.",
      journal: "CVPR",
      citationCount: 1200,
      source: "arXiv",
      url: "https://arxiv.org/abs/2103.10504",
    },
  ],
  bert: [
    {
      id: "devlin2019ss",
      title:
        "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
      authors: ["Jacob Devlin", "Ming-Wei Chang", "Kenton Lee"],
      year: 2019,
      abstract:
        "BERT pre-trains deep bidirectional representations from unlabeled text.",
      journal: "NAACL",
      citationCount: 90000,
      source: "Semantic Scholar",
      url: "https://arxiv.org/abs/1810.04805",
    },
    {
      id: "devlin2019oa",
      title:
        "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
      authors: ["Jacob Devlin", "Ming-Wei Chang", "Kenton Lee"],
      year: 2019,
      abstract:
        "BERT pre-trains deep bidirectional representations from unlabeled text.",
      journal: "NAACL",
      citationCount: 90000,
      source: "OpenAlex",
      doi: "10.18653/v1/N19-1423",
      url: "https://arxiv.org/abs/1810.04805",
    },
    {
      id: "liu2019",
      title: "RoBERTa: A Robustly Optimized BERT Pretraining Approach",
      authors: ["Yinhan Liu", "Myle Ott"],
      year: 2019,
      abstract:
        "RoBERTa removes the NSP objective and trains with larger batches, outperforming BERT on GLUE.",
      citationCount: 25000,
      source: "arXiv",
      url: "https://arxiv.org/abs/1907.11692",
    },
  ],
  resnet: [
    {
      id: "he2016",
      title: "Deep Residual Learning for Image Recognition",
      authors: ["Kaiming He", "Xiangyu Zhang"],
      year: 2016,
      abstract:
        "We present a residual learning framework to ease training of very deep networks. Won ILSVRC 2015.",
      journal: "CVPR",
      citationCount: 170000,
      source: "arXiv",
      url: "https://arxiv.org/abs/1512.03385",
    },
    {
      id: "densenet2017",
      title: "Densely Connected Convolutional Networks",
      authors: ["Gao Huang", "Zhuang Liu"],
      year: 2017,
      abstract:
        "DenseNet connects each layer to every other layer in feed-forward fashion, improving gradient flow.",
      journal: "CVPR",
      citationCount: 35000,
      source: "arXiv",
      url: "https://arxiv.org/abs/1608.06993",
    },
  ],
};

const SCENARIO_MAP: Record<string, string> = {
  "how do transformers work": "transformer",
  "explain BERT model": "bert",
  "what is ResNet": "resnet",
};

const PRESET_QUERIES = [
  "how do transformers work",
  "explain BERT model",
  "what is ResNet",
];

// ─── Badge Component ──────────────────────────────────────────

function Badge({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  const colors: Record<string, string> = {
    green: "bg-green-100 text-green-800 border border-green-200",
    red: "bg-red-100 text-red-800 border border-red-200",
    blue: "bg-blue-100 text-blue-800 border border-blue-200",
    purple: "bg-purple-100 text-purple-800 border border-purple-200",
    gray: "bg-gray-100 text-gray-700 border border-gray-200",
    orange: "bg-orange-100 text-orange-800 border border-orange-200",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[color] ?? colors["gray"]}`}
    >
      {children}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────

export default function TestHarness() {
  const [selectedQuery, setSelectedQuery] = useState<string>(PRESET_QUERIES[0]);
  const [customQuery, setCustomQuery] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("ranking");

  const query = selectedQuery === "custom" ? customQuery : selectedQuery;
  const scenario = SCENARIO_MAP[selectedQuery] ?? "transformer";
  const papers: Paper[] =
    MOCK_PAPERS[scenario] ?? MOCK_PAPERS["transformer"] ?? [];
  const keywords = extractKeywords(query);
  const qWords = keywords.filter((w) => w.length > 3);

  // Scoring
  const scored: ScoredPaper[] = papers
    .map((p) => {
      const { total, breakdown } = scorePaper(p, query, qWords);
      return {
        paper: p,
        total,
        breakdown,
        isFoundational: breakdown.foundationalBoost > 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  const maxScore = Math.max(...scored.map((s) => s.total), 1);

  // Deduplication
  const dedupState: DedupState = {
    ids: new Set(),
    dois: new Set(),
    arxivIds: new Set(),
    urls: new Set(),
    titles: new Set(),
  };
  const dedupResults: DedupResult[] = papers.map((p) => {
    const reason = checkDuplicate(p, dedupState);
    return { paper: p, isDup: !!reason, reason };
  });
  const dupCount = dedupResults.filter((r) => r.isDup).length;

  // Domain filter
  const DOMAIN_BLOCKS = [
    {
      pattern: /FPGA.*accelerat|field.?programmable.*gate.*array/i,
      exemptTrigger: /hardware|FPGA|chip/i,
    },
    {
      pattern: /UNETR|medical image segmentation|3d.*segmentation/i,
      exemptTrigger: /medical|clinical|surgery/i,
    },
  ];

  function isMLQuery(q: string): boolean {
    return /transformer|attention|bert|gpt|neural|deep learning/i.test(q);
  }

  const filterResults: FilterResult[] = papers.map((p) => {
    const text = `${p.title} ${p.abstract}`;
    let blocked: string | null = null;
    if (isMLQuery(query)) {
      for (const { pattern, exemptTrigger } of DOMAIN_BLOCKS) {
        if (!exemptTrigger.test(query) && pattern.test(text)) {
          blocked = pattern.source.slice(0, 35) + "...";
          break;
        }
      }
    }
    return { paper: p, blocked };
  });
  const blockedCount = filterResults.filter((r) => r.blocked).length;

  const tabs = [
    { id: "ranking", label: "📊 Paper Ranking" },
    { id: "dedup", label: "🔁 Deduplication" },
    { id: "filter", label: "🚫 Domain Filter" },
    { id: "boost", label: "⭐ Foundational Boost" },
  ];

  const breakdownLabels: Record<keyof ScoreBreakdown, string> = {
    citScore: "Citations",
    recency: "Recency",
    titleOvlp: "Title",
    abstractOvlp: "Abstract",
    venue: "Venue",
    foundationalBoost: "Boost",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            R
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">
              Researchly v5 — RAG Test Harness
            </h1>
            <p className="text-xs text-gray-500">
              Test scoring, deduplication, filtering and foundational boost
              logic
            </p>
          </div>
          <div className="ml-auto">
            <Badge color="green">v5 Upgrade</Badge>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Query selector */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Test Query
          </h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {PRESET_QUERIES.map((q) => (
              <button
                key={q}
                onClick={() => setSelectedQuery(q)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedQuery === q ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                {q}
              </button>
            ))}
            <button
              onClick={() => setSelectedQuery("custom")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedQuery === "custom" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            >
              custom query...
            </button>
          </div>
          {selectedQuery === "custom" && (
            <input
              type="text"
              value={customQuery}
              onChange={(e) => setCustomQuery(e.target.value)}
              placeholder="Type your query..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}
          <div className="flex flex-wrap gap-1.5 mt-3 items-center">
            <span className="text-xs text-gray-500">Keywords:</span>
            {keywords.map((k) => (
              <Badge key={k} color="blue">
                {k}
              </Badge>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            {
              label: "Papers Tested",
              value: papers.length,
              cls: "bg-indigo-50 text-indigo-700 border-indigo-100",
            },
            {
              label: "Duplicates Found",
              value: dupCount,
              cls:
                dupCount > 0
                  ? "bg-orange-50 text-orange-700 border-orange-100"
                  : "bg-green-50 text-green-700 border-green-100",
            },
            {
              label: "Domain Blocked",
              value: blockedCount,
              cls:
                blockedCount > 0
                  ? "bg-red-50 text-red-700 border-red-100"
                  : "bg-green-50 text-green-700 border-green-100",
            },
            {
              label: "Foundational Boost",
              value: scored.filter((s) => s.isFoundational).length,
              cls: "bg-purple-50 text-purple-700 border-purple-100",
            },
          ].map(({ label, value, cls }) => (
            <div key={label} className={`rounded-xl border p-4 ${cls}`}>
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-xs mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 flex">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-3 text-sm font-medium transition-colors ${activeTab === tab.id ? "border-b-2 border-indigo-600 text-indigo-700 bg-indigo-50" : "text-gray-500 hover:text-gray-700"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {/* RANKING */}
            {activeTab === "ranking" && (
              <div className="space-y-4">
                <p className="text-xs text-gray-500 mb-3">
                  Papers ranked by v5 formula. Foundational papers rank first
                  when the query triggers boost rules.
                </p>
                {scored.map(
                  ({ paper, total, breakdown, isFoundational }, i) => (
                    <div
                      key={`rank-${paper.id}-${i}`}
                      className={`rounded-xl border p-4 ${isFoundational ? "border-purple-200 bg-purple-50" : "border-gray-200 bg-gray-50"}`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i === 0 ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700"}`}
                        >
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap gap-2 items-start">
                            <span className="font-medium text-sm text-gray-900">
                              {paper.title}
                            </span>
                            {isFoundational && (
                              <Badge color="purple">
                                ⭐ Boost +{breakdown.foundationalBoost}
                              </Badge>
                            )}
                            {paper.year && (
                              <Badge color="gray">{paper.year}</Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {paper.authors.slice(0, 3).join(", ")}
                            {paper.authors.length > 3 ? " et al." : ""}
                          </p>
                          <div className="mt-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs text-gray-500 w-24">
                                Total Score
                              </span>
                              <div className="flex-1 bg-gray-200 rounded-full h-2">
                                <div
                                  className="h-2 rounded-full bg-indigo-600"
                                  style={{
                                    width: `${Math.min(100, (total / maxScore) * 100)}%`,
                                  }}
                                />
                              </div>
                              <span className="text-xs font-bold text-indigo-700 w-12 text-right">
                                {total.toFixed(2)}
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-1">
                              {(
                                Object.keys(breakdown) as Array<
                                  keyof ScoreBreakdown
                                >
                              ).map((key) => (
                                <div
                                  key={key}
                                  className="flex justify-between items-center px-2 py-1 bg-white rounded border border-gray-100 text-xs"
                                >
                                  <span className="text-gray-500">
                                    {breakdownLabels[key]}
                                  </span>
                                  <span className="font-medium">
                                    {breakdown[key].toFixed(2)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}

            {/* DEDUP */}
            {activeTab === "dedup" && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 mb-3">
                  v5 checks 5 keys: paperId → DOI → arXiv ID → URL → title.
                  Switch to &quot;explain BERT model&quot; to see a duplicate
                  caught.
                </p>
                {dedupResults.map(({ paper, isDup, reason }, i) => (
                  <div
                    key={`dup-${paper.id}-${i}`}
                    className={`rounded-xl border p-4 flex items-start gap-3 ${isDup ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5 font-bold ${isDup ? "bg-red-500 text-white" : "bg-green-500 text-white"}`}
                    >
                      {isDup ? "✕" : "✓"}
                    </div>
                    <div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="font-medium text-sm text-gray-900">
                          {paper.title.slice(0, 55)}
                          {paper.title.length > 55 ? "..." : ""}
                        </span>
                        <Badge color="gray">{paper.source}</Badge>
                        {paper.doi && <Badge color="blue">DOI</Badge>}
                        {paper.url?.includes("arxiv") && (
                          <Badge color="purple">arXiv</Badge>
                        )}
                      </div>
                      {isDup ? (
                        <p className="mt-1 text-xs text-red-700 font-medium">
                          🔁 Duplicate via: {reason}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-green-700 font-medium">
                          ✅ Unique — added to pool
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                <div
                  className={`rounded-xl border p-3 text-center text-sm font-medium ${dupCount > 0 ? "border-orange-200 bg-orange-50 text-orange-700" : "border-green-200 bg-green-50 text-green-700"}`}
                >
                  {dupCount > 0
                    ? `Removed ${dupCount} duplicate${dupCount > 1 ? "s" : ""} — ${papers.length - dupCount} unique papers remain`
                    : "No duplicates in this set"}
                </div>
              </div>
            )}

            {/* FILTER */}
            {activeTab === "filter" && (
              <div className="space-y-3">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 mb-3">
                  <strong>Active query:</strong> &ldquo;{query}&rdquo; —{" "}
                  {isMLQuery(query)
                    ? "✅ ML query (domain filters active)"
                    : "⚪ non-ML query (filters inactive)"}
                </div>
                {filterResults.map(({ paper, blocked }, i) => (
                  <div
                    key={`fil-${paper.id}-${i}`}
                    className={`rounded-xl border p-4 flex items-start gap-3 ${blocked ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5 font-bold ${blocked ? "bg-red-500 text-white" : "bg-green-500 text-white"}`}
                    >
                      {blocked ? "✕" : "✓"}
                    </div>
                    <div>
                      <span className="font-medium text-sm text-gray-900">
                        {paper.title.slice(0, 70)}
                        {paper.title.length > 70 ? "..." : ""}
                      </span>
                      {blocked ? (
                        <p className="mt-1 text-xs text-red-700">
                          🚫 Blocked:{" "}
                          <code className="bg-red-100 px-1 rounded">
                            {blocked}
                          </code>
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-green-700">
                          ✅ Passes domain filter
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* BOOST */}
            {activeTab === "boost" && (
              <div className="space-y-4">
                <p className="text-xs text-gray-500">
                  v5 fix: foundationalBoost() checks ORIGINAL query, not the
                  rewritten one. Boost raised 3 → 5 so seminal papers outrank
                  high-citation derivatives.
                </p>
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    Boost Rules
                  </h3>
                  {BOOST_RULES.map(({ trigger, phrases, boost }) => {
                    const fires = trigger.test(query.toLowerCase());
                    return (
                      <div
                        key={phrases[0]}
                        className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0"
                      >
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${fires ? "bg-purple-500 text-white" : "bg-gray-200 text-gray-400"}`}
                        >
                          {fires ? "✓" : "—"}
                        </div>
                        <span className="text-xs text-gray-700 flex-1">
                          {phrases[0]}
                        </span>
                        {fires && <Badge color="purple">+{boost}</Badge>}
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-2">
                  {scored.map(({ paper, breakdown, isFoundational }, i) => (
                    <div
                      key={`boost-${paper.id}-${i}`}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${isFoundational ? "border-purple-200 bg-purple-50" : "border-gray-100 bg-white"}`}
                    >
                      <span className="text-lg">
                        {isFoundational ? "⭐" : "○"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {paper.title.slice(0, 60)}
                          {paper.title.length > 60 ? "..." : ""}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Base:{" "}
                          {(
                            scored[i].total - breakdown.foundationalBoost
                          ).toFixed(2)}{" "}
                          + Boost: {breakdown.foundationalBoost} ={" "}
                          <strong>{scored[i].total.toFixed(2)}</strong>
                        </p>
                      </div>
                      {isFoundational && (
                        <Badge color="purple">FOUNDATIONAL</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 pb-4">
          Uses mock data. Live system adds: citation graph retrieval, real
          OpenAI embeddings, multi-API fetching, LLM reranking, and answer
          verification.
        </p>
      </div>
    </div>
  );
}
