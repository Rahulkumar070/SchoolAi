import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchAll } from "@/lib/papers";
import { generateAnswer } from "@/lib/ai";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { getCachedResult, saveToCache } from "@/lib/cache";
import { checkGuestLimit } from "@/lib/guestLimit";

// ── Limits ──────────────────────────────────────────────
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
    // GUEST USER — fingerprint + cookie dual tracking
    // Survives: browser close, reopen, incognito, cookie clear
    // ══════════════════════════════════════════════════════
    const guestCheck = await checkGuestLimit(req);

    // Helper to attach cookie to any response
    const withGuestCookie = (res: NextResponse): NextResponse => {
      res.cookies.set("_rly_gid", guestCheck.fingerprintId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: "/",
      });
      return res;
    };

    if (!guestCheck.allowed) {
      return withGuestCookie(
        NextResponse.json(
          {
            error: `Guest limit reached (${guestCheck.limit}/day). Sign in free to get 5 searches every day — no credit card needed.`,
          },
          { status: 429 },
        ),
      );
    }

    // Serve from cache or generate
    if (cached) {
      return withGuestCookie(
        NextResponse.json({
          papers: cached.papers,
          answer: cached.answer,
          query: q,
          fromCache: true,
        }),
      );
    }

    const fp = await searchAll(q);
    if (!fp.length) {
      return withGuestCookie(
        NextResponse.json({ error: "No papers found." }, { status: 404 }),
      );
    }
    const ans = await generateAnswer(q, fp);
    void saveToCache(q, ans, fp);
    return withGuestCookie(
      NextResponse.json({
        papers: fp,
        answer: ans,
        query: q,
        fromCache: false,
      }),
    );
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Search failed" },
      { status: 500 },
    );
  }
}
