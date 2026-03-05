import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { FeedbackModel } from "@/models/Feedback";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { query, rating, conversationId } = (await req.json()) as {
      query: string;
      rating: "up" | "down";
      conversationId?: string;
    };

    if (!query || !rating || !["up", "down"].includes(rating))
      return NextResponse.json({ error: "Invalid feedback" }, { status: 400 });

    await connectDB();

    await FeedbackModel.create({
      query,
      rating,
      conversationId: conversationId ?? null,
      userId: session?.user?.email ?? "guest",
      createdAt: new Date(),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
