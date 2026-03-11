import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { Paper } from "@/types";

// ── GET: fetch saved papers ──────────────────────────────────────
// Uses .lean() + .select() — returns plain JS object, no Mongoose overhead
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();
    const u = (await UserModel.findOne({ email: session.user.email })
      .select("savedPapers")
      .lean()) as { savedPapers?: unknown[] } | null;
    return NextResponse.json(
      { papers: u?.savedPapers ?? [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ papers: [] });
  }
}

// ── POST: save a paper ───────────────────────────────────────────
// Uses atomic $push + $slice — never loads or rewrites the full document
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const p = (await req.json()) as Paper;
    await connectDB();

    const newPaper = {
      paperId: p.id,
      title: p.title,
      authors: p.authors,
      year: p.year,
      journal: p.journal ?? "",
      doi: p.doi ?? "",
      url: p.url ?? "",
      abstract: p.abstract?.slice(0, 350) ?? "",
      savedAt: new Date(),
    };

    // Single atomic op: prepend to array, cap at 200, no full-doc read
    await UserModel.updateOne(
      { email: session.user.email },
      {
        $push: {
          savedPapers: {
            $each: [newPaper],
            $position: 0,
            $slice: 200,
          },
        },
      },
    );

    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ── DELETE: remove a paper ───────────────────────────────────────
// Uses atomic $pull — never loads or rewrites the full document
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = (await req.json()) as { id: string };
    await connectDB();

    // Single atomic op: pull matching entry, no full-doc read
    await UserModel.updateOne(
      { email: session.user.email },
      { $pull: { savedPapers: { paperId: id } } },
    );

    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
