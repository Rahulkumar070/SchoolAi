import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchAll } from "@/lib/papers";
import {
  chunkPapersWithSections,
  rankChunks,
  rerankChunks,
  enrichWithFullText,
  extractKeywords,
  buildEvidenceBlocks,
  formatEvidenceBlocks,
  guaranteeFoundationalChunks,
  verifyClaimCitations,
  badgePapers,
  STATIC_PAPER_IDS,
} from "@/lib/rag";
import { detectIntent, getIntentSystemAddendum } from "@/lib/intent";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { ConversationModel } from "@/models/Conversation";
import { MessageModel } from "@/models/Message";
import { getCachedResult, saveToCache } from "@/lib/cache";
import { checkGuestLimit } from "@/lib/guestLimit";
import Anthropic from "@anthropic-ai/sdk";
import mongoose from "mongoose";
import { generateRelatedQuestions } from "@/lib/ai";
import { EvidenceBlock } from "@/types";  // ✅ CHANGE #1 — new import [Upgrade #1]

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
  searchHistory?: {
    query: string;
    answer?: string;
    papers?: unknown[];
    searchedAt?: Date;
  }[];
};

// ✅ CHANGE #2 — PromptResult now also returns topChunks and evidenceBlocks
// so we can run verifyClaimCitations after streaming without re-building
interface PromptResult {
  prompt: string;
  chunkIdToPaperId: Map<string, string>;
  evidenceBlocks: EvidenceBlock[];   // needed for claim verification
  intentAddendum: string;            // v7 NEW: intent-specific system instructions
}

async function buildPrompt(
  query: string,
  papers: PaperRow[],
  intentAddendum: string = "",
): Promise<PromptResult> {
  const emptyMap = new Map<string, string>();

  if (papers.length > 0) {
    const keywords = extractKeywords(query);

    const chunks = await chunkPapersWithSections(papers as any, keywords);
    const bm25Chunks = await rankChunks(query, chunks);
    const reranked = await rerankChunks(query, bm25Chunks, 8);
    const topChunks = guaranteeFoundationalChunks(
      reranked,
      chunks,
      papers as any,
    );

    // Build citation-grounded evidence blocks (includes authors, citationCount, doi, inlineCite)
    const evidenceBlocks = buildEvidenceBlocks(topChunks, papers as any);
    const formattedEvidence = formatEvidenceBlocks(evidenceBlocks);
    const chunkIdToPaperId = new Map(
      evidenceBlocks.map((b) => [b.chunk_id, b.paper_id]),
    );

    // v7: append intent-specific instructions (math equations, comparison table, etc.)
    const intentSection = intentAddendum
      ? `\n\n${intentAddendum}`
      : "";

    const prompt = `You are Researchly, a citation-grounded research assistant.
You must answer the user using ONLY the retrieved evidence blocks provided below.
Do not use prior knowledge, world knowledge, or unstated assumptions.
GROUNDING RULES
1. Every factual sentence must end with one or more citations in this exact format: [CITATION:chunk_id]
2. Only cite chunk IDs that appear in the EVIDENCE BLOCKS section.
3. Do not cite a paper unless at least one cited chunk belongs to that paper.
4. If a claim is supported by multiple chunks, cite all of them.
5. If the evidence is insufficient, say exactly: "I cannot support that from the retrieved papers."
6. If sources conflict, state the conflict explicitly and cite both sides.
7. Do not invent authors, years, venues, URLs, DOI values, or paper titles.
8. Do not output a citation for stylistic or general statements unless they contain a factual claim.
9. Prefer direct evidence from the most relevant chunks over broad summary language.
10. Never output a claim first and search for a citation later; form each sentence from evidence.
CITATION FORMAT
- Use the inline_cite field for the FIRST mention of a paper:
  "Vaswani et al. (2017) [CITATION:c01]"
- For subsequent mentions of the same paper: just [CITATION:cXX]
OUTPUT RULES
- Write in 4 to 6 short sections with clear headings.
- After every factual sentence, append citation tags like [CITATION:c12][CITATION:c19].
- Do not use any citation tag that is not present in the evidence.
- At the end, output a section titled "## Cited Papers" listing only papers that were actually cited.
- For each cited paper, include:
  - paper_id
  - title
  - year
  - url
  - cited_chunk_ids
- Do not include papers that were retrieved but not cited.
- If no evidence supports the answer, output only: "I cannot support that from the retrieved papers."
EVIDENCE BLOCKS
Each block has:
- chunk_id
- paper_id
- title
- authors
- year
- venue
- citations       (citation count — e.g. 80,000)
- doi             (DOI string or "Not available")
- url
- section         (which part of the paper: abstract/introduction/methods/results/conclusion)
- inline_cite     (pre-formatted "Author et al. (Year)" — use this for first mention)
- text
${formattedEvidence}
USER QUESTION
${query}${intentSection}`;

    return { prompt, chunkIdToPaperId, evidenceBlocks, intentAddendum };
  }

  const prompt = `QUESTION: "${query}"\n\nNo academic papers found.\n\nClassify as Study Help / Exam Practice / General Academic / Non-Academic.\nIf non-academic: politely redirect. For study: thorough explanation + ## What To Search Next. For exam (JEE/NEET/UPSC/GATE): generate original questions with detailed answers. NEVER say you cannot help.${intentAddendum ? "\n\n" + intentAddendum : ""}`;
  return { prompt, chunkIdToPaperId: emptyMap, evidenceBlocks: [], intentAddendum };
}

