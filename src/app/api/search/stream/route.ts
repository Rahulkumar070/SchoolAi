import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchAll } from "@/lib/papers";
import { chunkPapers, rankChunks, rerankChunks, buildRAGContext, enrichWithFullText } from "@/lib/rag";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { ConversationModel } from "@/models/Conversation";
import { MessageModel } from "@/models/Message";
import { getCachedResult, saveToCache } from "@/lib/cache";
import { checkGuestLimit } from "@/lib/guestLimit";
import Anthropic from "@anthropic-ai/sdk";
import mongoose from "mongoose";
import { generateRelatedQuestions } from "@/lib/ai";

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

async function buildPrompt(query: string, papers: PaperRow[]) {
  if (papers.length > 0) {
    // RAG: chunk + rank + re-rank + build context
    const chunks = chunkPapers(papers as any);
    const bm25Chunks = rankChunks(query, chunks);
    const topChunks = await rerankChunks(query, bm25Chunks, 8); // LLM re-rank
    const ragCtx = buildRAGContext(topChunks);
    // Inject hardcoded foundational papers for well-known topics so they always appear in the index
    // Build guaranteed entries for well-known foundational papers
    // They are numbered REF-1, REF-2 ... and retrieved papers follow after
    interface GuaranteedPaperDef { title: string; authors: string; year: number; source: string; url: string; }
    const GUARANTEED_DEFS: Record<string, GuaranteedPaperDef> = {
      "attention-transformer": { title: "Attention Is All You Need", authors: "Ashish Vaswani, Noam Shazeer, Niki Parmar et al.", year: 2017, source: "NeurIPS / arXiv", url: "https://arxiv.org/abs/1706.03762" },
      "bert": { title: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding", authors: "Jacob Devlin, Ming-Wei Chang, Kenton Lee et al.", year: 2019, source: "NAACL / arXiv", url: "https://arxiv.org/abs/1810.04805" },
      "tinybert": { title: "TinyBERT: Distilling BERT for Natural Language Understanding", authors: "Xiaoqi Jiao, Yichun Yin, Lifeng Shang et al.", year: 2020, source: "EMNLP / arXiv", url: "https://arxiv.org/abs/1909.10351" },
      "roberta": { title: "RoBERTa: A Robustly Optimized BERT Pretraining Approach", authors: "Yinhan Liu, Myle Ott, Naman Goyal et al.", year: 2019, source: "arXiv", url: "https://arxiv.org/abs/1907.11692" },
      "gpt2": { title: "Language Models are Unsupervised Multitask Learners", authors: "Alec Radford, Jeffrey Wu, Rewon Child et al.", year: 2019, source: "OpenAI Blog", url: "https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf" },
      "gpt3": { title: "Language Models are Few-Shot Learners", authors: "Tom Brown, Benjamin Mann, Nick Ryder et al.", year: 2020, source: "NeurIPS / arXiv", url: "https://arxiv.org/abs/2005.14165" },
      "instructgpt": { title: "Training language models to follow instructions with human feedback", authors: "Long Ouyang, Jeffrey Wu, Xu Jiang et al.", year: 2022, source: "NeurIPS / arXiv", url: "https://arxiv.org/abs/2203.02155" },
      "gradient_descent": { title: "An overview of gradient descent optimization algorithms", authors: "Sebastian Ruder", year: 2016, source: "arXiv", url: "https://arxiv.org/abs/1609.04747" },
      "attention": { title: "Attention Is All You Need", authors: "Ashish Vaswani, Noam Shazeer, Niki Parmar et al.", year: 2017, source: "NeurIPS / arXiv", url: "https://arxiv.org/abs/1706.03762" },
      "rag": { title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", authors: "Patrick Lewis, Ethan Perez, Aleksandra Piktus et al.", year: 2020, source: "NeurIPS / arXiv", url: "https://arxiv.org/abs/2005.11401" },
    };

    const guaranteedDefs: GuaranteedPaperDef[] = [];
    if (/attention.*transformer|transformer.*attention|self.?attention|multi.?head|how.*transformer/i.test(query)) {
      guaranteedDefs.push(GUARANTEED_DEFS["attention-transformer"]);
    }
    if (/\bbert\b|bidirectional.*transformer|masked.*language.*model/i.test(query)) {
      guaranteedDefs.push(GUARANTEED_DEFS["bert"]);
      guaranteedDefs.push(GUARANTEED_DEFS["tinybert"]);
      guaranteedDefs.push(GUARANTEED_DEFS["roberta"]);
    }
    if (/\brag\b|retrieval.?augmented generation/i.test(query)) {
      guaranteedDefs.push(GUARANTEED_DEFS["rag"]);
    }
    if (/\bgpt\b|generative pre.?trained|few.?shot.*learn|language model.*few.?shot/i.test(query)) {
      guaranteedDefs.push(GUARANTEED_DEFS["gpt3"]);
      guaranteedDefs.push(GUARANTEED_DEFS["instructgpt"]);
      guaranteedDefs.push(GUARANTEED_DEFS["attention-transformer"]);
    }
    if (/gradient descent|sgd|adam optimizer|backprop/i.test(query)) {
      guaranteedDefs.push(GUARANTEED_DEFS["gradient_descent"]);
    }
    if (/\battention mechanism\b|self.?attention|scaled dot.?product/i.test(query)) {
      guaranteedDefs.push(GUARANTEED_DEFS["attention-transformer"]);
      guaranteedDefs.push(GUARANTEED_DEFS["bert"]);
    }

    // Guaranteed papers get REF-1, REF-2 ... ; retrieved papers follow as REF-(G+1), REF-(G+2) ...
    const G = guaranteedDefs.length;
    const guaranteedEntries = guaranteedDefs.map((p, i) =>
      `[REF-${i + 1}]\nTitle: "${p.title}"\nAuthors: ${p.authors}\nYear: ${p.year}\nSource: ${p.source}\nLink: ${p.url}`
    );

    const paperList = [
      ...guaranteedEntries,
      ...papers
        .slice(0, 18)
        .map(
          (p, i) =>
            `[REF-${G + i + 1}]\nTitle: "${p.title}"\nAuthors: ${p.authors.slice(0, 3).join(", ")}${p.authors.length > 3 ? " et al." : ""}\nYear: ${p.year ?? "n.d."}\nSource: ${p.source}\nLink: ${p.doi ? `https://doi.org/${p.doi}` : p.url ? p.url : "Not available"}`,
        ),
    ].join("\n\n");
    return `RESEARCH QUESTION: "${query}"

## RETRIEVED CONTEXT (top ${topChunks.length} chunks)
${ragCtx}

## PAPER INDEX (use these for citation cards — metadata is pre-verified)
${paperList}

CITATION INSTRUCTION:
- Place 5–7 [REF-N] markers total, spread across Overview, Technical Details, Limitations, and Takeaways.
- REF-1 is the foundational paper — use it MAX 2 TIMES across the whole answer.
- For the remaining citations, look at REF-2, REF-3, REF-4 etc. in the PAPER INDEX and use whichever best matches the claim.
- DO NOT write "(From general knowledge)" or plain-text citations like "Devlin et al." — only [REF-N].
- DO NOT repeat the same [REF-N] more than twice.
Classify this question and respond with the full 6-section structure.`;
  }
  return `QUESTION: "${query}"\n\nNo academic papers found.\n\nClassify as Study Help / Exam Practice / General Academic / Non-Academic.\nIf non-academic: politely redirect. For study: thorough explanation + ## What To Search Next. For exam (JEE/NEET/UPSC/GATE): generate original questions with detailed answers. NEVER say you cannot help.`;
}

// ── Guaranteed paper objects for frontend citation resolution ─────────
function getGuaranteedPaperObjects(query: string) {
  const all = [
    {
      id: "vaswani2017",
      title: "Attention Is All You Need",
      authors: ["Ashish Vaswani", "Noam Shazeer", "Niki Parmar", "Jakob Uszkoreit"],
      year: 2017,
      abstract: "We propose a new network architecture, the Transformer, based solely on attention mechanisms.",
      source: "NeurIPS / arXiv",
      doi: "10.48550/arXiv.1706.03762",
      url: "https://arxiv.org/abs/1706.03762",
      citationCount: 120000,
      _refKey: "REF-FOUND-1",
    },
    {
      id: "devlin2019",
      title: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
      authors: ["Jacob Devlin", "Ming-Wei Chang", "Kenton Lee", "Kristina Toutanova"],
      year: 2019,
      abstract: "BERT is designed to pre-train deep bidirectional representations from unlabeled text.",
      source: "NAACL / arXiv",
      url: "https://arxiv.org/abs/1810.04805",
      citationCount: 90000,
      _refKey: "REF-FOUND-2",
    },
    {
      id: "lewis2020",
      title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
      authors: ["Patrick Lewis", "Ethan Perez", "Aleksandra Piktus"],
      year: 2020,
      source: "NeurIPS / arXiv",
      url: "https://arxiv.org/abs/2005.11401",
      citationCount: 12000,
      _refKey: "REF-FOUND-3",
    },
  ];

  const matched: typeof all = [];
  if (/attention.*transformer|transformer.*attention|self.?attention|multi.?head|how.*transformer/i.test(query)) {
    matched.push(all[0]);
  }
  if (/\bbert\b|bidirectional.*transformer|masked.*language/i.test(query)) {
    matched.push(all[1]);
    matched.push({
      id: "liu2019",
      title: "RoBERTa: A Robustly Optimized BERT Pretraining Approach",
      authors: ["Yinhan Liu", "Myle Ott", "Naman Goyal", "Jingfei Du", "Mandar Joshi"],
      year: 2019,
      abstract: "RoBERTa replicates, simplifies, and better tunes BERT. It removes NSP and trains with larger batches over more data.",
      source: "arXiv",
      url: "https://arxiv.org/abs/1907.11692",
      citationCount: 25000,
      _refKey: "REF-FOUND-roberta",
    });
    matched.push({
      id: "jiao2020",
      title: "TinyBERT: Distilling BERT for Natural Language Understanding",
      authors: ["Xiaoqi Jiao", "Yichun Yin", "Lifeng Shang", "Xin Jiang", "Xuan Chen"],
      year: 2020,
      abstract: "TinyBERT is a compressed BERT model using two-stage knowledge distillation, achieving 96.8% of BERT performance with 7.5x fewer parameters.",
      source: "EMNLP / arXiv",
      url: "https://arxiv.org/abs/1909.10351",
      citationCount: 3000,
      _refKey: "REF-FOUND-tinybert",
    });
  }
  if (/\brag\b|retrieval.?augmented/i.test(query)) {
    matched.push(all[2]);
  }
  if (/\bgpt\b|generative pre.?trained|few.?shot.*learn|language model.*few.?shot/i.test(query)) {
    matched.push(
      { id: "brown2020", title: "Language Models are Few-Shot Learners", authors: ["Tom Brown", "Benjamin Mann", "Nick Ryder", "Melanie Subbiah"], year: 2020, source: "NeurIPS / arXiv", url: "https://arxiv.org/abs/2005.14165", citationCount: 35000, _refKey: "REF-FOUND-gpt3" },
      { id: "ouyang2022", title: "Training language models to follow instructions with human feedback", authors: ["Long Ouyang", "Jeffrey Wu", "Xu Jiang", "Diogo Almeida"], year: 2022, source: "NeurIPS / arXiv", url: "https://arxiv.org/abs/2203.02155", citationCount: 12000, _refKey: "REF-FOUND-instructgpt" },
      { id: "vaswani2017gpt", title: "Attention Is All You Need", authors: ["Ashish Vaswani", "Noam Shazeer", "Niki Parmar", "Jakob Uszkoreit"], year: 2017, source: "NeurIPS / arXiv", url: "https://arxiv.org/abs/1706.03762", citationCount: 120000, _refKey: "REF-FOUND-vaswani-gpt" }
    );
  }
  if (/gradient descent|sgd|adam optimizer|backprop/i.test(query)) {
    matched.push(
      { id: "ruder2016", title: "An overview of gradient descent optimization algorithms", authors: ["Sebastian Ruder"], year: 2016, source: "arXiv", url: "https://arxiv.org/abs/1609.04747", citationCount: 14000, _refKey: "REF-FOUND-ruder" }
    );
  }
  if (/\battention mechanism\b|self.?attention|scaled dot.?product/i.test(query)) {
    matched.push(
      { id: "vaswani2017attn", title: "Attention Is All You Need", authors: ["Ashish Vaswani", "Noam Shazeer", "Niki Parmar", "Jakob Uszkoreit"], year: 2017, source: "NeurIPS / arXiv", url: "https://arxiv.org/abs/1706.03762", citationCount: 120000, _refKey: "REF-FOUND-vaswani-attn" },
      { id: "devlin2019attn", title: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding", authors: ["Jacob Devlin", "Ming-Wei Chang", "Kenton Lee", "Kristina Toutanova"], year: 2019, source: "NAACL / arXiv", url: "https://arxiv.org/abs/1810.04805", citationCount: 90000, _refKey: "REF-FOUND-bert-attn" }
    );
  }
  return matched;
}

const SYSTEM = `You are Researchly, an expert academic research assistant for Indian students and researchers.
You ONLY help with academic, research, and study topics.

RULE 1 — MANDATORY RESPONSE STRUCTURE
Every research answer MUST use these 6 sections in order:
1. ## Overview
2. ## Key Concepts
3. ## System Architecture  (include ASCII diagram)
4. ## Technical Details or Comparison  (include comparison table)
5. ## Limitations
6. ## Key Takeaways  +  ## What To Search Next

RULE 2 — CITATIONS (SELECTIVE, NOT AFTER EVERY SENTENCE)
Cite 5–8 papers total across the whole answer. Spread citations across DIFFERENT papers — do NOT repeat the same [REF-N] more than 2 times total.

Where to place citations — EXACTLY ONE per location:
- Overview: exactly ONE [REF-1] at the END of the overview paragraph only
- Key Concepts: ONE citation on the most important technical bullet (MLM or self-attention)
- Technical Details: ONE citation after the comparison table
- Key Takeaways: ONE citation on the first takeaway

Where NOT to place citations:
- Do NOT place two citations in the Overview — one is enough
- Do NOT cite after every bullet point — most bullets need NO citation
- Do NOT repeat [REF-1] more than 2 times total across the whole answer
- Do NOT cite obvious general facts

Good example (BERT query) — 4 citations total, spread across sections:
Overview (end): "...adapts to specific downstream tasks like classification, QA, or NER. [REF-1]"
Key Concepts: "MLM forces true bidirectionality — BERT predicts masked tokens using both left and right context. [REF-1]"
Technical Details: "RoBERTa removes NSP and trains on 10× more data, outperforming BERT on GLUE. [REF-2]"
Key Takeaways: "TinyBERT achieves 96.8% of BERT's performance with 7.5× fewer parameters. [REF-3]"

Rules:
- NEVER write "(From general knowledge)" in any form — use [REF-N] or omit the citation entirely.
- NEVER write plain-text citations like "Devlin et al., 2019" or "Liu et al., 2019".
- NEVER add annotation lines like "Related Work: ...", "Key Benchmark: ...", "Foundational Paper: ...", "Note: ...".
- NEVER write a bare URL on its own line.
- NEVER append a references list or bibliography at the end of the answer.
- Use ONLY [REF-N] format from the PAPER INDEX.
- Maximum 2 uses of any single [REF-N] across the entire answer.

RULE 3 — HANDLING MISSING CONTEXT
If retrieved papers do not support a specific claim:
1. Use your training knowledge to answer — but do NOT label it. Just write the fact.
2. Use REF-1 for any claim about the core topic (REF-1 is always the foundational paper).
3. NEVER fabricate paper titles, authors, or URLs.
4. NEVER cite an irrelevant paper just to fill the citation requirement.
5. NEVER write "(From general knowledge)" in any form — it is forbidden.

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
        // Fetch rate-limiting fields + last 3 queries for personalized suggestions
        {
          _id: 1,
          plan: 1,
          searchesToday: 1,
          searchDateReset: 1,
          searchesThisMonth: 1,
          searchMonthReset: 1,
          "searchHistory": { $slice: 3 }, // last 3 queries for personalization
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
      const rawPapers = (await searchAll(q)) as PaperRow[];
      // Enrich top 3 open-access papers with full-text URL hints
      papers = (await enrichWithFullText(rawPapers as any, 3)) as PaperRow[];
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
        // Merge guaranteed foundational papers, deduplicating against retrieved papers
        const guaranteedPaperObjects = getGuaranteedPaperObjects(q);
        const retrievedTitles = new Set(
          papers.map(p => p.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 50))
        );
        const dedupedGuaranteed = guaranteedPaperObjects.filter(gp => {
          const key = gp.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 50);
          return !retrievedTitles.has(key);
        });
        // Guaranteed papers go FIRST so REF-1 = guaranteed[0], REF-2 = guaranteed[1], etc.
        // matching the buildPrompt numbering scheme
        const allPapers = [...dedupedGuaranteed, ...papers];

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
            model: "claude-sonnet-4-6",
            max_tokens: 4000,
            system: SYSTEM,
            messages: [{ role: "user", content: await buildPrompt(q, papers) }],
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

        // Send only papers that were actually cited in the answer (REF-N markers)
        const citedIndices = new Set<number>();
        const refMatches = fullAnswer.matchAll(/\[REF-(\d+)\]/g);
        for (const m of refMatches) {
          citedIndices.add(parseInt(m[1], 10) - 1); // convert to 0-based
        }
        const citedPapers = citedIndices.size > 0
          ? allPapers.filter((_, i) => citedIndices.has(i))
          : allPapers.slice(0, 6); // fallback: first 6 if no REF markers found
        send({ type: "papers", papers: citedPapers });

        // Generate personalized related questions using user's search history
        const recentHistory = (u?.searchHistory ?? [])
          .slice(0, 3)
          .map((h: { query: string }) => h.query)
          .filter((hq: string) => hq !== q);
        const relatedQuestions = await generateRelatedQuestions(q, recentHistory).catch(() => []);
        send({ type: "done", fromCache, conversationId, related: relatedQuestions });
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
