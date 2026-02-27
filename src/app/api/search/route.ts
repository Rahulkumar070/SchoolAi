import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchAll } from "@/lib/papers";
import { generateAnswer } from "@/lib/ai";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json() as { query: string };
    if (!query?.trim() || query.trim().length < 3) return NextResponse.json({ error: "Query too short" }, { status:400 });

    const session = await getServerSession(authOptions);
    if (session?.user?.email) {
      await connectDB();
      const u = await UserModel.findOne({ email: session.user.email });
      if (u) {
        const now = new Date();
        if (now.toDateString() !== new Date(u.searchDateReset).toDateString()) { u.searchesToday = 0; u.searchDateReset = now; }
        if (u.plan === "free" && u.searchesToday >= 10) return NextResponse.json({ error: "Daily limit reached (10/day on free plan). Sign in or upgrade." }, { status:429 });
        u.searchesToday += 1;
        u.searchHistory.unshift({ query: query.trim(), searchedAt: now });
        if (u.searchHistory.length > 50) u.searchHistory.length = 50;
        await u.save();
      }
    }

    const papers = await searchAll(query.trim());
    if (!papers.length) return NextResponse.json({ error: "No papers found. Try different keywords." }, { status:404 });
    const answer = await generateAnswer(query.trim(), papers);
    return NextResponse.json({ papers, answer, query });
  } catch (e) { return NextResponse.json({ error: (e as Error).message || "Search failed" }, { status:500 }); }
}
