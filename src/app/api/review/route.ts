import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchAll } from "@/lib/papers";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import Anthropic from "@anthropic-ai/sdk";
import { Paper } from "@/types";

const ant = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const REVIEW_SYSTEM = `You are Researchly, an elite academic research assistant. Write publication-quality literature reviews.

RULES:
- Every factual claim MUST be cited with [n]
- Write in formal academic English — third person, passive voice where appropriate
- No bullet points in main sections — only flowing academic paragraphs
- Synthesize ideas across papers, don't summarize each separately
- Minimum 1400 words`;

function buildReviewPrompt(topic: string, papers: Paper[]): string {
  const paperCtx = papers
    .slice(0, 12)
    .map(
      (p, i) =>
        `[${i + 1}] "${p.title}"
Authors: ${p.authors.slice(0, 4).join(", ")}${p.authors.length > 4 ? " et al." : ""} | Year: ${p.year ?? "n.d."} | Journal: ${p.journal ?? p.source}
Abstract: ${p.abstract.slice(0, 900)}
${p.url ? `URL: ${p.url}` : ""}${p.doi ? `\nDOI: https://doi.org/${p.doi}` : ""}`,
    )
    .join("\n\n---\n\n");

  return `LITERATURE REVIEW TOPIC: "${topic}"

SOURCES (${papers.length} papers):
${paperCtx}

Write a comprehensive literature review with EXACTLY these sections:

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
(All cited papers in APA format)`;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  try {
    const { topic } = (await req.json()) as { topic: string };
    if (!topic?.trim())
      return NextResponse.json({ error: "Topic required" }, { status: 400 });

    await connectDB();
    const u = await UserModel.findOne({ email: session.user.email });
    const plan = u?.plan ?? "free";

    if (plan === "free") {
      return NextResponse.json(
        {
          error:
            "Literature Review is available on Student (₹199/mo) and Pro (₹499/mo) plans.",
        },
        { status: 403 },
      );
    }

    const papers = (await searchAll(topic.trim())) as Paper[];
    if (!papers.length)
      return NextResponse.json(
        { error: "No papers found for this topic." },
        { status: 404 },
      );

    const encoder = new TextEncoder();
    let fullReview = "";

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(obj)}\n\n`),
          );

        try {
          // Send papers first so UI can show sources while review streams
          send({ type: "papers", papers });
          send({
            type: "status",
            text: `Found ${papers.length} papers. Writing review…`,
          });

          const streamResp = await ant.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 4500,
            system: REVIEW_SYSTEM,
            messages: [
              {
                role: "user",
                content: buildReviewPrompt(topic.trim(), papers),
              },
            ],
          });

          for await (const event of streamResp) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              fullReview += event.delta.text;
              send({ type: "text", text: event.delta.text });
            }
          }

          send({ type: "done", topic });
        } catch (e) {
          send({
            type: "error",
            message: (e as Error).message || "Review generation failed",
          });
        } finally {
          controller.close();
        }

        // ── Save to review history after stream closes ────────
        if (u && fullReview) {
          const now = new Date();
          const existingIdx = (u.reviewHistory ?? []).findIndex(
            (h: { topic: string }) =>
              h.topic.toLowerCase() === topic.trim().toLowerCase(),
          );
          if (existingIdx !== -1) {
            await UserModel.findByIdAndUpdate(u._id, {
              $set: {
                [`reviewHistory.${existingIdx}.review`]: fullReview,
                [`reviewHistory.${existingIdx}.papers`]: papers,
                [`reviewHistory.${existingIdx}.reviewedAt`]: now,
              },
            });
          } else {
            await UserModel.findByIdAndUpdate(u._id, {
              $push: {
                reviewHistory: {
                  $each: [
                    {
                      topic: topic.trim(),
                      review: fullReview,
                      papers,
                      reviewedAt: now,
                    },
                  ],
                  $position: 0,
                  $slice: 20,
                },
              },
            });
          }
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
