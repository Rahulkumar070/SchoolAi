import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchAll } from "@/lib/papers";
import { generateReview } from "@/lib/ai";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const { topic } = (await req.json()) as { topic: string };
    if (!topic?.trim())
      return NextResponse.json({ error: "Topic required" }, { status: 400 });
    const papers = await searchAll(topic.trim());
    if (!papers.length)
      return NextResponse.json({ error: "No papers found" }, { status: 404 });
    const review = await generateReview(topic.trim(), papers);
    return NextResponse.json({ review, papers, topic });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Failed" },
      { status: 500 },
    );
  }
}
