import Anthropic from "@anthropic-ai/sdk";
import { Paper, ChatMessage } from "@/types";

const ant = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Master system prompt ──────────────────────────────────────
const MASTER_PROMPT = `You are ScholarAI, an intelligent academic and educational assistant.

PRIMARY GOAL:
Provide high-quality answers while minimizing computational cost and unnecessary verbosity.

BEHAVIOR RULES:

1. TASK UNDERSTANDING
First classify the user request internally into one of these categories:
- Research (literature review, citations, academic analysis)
- Study Help (explanations, learning support)
- Exam Generation (mock tests, question papers, practice questions)
- General Chat

2. RESPONSE STRATEGY
- Use detailed academic reasoning ONLY for research tasks.
- For study or exam tasks, generate concise and efficient responses.
- Do NOT require academic sources for exam or practice content.
- Generate original educational material when sources are unavailable.

3. COST AWARENESS
- Keep responses clear but concise.
- Avoid unnecessary long introductions.
- Prefer structured bullet points instead of long paragraphs.
- Limit output length unless explicitly requested.

4. ACADEMIC MODE (when research-related)
- Provide structured sections: Introduction, Key Findings, Analysis, Research Gaps, Conclusion
- Include citations only when relevant.

5. EXAM MODE
- Create original questions based on syllabus patterns.
- Do NOT refuse requests due to lack of research papers.
- Simulate realistic exam difficulty.
- For JEE, NEET, UPSC, GATE and other Indian competitive exams — generate syllabus-accurate questions.

6. CLARIFICATION RULE
If the request is ambiguous, ask ONE short clarification question instead of generating long content.

7. OUTPUT STYLE
- Clear headings
- Bullet points where possible
- No filler text
- Practical and useful answers only

Your objective is to act like a premium academic assistant that balances quality, efficiency, and cost-awareness.`;

// ── Paper context builder ─────────────────────────────────────
function ctx(papers: Paper[]) {
  return papers
    .slice(0, 12)
    .map(
      (p, i) =>
        `[${i + 1}] "${p.title}"\nAuthors: ${p.authors.slice(0, 4).join(", ")}${p.authors.length > 4 ? " et al." : ""} | Year: ${p.year ?? "n.d."} | Source: ${p.journal ?? p.source}\nAbstract: ${p.abstract.slice(0, 550)}`,
    )
    .join("\n\n---\n\n");
}

// ── Single AI caller (Claude only — no OpenAI needed) ─────────
async function callAI(userPrompt: string, maxTokens: number): Promise<string> {
  const r = await ant.messages.create({
    model: "claude-opus-4-6",
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

  const userPrompt = hasPapers
    ? `QUESTION: "${query}"

AVAILABLE SOURCES:
${ctx(papers)}

Classify this request and respond appropriately:
- If research-related: write a 4-6 paragraph answer with [n] inline citations after every claim. End with ## Key Takeaways (3-4 bullet points).
- If study/explanation: give a clear, structured explanation using the sources as reference where helpful.
- If exam/practice: generate relevant practice questions or content based on the topic.`
    : `QUESTION: "${query}"

No academic papers were found for this query. Classify this request and respond appropriately:
- If it is a study/explanation request: provide a clear, accurate educational answer.
- If it is an exam/practice request (e.g. JEE, NEET, UPSC, question paper, mock test): generate original high-quality practice questions matching the exam pattern and difficulty.
- If it is a general academic question: answer from your knowledge with clear structure.
- Do NOT say "I cannot find papers" — just provide the most useful response for the student.`;

  return callAI(userPrompt, 2400);
}

// ── Generate literature review ────────────────────────────────
export async function generateReview(topic: string, papers: Paper[]) {
  return callAI(
    `TOPIC: "${topic}"

SOURCES:
${ctx(papers)}

Write a full academic literature review with these sections:
## Introduction
## Theoretical Background
## Key Findings
## Debates & Contradictions
## Research Gaps
## Conclusion

Each section 2-3 paragraphs. Every factual claim must be cited with [n]. Target ~1300 words.`,
    3800,
  );
}

// ── PDF chat ──────────────────────────────────────────────────
export async function chatPDF(
  question: string,
  pdfText: string,
  history: ChatMessage[],
) {
  const r = await ant.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1600,
    system: `${MASTER_PROMPT}

PAPER CONTEXT:
${pdfText.slice(0, 13000)}

Answer based on this paper. Quote relevant passages when helpful. If something is not in the paper, say so clearly.`,
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
