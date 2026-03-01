import { NextRequest, NextResponse } from "next/server";
import { getServerSession }          from "next-auth";
import { authOptions }               from "@/lib/auth";
import { searchAll }                 from "@/lib/papers";
import { generateAnswer }            from "@/lib/ai";
import { connectDB }                 from "@/lib/mongodb";
import { UserModel }                 from "@/models/User";
import { getCachedResult, saveToCache } from "@/lib/cache";

const FREE_DAILY_LIMIT      = 5;
const STUDENT_MONTHLY_LIMIT = 500;

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json() as { query: string };
    if (!query?.trim() || query.trim().length < 3)
      return NextResponse.json({ error: "Query too short" }, { status: 400 });

    const q       = query.trim();
    const session = await getServerSession(authOptions);

    // ── STEP 1: Check global cache ──
    const cached = await getCachedResult(q);

    if (session?.user?.email) {
      await connectDB();
      const now = new Date();

      let u = await UserModel.findOne({ email: session.user.email });
      if (!u) {
        u = await UserModel.create({
          email: session.user.email,
          name:  session.user.name  ?? "",
          image: session.user.image ?? "",
          searchesToday: 0,     searchDateReset:   now,
          searchesThisMonth: 0, searchMonthReset:  now,
          searchHistory: [],
        });
      }

      const plan = u.plan ?? "free";

      // ── STEP 2: Check limits ──
      if (plan === "free") {
        if (now.toDateString() !== new Date(u.searchDateReset).toDateString()) {
          u.searchesToday = 0; u.searchDateReset = now;
        }
        if (u.searchesToday >= FREE_DAILY_LIMIT) {
          return NextResponse.json(
            { error: `You've used all ${FREE_DAILY_LIMIT} free searches today. Upgrade to Student plan for 500 searches/month at ₹199.` },
            { status: 429 }
          );
        }
      } else if (plan === "student") {
        const rd = new Date(u.searchMonthReset ?? now);
        if (now.getMonth() !== rd.getMonth() || now.getFullYear() !== rd.getFullYear()) {
          u.searchesThisMonth = 0; u.searchMonthReset = now;
        }
        if (u.searchesThisMonth >= STUDENT_MONTHLY_LIMIT) {
          return NextResponse.json(
            { error: `You've used all ${STUDENT_MONTHLY_LIMIT} searches this month. Upgrade to Pro for unlimited searches at ₹499.` },
            { status: 429 }
          );
        }
      }

      // ── STEP 3: Get answer (cache or AI) ──
      let answer: string;
      let papers: unknown[];

      if (cached) {
        answer = cached.answer;
        papers = cached.papers;
      } else {
        const fetchedPapers = await searchAll(q);
        if (!fetchedPapers.length)
          return NextResponse.json({ error: "No papers found. Try different keywords." }, { status: 404 });
        answer = await generateAnswer(q, fetchedPapers);
        papers = fetchedPapers;
        void saveToCache(q, answer, papers);
      }

      // ── STEP 4: Update counter ──
      const counterUpdate: Record<string, unknown> = {};
      if (plan === "free") {
        counterUpdate.searchesToday   = u.searchesToday + 1;
        counterUpdate.searchDateReset = u.searchDateReset;
      } else if (plan === "student") {
        counterUpdate.searchesThisMonth = u.searchesThisMonth + 1;
        counterUpdate.searchMonthReset  = u.searchMonthReset;
      }

      // ── STEP 5: Check if this exact query already exists in history ──
      // If yes → UPDATE that entry with latest answer (don't create duplicate)
      // If no  → ADD new entry at top
      const existingIdx = (u.searchHistory ?? []).findIndex(
        (h: { query: string }) => h.query.toLowerCase() === q.toLowerCase()
      );

      if (existingIdx !== -1) {
        // Update existing history entry with fresh answer + timestamp
        // Using positional operator to update specific array element
        const historyKey = `searchHistory.${existingIdx}`;
        await UserModel.findByIdAndUpdate(u._id, {
          $set: {
            ...counterUpdate,
            [`${historyKey}.answer`]:     answer,
            [`${historyKey}.papers`]:     papers,
            [`${historyKey}.searchedAt`]: now,
          },
        });
      } else {
        // New query — add to front, keep max 50
        await UserModel.findByIdAndUpdate(u._id, {
          $set:  counterUpdate,
          $push: {
            searchHistory: {
              $each:     [{ query: q, answer, papers, searchedAt: now }],
              $position: 0,
              $slice:    50,
            },
          },
        });
      }

      return NextResponse.json({ papers, answer, query: q, fromCache: !!cached });
    }

    // ── Unauthenticated user ──
    if (cached) return NextResponse.json({ papers: cached.papers, answer: cached.answer, query: q, fromCache: true });
    const fp = await searchAll(q);
    if (!fp.length) return NextResponse.json({ error: "No papers found." }, { status: 404 });
    const ans = await generateAnswer(q, fp);
    void saveToCache(q, ans, fp);
    return NextResponse.json({ papers: fp, answer: ans, query: q, fromCache: false });

  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Search failed" }, { status: 500 });
  }
}
