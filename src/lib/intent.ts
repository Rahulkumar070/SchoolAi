/**
 * Intent Detection — Researchly v7
 *
 * Classifies user queries into 5 intent types and returns a retrieval
 * strategy for each. This allows the system to use different search
 * parameters, source preferences, and prompting strategies per query.
 *
 * Intent types:
 *   concept     → "What is attention?" / "Explain BERT"
 *   architecture → "How does a Transformer work?" / "BART architecture"
 *   comparison  → "BERT vs GPT" / "Compare T5 and BART"
 *   research    → "RAG hallucination papers" / "latest LLM alignment research"
 *   exam        → "JEE neural networks" / "GATE ML questions"
 */

import Anthropic from "@anthropic-ai/sdk";

const ant = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Intent Types ──────────────────────────────────────────────

export type QueryIntent =
  | "concept"
  | "architecture"
  | "comparison"
  | "research"
  | "exam"
  | "math";

export interface IntentResult {
  intent: QueryIntent;
  confidence: number; // 0–1
  entities: string[]; // extracted model/topic names
  requiresMath: boolean; // whether equations should be included
  retrievalHint: RetrievalHint;
}

export interface RetrievalHint {
  preferSurveys: boolean; // concept/comparison → include survey papers
  preferRecent: boolean; // research → bias toward recent papers
  preferFoundational: boolean; // architecture/concept → include seminal papers
  topK: number; // how many chunks to retrieve
  expandQueries: boolean; // whether to expand with related queries
  sourceWeights: {
    semanticScholar: number; // 0–1
    openAlex: number;
    arxiv: number;
    pubmed: number;
  };
}

// ── Rule-based fast classifier (no LLM) ──────────────────────

const COMPARISON_RE =
  /\b(vs\.?|versus|compare|comparison|difference.*between|better.*than|which.*is|contrast)\b/i;

const ARCHITECTURE_RE =
  /\b(architecture|how does|how do|mechanism|pipeline|layers|workflow|structure|diagram|components|encoder|decoder|flow)\b/i;

const MATH_RE =
  /\b(equation|formula|proof|derivation|calculate|compute|theorem|algorithm|pseudocode|math|matrix|gradient|backprop|loss function)\b/i;

const EXAM_RE =
  /\b(jee|neet|gate|upsc|mcq|exam|question|practice|solve|problem|marks|university|syllabus|quiz)\b/i;

const RESEARCH_RE =
  /\b(paper|papers|research|survey|recent|new|state.?of.?the.?art|sota|hallucination|benchmark|dataset|fine.?tun)\b/i;

function extractEntities(query: string): string[] {
  const MODEL_PATTERNS =
    /\b(bert|gpt|t5|bart|llama|mistral|claude|gemini|palm|rag|transformer|resnet|vgg|cnn|rnn|lstm|gru|vae|gan|diffusion|attention|word2vec|glove|fasttext|roberta|xlnet|electra|deberta|gpt-?[1-4]|gpt-?j|gpt-?neo|llm|vlm|mamba|s4|ssm)\b/gi;
  const matches = [...query.matchAll(MODEL_PATTERNS)];
  return [...new Set(matches.map((m) => m[1].toUpperCase()))];
}

function ruleBasedIntent(query: string): QueryIntent | null {
  if (EXAM_RE.test(query)) return "exam";
  if (MATH_RE.test(query)) return "math";
  if (COMPARISON_RE.test(query)) return "comparison";
  if (ARCHITECTURE_RE.test(query)) return "architecture";
  if (RESEARCH_RE.test(query)) return "research";
  return null;
}

// ── LLM-based classifier (called only when rules are unsure) ──

async function llmClassifyIntent(query: string): Promise<QueryIntent> {
  try {
    const r = await ant.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 30,
      system:
        "Classify the academic query into exactly one of: concept, architecture, comparison, research, exam, math. " +
        "concept = explaining what something is. architecture = how a system works internally. " +
        "comparison = comparing two or more models/methods. research = finding papers/surveys. " +
        "exam = practice questions or exam prep. math = equations, proofs, derivations. " +
        "Return ONLY the single word label.",
      messages: [{ role: "user", content: query }],
    });
    const b = r.content[0];
    if (b.type !== "text") return "concept";
    const label = b.text.trim().toLowerCase() as QueryIntent;
    const VALID: QueryIntent[] = [
      "concept",
      "architecture",
      "comparison",
      "research",
      "exam",
      "math",
    ];
    return VALID.includes(label) ? label : "concept";
  } catch {
    return "concept";
  }
}

// ── Retrieval hints per intent ────────────────────────────────

