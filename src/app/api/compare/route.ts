/**
 * Paper Comparison API — /api/compare
 * Upgrade #6 — Academic Features (Paper Comparison)
 *
 * Takes a query like "Compare BERT vs GPT vs RoBERTa" and returns:
 *   - A structured markdown comparison table
 *   - A narrative synthesis
 *   - The papers used
 *
 * POST /api/compare
 * Body: { models: string[], topic?: string }
 * Returns SSE stream: { type: "papers" | "text" | "done" }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchAll } from "@/lib/papers";
import { Paper } from "@/types";
import Anthropic from "@anthropic-ai/sdk";

const ant = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const COMPARE_SYSTEM = `You are Researchly, an expert academic research assistant specialising in comparative analysis of AI/ML models and techniques.

TASK: Generate a structured, publication-quality comparison of the requested models/methods.

MANDATORY OUTPUT FORMAT:

## Overview
(2-3 sentences placing all models in context — when they were introduced, what problem they solve)

## Comparison Table
(Markdown table. ALWAYS include these columns: Model | Year | Architecture | Training Objective | Parameters | Key Dataset | Best Score | Venue)
| Model | Year | Architecture | Training Objective | Parameters | Key Metric | Best Score | Venue |
|---|---|---|---|---|---|---|---|

## Key Differences
(3-5 bullet points covering the most important architectural/training differences)

## Performance Analysis
(1-2 paragraphs on empirical performance, noting where each model excels)

## When To Use Which
(A practical guide for a student/researcher — "Use BERT when...", "Use GPT when...")

## Research Timeline
(Chronological list showing how each model built on prior work)

## Conclusion
(2-3 sentences on the state of the field and which model to study first)

RULES:
- Use only information from the provided context papers
- Bold **key technical terms**
- Keep table values concise (≤ 20 chars per cell)
- Do not use [CITATION] tags — this is a comparison, not a grounded answer`;

function buildComparePrompt(models: string[], papers: Paper[]): string {
  const paperCtx = papers
    .slice(0, 15)
    .map(
      (p, i) =>
        `[${i + 1}] "${p.title}" (${p.authors.slice(0, 3).join(", ")}${p.authors.length > 3 ? " et al." : ""}, ${p.year ?? "n.d."})\n` +
        `Venue: ${p.journal ?? p.source} | Citations: ${(p.citationCount ?? 0).toLocaleString()}\n` +
        `Abstract: ${p.abstract.slice(0, 800)}` +
        (p.url ? `\nURL: ${p.url}` : ""),
    )
    .join("\n\n---\n\n");

  return (
    `Compare the following models/techniques:\n${models.map((m) => `• ${m}`).join("\n")}\n\n` +
    `RETRIEVED PAPERS:\n${paperCtx}\n\n` +
    `Generate a comprehensive comparison following the mandatory output format.`
  );
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const { models, topic } = (await req.json()) as {
      models: string[];
      topic?: string;
    };

    if (!models || !Array.isArray(models) || models.length < 2) {
      return NextResponse.json(
        { error: "Provide at least 2 models to compare" },
        { status: 400 },
      );
    }

    if (models.length > 6) {
      return NextResponse.json(
        { error: "Maximum 6 models per comparison" },
        { status: 400 },
      );
    }

    // Build search query from model names
    const searchQuery = topic ?? `${models.join(" vs ")} comparison architecture`;

    // Fetch relevant papers
    const { papers } = await searchAll(searchQuery);
    if (!papers.length) {
      return NextResponse.json(
        { error: "No papers found for these models" },
        { status: 404 },
      );
    }

    // Stream the comparison
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

        try {
          // Send papers immediately
          send({ type: "papers", papers: papers.slice(0, 10) });
          send({
            type: "status",
            text: `Comparing ${models.join(", ")} using ${papers.length} papers…`,
          });

          const streamResp = await ant.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 3500,
            system: COMPARE_SYSTEM,
            messages: [
              {
                role: "user",
                content: buildComparePrompt(models, papers),
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

          send({ type: "done", models, paperCount: papers.length });
        } catch (e) {
          send({ type: "error", message: (e as Error).message || "Comparison failed" });
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
