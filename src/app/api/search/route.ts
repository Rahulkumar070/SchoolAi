import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchAll } from "@/lib/papers";
import { generateAnswer } from "@/lib/ai";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { getCachedResult, saveToCache } from "@/lib/cache";

// ── Plan limits ───────────────────────────────
const FREE_DAILY_LIMIT = 5;
const STUDENT_MONTHLY_LIMIT = 500;

export async function POST(req: NextRequest) {
  try {
    const { query } = (await req.json()) as { query: string };
    if (!query?.trim() || query.trim().length < 3)
      return NextResponse.json({ error: "Query too short" }, { status: 400 });

    const q = query.trim();
    const session = await getServerSession(authOptions);

    // ── STEP 1: Check cache FIRST (before any DB user lookup) ──
    const cached = await getCachedResult(q);

    if (session?.user?.email) {
      await connectDB();
      const now = new Date();

      // Find or create user
      let u = await UserModel.findOne({ email: session.user.email });
      if (!u) {
        u = await UserModel.create({
          email: session.user.email,
          name: session.user.name ?? "",
          image: session.user.image ?? "",
          searchesToday: 0,
          searchDateReset: now,
          searchesThisMonth: 0,
          searchMonthReset: now,
          searchHistory: [],
        });
      }

      const plan = u.plan ?? "free";

      // ── STEP 2: Check limits ──
      if (plan === "free") {
        if (now.toDateString() !== new Date(u.searchDateReset).toDateString()) {
          u.searchesToday = 0;
          u.searchDateReset = now;
        }
        if (u.searchesToday >= FREE_DAILY_LIMIT) {
          return NextResponse.json(
            {
              error: `Daily limit reached (${FREE_DAILY_LIMIT}/day on free plan). Upgrade to Student plan for 500 searches/month.`,
            },
            { status: 429 },
          );
        }
      } else if (plan === "student") {
        const resetDate = new Date(u.searchMonthReset ?? now);
        const isNewMonth =
          now.getMonth() !== resetDate.getMonth() ||
          now.getFullYear() !== resetDate.getFullYear();
        if (isNewMonth) {
          u.searchesThisMonth = 0;
          u.searchMonthReset = now;
        }
        if (u.searchesThisMonth >= STUDENT_MONTHLY_LIMIT) {
          return NextResponse.json(
            {
              error: `Monthly limit reached (${STUDENT_MONTHLY_LIMIT}/month on Student plan). Upgrade to Pro for unlimited searches.`,
            },
            { status: 429 },
          );
        }
      }
      // Pro = no limit check needed

      // ── STEP 3: If CACHED — save history but DON'T deduct credits ──
      if (cached) {
        // Save to history + increment counter (but much cheaper — no AI call)
        const updateFields: Record<string, unknown> = {};
        if (plan === "free") {
          updateFields.searchesToday = u.searchesToday + 1;
          updateFields.searchDateReset = u.searchDateReset;
        } else if (plan === "student") {
          updateFields.searchesThisMonth = u.searchesThisMonth + 1;
          updateFields.searchMonthReset = u.searchMonthReset;
        }

        await UserModel.findByIdAndUpdate(u._id, {
          $set: updateFields,
          $push: {
            searchHistory: {
              $each: [{ query: q, searchedAt: now }],
              $position: 0,
              $slice: 50,
            },
          },
        });

        // Return cached result — NO AI API called, cost = ₹0
        return NextResponse.json({
          papers: cached.papers,
          answer: cached.answer,
          query: q,
          fromCache: true, // flag so frontend knows
        });
      }

      // ── STEP 4: Not cached — call AI API and deduct credits ──
      const updateFields: Record<string, unknown> = {};
      if (plan === "free") {
        updateFields.searchesToday = u.searchesToday + 1;
        updateFields.searchDateReset = u.searchDateReset;
      } else if (plan === "student") {
        updateFields.searchesThisMonth = u.searchesThisMonth + 1;
        updateFields.searchMonthReset = u.searchMonthReset;
      }

      await UserModel.findByIdAndUpdate(u._id, {
        $set: updateFields,
        $push: {
          searchHistory: {
            $each: [{ query: q, searchedAt: now }],
            $position: 0,
            $slice: 50,
          },
        },
      });
    } else if (cached) {
      // Unauthenticated user — still serve cache
      return NextResponse.json({
        papers: cached.papers,
        answer: cached.answer,
        query: q,
        fromCache: true,
      });
    }

    // ── STEP 5: Call AI API ──
    const papers = await searchAll(q);
    if (!papers.length)
      return NextResponse.json(
        { error: "No papers found. Try different keywords." },
        { status: 404 },
      );

    const answer = await generateAnswer(q, papers);

    // ── STEP 6: Save to cache for future users ──
    void saveToCache(q, answer, papers); // fire and forget — don't await

    return NextResponse.json({ papers, answer, query: q, fromCache: false });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Search failed" },
      { status: 500 },
    );
  }
}
