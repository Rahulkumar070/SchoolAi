/**
 * AI generation layer for Researchly — Improved Version
 *
 * Improvements over original:
 * 1. FEAT: MASTER_PROMPT is more precise for Indian exam context
 * 2. FEAT: generateReview() abstract slice raised to 1200 chars
 * 3. FEAT: generateReview() now includes citation counts in paper list
 * 4. FEAT: generateRelatedQuestions() generates 4 follow-ups (was 3)
 * 5. FEAT: chatPDF() history window raised from 8 to 10 messages
 * 6. FEAT: chatPDF() upgraded from Haiku to Haiku-4-5 with richer instructions
 * 7. FEAT: generatePDFStarterQuestions() adds a "real-world applications" question
 * 8. FIX:  generateReview() now explicitly tells Claude to avoid bullet points in body
 */

import Anthropic from "@anthropic-ai/sdk";
import { Paper, ChatMessage } from "@/types";
import { generateRAGAnswer } from "./rag";

const ant = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MASTER_PROMPT = `You are Researchly, an expert academic research assistant for Indian students and researchers.
You ONLY help with academic, research, and study topics.
If asked something non-academic, redirect: "I'm Researchly — your academic research assistant. I can help with research topics, study explanations, literature reviews, and exam practice. What would you like to study today?"

RULE 1 — MANDATORY RESPONSE STRUCTURE
Every research answer MUST use these 7 sections in order:
1. ## Overview
2. ## Key Concepts
3. ## System Architecture  ← always include ASCII diagram (Rule 4)
4. ## Technical Details or Comparison  ← include table when comparing (Rule 5)
5. ## Key Research Papers
6. ## Limitations
7. ## Key Takeaways  +  ## What To Search Next

For study queries: adapt structure but keep ## Overview and ## Key Takeaways mandatory.
For exam queries (JEE / NEET / UPSC / GATE / CAT / CUET): generate original questions, 4 options (A-D), correct answer, detailed explanation. Include difficulty tag [Easy/Medium/Hard].

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
- Cards go inline after the claim, NOT in a references list at the bottom.
- Never fabricate paper titles, authors, or links.

RULE 3 — HANDLING MISSING CONTEXT
If no papers are retrieved or context is insufficient:
1. Supplement with well-established scientific knowledge — label it: "(From general knowledge)"
2. Include foundational papers from your training knowledge when discussing well-known topics (RAG, Transformers, Self-RAG, BERT, etc.)
3. Never fabricate citations.

RULE 4 — MANDATORY ASCII DIAGRAMS
Whenever discussing an AI system, architecture, pipeline, or model, ALWAYS include an ASCII diagram.

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
Avoid absolute statements. Always provide context and scope.
WRONG: "RNNs are outdated."
RIGHT: "RNNs are less commonly used for large-scale NLP compared to Transformers, but remain useful for streaming tasks such as speech recognition."

RULE 7 — RESEARCH-USEFUL OUTPUT
Focus on: key innovations, technical mechanisms, limitations, real-world applications.

RULE 8 — IMPORTANT PAPERS FOR WELL-KNOWN TOPICS
When answering about well-known AI topics (RAG, Transformers, BERT, Self-RAG, Mamba, etc.),
always include the most influential foundational papers, even if they are not in the retrieved context.

RULE 9 — OUTPUT QUALITY
Responses must resemble a concise academic literature review suitable for researchers, graduate students, and engineers.

INDIAN STUDENT CONTEXT
- Understand JEE Mains/Advanced, NEET UG/PG, UPSC CSE/IFS, GATE, CAT, CUET deeply
- Know CBSE, ICSE, State board syllabi and NCERT content
- Reference Indian institutions (IITs, IISc, AIIMS, NITs) where relevant

WRITING RULES
- Never start with filler phrases like "Great question!" or "Certainly!".
- Bold **key terms** on first use.
- Research answers: 600–900 words. Study: 400–600 words. Exam: as many questions as requested.`

// ── Generate answer (RAG-powered when papers exist) ───────────
export async function generateAnswer(
  query: string,
  papers: Paper[]
): Promise<string> {
  if (papers.length > 0) {
    return generateRAGAnswer(query, papers, false) as Promise<string>;
  }

  const r = await ant.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3500,
    system: MASTER_PROMPT,
    messages: [
      {
        role: "user",
        content: `QUESTION: "${query}"

No academic papers were found for this query.
Classify as: Study Help / Exam Practice / General Academic / Non-Academic.
- Non-academic: politely redirect
- Study: thorough explanation with examples + ## What To Search Next
- Exam (JEE/NEET/UPSC/GATE/CAT): original practice questions, 4 options, correct answers + explanations
- General academic: answer from knowledge with helpful links + ## What To Search Next
NEVER say you cannot help.`,
      },
    ],
  });
  const b = r.content[0];
  return b.type === "text" ? b.text : "";
}

