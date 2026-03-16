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
  verifyAnswer,
  repairUncitedSentences,
  badgePapers,
  RAG_SYSTEM,
  buildRAGPrompt,
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
import { EvidenceBlock } from "@/types";
import { PublicResearchModel } from "@/models/PublicResearch";

const ant = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function slugify(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

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

// PromptResult carries everything needed to derive citedPapers in code after streaming
interface PromptResult {
  prompt: string;
  chunkIdToPaperId: Map<string, string>; // request-local — not shared state
  evidenceBlocks: EvidenceBlock[];
  intentAddendum: string;
}

async function buildPrompt(
  query: string,
  papers: PaperRow[],
  intentAddendum: string = "",
  requiredIds: Set<string> = new Set(),
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
      requiredIds,
    );

    const evidenceBlocks = buildEvidenceBlocks(topChunks, papers as any);
    const formattedEvidence = formatEvidenceBlocks(evidenceBlocks);

    // Request-local citation map — no global mutation
    const chunkIdToPaperId = new Map(
      evidenceBlocks.map((b) => [b.chunk_id, b.paper_id]),
    );

    // Use shared buildRAGPrompt so the user prompt contract is identical to generateRAGAnswer
    const prompt = buildRAGPrompt(query, formattedEvidence, intentAddendum);

    return { prompt, chunkIdToPaperId, evidenceBlocks, intentAddendum };
  }

  const prompt = `QUESTION: "${query}"\n\nNo academic papers found.\n\nClassify as Study Help / Exam Practice / General Academic / Non-Academic.\nIf non-academic: politely redirect. For study: thorough explanation + ## What To Search Next. For exam (JEE/NEET/UPSC/GATE): generate original questions with detailed answers. NEVER say you cannot help.${intentAddendum ? "\n\n" + intentAddendum : ""}`;
  return {
    prompt,
    chunkIdToPaperId: emptyMap,
    evidenceBlocks: [],
    intentAddendum,
  };
}

