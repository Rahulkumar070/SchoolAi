import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchAll } from "@/lib/papers";
import { chunkPapers, rankChunks, buildRAGContext } from "@/lib/rag";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { ConversationModel } from "@/models/Conversation";
import { MessageModel } from "@/models/Message";
import { getCachedResult, saveToCache } from "@/lib/cache";
import { checkGuestLimit } from "@/lib/guestLimit";
import Anthropic from "@anthropic-ai/sdk";
import mongoose from "mongoose";

const ant = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FREE_DAILY_LIMIT = 5;
const STUDENT_MONTHLY_LIMIT = 500;

type PaperRow = {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  journal?: string;
  source?: string;
  abstract: string;
  url?: string;
  doi?: string;
  citationCount?: number;
};

type UserDoc = {
  _id: mongoose.Types.ObjectId;
  plan?: string;
  searchesToday?: number;
  searchDateReset?: Date;
  searchesThisMonth?: number;
  searchMonthReset?: Date;
  searchHistory?: { query: string; answer?: string; papers?: unknown[]; searchedAt?: Date }[];
};

function buildPrompt(query: string, papers: PaperRow[]) {
  if (papers.length > 0) {
    // RAG: chunk + rank + build context
    const chunks = chunkPapers(papers as any);
    const topChunks = rankChunks(query, chunks);
    const ragCtx = buildRAGContext(topChunks);
    const paperList = papers
      .slice(0, 18)
      .map(
        (p, i) =>
          `[${i + 1}] "${p.title}" — ${p.authors.slice(0, 3).join(", ")}${p.authors.length > 3 ? " et al." : ""} (${p.year ?? "n.d."}) · ${p.source}${p.url ? " · " + p.url : ""}`,
      )
      .join("\n");
    return `RESEARCH QUESTION: "${query}"\n\n## RETRIEVED CONTEXT (RAG — top ${topChunks.length} chunks ranked by relevance)\n${ragCtx}\n\n## FULL PAPER INDEX (for citations)\n${paperList}\n\nClassify and respond:\n- Research: after every claim insert a citation card (> 📄 Paper / Authors / Year / Source / Link). End with ## Key Takeaways, ## What To Search Next. NEVER use [n] numbers.\n- Study help: clear structure, real examples, ## Quick Revision Points, ## What To Search Next\n- Exam practice: original questions with answers and explanations\nMake every sentence count — no filler, maximum insight.`;
  }
  return `QUESTION: "${query}"\n\nNo academic papers found.\n\nClassify as Study Help / Exam Practice / General Academic / Non-Academic.\nIf non-academic: politely redirect. For study: thorough explanation + ## What To Search Next. For exam (JEE/NEET/UPSC/GATE): generate original questions with detailed answers. NEVER say you cannot help.`;
}

