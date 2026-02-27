import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchAll } from "@/lib/papers";
import { generateAnswer } from "@/lib/ai";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";

export async function POST(req: NextRequest) {
  try {
    const { query } = (await req.json()) as { query: string };
    if (!query?.trim() || query.trim().length < 3)
      return NextResponse.json({ error: "Query too short" }, { status: 400 });

    const session = await getServerSession(authOptions);
    if (session?.user?.email) {
      await connectDB();
      const now = new Date();

      // Find or create user — avoids "no matching document" version errors
      let u = await UserModel.findOne({ email: session.user.email });
      if (!u) {
        u = await UserModel.create({
          email: session.user.email,
          name: session.user.name ?? "",
          image: session.user.image ?? "",
          searchesToday: 0,
          searchDateReset: now,
          searchHistory: [],
        });
      }

      // Reset count if new day
      if (now.toDateString() !== new Date(u.searchDateReset).toDateString()) {
        u.searchesToday = 0;
        u.searchDateReset = now;
      }

      // Enforce free limit
      if (u.plan === "free" && u.searchesToday >= 10) {
        return NextResponse.json(
          {
            error:
              "Daily limit reached (10/day on free plan). Upgrade for unlimited searches.",
          },
          { status: 429 },
        );
      }

      // Use findByIdAndUpdate to avoid Mongoose version conflicts entirely
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
