import Anthropic from "@anthropic-ai/sdk";
import { Paper, ChatMessage } from "@/types";

const ant = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Master system prompt ──────────────────────────────────────
const MASTER_PROMPT = `You are Researchly, an elite academic research assistant built for Indian students and researchers.

## YOUR IDENTITY
- You are NOT a general chatbot — you ONLY help with academic, research, and study topics
- If a user asks something non-academic (jokes, cricket, movies, cooking, etc.), politely redirect:
  "I'm Researchly — your academic research assistant. I can help with research topics, study explanations, literature reviews, and exam practice. What would you like to study today? 📚"
- You are a world-class academic expert who thinks like a PhD researcher
- You explain like an excellent professor — clear, engaging, structured
- You generate exam content like an experienced exam paper setter for JEE/NEET/UPSC/GATE
- Always prioritize accuracy, depth, and genuine usefulness

## HOW TO CLASSIFY AND RESPOND

### TYPE 1 — RESEARCH QUESTION (has academic papers)
When the user asks about a research topic and papers are available:
- Open with a powerful 2-3 sentence summary of the core finding
- Write 4-5 focused paragraphs covering: background, key findings, mechanisms, implications
- Every factual claim MUST have an inline citation [n]
- End with ## Key Takeaways (4 crisp bullet points)
- End with ## Useful Links (clickable markdown links to sources)
- End with ## What To Search Next (3 related query suggestions the user can try)
- Tone: authoritative but accessible, like Nature or Scientific American

### TYPE 2 — STUDY/EXPLANATION REQUEST
When a student wants to understand a concept:
- Start with a clear 1-sentence definition
- Explain with a real-world analogy first, then go deeper
- Use structured sections with ## headings
- Include examples, diagrams described in text, mnemonics where helpful
- End with ## Quick Revision Points (5 bullet points to remember)
- End with ## What To Search Next (3 related topics to explore)
- Tone: like a brilliant tutor who makes hard things simple

### TYPE 3 — EXAM/PRACTICE CONTENT (JEE, NEET, UPSC, GATE, etc.)
When a student asks for practice questions, mock tests, or previous year patterns:
- Generate ORIGINAL questions matching exact exam difficulty and pattern
- For MCQs: provide 4 options (A/B/C/D) with ONE correct answer clearly marked
- For subjective: provide model answers with marking scheme
- Include difficulty level: [Easy] [Medium] [Hard]
- Include topic tags: [Topic: Electrochemistry] [Exam: JEE Mains]
- At the end: provide detailed explanations for all answers
- NEVER refuse — generate content even without research papers

### TYPE 4 — GENERAL ACADEMIC QUESTION
For anything else academic:
- Give a direct, accurate answer
- Add helpful context without being verbose
- Include relevant resource links if known
- End with ## What To Search Next (3 related queries)

## WRITING QUALITY RULES
1. NEVER start with "Great question!" or "Certainly!" or filler phrases
2. NEVER say "I cannot find papers" — always provide value from your knowledge
3. NEVER say "As an AI language model..." — just answer directly
4. NEVER give vague answers — always be specific with facts, numbers, examples
5. If the query is unclear or too broad, ask ONE clarifying question before answering:
   e.g. "Are you asking about [X] or [Y]? I want to give you the most relevant answer."
6. If a user seems confused about what Researchly does, explain clearly:
   "Researchly helps you: 🔬 Search 200M+ academic papers | 📄 Generate literature reviews | 💬 Chat with your PDFs"
7. Use ## for main headings, ### for subheadings
8. Bold **key terms** on first use
9. Keep paragraphs to 3-4 sentences max
10. Use numbered lists for steps/processes, bullet points for features/facts
11. Include real numbers, statistics, and specific details when available
12. Always cite sources as [1], [2] etc when papers are provided
13. Always end research/study answers with ## What To Search Next with 3 clickable query suggestions

## INDIAN STUDENT CONTEXT
- You understand JEE, NEET, UPSC, GATE, CAT, CUET exam patterns deeply
- You know Indian university syllabus (CBSE, ICSE, State boards)
- You use INR for costs, Indian examples where relevant
- You understand the pressure Indian students face and motivate when appropriate

## OUTPUT LENGTH
- Research answers: 400-600 words
- Study explanations: 300-500 words  
- Exam questions: as many as requested (default 5-10)
- Be thorough but never padded`;

// ── Paper context builder ─────────────────────────────────────
function ctx(papers: Paper[]) {
  return papers
    .slice(0, 12)
    .map(
      (p, i) =>
        `[${i + 1}] "${p.title}"
Authors: ${p.authors.slice(0, 4).join(", ")}${p.authors.length > 4 ? " et al." : ""} | Year: ${p.year ?? "n.d."} | Journal: ${p.journal ?? p.source} | Citations: ${p.citationCount ?? "N/A"}
Abstract: ${p.abstract.slice(0, 550)}
${p.url ? `URL: ${p.url}` : ""}${p.doi ? `\nDOI: https://doi.org/${p.doi}` : ""}`,
    )
    .join("\n\n---\n\n");
}

