import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchAll } from "@/lib/papers";
import { generateReview } from "@/lib/ai";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  try {
    const { topic } = (await req.json()) as { topic: string };
    if (!topic?.trim())
      return NextResponse.json({ error: "Topic required" }, { status: 400 });

    await connectDB();
    const u = await UserModel.findOne({ email: session.user.email });
    const plan = u?.plan ?? "free";

    // ── PLAN GATE: paid feature only ──
    if (plan === "free") {
      return NextResponse.json(
        {
          error:
            "Literature Review is available on Student (₹199/mo) and Pro (₹499/mo) plans.",
        },
        { status: 403 },
      );
    }

    const papers = await searchAll(topic.trim());
    if (!papers.length)
      return NextResponse.json(
        { error: "No papers found for this topic." },
        { status: 404 },
      );

    const review = await generateReview(topic.trim(), papers);

    // ── SAVE TO REVIEW HISTORY ──
    // Update existing entry if same topic, else add new one
    const now = new Date();
    const existingIdx = (u?.reviewHistory ?? []).findIndex(
      (h: { topic: string }) =>
        h.topic.toLowerCase() === topic.trim().toLowerCase(),
    );

    if (existingIdx !== -1) {
      await UserModel.findByIdAndUpdate(u!._id, {
        $set: {
          [`reviewHistory.${existingIdx}.review`]: review,
          [`reviewHistory.${existingIdx}.papers`]: papers,
          [`reviewHistory.${existingIdx}.reviewedAt`]: now,
        },
      });
    } else {
      await UserModel.findByIdAndUpdate(u!._id, {
        $push: {
          reviewHistory: {
            $each: [{ topic: topic.trim(), review, papers, reviewedAt: now }],
            $position: 0,
            $slice: 20,
          },
        },
      });
    }

    return NextResponse.json({ review, papers, topic });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Failed" },
      { status: 500 },
    );
  }
}