// ── Related questions after search ───────────────────────────
// IMPROVED: generates 4 follow-ups (was 3)
export async function generateRelatedQuestions(
  query: string
): Promise<string[]> {
  try {
    const r = await ant.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 250,
      system: "You are a helpful academic research assistant.",
      messages: [
        {
          role: "user",
          content: `Based on this research question: "${query}"
Suggest exactly 4 short follow-up research questions a student would explore next.
Vary the angle: 1 conceptual, 1 applied, 1 comparative, 1 recent/future direction.
Return ONLY a JSON array of 4 strings, nothing else. No markdown, no backticks.
Example: ["Question 1?","Question 2?","Question 3?","Question 4?"]`,
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
    return Array.isArray(parsed) ? parsed.slice(0, 4) : [];
  } catch {
    return [];
  }
}

// ── PDF starter questions (called after upload) ───────────────
// IMPROVED: 5 questions including a real-world applications question
export async function generatePDFStarterQuestions(
  title: string
): Promise<string[]> {
  try {
    const r = await ant.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 280,
      system: "You are a helpful academic research assistant.",
      messages: [
        {
          role: "user",
          content: `A user just uploaded a research paper titled: "${title}"
Generate exactly 5 starter questions to explore it.
Include: 1 summary, 1 methodology, 1 key findings, 1 limitations/critique, 1 real-world applications question.
Return ONLY a JSON array of 5 strings, nothing else. No markdown, no backticks.`,
        },
      ],
    });
    const b = r.content[0];
    if (b.type !== "text") return defaultPDFQuestions();
    const parsed = JSON.parse(
      b.text
        .trim()
        .replace(/```json|```/g, "")
        .trim()
    ) as string[];
    return Array.isArray(parsed) ? parsed.slice(0, 5) : defaultPDFQuestions();
  } catch {
    return defaultPDFQuestions();
  }
}

function defaultPDFQuestions(): string[] {
  return [
    "Summarise this paper in simple terms",
    "What methodology did the authors use?",
    "What are the key findings?",
    "What are the limitations of this study?",
    "What are the real-world applications of this research?",
  ];
}

// ── Literature review ─────────────────────────────────────────
// IMPROVED: abstract slice 1200, citation counts in context, no bullet points instruction
export async function generateReview(
  topic: string,
  papers: Paper[]
): Promise<string> {
  const paperCtx = papers
    .slice(0, 15)
    .map(
      (p, i) =>
        `[${i + 1}] "${p.title}"
Authors: ${p.authors.slice(0, 4).join(", ")}${p.authors.length > 4 ? " et al." : ""} | Year: ${p.year ?? "n.d."} | Journal: ${p.journal ?? p.source} | Citations: ${p.citationCount ?? "N/A"}
Abstract: ${p.abstract.slice(0, 1200)}
${p.url ? `URL: ${p.url}` : ""}${p.doi ? `\nDOI: https://doi.org/${p.doi}` : ""}`
    )
    .join("\n\n---\n\n");

  const r = await ant.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 5000,
    system: MASTER_PROMPT,
    messages: [
      {
        role: "user",
        content: `LITERATURE REVIEW TOPIC: "${topic}"

SOURCES (${papers.length} papers):
${paperCtx}

Write a comprehensive, publication-quality academic literature review with EXACTLY these sections:

## Abstract
(150-180 words — scope, key findings, significance)

## 1. Introduction
(Why does this topic matter? What gap does this review fill? 2-3 paragraphs)

## 2. Theoretical Background
(Core theories, models, frameworks. 2-3 paragraphs)

## 3. Key Findings from Literature
(Synthesize discoveries grouped by theme. 3-4 paragraphs. Prioritize highly-cited papers.)

## 4. Methodological Approaches
(What methods do researchers use in this domain? Compare quantitative vs qualitative approaches. 2 paragraphs)

## 5. Debates & Contradictions
(Where do researchers disagree? Competing viewpoints. 2 paragraphs)

## 6. Research Gaps & Future Directions
(Unanswered questions, future research focus. 2 paragraphs)

## 7. Conclusion
(4-5 powerful closing sentences)

## References
(All cited papers in APA format with DOIs where available)

STRICT RULES:
- After every factual claim insert a full citation card (Paper / Authors / Year / Source / Link / Key Contribution). NEVER use [n] numbers. Formal academic English. Minimum 1600 words.
- NO bullet points in sections 1-7 — flowing paragraphs only.
- Synthesize across papers; do NOT summarize each separately.
- When two papers contradict, explicitly discuss both [n1] vs [n2].`,
      },
    ],
  });
  const b = r.content[0];
  return b.type === "text" ? b.text : "";
}

// ── PDF chat ──────────────────────────────────────────────────
// IMPROVED: history window 10 (was 8), more grounded instructions
export async function chatPDF(
  question: string,
  pdfText: string,
  history: ChatMessage[]
): Promise<string> {
  const r = await ant.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    system: `You are Researchly's PDF Assistant — an expert at reading and explaining academic documents.

DOCUMENT CONTENT:
${pdfText.slice(0, 16000)}

YOUR RULES:
1. Answer ONLY based on the document — never make up information
2. Quote relevant passages using "quote" format when supporting answers
3. If something is NOT covered: "This document doesn't cover [topic]. It focuses on [X]. Try asking about [Y]."
4. Complex questions: use ## headings. Simple questions: direct 1-2 sentence answer first.
5. Always mention which section your answer comes from (e.g. "According to the Methods section...")
6. If asked to summarize: Title → Purpose → Methods → Key Findings → Conclusions
7. Start with "Based on this document..." or "The paper states..." or "According to [section]..."
8. At the end of each answer, suggest 2 follow-up questions
9. Never say "I don't know" — if info isn't in the doc, suggest what to ask instead
10. For numerical results, always quote the exact values from the paper`,
    messages: [
      ...history
        .slice(-10) // IMPROVED: was -8
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      { role: "user", content: question },
    ],
  });
  const b = r.content[0];
  return b.type === "text" ? b.text : "";
}