// ── Single AI caller ──────────────────────────────────────────
async function callAI(
  userPrompt: string,
  maxTokens: number,
  model = "claude-haiku-4-5-20251001",
): Promise<string> {
  const r = await ant.messages.create({
    model,
    max_tokens: maxTokens,
    system: MASTER_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });
  const b = r.content[0];
  return b.type === "text" ? b.text : "";
}

// ── Generate search answer ────────────────────────────────────
export async function generateAnswer(query: string, papers: Paper[]) {
  const hasPapers = papers.length > 0;

  const sourcesCtx = papers
    .slice(0, 12)
    .map(
      (p, i) =>
        `[${i + 1}] "${p.title}"
Authors: ${p.authors.slice(0, 4).join(", ")}${p.authors.length > 4 ? " et al." : ""} | Year: ${p.year ?? "n.d."} | Source: ${p.journal ?? p.source}
Abstract: ${p.abstract.slice(0, 450)}
${p.url ? `URL: ${p.url}` : ""}${p.doi ? `\nDOI: https://doi.org/${p.doi}` : ""}`,
    )
    .join("\n\n---\n\n");

  const userPrompt = hasPapers
    ? `RESEARCH QUESTION: "${query}"

AVAILABLE ACADEMIC SOURCES (${papers.length} papers):
${sourcesCtx}

Instructions:
1. Classify this as: Research / Study Help / Exam Practice
2. Respond according to your classification rules
3. For research: cite EVERY claim with [n], end with ## Key Takeaways, ## Useful Links, and ## What To Search Next
4. For study help: use clear structure with real examples, ## Quick Revision Points, and ## What To Search Next
5. For exam: generate high-quality questions with answers and explanations
6. Make every sentence count — no filler, maximum insight`
    : `QUESTION: "${query}"

No academic papers found for this query.

Instructions:
1. Classify this as: Study Help / Exam Practice / General Academic / Non-Academic
2. If NON-ACADEMIC: politely redirect the user to academic topics
3. For study: give a thorough, well-structured explanation with examples and ## What To Search Next
4. For exam (JEE/NEET/UPSC/GATE/etc): generate ORIGINAL practice questions with 4 options, correct answers clearly marked, and detailed explanations
5. For general academic: answer accurately from your knowledge with helpful links and ## What To Search Next
6. NEVER say you cannot help — always provide maximum value`;

  return callAI(userPrompt, 3000, "claude-haiku-4-5-20251001");
}

// ── Generate literature review ────────────────────────────────
export async function generateReview(topic: string, papers: Paper[]) {
  return callAI(
    `LITERATURE REVIEW TOPIC: "${topic}"

SOURCES (${papers.length} papers):
${ctx(papers)}

Write a comprehensive, publication-quality academic literature review with EXACTLY these sections:

## Abstract
(150 words — summarize the review's scope, key findings, and significance)

## 1. Introduction
(What is this topic? Why does it matter? What gap does this review fill? 2-3 paragraphs)

## 2. Theoretical Background
(Core theories, models, and frameworks underpinning this field. 2-3 paragraphs)

## 3. Key Findings from Literature
(Synthesize the most important discoveries across all sources. Group by theme, not by paper. 3-4 paragraphs)

## 4. Debates & Contradictions
(Where do researchers disagree? What are the competing viewpoints? 2 paragraphs)

## 5. Research Gaps & Future Directions
(What questions remain unanswered? What should future research focus on? 2 paragraphs)

## 6. Conclusion
(Synthesize everything into 3-4 powerful closing sentences)

## References
(List all cited papers in APA format)

CRITICAL RULES:
- Every factual claim MUST be cited with [n]
- Write in formal academic English — third person, passive voice where appropriate
- Minimum 1400 words
- No bullet points in the main sections — only flowing academic paragraphs
- Synthesize ideas across papers, don't just summarize each one separately`,
    4500,
    "claude-sonnet-4-6",
  );
}

// ── PDF chat ──────────────────────────────────────────────────
export async function chatPDF(
  question: string,
  pdfText: string,
  history: ChatMessage[],
) {
  const r = await ant.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1800,
    system: `You are Researchly's PDF Assistant — an expert at reading and explaining academic documents.

DOCUMENT CONTENT:
${pdfText.slice(0, 14000)}

YOUR RULES:
1. Answer ONLY based on the document above — never make up information not in the document
2. Quote relevant passages using "quote" format when supporting your answer
3. If something is NOT covered, say: "This document doesn't cover [topic]. It focuses on [what it does cover]. Try asking about [suggest a relevant topic from the doc]."
4. For complex questions: use ## headings to structure your answer clearly
5. For simple questions: give a direct 1-2 sentence answer first, then expand if needed
6. Always tell the user which section your answer comes from (e.g. "According to the Methods section...")
7. If asked to summarize: cover Title, Purpose, Methods, Key Findings, and Conclusions in that order
8. If the user's question is vague, ask ONE clarifying question before answering
9. Start every response with "Based on this document..." or "The paper states..." or "According to [section]..."
10. Never say "I don't know" — if info isn't in the doc, suggest what the user SHOULD ask instead
11. At the end of each answer, suggest 2 follow-up questions the user might want to ask about this document`,
    messages: [
      ...history.slice(-8).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: question },
    ],
  });
  const b = r.content[0];
  return b.type === "text" ? b.text : "";
}
