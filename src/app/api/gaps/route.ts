/**
 * Research Gaps Detector — /api/gaps
 * Upgrade #6 — Academic Features (Research Gaps + Timeline)
 *
 * Analyses a topic's paper landscape and identifies:
 *   - Open research problems
 *   - Underexplored directions
 *   - Contradictions between papers
 *   - Research timeline (bonus feature)
 *
 * POST /api/gaps
 * Body: { topic: string }
 * Returns SSE stream with gaps analysis + timeline
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchAll } from "@/lib/papers";
import { badgePapers, categorizePapers } from "@/lib/rag";
import { Paper } from "@/types";
import Anthropic from "@anthropic-ai/sdk";

const ant = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────────────────────────
// GAPS DETECTOR SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────

const GAPS_SYSTEM = `You are Researchly, an elite academic research analyst specialising in identifying open research problems.

TASK: Analyse the provided papers and identify genuine research gaps, contradictions, and future opportunities.

MANDATORY OUTPUT FORMAT:

## Research Gaps Analysis: [TOPIC]

### 1. Open Research Problems
(List 4-6 concrete unsolved problems. For each: state the gap, cite which papers expose it, explain why it matters)

### 2. Contradictions in the Literature
(Identify 2-4 areas where papers disagree. Quote both sides explicitly)

### 3. Underexplored Directions
(3-5 directions that appear promising but have few papers)

### 4. Methodological Gaps
(What research designs or evaluation methods are missing?)

### 5. Research Timeline
(Chronological milestones showing the evolution of this field)
Format each milestone as:
**[YEAR]** — *Paper Title* — One-sentence significance

### 6. Most Promising Future Directions
(Top 3 directions a PhD student should pursue)

### 7. Key Open Questions
(5 specific research questions phrased as actual thesis/grant proposal questions)

RULES:
- Be specific — cite paper titles and years (e.g. "as shown in Vaswani et al. (2017)")
- Be honest about gaps — do NOT invent problems
- Focus on the intersection of what has been done vs what remains
- Write for a graduate student audience`;

function buildGapsPrompt(topic: string, papers: Paper[]): string {
  const paperCtx = papers
    .slice(0, 15)
    .map(
      (p, i) =>
        `[${i + 1}] "${p.title}" (${p.authors.slice(0, 2).join(", ")}${p.authors.length > 2 ? " et al." : ""}, ${p.year ?? "n.d."})\n` +
        `Citations: ${(p.citationCount ?? 0).toLocaleString()} | Venue: ${p.journal ?? p.source}\n` +
        `Abstract: ${p.abstract.slice(0, 700)}`,
    )
    .join("\n\n---\n\n");

  return (
    `TOPIC: "${topic}"\n\n` +
    `RETRIEVED PAPERS (${papers.length} papers):\n${paperCtx}\n\n` +
    `Analyse these papers and identify research gaps, contradictions, and future opportunities.`
  );
}

// ─────────────────────────────────────────────────────────────
// TIMELINE EXTRACTOR
// A fast Haiku call that extracts a clean timeline from the papers
// ─────────────────────────────────────────────────────────────

async function extractTimeline(
  topic: string,
  papers: Paper[],
): Promise<Array<{ year: number; title: string; significance: string; url?: string }>> {
  try {
    const paperList = papers
      .filter((p) => p.year)
      .sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
      .slice(0, 20)
      .map(
        (p) =>
          `${p.year}: "${p.title}" by ${p.authors.slice(0, 2).join(", ")}${p.authors.length > 2 ? " et al." : ""} | Citations: ${p.citationCount ?? 0}`,
      )
      .join("\n");

    const r = await ant.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system:
        "You are an academic timeline generator. Given papers and their years, produce a concise research timeline. " +
        "Return ONLY a valid JSON array. No markdown. No backticks.",
      messages: [
        {
          role: "user",
          content:
            `Topic: "${topic}"\nPapers:\n${paperList}\n\n` +
            `Return a JSON array of the 8-12 most significant milestones in chronological order.\n` +
            `Each object: { "year": number, "title": string, "significance": string }\n` +
            `"significance" should be one sentence explaining why this paper mattered.\n` +
            `Include only papers with clear historical impact. Skip minor papers.`,
        },
      ],
    });

    const b = r.content[0];
    if (b.type !== "text") return [];
    const parsed = JSON.parse(b.text.trim().replace(/```json|```/g, "").trim()) as Array<{
      year: number;
      title: string;
      significance: string;
    }>;

    // Attach URLs from paper data
    return Array.isArray(parsed)
      ? parsed.map((event) => {
          const matchedPaper = papers.find(
            (p) =>
              p.year === event.year &&
              p.title.toLowerCase().includes(event.title.toLowerCase().slice(0, 20)),
          );
          return { ...event, url: matchedPaper?.url };
        })
      : [];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const { topic } = (await req.json()) as { topic: string };

    if (!topic?.trim()) {
      return NextResponse.json({ error: "Topic required" }, { status: 400 });
    }

    const t = topic.trim();

    // Fetch papers
    const rawPapers = (await searchAll(t)) as Paper[];
    if (!rawPapers.length) {
      return NextResponse.json({ error: "No papers found for this topic" }, { status: 404 });
    }

    // Badge papers and categorize  [Upgrade #10]
    const badged = badgePapers(rawPapers);
    const categories = categorizePapers(badged);

    // Extract timeline in parallel with gap analysis setup
    const [timeline] = await Promise.all([extractTimeline(t, rawPapers)]);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

        try {
          // Send papers + categorisation + timeline upfront
          send({
            type: "meta",
            papers: rawPapers,
            categories: {
              mostInfluential: categories.mostInfluential,
              foundational: categories.foundational,
              recentBreakthroughs: categories.recentBreakthroughs,
              surveyPapers: categories.surveyPapers,
            },
            timeline,
          });

          send({
            type: "status",
            text: `Analysing ${rawPapers.length} papers for research gaps in "${t}"…`,
          });

          // Stream the gaps analysis
          const streamResp = await ant.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 4000,
            system: GAPS_SYSTEM,
            messages: [
              {
                role: "user",
                content: buildGapsPrompt(t, rawPapers),
              },
            ],
          });

          for await (const event of streamResp) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              send({ type: "text", text: event.delta.text });
            }
          }

          send({
            type: "done",
            topic: t,
            paperCount: rawPapers.length,
            timelineEvents: timeline.length,
          });
        } catch (e) {
          send({ type: "error", message: (e as Error).message || "Analysis failed" });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Failed" },
      { status: 500 },
    );
  }
}
