/**
 * PDF RAG Pipeline — Researchly v2  (Upgrade #7)
 *
 * Replaces the naive "send full text to Claude" approach with true RAG:
 *
 *   PDF text
 *     → structured section detection
 *     → overlapping sentence chunks (300 words, 80-word overlap)
 *     → batch OpenAI/TF-IDF embeddings
 *     → top-K cosine similarity retrieval
 *     → Claude answers from retrieved chunks ONLY
 *
 * Benefits:
 *   - Handles PDFs of any length (not limited to 40k chars)
 *   - More precise answers — only relevant sections reach Claude
 *   - Section labels (methods, results, etc.) improve answer quality
 *   - Embedding cache avoids re-embedding on follow-up questions
 */

import Anthropic from "@anthropic-ai/sdk";
import { ChatMessage, SectionType } from "@/types";
import { getBatchEmbeddings } from "./rag";

const ant = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PDF_CHUNK_SIZE = 250;   // words per chunk
const PDF_CHUNK_OVERLAP = 60; // overlap between consecutive chunks
const TOP_K_PDF = 6;          // chunks sent to Claude per question

// =============================================================
// SECTION 1 — PDF SECTION DETECTOR
//
// Detects section boundaries in PDF text extracted as plain text.
// Splits the document into named sections for better chunk labelling.
// =============================================================

interface PdfSection {
  type: SectionType | "other";
  heading: string;
  content: string;
}

const SECTION_HEADING_RE: Array<{ pattern: RegExp; type: SectionType | "other" }> = [
  { pattern: /^\s*(?:\d+\.?\s+)?abstract\b/im,     type: "abstract"      },
  { pattern: /^\s*(?:\d+\.?\s+)?introduction\b/im, type: "introduction"  },
  { pattern: /^\s*(?:\d+\.?\s+)?(?:methodology|methods?|approach)\b/im, type: "methods" },
  { pattern: /^\s*(?:\d+\.?\s+)?(?:results?|findings|experiments?|evaluation)\b/im, type: "results" },
  { pattern: /^\s*(?:\d+\.?\s+)?discussion\b/im,   type: "discussion"    },
  { pattern: /^\s*(?:\d+\.?\s+)?(?:conclusion|summary)\b/im, type: "conclusion" },
  { pattern: /^\s*(?:\d+\.?\s+)?(?:related work|background|literature review)\b/im, type: "other" },
  { pattern: /^\s*(?:\d+\.?\s+)?references?\b/im,  type: "other"         },
];

export function detectPdfSections(text: string): PdfSection[] {
  // Split on likely headings (lines that are short, possibly numbered)
  const lines = text.split("\n");
  const sections: PdfSection[] = [];
  let currentSection: PdfSection = { type: "other", heading: "Preamble", content: "" };

  for (const line of lines) {
    let matched = false;
    for (const { pattern, type } of SECTION_HEADING_RE) {
      if (pattern.test(line) && line.trim().length < 80) {
        if (currentSection.content.trim()) {
          sections.push(currentSection);
        }
        currentSection = { type, heading: line.trim(), content: "" };
        matched = true;
        break;
      }
    }
    if (!matched) {
      currentSection.content += line + "\n";
    }
  }

  if (currentSection.content.trim()) sections.push(currentSection);

  // If no sections detected, treat whole text as one "other" section
  if (sections.length === 0) {
    return [{ type: "other", heading: "Full Text", content: text }];
  }

  return sections;
}

// =============================================================
// SECTION 2 — PDF CHUNKER
//
// Creates overlapping word chunks from each section.
// Chunk metadata includes: section type, heading, char offset.
// =============================================================

export interface PdfChunk {
  id: string;           // "chunk_001"
  section: string;      // section type
  heading: string;      // section heading text
  text: string;
  wordCount: number;
  embedding?: number[];
}

function splitIntoSentencesPdf(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);
}

