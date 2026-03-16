import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { PublicResearchModel } from "@/models/PublicResearch";

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } },
) {
  try {
    await connectDB();
    const doc = await PublicResearchModel.findOne(
      { slug: params.slug },
      { __v: 0 },
    ).lean();
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(doc);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
