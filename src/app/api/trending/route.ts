import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { CacheModel } from "@/models/Cache";

type CacheLean = {
  originalQuery: string;
  usageCount: number;
};

export async function GET() {
  try {
    await connectDB();

    // ✅ Get top 6 most-searched queries
    const top = await CacheModel.find({ usageCount: { $gte: 2 } })
      .select("originalQuery usageCount")
      .sort({ usageCount: -1 })
      .limit(6)
      .lean<CacheLean[]>();

    const queries = top.map((t) => t.originalQuery).filter(Boolean);

    // Fallback if not enough cache data yet
    if (queries.length < 4) {
      return NextResponse.json({
        queries: [
          "How does gut microbiome affect mental health?",
          "Latest breakthroughs in quantum computing",
          "CRISPR gene editing applications 2024",
          "Long COVID mechanisms and treatments",
          "Transformer architecture in deep learning",
          "Climate change impact on biodiversity",
        ],
      });
    }

    return NextResponse.json({ queries });
  } catch {
    return NextResponse.json({ queries: [] });
  }
}