export function chunkPdfSections(sections: PdfSection[]): PdfChunk[] {
  const chunks: PdfChunk[] = [];
  let chunkIdx = 0;

  for (const section of sections) {
    // Skip references section — not useful for answering questions
    if (/^references?$/i.test(section.heading)) continue;

    const sentences = splitIntoSentencesPdf(section.content);
    if (!sentences.length) continue;

    let current: string[] = [];
    let currentWordCount = 0;

    const pushChunk = () => {
      if (!current.length) return;
      const text = current.join(" ").trim();
      if (text.split(/\s+/).length < 20) return; // skip tiny chunks
      chunkIdx++;
      chunks.push({
        id: `chunk_${String(chunkIdx).padStart(3, "0")}`,
        section: section.type,
        heading: section.heading,
        text,
        wordCount: text.split(/\s+/).length,
      });
    };

    for (const sentence of sentences) {
      const wordCount = sentence.split(/\s+/).length;
      if (currentWordCount + wordCount > PDF_CHUNK_SIZE && current.length > 0) {
        pushChunk();
        const overlapWords = current
          .join(" ")
          .split(/\s+/)
          .slice(-PDF_CHUNK_OVERLAP);
        current = [overlapWords.join(" "), sentence];
        currentWordCount = overlapWords.length + wordCount;
      } else {
        current.push(sentence);
        currentWordCount += wordCount;
      }
    }
    pushChunk();
  }

  return chunks;
}

// =============================================================
// SECTION 3 — EMBEDDING MANAGER
//
// Embeds all PDF chunks in a single batch call.
// Returns chunks with embeddings attached.
// The chunk array is cached by a hash of the PDF text
// so follow-up questions don't re-embed.
// =============================================================

// In-memory cache: pdfHash → embedded chunks
const pdfChunkCache = new Map<string, PdfChunk[]>();

function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < Math.min(text.length, 5000); i++) {
    h = ((h << 5) + h) ^ text.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

export async function embedPdfChunks(
  chunks: PdfChunk[],
  pdfHash: string,
): Promise<PdfChunk[]> {
  const cached = pdfChunkCache.get(pdfHash);
  if (cached) return cached;

  const texts = chunks.map((c) => c.text);
  const embeddings = await getBatchEmbeddings(texts);

  const withEmbeddings = chunks.map((c, i) => ({
    ...c,
    embedding: embeddings[i] ?? [],
  }));

  pdfChunkCache.set(pdfHash, withEmbeddings);
  return withEmbeddings;
}

// =============================================================
// SECTION 4 — RETRIEVAL
//
// Retrieves top-K chunks most similar to the user's question.
// Uses cosine similarity between query embedding and chunk embeddings.
// Also boosts chunks from high-priority sections (methods, results).
// =============================================================

function cosineSim(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const SECTION_BOOST: Record<string, number> = {
  methods:      1.20,
  results:      1.20,
  conclusion:   1.10,
  discussion:   1.05,
  introduction: 1.00,
  abstract:     0.95,
  other:        0.85,
};

export async function retrieveTopChunks(
  question: string,
  embeddedChunks: PdfChunk[],
  topK = TOP_K_PDF,
): Promise<PdfChunk[]> {
  const [queryEmb] = await getBatchEmbeddings([question]);
  if (!queryEmb || !queryEmb.length) {
    // Fallback: keyword overlap
    const qWords = new Set(
      question.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3),
    );
    return [...embeddedChunks]
      .sort((a, b) => {
        const scoreA = [...qWords].filter((w) => a.text.toLowerCase().includes(w)).length;
        const scoreB = [...qWords].filter((w) => b.text.toLowerCase().includes(w)).length;
        return scoreB - scoreA;
      })
      .slice(0, topK);
  }

  return embeddedChunks
    .map((chunk) => {
      const sim = chunk.embedding ? cosineSim(queryEmb, chunk.embedding) : 0;
      const boost = SECTION_BOOST[chunk.section] ?? 1.0;
      return { chunk, score: sim * boost };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ chunk }) => chunk);
}

// =============================================================
// SECTION 5 — PDF RAG CHAT  (the main export)
//
// Full pipeline:
//   pdfText → detect sections → chunk → embed → retrieve → answer
//
// On first call: detects sections + embeds all chunks (cached)
// On follow-up calls: just retrieves + answers (fast)
// =============================================================

const PDF_SYSTEM = `You are Researchly's PDF Research Assistant — an expert at reading and explaining academic documents.

YOUR RULES:
1. Answer ONLY based on the document chunks provided below — never make up information
2. Quote relevant passages using "quote" format when supporting answers
3. If something is NOT in the chunks: "The provided sections don't cover [topic]. Based on the document structure, try asking about [Y]."
4. Complex questions: use ## headings to structure your answer
5. Simple questions: 1-2 sentence direct answer first, then expand
6. Always mention which section your answer comes from: "According to the Methods section..."
7. Start with "Based on this document..." or "According to [section]..."
8. At the end of each answer, suggest 2 follow-up questions
9. For summaries: Title → Purpose → Methods → Key Findings → Conclusions
10. For numerical results, always quote the exact values from the text`;

