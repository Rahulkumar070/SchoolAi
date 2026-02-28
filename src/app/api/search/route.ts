import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchAll } from "@/lib/papers";
import { generateAnswer } from "@/lib/ai";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";

// Plan limits
const LIMITS = {
  free: { type: "daily", max: 5 },
  student: { type: "monthly", max: 500 },
  pro: { type: "none", max: 0 }, // unlimited
};

export async function POST(req: NextRequest) {
  try {
    const { query } = (await req.json()) as { query: string };
    if (!query?.trim() || query.trim().length < 3)
      return NextResponse.json({ error: "Query too short" }, { status: 400 });

    const session = await getServerSession(authOptions);
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
      const limit = LIMITS[plan as keyof typeof LIMITS] ?? LIMITS.free;

      // ── FREE plan — daily reset ──
      if (plan === "free") {
        if (now.toDateString() !== new Date(u.searchDateReset).toDateString()) {
          u.searchesToday = 0;
          u.searchDateReset = now;
        }
        if (u.searchesToday >= 5) {
          return NextResponse.json(
            {
              error:
                "Daily limit reached (5/day on free plan). Upgrade to Student plan for 500 searches/month.",
            },
            { status: 429 },
          );
        }
        await UserModel.findByIdAndUpdate(u._id, {
          $set: {
            searchesToday: u.searchesToday + 1,
            searchDateReset: u.searchDateReset,
          },
          $push: {
            searchHistory: {
              $each: [{ query: query.trim(), searchedAt: now }],
              $position: 0,
              $slice: 50,
            },
          },
        });
      }

      // ── STUDENT plan — monthly reset ──
      else if (plan === "student") {
        const resetDate = new Date(u.searchMonthReset);
        const isNewMonth =
          now.getMonth() !== resetDate.getMonth() ||
          now.getFullYear() !== resetDate.getFullYear();
        if (isNewMonth) {
          u.searchesThisMonth = 0;
          u.searchMonthReset = now;
        }
        if (u.searchesThisMonth >= 500) {
          return NextResponse.json(
            {
              error:
                "Monthly limit reached (500/month on Student plan). Upgrade to Pro for unlimited searches.",
            },
            { status: 429 },
          );
        }
        await UserModel.findByIdAndUpdate(u._id, {
          $set: {
            searchesThisMonth: u.searchesThisMonth + 1,
            searchMonthReset: u.searchMonthReset,
          },
          $push: {
            searchHistory: {
              $each: [{ query: query.trim(), searchedAt: now }],
              $position: 0,
              $slice: 50,
            },
          },
        });
      }

      // ── PRO plan — unlimited, just save history ──
      else {
        await UserModel.findByIdAndUpdate(u._id, {
          $push: {
            searchHistory: {
              $each: [{ query: query.trim(), searchedAt: now }],
              $position: 0,
              $slice: 50,
            },
          },
        });
      }
    }

    const papers = await searchAll(query.trim());
    if (!papers.length)
      return NextResponse.json(
        { error: "No papers found. Try different keywords." },
        { status: 404 },
      );

    const answer = await generateAnswer(query.trim(), papers);
    return NextResponse.json({ papers, answer, query });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Search failed" },
      { status: 500 },
    );
  }
}
