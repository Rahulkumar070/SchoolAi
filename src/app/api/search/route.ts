import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchAll } from "@/lib/papers";
import { generateAnswer } from "@/lib/ai";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { CacheModel } from "@/models/Cache";
import { getCachedResult, saveToCache } from "@/lib/cache";

// ── Limits ──────────────────────────────────────────────
const GUEST_DAILY_LIMIT = 2; // not logged in
const FREE_DAILY_LIMIT = 5; // logged in, free plan
const STUDENT_MONTHLY_LIMIT = 500; // paid student plan
// Pro = unlimited

export async function POST(req: NextRequest) {
  try {
    const { query } = (await req.json()) as { query: string };
    if (!query?.trim() || query.trim().length < 3)
      return NextResponse.json({ error: "Query too short" }, { status: 400 });

    const q = query.trim();
    const session = await getServerSession(authOptions);
    await connectDB();

    // ── Check global cache first (saves API cost) ──────────
    const cached = await getCachedResult(q);

    // ══════════════════════════════════════════════════════
    // LOGGED IN USER
    // ══════════════════════════════════════════════════════
    if (session?.user?.email) {
      const now = new Date();

      let u = await UserModel.findOne({ email: session.user.email });
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

      const plan = u.plan ?? "free";

      // ── Check plan limits ────────────────────────────────
      if (plan === "free") {
        // Reset daily counter if new day
        if (
          now.toDateString() !==
          new Date(u.searchDateReset ?? now).toDateString()
        ) {
          u.searchesToday = 0;
          u.searchDateReset = now;
        }
        if (u.searchesToday >= FREE_DAILY_LIMIT) {
          return NextResponse.json(
            {
              error: `You've used all ${FREE_DAILY_LIMIT} free searches today. Upgrade to Student plan for 500 searches/month at ₹199.`,
            },
            { status: 429 },
          );
        }
      } else if (plan === "student") {
        // Reset monthly counter if new month
        const rd = new Date(u.searchMonthReset ?? now);
        if (
          now.getMonth() !== rd.getMonth() ||
          now.getFullYear() !== rd.getFullYear()
        ) {
          u.searchesThisMonth = 0;
          u.searchMonthReset = now;
        }
        if (u.searchesThisMonth >= STUDENT_MONTHLY_LIMIT) {
          return NextResponse.json(
            {
              error: `You've used all ${STUDENT_MONTHLY_LIMIT} searches this month. Upgrade to Pro for unlimited searches at ₹499.`,
            },
            { status: 429 },
          );
        }
      }
      // plan === "pro" → no limit check, falls through

      // ── Get answer ──────────────────────────────────────
      let answer: string;
      let papers: unknown[];

      if (cached) {
        answer = cached.answer;
        papers = cached.papers;
      } else {
        const fetchedPapers = await searchAll(q);
        if (!fetchedPapers.length)
          return NextResponse.json(
            { error: "No papers found. Try different keywords." },
            { status: 404 },
          );
        answer = await generateAnswer(q, fetchedPapers);
        papers = fetchedPapers;
        void saveToCache(q, answer, papers);
      }

      // ── Update counter ──────────────────────────────────
      const counterUpdate: Record<string, unknown> = {};
      if (plan === "free") {
        counterUpdate.searchesToday = (u.searchesToday ?? 0) + 1;
        counterUpdate.searchDateReset = u.searchDateReset;
      } else if (plan === "student") {
        counterUpdate.searchesThisMonth = (u.searchesThisMonth ?? 0) + 1;
        counterUpdate.searchMonthReset = u.searchMonthReset;
      }
      // pro: no counter needed

      // ── Save to history (no duplicates) ─────────────────
      const existingIdx = (u.searchHistory ?? []).findIndex(
        (h: { query: string }) => h.query.toLowerCase() === q.toLowerCase(),
      );

      if (existingIdx !== -1) {
        await UserModel.findByIdAndUpdate(u._id, {
          $set: {
            ...counterUpdate,
            [`searchHistory.${existingIdx}.answer`]: answer,
            [`searchHistory.${existingIdx}.papers`]: papers,
            [`searchHistory.${existingIdx}.searchedAt`]: now,
          },
        });
      } else {
        await UserModel.findByIdAndUpdate(u._id, {
          $set: counterUpdate,
          $push: {
            searchHistory: {
              $each: [{ query: q, answer, papers, searchedAt: now }],
              $position: 0,
              $slice: 50,
            },
          },
        });
      }

      return NextResponse.json({
        papers,
        answer,
        query: q,
        fromCache: !!cached,
      });
    }

    // ══════════════════════════════════════════════════════
    // GUEST USER (not logged in) — limit 2/day by IP
    // ══════════════════════════════════════════════════════
    const ip = (req.headers.get("x-forwarded-for") ?? "unknown")
      .split(",")[0]
      .trim();
    const guestKey = `guest:${ip}`;
    const today = new Date().toDateString();
    const guestDocKey = `${guestKey}:${today}`; // resets each day automatically

    const guestDoc = (await CacheModel.findOne({
      query: guestDocKey,
    }).lean()) as { answer?: string } | null;
    const guestCount = guestDoc ? parseInt(guestDoc.answer ?? "0", 10) : 0;

    if (guestCount >= GUEST_DAILY_LIMIT) {
      return NextResponse.json(
        {
          error: `Guest limit reached (${GUEST_DAILY_LIMIT}/day). Sign in free to get 5 searches every day — no credit card needed.`,
        },
        { status: 429 },
      );
    }

    // Increment guest count
    await CacheModel.findOneAndUpdate(
      { query: guestDocKey },
      {
        query: guestDocKey,
        answer: String(guestCount + 1),
        papers: [],
        createdAt: new Date(),
      },
      { upsert: true },
    );

    // Serve from cache or generate
    if (cached)
      return NextResponse.json({
        papers: cached.papers,
        answer: cached.answer,
        query: q,
        fromCache: true,
      });
    const fp = await searchAll(q);
    if (!fp.length)
      return NextResponse.json({ error: "No papers found." }, { status: 404 });
    const ans = await generateAnswer(q, fp);
    void saveToCache(q, ans, fp);
    return NextResponse.json({
      papers: fp,
      answer: ans,
      query: q,
      fromCache: false,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Search failed" },
      { status: 500 },
    );
  }
}