// Use the single shared RAG_SYSTEM from rag.ts — one prompt contract everywhere
const SYSTEM = RAG_SYSTEM;

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
    const intentResult = await detectIntent(q).catch(() => null);
    const intentAddendum = intentResult
      ? getIntentSystemAddendum(intentResult)
      : "";

    const cached = await getCachedResult(q);
    let papers: PaperRow[];
    let requiredIds: Set<string> = new Set();
    let fromCache: boolean;

    const routeJunkFilter = (p: PaperRow, query: string): boolean => {
      const t = p.title ?? "";
      const abs = p.abstract ?? "";
      const combined = `${t} ${abs.slice(0, 400)}`;

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
        // v10
        /vision language action|grasping foundation model|robotic.*grasp|syngrasp/i,
        /graph structure learning.*language|LangGSL/i,
        /scaling vision transformer|contrastive language.?image.*scaling|clip.*scaling law/i,
        /gradient.?based learning.*document recognition/i,
        /spatio.?temporal.*graph.*deep learning.*alzheimer/i,
        /deep.*learning.*model.*alzheimer.*progression.*real.?world/i,
        // v11 NEW
        /reproducible scaling.*contrastive|contrastive.*language.*image.*learning.*scaling/i,
        /federated learning.*open problems|advances.*federated learning/i,
        /alpha maml|negative adaptation.*meta.?learning|regression network.*meta.?learning/i,
        /tapnet.*few.?shot|task.?adaptive projection.*few.?shot/i,
        /transfer learning.*deep reinforcement|survey.*deep reinforcement.*transfer/i,
      ];
      if (HARD_BLOCKS.some((re) => re.test(t))) return false;

      // ── Domain-aware filter for NLP / LLM queries ────────────
      const isNLPQuery =
        /\b(transformer|attention|bert|gpt|llm|language model|rnn|lstm|seq2seq|nlp|natural language|embedding|rag|few.?shot|in.?context|prompt|pre.?train.*language)\b/i.test(
          query,
        );

      if (isNLPQuery) {
        const isVisionQuery =
          /computer vision|image classif|ViT|vision transformer.*how|object detect/i.test(
            query,
          );
        const isMedicalQuery =
          /medical|clinical|health|patient|diagnosis|drug/i.test(query);
        const isFPGAQuery = /FPGA|hardware accelerat|chip design/i.test(query);
        const isTimeSeriesQuery = /time series|forecasting|LTSF/i.test(query);
        const isSecurityQuery =
          /malware|intrusion|cybersecurity|network security/i.test(query);
        const isGraphQuery = /graph neural|GNN|graph transformer/i.test(query);
        const isRLQuery =
          /reinforcement learning|policy gradient|reward function|Q-learning/i.test(
            query,
          );
        const isMetaLearningQuery =
          /MAML|model.?agnostic meta|meta.?learning/i.test(query);

        // Block CV papers
        if (
          !isVisionQuery &&
          /\b(image classif|object detect|visual.*model|vision transformer|ViT|pixel|bounding box|segmentation.*image|imagenet|image.*recogni)\b/i.test(
            t,
          )
        )
          return false;

        // Block clinical / medical papers — TITLE ONLY
        if (
          !isMedicalQuery &&
          /\b(clinical.*knowledge|medical.*qa|health.*search|medqa|pubmedqa|medical.*licens|multimedqa|ehr.*language|biomedical.*qa|medical.*question answering|radiology.*report|tumor.*classif|cancer.*detect)\b/i.test(
            t,
          )
        )
          return false;

        // Block FPGA / hardware
        if (
          !isFPGAQuery &&
          /\b(FPGA|hardware accelerat|energy.?efficient.*hardware|asic|chip)\b/i.test(
            t,
          )
        )
          return false;

        // Block time-series
        if (
          !isTimeSeriesQuery &&
          /\b(time series.*transformer|LTSF|temporal forecast)\b/i.test(t)
        )
          return false;

        // Block security
        if (
          !isSecurityQuery &&
          /\b(malware|intrusion detect|cyberattack|ransomware|botnet)\b/i.test(
            combined,
          )
        )
          return false;

        // Block non-NLP graph papers
        if (
          !isGraphQuery &&
          /\b(graph neural|spectral.*graph|GCN|graph convolution|graph structure|node classif|link predict)\b/i.test(
            t,
          )
        )
          return false;

        // Block robotics / embodied AI
        if (
          /\b(robot(?:ic)?|grasping.*model|manipulation.*llm|embodied.*agent|syngrasp|sim.?to.?real)\b/i.test(
            t,
          )
        )
          return false;

        // Block pure CV scaling / contrastive image-text papers
        if (
          /\b(scaling.*vision|contrastive.*image.*text|contrastive.*language.*image|clip.*zero.?shot.*image|imagenet.*top.?1|reproducible.*scaling.*clip)\b/i.test(
            t,
          )
        )
          return false;

        // Block RL / policy gradient papers unless query is about RL
        if (
          !isRLQuery &&
          /\b(reinforcement learning|policy gradient|reward.*function|Q-learning|markov decision|actor.?critic|deep RL)\b/i.test(
            t,
          )
        )
          return false;

        // Block vision-focused meta-learning / MAML papers unless query asks for it
        if (
          !isMetaLearningQuery &&
          /\b(MAML|model.?agnostic meta|meta.?learning.*classif|meta.?learn.*image|prototypical network|matching network|tapnet|regression network.*few.?shot)\b/i.test(
            t,
          )
        )
          return false;

        // Block federated learning papers
        if (
          /\b(federated learning|federated optimization|federated.*privacy)\b/i.test(
            t,
          )
        )
          return false;

        // Block semi-supervised learning surveys (not LLM-specific)
        if (
          /\b(semi.?supervised learning.*survey|survey.*semi.?supervised)\b/i.test(
            t,
          )
        )
          return false;

        // Block pre-2020 papers with low citations — too old for LLM/ICL queries
        if (
          p.year &&
          p.year < 2020 &&
          (p.citationCount ?? 0) < 500 &&
          !/\b(bert|gpt|transformer|attention|word2vec|elmo|xlnet)\b/i.test(t)
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
      // On cache hit requiredIds stay empty — the answer is already generated
    } else {
      const searchResult = await searchAll(q);
      const rawPapers = searchResult.papers as PaperRow[];
      requiredIds = searchResult.requiredIds;
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
        const {
          prompt: builtPrompt,
          chunkIdToPaperId,
          evidenceBlocks,
          intentAddendum: resolvedAddendum,
        } = await buildPrompt(q, papers, intentAddendum, requiredIds);

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

          // Run repair pass on cached answers too — fixes stale entries saved
          // before the repair pass was deployed, and is idempotent on correct ones.
          if (evidenceBlocks.length > 0) {
            const repairedCached = await repairUncitedSentences(
              cachedAnswer,
              evidenceBlocks,
            ).catch(() => cachedAnswer);
            if (repairedCached !== cachedAnswer) {
              cachedAnswer = repairedCached;
              // Save the improved version back so future cache hits are correct
              void saveToCache(q, cachedAnswer, papers);
            }
          }

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
            temperature: 0,
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

        // Strip ** bold artifacts from "What To Search Next" items.
        // The model sometimes wraps suggestions in **"..."** or ** "..."**.
        // Match and remove any ** markers surrounding or adjacent to quoted suggestions.
        fullAnswer = fullAnswer.replace(
          /(##\s*What To Search Next[\s\S]*?)$/im,
          (section) =>
            section.replace(/\*{1,2}\s*(".*?"|\S[^\n]*?)\s*\*{1,2}/g, "$1"),
        );

        // SERVER-SIDE: per-section citation cap
        // Split on section boundaries rather than using a greedy regex —
        // the old (?=^##|\s*$) lookahead silently dropped the last section.
        const SERVER_SECTION_LIMITS: Record<string, number> = {
          "key concepts": 4,
          overview: 2,
          "system architecture": 0,
          "technical details": 3,
          "technical details or comparison": 3,
          limitations: 2,
          "key takeaways": 5,
          "what to search next": 0,
          "cited papers": 0,
        };

        // Split the answer on ## headings, process each section independently
        const sectionParts = fullAnswer.split(/(^##\s+.+$)/m);
        // sectionParts alternates: [pre-content, ## Heading, body, ## Heading, body, ...]
        const cappedParts: string[] = [];
        for (let si = 0; si < sectionParts.length; si++) {
          const part = sectionParts[si];
          if (/^##\s+/.test(part)) {
            // This is a heading — peek at the next part (the body)
            const heading = part
              .replace(/^##\s+/, "")
              .trim()
              .toLowerCase();
            const limit = SERVER_SECTION_LIMITS[heading];
            cappedParts.push(part);
            si++; // advance to body
            const body = sectionParts[si] ?? "";
            if (limit !== undefined) {
              const seenIds = new Set<string>();
              cappedParts.push(
                body.replace(/\[CITATION:[a-z0-9]+\]/g, (m: string) => {
                  if (seenIds.has(m)) return m; // repeat of known citation — always keep
                  if (seenIds.size >= limit) return ""; // new citation beyond cap — strip
                  seenIds.add(m);
                  return m;
                }),
              );
            } else {
              cappedParts.push(body);
            }
          } else {
            cappedParts.push(part);
          }
        }
        fullAnswer = cappedParts.join("");

        // Pass 1: hallucination guard — runs on every answer, including short ones
        if (evidenceBlocks.length > 0) {
          const verified1 = await verifyAnswer(
            fullAnswer,
            formatEvidenceBlocks(evidenceBlocks),
          ).catch(() => fullAnswer);
          if (verified1 !== fullAnswer) {
            fullAnswer = verified1;
          }
        }

        // Pass 2: uncited-sentence repair for Overview + Key Concepts
        // Detects factual sentences with no [CITATION:...] tag and triggers a
        // targeted Haiku repair that inserts the correct evidenceId in place.
        if (evidenceBlocks.length > 0) {
          fullAnswer = await repairUncitedSentences(
            fullAnswer,
            evidenceBlocks,
          ).catch(() => fullAnswer);
        }

        // Pass 3: per-citation strength check — strict thresholds (keep>=7, flag 4-6, remove<=3)
        if (evidenceBlocks.length > 0) {
          const { verified_answer } = await verifyClaimCitations(
            fullAnswer,
            evidenceBlocks,
          ).catch(() => ({
            verified_answer: fullAnswer,
          }));
          fullAnswer = verified_answer;
        }

        // Required-paper completeness injection.
        // After all verification passes, some required papers may still be absent from
        // citedPapers because their citations were in a capped section (e.g. Limitations)
        // or were stripped by verifyClaimCitations. Scan fullAnswer for author+year mentions
        // of required papers; if one is mentioned by text but has no [CITATION:xxx] tag,
        // inject the citation immediately after its first mention.
        if (requiredIds.size > 0 && !fromCache) {
          // Key-term patterns for required papers whose authors the LLM may not name
          // explicitly. Used as fallback when author+year text is absent from the answer.
          // IMPORTANT: keys must match block.paper_id (the paper's .id field),
          // NOT the STATIC_PAPERS key name (e.g. "vaswani2017" not "attention-transformer").
          const PAPER_KEY_TERM_RE: Record<string, RegExp> = {
            vaswani2017:
              /\b(transformer\b|transformer architecture|transformer model|transformer.based|attention is all you need|multi.?head attention|encoder.{0,20}decoder)\b/i,
            raffel2020: /\bT5\b|\btext.?to.?text\b|unified.*text.?to.?text/i,
            devlin2019:
              /\bBERT\b|bidirectional.*transformer|masked language model/i,
            radford2018: /\bGPT[-\s]?1\b|generative pre.?training/i,
            brown2020:
              /\bGPT[-\s]?3\b|few.?shot learner|175.{0,10}billion param/i,
          };

          const currentlyCitedPaperIds = new Set<string>();
          for (const [, eid] of fullAnswer.matchAll(
            /\[CITATION:([a-z0-9]+)\]/g,
          )) {
            const pid = chunkIdToPaperId.get(eid);
            if (pid) currentlyCitedPaperIds.add(pid);
          }
          for (const block of evidenceBlocks) {
            if (!requiredIds.has(block.paper_id)) continue;
            if (currentlyCitedPaperIds.has(block.paper_id)) continue;

            // Strategy 1: author last-name + year within 80 chars
            const lastName = (block.authors[0] ?? "").split(/\s+/).pop() ?? "";
            const yearStr = block.year?.toString() ?? "";
            let matchResult: RegExpExecArray | null = null;
            if (lastName && yearStr) {
              const mentionRe = new RegExp(
                `${lastName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^.!?\\n]{0,80}${yearStr}`,
                "i",
              );
              matchResult = mentionRe.exec(fullAnswer);
            }

            // Strategy 2: paper-specific key terms (handles cases where LLM
            // writes "T5 framework" without mentioning Raffel, or "Transformer"
            // without mentioning Vaswani)
            if (!matchResult) {
              const keyTermRe = PAPER_KEY_TERM_RE[block.paper_id];
              if (keyTermRe) matchResult = keyTermRe.exec(fullAnswer);
            }

            if (!matchResult) continue;
            const insertAt = matchResult.index + matchResult[0].length;
            // Don't double-inject if a citation already immediately follows
            if (
              /^\s*\[CITATION:/.test(fullAnswer.slice(insertAt, insertAt + 20))
            )
              continue;
            fullAnswer =
              fullAnswer.slice(0, insertAt) +
              ` [CITATION:${block.chunk_id}]` +
              fullAnswer.slice(insertAt);
            currentlyCitedPaperIds.add(block.paper_id);
          }
        }

        // Key Concepts derivative-paper filter for named comparison queries.
        // After all repair passes, scan Key Concepts bullet points. For comparison
        // queries (≥2 of BERT/GPT/T5 named with a comparison word), remove any
        // bullet whose [CITATION:xxx] tags ALL map to non-required papers AND whose
        // text does not mention any backbone model by name. This prevents TinyBERT,
        // MPNet, BART etc. from occupying primary Key Concept slots.
        if (requiredIds.size > 0 && !fromCache) {
          const mentionsBert2 = /\bbert\b/i.test(q);
          const mentionsGpt2 = /\bgpt[\s\-]?\d*\b/i.test(q);
          const mentionsT52 = /\bt5\b/i.test(q);
          const namedCount2 = +mentionsBert2 + +mentionsGpt2 + +mentionsT52;
          const hasComparisonWord2 =
            /\bvs\.?\b|\bversus\b|\bcompar|\bdiffer|\bcontrast/i.test(q);
          const isComparisonQuery =
            (namedCount2 >= 2 && hasComparisonWord2) || namedCount2 === 3;

          if (isComparisonQuery) {
            const BACKBONE_NAMES =
              /\btransformer\b|\bbert\b|\bgpt\b|\bt5\b|\battention is all you need\b/i;
            const kParts = fullAnswer.split(/(^##\s+.+$)/m);
            const kSanitized: string[] = [];
            for (let si = 0; si < kParts.length; si++) {
              const part = kParts[si];
              if (
                /^##\s+/.test(part) &&
                part
                  .replace(/^##\s+/, "")
                  .trim()
                  .toLowerCase() === "key concepts"
              ) {
                kSanitized.push(part);
                si++;
                const body = kParts[si] ?? "";
                const sanitizedLines = body.split("\n").filter((line) => {
                  const trimmed = line.trim();
                  if (!trimmed.startsWith("-") && !trimmed.startsWith("*"))
                    return true; // not a bullet — keep
                  // Extract all citation IDs from this bullet
                  const eids = [
                    ...trimmed.matchAll(/\[CITATION:([a-z0-9]+)\]/g),
                  ].map((m) => m[1]);
                  if (eids.length === 0) return true; // uncited — keep (repair pass will handle it)
                  // Keep if any citation maps to a required (backbone) paper
                  const hasBackbone = eids.some((eid) => {
                    const pid = chunkIdToPaperId.get(eid);
                    return pid !== undefined && requiredIds.has(pid);
                  });
                  if (hasBackbone) return true;
                  // Keep if bullet text explicitly names a backbone model
                  if (BACKBONE_NAMES.test(trimmed)) return true;
                  // All citations are to derivative papers and no backbone name — remove
                  return false;
                });
                kSanitized.push(sanitizedLines.join("\n"));
              } else {
                kSanitized.push(part);
              }
            }
            fullAnswer = kSanitized.join("");
          }
        }

        // ── Final backbone validator for named comparison queries ───────────────
        // Runs after ALL repair passes (including completeness injection and Key
        // Concepts filter). For BERT/GPT/T5 comparison queries, any required
        // backbone paper still absent from the answer gets a citation injected
        // deterministically — guaranteed before citedPapers is built.
        if (requiredIds.size > 0 && !fromCache) {
          const _bMentionsBert = /\bbert\b/i.test(q);
          const _bMentionsGpt = /\bgpt[\s\-]?\d*\b/i.test(q);
          const _bMentionsT5 = /\bt5\b/i.test(q);
          const _bNamed = +_bMentionsBert + +_bMentionsGpt + +_bMentionsT5;
          const _bIsComparison =
            (_bNamed >= 2 &&
              /\bvs\.?\b|\bversus\b|\bcompar|\bdiffer|\bcontrast/i.test(q)) ||
            _bNamed === 3;

          if (_bIsComparison) {
            // Broad key-term patterns used only for final injection-point search.
            // Deliberately broader than completeness injection so any phrasing qualifies.
            const BACKBONE_FIND_RE: Record<string, RegExp> = {
              vaswani2017:
                /\btransformer\b|\battention is all you need\b|\bmulti.?head attention\b/i,
              raffel2020: /\bT5\b|\btext.?to.?text\b|\braffel\b/i,
              devlin2019: /\bBERT\b|\bdevlin\b/i,
              radford2018:
                /\bGPT[-\s]?1\b|\bradford\b|\bgenerative pre.?training\b/i,
              brown2020:
                /\bGPT[-\s]?3\b|\bfew.?shot learner\b|\bbrown.*2020\b/i,
            };

            // Re-scan current citation state after all passes
            const _bCurPids = new Set<string>();
            for (const [, eid] of fullAnswer.matchAll(
              /\[CITATION:([a-z0-9]+)\]/g,
            )) {
              const pid = chunkIdToPaperId.get(eid);
              if (pid) _bCurPids.add(pid);
            }

            for (const block of evidenceBlocks) {
              if (!requiredIds.has(block.paper_id)) continue;
              if (_bCurPids.has(block.paper_id)) continue; // already cited

              const findRe = BACKBONE_FIND_RE[block.paper_id];
              if (!findRe) continue;

              const m = findRe.exec(fullAnswer);
              if (!m) continue;

              // Inject right after the matched mention
              const afterMatch = m.index + m[0].length;
              // Skip if already immediately followed by a citation
              if (
                /^\s*\[CITATION:/.test(
                  fullAnswer.slice(afterMatch, afterMatch + 25),
                )
              )
                continue;

              fullAnswer =
                fullAnswer.slice(0, afterMatch) +
                ` [CITATION:${block.chunk_id}]` +
                fullAnswer.slice(afterMatch);
              _bCurPids.add(block.paper_id);
            }
          }
        }

        // Save CLEAN answer to cache
        void saveToCache(q, fullAnswer, papers);

        // If answer was modified, send correction to frontend
        if (fullAnswer !== rawAnswer) {
          send({ type: "answer_replace", text: fullAnswer });
        }

        // Build citedPapers entirely from actually-used evidenceIds in the answer body
        // — never from the full retrieved list, and never from STATIC_PAPER_IDS auto-add
        const usedEvidenceIds = new Set<string>();
        for (const [, evidenceId] of fullAnswer.matchAll(
          /\[CITATION:([a-z0-9]+)\]/g,
        )) {
          usedEvidenceIds.add(evidenceId);
        }

        const citedPaperIds = new Set<string>();
        for (const evidenceId of usedEvidenceIds) {
          const paperId = chunkIdToPaperId.get(evidenceId);
          if (paperId) citedPaperIds.add(paperId);
        }

        // Only show papers that were genuinely cited — no fallback to full results
        const citedPapers = allPapers.filter((p) => citedPaperIds.has(p.id));

        // Attach credibility badges and send to client
        const badgedCitedPapers = badgePapers(citedPapers as any);

        // Build evidenceId → paperId map so the client can resolve [CITATION:evidenceId] markers
        const evidenceIdToPaperId: Record<string, string> = {};
        for (const evidenceId of usedEvidenceIds) {
          const paperId = chunkIdToPaperId.get(evidenceId);
          if (paperId) evidenceIdToPaperId[evidenceId] = paperId;
        }

        send({
          type: "papers",
          papers: badgedCitedPapers,
          usedEvidenceIds: [...usedEvidenceIds],
          evidenceIdToPaperId,
        });

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

        // ── Save to PublicResearch for SEO pages (all users) ──
        void PublicResearchModel.updateOne(
          { slug: slugify(q) },
          {
            $set: {
              slug: slugify(q),
              query: q,
              answer: fullAnswer,
              papers: badgedCitedPapers,
              evidenceIdToPaperId,
              createdAt: new Date(),
            },
          },
          { upsert: true },
        ).catch(() => null);

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
            papers: badgedCitedPapers, // cited papers with credibility badges
            retrievedPapers: papers, // full ranked retrieval set
            evidenceIdToPaperId, // citation resolution map
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