const SYSTEM = `You are Researchly, a citation-grounded academic research assistant for Indian students and researchers.
You ONLY help with academic, research, and study topics.
You must answer using ONLY the retrieved evidence blocks in the user message.

GROUNDING RULES
1. Every factual sentence must end with [CITATION:chunk_id] — use the exact chunk_id from the evidence blocks.
2. Only cite chunk IDs present in the EVIDENCE BLOCKS section of the user message.
3. Never cite a paper unless a cited chunk belongs to that paper.
4. If a claim is supported by multiple chunks, cite all of them: [CITATION:c01][CITATION:c03]
5. If evidence is insufficient, write: "I cannot support that from the retrieved papers."
6. Never invent authors, years, venues, URLs, DOI values, or paper titles.

CITATION FORMAT
- Use inline_cite field from the evidence block for the FIRST mention of each paper.
  Example: "The Transformer uses only attention mechanisms. Vaswani et al. (2017) [CITATION:c01]"
- For subsequent mentions of the same paper: just [CITATION:cXX]

MANDATORY RESPONSE STRUCTURE — output ALL 7 sections in order:
1. ## Overview
2. ## Key Concepts
3. ## System Architecture  (include ASCII diagram for any AI system or pipeline)
4. ## Technical Details or Comparison  (include comparison table when comparing 2+ models)
5. ## Limitations
6. ## Key Takeaways
7. ## What To Search Next  (3 query suggestions, no citations needed here)

CITATION PLACEMENT — hard limits per section:
- ## Overview: max 2 citations
- ## Key Concepts: max 3 citations
- ## System Architecture: 0 citations
- ## Technical Details or Comparison: max 3 citations
- ## Limitations: 0 citations
- ## Key Takeaways: max 2 citations on first two takeaways only
- ## What To Search Next: 0 citations
- TOTAL: maximum 8 [CITATION:*] markers across the whole answer

CITATION SAFETY RULES:
- ONLY cite chunk_ids listed in the EVIDENCE BLOCKS section.
- Never repeat the same chunk_id more than 2 times.
- Never write plain-text citations like "Devlin et al." — use [CITATION:chunk_id] only.
- Never append a bibliography or references list at the end.

After ## What To Search Next, output a "## Cited Papers" section in YAML format:
## Cited Papers
- paper_id: <paper_id>
  title: <title>
  year: <year>
  url: <url>
  cited_chunk_ids: [<chunk_id>, ...]

Include ONLY papers actually cited in the answer body. Then STOP completely.

WRITING RULES
- Never start with filler phrases.
- Bold **key terms** on first use.
- Research answers: 600–900 words. Study: 400–600 words.`;

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
        {
          _id: 1,
          plan: 1,
          searchesToday: 1,
          searchDateReset: 1,
          searchesThisMonth: 1,
          searchMonthReset: 1,
          searchHistory: { $slice: 3 },
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
        const existing = await ConversationModel.findOne({
          _id: existingConvId,
          userId: u._id,
        });
        if (existing) {
          conversationId = existingConvId;
        }
      }

      if (!conversationId) {
        const title = q.length > 60 ? q.slice(0, 57) + "…" : q;
        const conv = await ConversationModel.create({ userId: u._id, title });
        conversationId = conv._id.toString();
        isNewConversation = true;
      }
    }

    // ── Papers ────────────────────────────────────────────────
    // v7 NEW: Detect query intent FIRST — drives retrieval strategy + system prompt
    const intentResult = await detectIntent(q).catch(() => null);
    const intentAddendum = intentResult
      ? getIntentSystemAddendum(intentResult)
      : "";

    const cached = await getCachedResult(q);
    let papers: PaperRow[];
    let fromCache: boolean;

    const routeJunkFilter = (p: PaperRow, query: string): boolean => {
      const t = p.title ?? "";
      const abs = p.abstract ?? "";

      // ── Hard title blocks (always dropped) ──────────────────
      const HARD_BLOCKS = [
        /simple harmonic oscillator|harmonic oscillator.*physics/i,
        /UNETR|medical image segmentation|organ segmentation/i,
        /delirium|surgical|intraoperative|postoperative/i,
        /FPGA.*transformer|transformer.*FPGA|FTRANS/i,
        /how to represent part.?whole hierarchies/i,
        /implicit reasoning.*shortcut/i,
        /malware.*detect|intrusion detect/i,
        /supply.?chain.*optim|inventory.*optim/i,
      ];
      if (HARD_BLOCKS.some((re) => re.test(t))) return false;

      // ── Domain-aware filter for NLP queries ──────────────────
      const isNLPQuery =
        /\b(transformer|attention|bert|gpt|llm|language model|rnn|lstm|seq2seq|nlp|natural language|embedding|rag)\b/i.test(
          query,
        );

      if (isNLPQuery) {
        // Only block CV/security papers if the query is not explicitly about that domain
        const isVisionQuery =
          /computer vision|image classif|ViT|vision transformer.*how|object detect/i.test(query);
        const isMedicalQuery =
          /medical imaging|radiology|clinical|tumor|cancer/i.test(query);
        const isFPGAQuery =
          /FPGA|hardware accelerat|chip design/i.test(query);
        const isTimeSeriesQuery =
          /time series|forecasting|LTSF/i.test(query);
        const isSecurityQuery =
          /malware|intrusion|cybersecurity|network security/i.test(query);
        const isGraphQuery = /graph neural|GNN|graph transformer/i.test(query);

        const paperText = `${t} ${abs}`;

        if (
          !isVisionQuery &&
          /\b(image classif|object detect|visual.*model|vision transformer|ViT|pixel|bounding box|segmentation.*image)\b/i.test(t)
        )
          return false;

        if (
          !isMedicalQuery &&
          /\b(clinical|patient|diagnosis|tumor|cancer|radiology|mri|ct scan|organ|surgical)\b/i.test(t)
        )
          return false;

        if (
          !isFPGAQuery &&
          /\b(FPGA|hardware accelerat|energy.?efficient.*hardware|asic|chip)\b/i.test(t)
        )
          return false;

        if (
          !isTimeSeriesQuery &&
          /\b(time series.*transformer|LTSF|temporal forecast)\b/i.test(t)
        )
          return false;

        if (
          !isSecurityQuery &&
          /\b(malware|intrusion detect|cyberattack|ransomware|botnet)\b/i.test(paperText)
        )
          return false;

        if (
          !isGraphQuery &&
          /\b(graph neural|spectral.*graph|GCN|graph convolution)\b/i.test(t)
        )
          return false;
      }

      return true;
    };

    if (cached) {
      papers = (cached.papers as PaperRow[]).filter((p) =>
        routeJunkFilter(p, q),
      );
      fromCache = true;
    } else {
      const rawPapers = (await searchAll(q)) as PaperRow[];
      const enriched = (await enrichWithFullText(
        rawPapers as any,
        3,
      )) as PaperRow[];
      papers = enriched.filter((p) => routeJunkFilter(p, q));
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

        send({ type: "meta", conversationId, isNewConversation });

        const allPapers = [...papers];

        // ── Build prompt + chunk map ──────────────────────────
        // evidenceBlocks is now returned so we can use it for claim verification
        const { prompt: builtPrompt, chunkIdToPaperId, evidenceBlocks, intentAddendum: resolvedAddendum } =
          await buildPrompt(q, papers, intentAddendum);

        // v7 NEW: dynamic system prompt — append intent-specific rules
        const dynamicSystem = resolvedAddendum
          ? SYSTEM + "\n\n" + resolvedAddendum
          : SYSTEM;

        // ── Stream the answer ─────────────────────────────────
        if (fromCache && cached) {
          let cachedAnswer = cached.answer.replace(
            /\n+##\s*Cited Papers[\s\S]*$/i,
            "",
          );
          const words = cachedAnswer.split(" ");
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
            model: "claude-sonnet-4-6",
            max_tokens: 4000,
            system: dynamicSystem,
            messages: [{ role: "user", content: builtPrompt }],
          });
          let citedPapersStarted = false;
          for await (const event of streamResp) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const chunk = event.delta.text;

              const tentative = fullAnswer + chunk;
              if (
                !citedPapersStarted &&
                /\n##\s*Cited Papers/i.test(tentative)
              ) {
                citedPapersStarted = true;
                fullAnswer = tentative.replace(
                  /\n+##\s*Cited Papers[\s\S]*$/i,
                  "",
                );
                send({ type: "answer_replace", text: fullAnswer });
                continue;
              }
              if (citedPapersStarted) continue;

              fullAnswer += chunk;
              send({ type: "text", text: chunk });
            }
          }
        }

        // Strip any leaked ## Cited Papers block
        const rawAnswer = fullAnswer;
        fullAnswer = fullAnswer.replace(/\n+##\s*Cited Papers[\s\S]*$/i, "");

        // SERVER-SIDE: deduplicate [CITATION:chunk_id] markers
        const seenCitations = new Set<string>();
        fullAnswer = fullAnswer.replace(/\[CITATION:[a-z0-9]+\]/g, (match) => {
          if (seenCitations.has(match)) return "";
          seenCitations.add(match);
          return match;
        });

        // SERVER-SIDE: per-section citation cap
        const SERVER_SECTION_LIMITS: Record<string, number> = {
          "key concepts": 3,
          overview: 2,
          "system architecture": 0,
          "technical details": 3,
          "technical details or comparison": 3,
          limitations: 0,
          "key takeaways": 2,
          "what to search next": 0,
          "cited papers": 0,
        };
        fullAnswer = fullAnswer.replace(
          /^##\s+(.+)$([\s\S]*?)(?=^##|\s*$)/gm,
          (block, heading, body) => {
            const limit = SERVER_SECTION_LIMITS[heading.trim().toLowerCase()];
            if (limit === undefined) return block;
            let count = 0;
            const cappedBody = body.replace(
              /\[CITATION:[a-z0-9]+\]/g,
              (m: string) => {
                count++;
                return count <= limit ? m : "";
              },
            );
            return `## ${heading}${cappedBody}`;
          },
        );

        // ✅ CHANGE #4 — Claim-to-citation verification pass [Upgrade #2]
        // Runs Claude Haiku to score each citation 0-10 and removes weak ones (<6)
        if (evidenceBlocks.length > 0) {
          const { verified_answer } = await verifyClaimCitations(
            fullAnswer,
            evidenceBlocks,
          ).catch(() => ({ verified_answer: fullAnswer, removed_citations: 0, flagged_citations: 0, verification_log: "" }));
          fullAnswer = verified_answer;
        }

        // Save CLEAN answer to cache
        void saveToCache(q, fullAnswer, papers);

        // If answer was modified, send correction to frontend
        if (fullAnswer !== rawAnswer) {
          send({ type: "answer_replace", text: fullAnswer });
        }

        // Extract cited papers from [CITATION:cXX] markers using chunk map
        const citedPaperIds = new Set<string>();
        for (const [, chunkId] of fullAnswer.matchAll(
          /\[CITATION:([a-z0-9]+)\]/g,
        )) {
          const paperId = chunkIdToPaperId.get(chunkId);
          if (paperId) citedPaperIds.add(paperId);
        }

        for (const [, paperId] of chunkIdToPaperId) {
          if (STATIC_PAPER_IDS.has(paperId)) {
            citedPaperIds.add(paperId);
          }
        }

        const citedPapers =
          citedPaperIds.size > 0
            ? allPapers.filter((p) => citedPaperIds.has(p.id))
            : allPapers.slice(0, 6);

        // ✅ CHANGE #5 — Attach credibility badges before sending to client [Upgrade #10]
        const badgedCitedPapers = badgePapers(citedPapers as any);
        send({ type: "papers", papers: badgedCitedPapers });

        // Generate personalized related questions
        const recentHistory = (u?.searchHistory ?? [])
          .slice(0, 3)
          .map((h: { query: string }) => h.query)
          .filter((hq: string) => hq !== q);
        const relatedQuestions = await generateRelatedQuestions(
          q,
          recentHistory,
        ).catch(() => []);
        send({
          type: "done",
          fromCache,
          conversationId,
          related: relatedQuestions,
        });
        controller.close();

        // ── Persist after stream closes ───────────────────────
        if (u && session?.user?.email && conversationId) {
          const now = new Date();
          const plan = u.plan ?? "free";

          await MessageModel.create({
            conversationId,
            userId: u._id,
            role: "user",
            content: q,
            papers: [],
          });

          await MessageModel.create({
            conversationId,
            userId: u._id,
            role: "assistant",
            content: fullAnswer,
            papers,
          });

          await ConversationModel.findByIdAndUpdate(conversationId, {
            updatedAt: now,
          });

          const counterUpdate: Record<string, unknown> = {};
          if (plan === "free") {
            counterUpdate.searchesToday = (u.searchesToday ?? 0) + 1;
            counterUpdate.searchDateReset = now;
          } else if (plan === "student") {
            counterUpdate.searchesThisMonth = (u.searchesThisMonth ?? 0) + 1;
            counterUpdate.searchMonthReset = now;
          }

          await UserModel.findByIdAndUpdate(u._id, {
            $set: counterUpdate,
            $push: {
              searchHistory: {
                $each: [
                  {
                    query: q,
                    answer: fullAnswer,
                    papers: citedPapers,
                    searchedAt: now,
                  },
                ],
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