function buildRetrievalHint(intent: QueryIntent): RetrievalHint {
  switch (intent) {
    case "concept":
      return {
        preferSurveys: true,
        preferRecent: false,
        preferFoundational: true,
        topK: 12,
        expandQueries: true,
        sourceWeights: {
          semanticScholar: 0.9,
          openAlex: 0.7,
          arxiv: 0.5,
          pubmed: 0.2,
        },
      };

    case "architecture":
      return {
        preferSurveys: false,
        preferRecent: false,
        preferFoundational: true,
        topK: 15,
        expandQueries: true,
        sourceWeights: {
          semanticScholar: 1.0,
          openAlex: 0.6,
          arxiv: 0.8,
          pubmed: 0.1,
        },
      };

    case "comparison":
      return {
        preferSurveys: true,
        preferRecent: true,
        preferFoundational: true,
        topK: 16,
        expandQueries: true,
        sourceWeights: {
          semanticScholar: 1.0,
          openAlex: 0.8,
          arxiv: 0.7,
          pubmed: 0.1,
        },
      };

    case "research":
      return {
        preferSurveys: true,
        preferRecent: true,
        preferFoundational: false,
        topK: 12,
        expandQueries: true,
        sourceWeights: {
          semanticScholar: 1.0,
          openAlex: 0.9,
          arxiv: 0.9,
          pubmed: 0.5,
        },
      };

    case "exam":
      return {
        preferSurveys: false,
        preferRecent: false,
        preferFoundational: false,
        topK: 8,
        expandQueries: false,
        sourceWeights: {
          semanticScholar: 0.5,
          openAlex: 0.5,
          arxiv: 0.3,
          pubmed: 0.2,
        },
      };

    case "math":
      return {
        preferSurveys: false,
        preferRecent: false,
        preferFoundational: true,
        topK: 10,
        expandQueries: true,
        sourceWeights: {
          semanticScholar: 1.0,
          openAlex: 0.6,
          arxiv: 1.0,
          pubmed: 0.1,
        },
      };
  }
}

// ── Cache ─────────────────────────────────────────────────────

const intentCache = new Map<string, IntentResult>();

// ── Main export ───────────────────────────────────────────────

export async function detectIntent(query: string): Promise<IntentResult> {
  const cacheKey = query.toLowerCase().trim().slice(0, 200);
  const cached = intentCache.get(cacheKey);
  if (cached) return cached;

  const entities = extractEntities(query);
  const requiresMath = MATH_RE.test(query);

  // Try rule-based first
  let intent = ruleBasedIntent(query);
  let confidence = intent ? 0.85 : 0.0;

  // Fall back to LLM for ambiguous queries
  if (!intent) {
    intent = await llmClassifyIntent(query);
    confidence = 0.7;
  }

  const result: IntentResult = {
    intent,
    confidence,
    entities,
    requiresMath,
    retrievalHint: buildRetrievalHint(intent),
  };

  intentCache.set(cacheKey, result);
  return result;
}

// ── System prompt addendum based on intent ────────────────────

export function getIntentSystemAddendum(intent: IntentResult): string {
  const lines: string[] = [];

  if (intent.requiresMath || intent.intent === "math") {
    lines.push(
      "MATH REQUIREMENT: When explaining algorithms or formulas, you MUST include:",
      "• The mathematical notation using LaTeX-style inline math (e.g., $Q K^T / \\sqrt{d_k}$)",
      "• A step-by-step breakdown of each variable and operation",
      "• A concrete numeric example or worked case",
      "Example for Attention:",
      "  $\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{Q K^T}{\\sqrt{d_k}}\\right) V$",
      "  where Q ∈ ℝ^{n×d_k}, K ∈ ℝ^{m×d_k}, V ∈ ℝ^{m×d_v}",
    );
  }

  if (intent.intent === "architecture") {
    lines.push(
      "ARCHITECTURE REQUIREMENT: Include a detailed ASCII diagram of the system pipeline.",
      "Show all major components, data flow arrows, and dimension transformations where relevant.",
    );
  }

  if (intent.intent === "comparison") {
    lines.push(
      "COMPARISON REQUIREMENT: Include a markdown comparison table with columns for each model/method.",
      "Cover: Architecture, Parameters, Training Data, Key Innovation, Strengths, Weaknesses.",
      "Cite the original paper for each model at least once.",
    );
  }

  if (intent.intent === "research") {
    lines.push(
      "RESEARCH REQUIREMENT: Focus on empirical results, benchmark numbers, and open research questions.",
      "Highlight the most-cited recent papers and note conflicting findings across papers.",
    );
  }

  if (intent.intent === "exam") {
    lines.push(
      "EXAM MODE: Generate 3–5 practice questions at the end with detailed answers.",
      "Mark difficulty (Easy/Medium/Hard) and map to relevant exam (JEE/GATE/NEET where applicable).",
    );
  }

  return lines.length > 0 ? "\n\nINTENT-SPECIFIC RULES:\n" + lines.join("\n") : "";
}
