import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchAll } from "@/lib/papers";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { getCachedResult, saveToCache } from "@/lib/cache";
import { checkGuestLimit } from "@/lib/guestLimit";
import Anthropic from "@anthropic-ai/sdk";

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

function buildCtx(papers: PaperRow[]) {
  return papers
    .slice(0, 12)
    .map(
      (p, i) =>
        `[${i + 1}] "${p.title}"\nAuthors: ${p.authors.slice(0, 4).join(", ")}${p.authors.length > 4 ? " et al." : ""} | Year: ${p.year ?? "n.d."} | Source: ${p.journal ?? p.source}\nAbstract: ${p.abstract.slice(0, 450)}\n${p.url ? `URL: ${p.url}` : ""}${p.doi ? `\nDOI: https://doi.org/${p.doi}` : ""}`,
    )
    .join("\n\n---\n\n");
}

function buildPrompt(query: string, papers: PaperRow[]) {
  if (papers.length > 0) {
    return `RESEARCH QUESTION: "${query}"\n\nAVAILABLE ACADEMIC SOURCES (${papers.length} papers):\n${buildCtx(papers)}\n\nClassify and respond:\n- Research: cite every claim [n], end with ## Key Takeaways, ## Useful Links, ## What To Search Next\n- Study help: clear structure, real examples, ## Quick Revision Points, ## What To Search Next\n- Exam practice: original questions with answers and explanations\nMake every sentence count — no filler, maximum insight.`;
  }
  return `QUESTION: "${query}"\n\nNo academic papers found.\n\nClassify as Study Help / Exam Practice / General Academic / Non-Academic.\nIf non-academic: politely redirect. For study: thorough explanation + ## What To Search Next. For exam (JEE/NEET/UPSC/GATE): generate original questions with detailed answers. NEVER say you cannot help.`;
}

const SYSTEM = `You are Researchly, an elite academic research assistant built for Indian students and researchers. You ONLY help with academic, research, and study topics. If asked something non-academic, politely redirect. You explain like an excellent professor and generate exam content like an expert for JEE/NEET/UPSC/GATE.

RULES: Never start with "Great question!" or "Certainly!". Never say "I cannot find papers". Cite every claim as [n] when papers given. Use ## headings, bold **key terms**. Research: 400-600 words. Study: 300-500 words. Always end with ## What To Search Next.`;

export async function POST(req: NextRequest) {
  try {
    const { query } = (await req.json()) as { query: string };
    if (!query?.trim() || query.trim().length < 3)
      return NextResponse.json({ error: "Query too short" }, { status: 400 });

    const q = query.trim();
    const session = await getServerSession(authOptions);
    await connectDB();

    // ── Limits ────────────────────────────────────────────────
    type UserDoc = {
      _id: unknown;
      plan?: string;
      searchesToday?: number;
      searchDateReset?: Date;
      searchesThisMonth?: number;
      searchMonthReset?: Date;
      searchHistory?: { query: string }[];
    };
    let u: UserDoc | null = null;

    if (session?.user?.email) {
      const now = new Date();
      u = await UserModel.findOne({ email: session.user.email });
      if (!u) {
        u = await UserModel.create({
          email: session.user.email,
          name: session.user.name ?? "",
          image: session.user.image ?? "",
          plan: "free",
          searchesToday: 0,
          searchDateReset: now,
          searchesThisMonth: 0,
          searchMonthReset: now,
          searchHistory: [],
        });
      }
      const plan = (u as UserDoc).plan ?? "free";
      if (plan === "free") {
        if (
          now.toDateString() !==
          new Date((u as UserDoc).searchDateReset ?? now).toDateString()
        ) {
          (u as UserDoc).searchesToday = 0;
        }
        if (((u as UserDoc).searchesToday ?? 0) >= FREE_DAILY_LIMIT)
          return NextResponse.json(
            {
              error: `Daily limit reached (${FREE_DAILY_LIMIT}/day). Upgrade to Student for 500/month.`,
            },
            { status: 429 },
          );
      } else if (plan === "student") {
        const rd = new Date((u as UserDoc).searchMonthReset ?? now);
        if (
          now.getMonth() !== rd.getMonth() ||
          now.getFullYear() !== rd.getFullYear()
        ) {
          (u as UserDoc).searchesThisMonth = 0;
        }
        if (((u as UserDoc).searchesThisMonth ?? 0) >= STUDENT_MONTHLY_LIMIT)
          return NextResponse.json(
            {
              error: `Monthly limit reached (${STUDENT_MONTHLY_LIMIT}/month). Upgrade to Pro for unlimited.`,
            },
            { status: 429 },
          );
      }
    } else {
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

    // ── Papers ────────────────────────────────────────────────
    const cached = await getCachedResult(q);
    let papers: PaperRow[];
    let fromCache = false;

    if (cached) {
      papers = cached.papers as PaperRow[];
      fromCache = true;
    } else {
      papers = (await searchAll(q)) as PaperRow[];
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

        // Send papers first so UI renders sources immediately
        send({ type: "papers", papers });

        if (fromCache && cached) {
          // Simulate streaming for cached answers (feels live, saves API cost)
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
          // Live streaming from Anthropic
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

        send({ type: "done", fromCache });
        controller.close();

        // ── Persist to DB after stream closes ────────────────
        if (u && session?.user?.email) {
          const now = new Date();
          const plan = (u as UserDoc).plan ?? "free";
          const counterUpdate: Record<string, unknown> = {};
          if (plan === "free") {
            counterUpdate.searchesToday =
              ((u as UserDoc).searchesToday ?? 0) + 1;
            counterUpdate.searchDateReset = now;
          } else if (plan === "student") {
            counterUpdate.searchesThisMonth =
              ((u as UserDoc).searchesThisMonth ?? 0) + 1;
            counterUpdate.searchMonthReset = now;
          }
          const existingIdx = ((u as UserDoc).searchHistory ?? []).findIndex(
            (h) => h.query.toLowerCase() === q.toLowerCase(),
          );
          if (existingIdx !== -1) {
            await UserModel.findByIdAndUpdate((u as UserDoc)._id, {
              $set: {
                ...counterUpdate,
                [`searchHistory.${existingIdx}.answer`]: fullAnswer,
                [`searchHistory.${existingIdx}.papers`]: papers,
                [`searchHistory.${existingIdx}.searchedAt`]: now,
              },
            });
          } else {
            await UserModel.findByIdAndUpdate((u as UserDoc)._id, {
              $set: counterUpdate,
              $push: {
                searchHistory: {
                  $each: [
                    { query: q, answer: fullAnswer, papers, searchedAt: now },
                  ],
                  $position: 0,
                  $slice: 50,
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
      { error: (e as Error).message || "Search failed" },
      { status: 500 },
    );
  }
}
