import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { Paper } from "@/types";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const u = (await UserModel.findOne({ email: session.user.email }).lean()) as {
    savedPapers?: unknown[];
  } | null;
  return NextResponse.json({ papers: u?.savedPapers ?? [] });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const p = (await req.json()) as Paper;
  await connectDB();
  const u = await UserModel.findOne({ email: session.user.email });
  if (!u)
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  const idx = u.savedPapers.findIndex(
    (sp: { paperId: string }) => sp.paperId === p.id,
  );
  if (idx !== -1) {
    u.savedPapers.splice(idx, 1);
    await u.save();
    return NextResponse.json({ saved: false });
  }
  u.savedPapers.unshift({
    paperId: p.id,
    title: p.title,
    authors: p.authors,
    year: p.year,
    journal: p.journal,
    doi: p.doi,
    url: p.url,
    abstract: p.abstract?.slice(0, 350),
    savedAt: new Date(),
  });
  await u.save();
  return NextResponse.json({ saved: true });
}