const SYSTEM = `You are Researchly, an expert academic research assistant for Indian students and researchers.
You ONLY help with academic, research, and study topics.

RULE 1 — MANDATORY RESPONSE STRUCTURE
Every research answer MUST use these 7 sections in order:
1. ## Overview
2. ## Key Concepts
3. ## System Architecture  (include ASCII diagram — Rule 4)
4. ## Technical Details or Comparison  (include table when comparing — Rule 5)
5. ## Key Research Papers
6. ## Limitations
7. ## Key Takeaways  +  ## What To Search Next

RULE 2 — CITATION FORMAT (MANDATORY)
NEVER use [1], [2], [n] or any numeric citation style.
After every factual claim, insert this card inline:

> 📄 **Paper:** <full title>
> **Authors:** <up to 3 names, then "et al.">
> **Year:** <year>
> **Source:** <arXiv / Semantic Scholar / PubMed / OpenAlex / Journal>
> **Link:** <DOI or URL, or "Not available">
> **Key Contribution:** <1–2 sentences>

RULE 3 — HANDLING MISSING CONTEXT
Supplement with well-established knowledge — label: "(From general knowledge)". Never fabricate citations.

RULE 4 — ASCII DIAGRAMS (MANDATORY for any AI system or pipeline discussion)

RULE 5 — COMPARISON TABLES when comparing 2+ models:
| Model | Time Complexity | Memory | Strengths | Limitations |

RULE 6 — No overconfident claims. Provide context and scope.

RULE 7 — Focus on key innovations, mechanisms, limitations, applications.

RULE 10 — CITATION QUALITY AND PAPER PRIORITIZATION
Priority order when selecting which papers to cite:
  1. FOUNDATIONAL — the original paper that introduced the method.
  2. MAJOR FOLLOW-UP — papers that significantly improved the method.
  3. BENCHMARK / EVALUATION — papers that directly test or compare the method.

CITATION FILTERING — only include a paper if it:
  ✓ Introduces the method
  ✓ Significantly improves the method
  ✓ Benchmarks or evaluates the method directly

DO NOT cite:
  ✗ General surveys if a foundational paper exists.
  ✗ Papers that only mention the concept tangentially.

CITATION LIMITS: 3–5 most relevant papers per answer. Foundational papers always cited first.

WRITING RULES
- Never start with filler phrases.
- Bold **key terms** on first use.
- Research: 600–900 words. Study: 400–600 words.
- End with ## What To Search Next (3 suggestions).`

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      query: string;
      conversationId?: string;
    };
    const { query, conversationId: existingConvId } = body;

    if (!query?.trim() || query.trim().length < 3)
      return NextResponse.json({ error: "Query too short" }, { status: 400 });

    const q = query.trim();
    const session = await getServerSession(authOptions);
    await connectDB();

    // ── Auth + rate limit check ───────────────────────────────
    let u: UserDoc | null = null;

    if (session?.user?.email) {
      const now = new Date();
      u = (await UserModel.findOne(
        { email: session.user.email },
        // ✅ Only fetch fields needed for rate limiting — NOT searchHistory/savedPapers
        {
          _id: 1,
          plan: 1,
          searchesToday: 1,
          searchDateReset: 1,
          searchesThisMonth: 1,
          searchMonthReset: 1,
        },
      )) as UserDoc | null;
      if (!u) {
        u = (await UserModel.create({
          email: session.user.email,
          name: session.user.name ?? "",
          image: session.user.image ?? "",
          plan: "free",
          searchesToday: 0,
          searchDateReset: now,
          searchesThisMonth: 0,
          searchMonthReset: now,
          searchHistory: [],
        })) as UserDoc;
      }
      const plan = u.plan ?? "free";
      if (plan === "free") {
        if (
          now.toDateString() !==
          new Date(u.searchDateReset ?? now).toDateString()
        )
          u.searchesToday = 0;
        if ((u.searchesToday ?? 0) >= FREE_DAILY_LIMIT)
          return NextResponse.json(
            {
              error: `Daily limit reached (${FREE_DAILY_LIMIT}/day). Upgrade to Student for 500/month.`,
            },
            { status: 429 },
          );
      } else if (plan === "student") {
        const rd = new Date(u.searchMonthReset ?? now);
        if (
          now.getMonth() !== rd.getMonth() ||
          now.getFullYear() !== rd.getFullYear()
        )
          u.searchesThisMonth = 0;
        if ((u.searchesThisMonth ?? 0) >= STUDENT_MONTHLY_LIMIT)
          return NextResponse.json(
            {
              error: `Monthly limit reached (${STUDENT_MONTHLY_LIMIT}/month). Upgrade to Pro for unlimited.`,
            },
            { status: 429 },
          );
      }
    } else {
      // Guest path
      const g = await checkGuestLimit(req);
      if (!g.allowed) {
        const res = NextResponse.json(
          {
            error:
              "Guest limit reached (2/2). Sign in free for 5 searches/day.",
          },
          { status: 429 },
        );
        res.cookies.set("_rly_gid", g.fingerprintId, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          maxAge: 60 * 60 * 24 * 30,
        });
        return res;
      }
    }

    // ── Resolve or create conversation (logged-in users only) ─
    let conversationId: string | null = null;
    let isNewConversation = false;

    if (u && session?.user?.email) {
      if (existingConvId && mongoose.isValidObjectId(existingConvId)) {
        // Verify ownership then reuse
        const existing = await ConversationModel.findOne({
          _id: existingConvId,
          userId: u._id,
        });
        if (existing) {
          conversationId = existingConvId;
        }
      }

      if (!conversationId) {
        // Create a new conversation — title = first 60 chars of query
        const title = q.length > 60 ? q.slice(0, 57) + "…" : q;
        const conv = await ConversationModel.create({ userId: u._id, title });
        conversationId = conv._id.toString();
        isNewConversation = true;
      }
    }

    // ── Papers ────────────────────────────────────────────────
    const cached = await getCachedResult(q);
    let papers: PaperRow[];
    let fromCache: boolean;

    if (cached) {
      papers = cached.papers as PaperRow[];
      fromCache = true;
    } else {
      papers = (await searchAll(q)) as PaperRow[];
      fromCache = false;
    }

    // ── SSE stream ────────────────────────────────────────────
    const encoder = new TextEncoder();
    let fullAnswer = "";

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(obj)}\n\n`),
          );

        // Tell the client which conversation this belongs to immediately
        send({ type: "meta", conversationId, isNewConversation });

        // Send papers so sources panel opens instantly
        send({ type: "papers", papers });

        // ── Stream the answer ─────────────────────────────────
        if (fromCache && cached) {
          const words = cached.answer.split(" ");
          for (let i = 0; i < words.length; i += 4) {
            const chunk =
              words.slice(i, i + 4).join(" ") +
              (i + 4 < words.length ? " " : "");
            fullAnswer += chunk;
            send({ type: "text", text: chunk });
            await new Promise((r) => setTimeout(r, 10));
          }
        } else {
          const streamResp = await ant.messages.stream({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 3000,
            system: SYSTEM,
            messages: [{ role: "user", content: buildPrompt(q, papers) }],
          });
          for await (const event of streamResp) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const chunk = event.delta.text;
              fullAnswer += chunk;
              send({ type: "text", text: chunk });
            }
          }
          void saveToCache(q, fullAnswer, papers);
        }

        send({ type: "done", fromCache, conversationId });
        controller.close();

        // ── Persist after stream closes ───────────────────────
        if (u && session?.user?.email && conversationId) {
          const now = new Date();
          const plan = u.plan ?? "free";

          // 1. Save user message
          await MessageModel.create({
            conversationId,
            userId: u._id,
            role: "user",
            content: q,
            papers: [],
          });

          // 2. Save assistant message (with papers)
          await MessageModel.create({
            conversationId,
            userId: u._id,
            role: "assistant",
            content: fullAnswer,
            papers,
          });

          // 3. Touch conversation updatedAt
          await ConversationModel.findByIdAndUpdate(conversationId, {
            updatedAt: now,
          });

          // 4. Update rate-limit counters on User
          const counterUpdate: Record<string, unknown> = {};
          if (plan === "free") {
            counterUpdate.searchesToday = (u.searchesToday ?? 0) + 1;
            counterUpdate.searchDateReset = now;
          } else if (plan === "student") {
            counterUpdate.searchesThisMonth = (u.searchesThisMonth ?? 0) + 1;
            counterUpdate.searchMonthReset = now;
          }

          // 5. Save to searchHistory — always push new entry, cap at 50
          // ✅ Single atomic update instead of findFirst + conditional update
          // Save full answer + papers to searchHistory so Library/History can display them
          await UserModel.findByIdAndUpdate(u._id, {
            $set: counterUpdate,
            $push: {
              searchHistory: {
                $each: [{ query: q, answer: fullAnswer, papers, searchedAt: now }],
                $position: 0,
                $slice: 100,
              },
            },
          });
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
      { error: (e as Error).message || "Search failed" },
      { status: 500 },
    );
  }
}