export interface PdfRagResult {
  answer: string;
  sourceChunks: Array<{
    section: string;
    heading: string;
    text: string;
  }>;
  chunkCount: number;
}

export async function chatWithPdfRag(
  question: string,
  pdfText: string,
  history: ChatMessage[],
  streamCallback?: (text: string) => void,
): Promise<PdfRagResult | AsyncGenerator<string>> {
  // 1. Hash the PDF for caching
  const pdfHash = hashText(pdfText);

  // 2. Detect sections + chunk
  const sections = detectPdfSections(pdfText);
  const rawChunks = chunkPdfSections(sections);

  // 3. Embed all chunks (cached after first call)
  const embeddedChunks = await embedPdfChunks(rawChunks, pdfHash);

  // 4. Retrieve top-K relevant chunks
  const topChunks = await retrieveTopChunks(question, embeddedChunks, TOP_K_PDF);

  // 5. Build context from retrieved chunks
  const context = topChunks
    .map(
      (c, i) =>
        `[Chunk ${i + 1} | Section: ${c.section} — ${c.heading}]\n${c.text}`,
    )
    .join("\n\n---\n\n");

  // 6. Build messages with retrieved context
  const systemPrompt =
    `${PDF_SYSTEM}\n\n` +
    `--- RETRIEVED DOCUMENT SECTIONS ---\n${context}\n--- END SECTIONS ---\n\n` +
    `(${embeddedChunks.length} total chunks indexed. Showing top ${topChunks.length} most relevant to this question.)`;

  const messages: { role: "user" | "assistant"; content: string }[] = [
    ...history
      .slice(-8)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: question },
  ];

  if (streamCallback) {
    // Streaming mode
    const streamResp = await ant.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1800,
      system: systemPrompt,
      messages,
    });

    for await (const event of streamResp) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        streamCallback(event.delta.text);
      }
    }

    return {
      answer: "[streamed]",
      sourceChunks: topChunks.map((c) => ({ section: c.section, heading: c.heading, text: c.text.slice(0, 200) + "…" })),
      chunkCount: embeddedChunks.length,
    };
  }

  // Non-streaming mode
  const res = await ant.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1800,
    system: systemPrompt,
    messages,
  });

  const bv = res.content[0];
  const answer = bv.type === "text" ? bv.text : "";

  return {
    answer,
    sourceChunks: topChunks.map((c) => ({
      section: c.section,
      heading: c.heading,
      text: c.text.slice(0, 200) + "…",
    })),
    chunkCount: embeddedChunks.length,
  };
}

// =============================================================
// SECTION 6 — PDF STARTER QUESTIONS  (section-aware)
//
// Generates starter questions that are section-aware.
// If methods/results sections were detected, asks about them specifically.
// =============================================================

export async function generateSectionAwareStarters(
  title: string,
  sections: PdfSection[],
): Promise<string[]> {
  const sectionNames = sections.map((s) => s.type).filter((t) => t !== "other");
  const sectionCtx =
    sectionNames.length > 0
      ? `Available sections: ${sectionNames.join(", ")}.`
      : "";

  try {
    const r = await ant.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: "You are a helpful academic research assistant.",
      messages: [
        {
          role: "user",
          content:
            `A user uploaded: "${title}"\n${sectionCtx}\n\n` +
            `Generate 5 starter questions. Include:\n` +
            `1. A summary question\n` +
            `2. A methodology question (if methods section exists)\n` +
            `3. A key findings question (if results section exists)\n` +
            `4. A limitations/critique question\n` +
            `5. A real-world applications question\n\n` +
            `Return ONLY a JSON array of 5 strings. No markdown, no backticks.`,
        },
      ],
    });
    const b = r.content[0];
    if (b.type !== "text") return defaultPdfStarters();
    const parsed = JSON.parse(b.text.trim().replace(/```json|```/g, "").trim()) as string[];
    return Array.isArray(parsed) ? parsed.slice(0, 5) : defaultPdfStarters();
  } catch {
    return defaultPdfStarters();
  }
}

function defaultPdfStarters(): string[] {
  return [
    "Summarise this paper in simple terms",
    "What methodology did the authors use?",
    "What are the key findings?",
    "What are the limitations of this study?",
    "What are the real-world applications of this research?",
  ];
}
