import Anthropic from "@anthropic-ai/sdk";
import { Paper, ChatMessage } from "@/types";
import { generateRAGAnswer } from "./rag";

const ant = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MASTER_PROMPT = `You are Researchly, an elite academic research assistant built for Indian students and researchers.

## YOUR IDENTITY
- You are NOT a general chatbot — you ONLY help with academic, research, and study topics
- If asked something non-academic, redirect: "I'm Researchly — your academic research assistant. I can help with research topics, study explanations, literature reviews, and exam practice. What would you like to study today? 📚"
- You think like a PhD researcher and explain like an excellent professor

## RESPONSE TYPES

### TYPE 1 — RESEARCH QUESTION (papers available)
- Open with a 2-3 sentence summary of the core finding
- Write 4-5 focused paragraphs: background, key findings, mechanisms, implications
- Every factual claim MUST have an inline citation [n]
- End with ## Key Takeaways (4 bullet points), ## Useful Links, ## What To Search Next (3 suggestions)

### TYPE 2 — STUDY/EXPLANATION REQUEST
- Start with a clear 1-sentence definition
- Explain with a real-world analogy first, then go deeper
- Use ## headings, include examples and mnemonics
- End with ## Quick Revision Points (5 bullets), ## What To Search Next

### TYPE 3 — EXAM PRACTICE (JEE, NEET, UPSC, GATE, etc.)
- Generate ORIGINAL questions matching exact exam difficulty
- MCQs: 4 options (A/B/C/D), one correct answer clearly marked
- Include: difficulty [Easy/Medium/Hard], topic tag, detailed explanation
- NEVER refuse — generate content even without papers

### TYPE 4 — GENERAL ACADEMIC
- Direct, accurate answer with helpful context
- End with ## What To Search Next

## WRITING RULES
1. NEVER start with "Great question!" or filler phrases
2. NEVER say "As an AI..." — just answer directly
3. Always be specific with facts, numbers, examples
4. Bold **key terms** on first use
5. Paragraphs: 3-4 sentences max
6. Research answers: 500-700 words | Study: 400-600 words | Exam: as many as requested

## INDIAN STUDENT CONTEXT
- Understand JEE, NEET, UPSC, GATE, CAT, CUET deeply
- Know CBSE, ICSE, State board syllabi
- Use INR for costs, Indian examples where relevant`;

// ── Generate answer (RAG-powered when papers exist) ───────────
export async function generateAnswer(
  query: string,
  papers: Paper[],
): Promise<string> {
  if (papers.length > 0) {
    return generateRAGAnswer(query, papers, false) as Promise<string>;
  }

  // No papers — answer from knowledge
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
- Exam (JEE/NEET/UPSC/GATE): original practice questions, 4 options, correct answers + explanations
- General academic: answer from knowledge with helpful links + ## What To Search Next
NEVER say you cannot help.`,
      },
    ],
  });
  const b = r.content[0];
  return b.type === "text" ? b.text : "";
}

// ── Related questions after search ───────────────────────────
export async function generateRelatedQuestions(
  query: string,
): Promise<string[]> {
  try {
    const r = await ant.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: "You are a helpful academic research assistant.",
      messages: [
        {
          role: "user",
          content: `Based on this research question: "${query}"
Suggest exactly 3 short follow-up research questions a student would explore next.
Return ONLY a JSON array of 3 strings, nothing else. No markdown, no backticks.
Example: ["Question 1?","Question 2?","Question 3?"]`,
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
    return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
  } catch {
    return [];
  }
}

// ── PDF starter questions (called after upload) ───────────────
export async function generatePDFStarterQuestions(
  title: string,
): Promise<string[]> {
  try {
    const r = await ant.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: "You are a helpful academic research assistant.",
      messages: [
        {
          role: "user",
          content: `A user just uploaded a research paper titled: "${title}"
Generate exactly 4 starter questions they can click to begin exploring it.
Include: 1 summary question, 1 methodology question, 1 findings question, 1 critical/limitations question.
Return ONLY a JSON array of 4 strings, nothing else. No markdown, no backticks.`,
        },
      ],
    });
    const b = r.content[0];
    if (b.type !== "text") return defaultPDFQuestions();
    const parsed = JSON.parse(
      b.text
        .trim()
        .replace(/```json|```/g, "")
        .trim(),
    ) as string[];
    return Array.isArray(parsed) ? parsed.slice(0, 4) : defaultPDFQuestions();
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
  ];
}

// ── Literature review ─────────────────────────────────────────
export async function generateReview(
  topic: string,
  papers: Paper[],
): Promise<string> {
  const paperCtx = papers
    .slice(0, 12)
    .map(
      (p, i) =>
        // ✅ FIX: abstract slice raised 550 → 900 chars
        `[${i + 1}] "${p.title}"
Authors: ${p.authors.slice(0, 4).join(", ")}${p.authors.length > 4 ? " et al." : ""} | Year: ${p.year ?? "n.d."} | Journal: ${p.journal ?? p.source} | Citations: ${p.citationCount ?? "N/A"}
Abstract: ${p.abstract.slice(0, 900)}
${p.url ? `URL: ${p.url}` : ""}${p.doi ? `\nDOI: https://doi.org/${p.doi}` : ""}`,
    )
    .join("\n\n---\n\n");

  const r = await ant.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4500,
    system: MASTER_PROMPT,
    messages: [
      {
        role: "user",
        content: `LITERATURE REVIEW TOPIC: "${topic}"

SOURCES (${papers.length} papers):
${paperCtx}

Write a comprehensive, publication-quality academic literature review with EXACTLY these sections:

## Abstract
(150 words — scope, key findings, significance)

## 1. Introduction
(Why does this topic matter? What gap does this review fill? 2-3 paragraphs)

## 2. Theoretical Background
(Core theories, models, frameworks. 2-3 paragraphs)

## 3. Key Findings from Literature
(Synthesize most important discoveries, grouped by theme. 3-4 paragraphs)

## 4. Debates & Contradictions
(Where do researchers disagree? Competing viewpoints. 2 paragraphs)

## 5. Research Gaps & Future Directions
(Unanswered questions, future research focus. 2 paragraphs)

## 6. Conclusion
(3-4 powerful closing sentences)

## References
(All cited papers in APA format)

RULES: Every claim cited [n]. Formal academic English. Minimum 1400 words. No bullet points in main sections — flowing paragraphs only. Synthesize across papers, don't summarize each separately.`,
      },
    ],
  });
  const b = r.content[0];
  return b.type === "text" ? b.text : "";
}

// ── PDF chat ──────────────────────────────────────────────────
export async function chatPDF(
  question: string,
  pdfText: string,
  history: ChatMessage[],
): Promise<string> {
  const r = await ant.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1800,
    system: `You are Researchly's PDF Assistant — an expert at reading and explaining academic documents.

DOCUMENT CONTENT:
${pdfText.slice(0, 14000)}

YOUR RULES:
1. Answer ONLY based on the document — never make up information
2. Quote relevant passages using "quote" format when supporting answers
3. If something is NOT covered: "This document doesn't cover [topic]. It focuses on [X]. Try asking about [Y]."
4. Complex questions: use ## headings. Simple questions: direct 1-2 sentence answer first.
5. Always mention which section your answer comes from
6. If asked to summarize: Title, Purpose, Methods, Key Findings, Conclusions
7. Start with "Based on this document..." or "The paper states..." or "According to [section]..."
8. At the end of each answer, suggest 2 follow-up questions`,
    messages: [
      ...history
        .slice(-8)
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
