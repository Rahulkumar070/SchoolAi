import { NextRequest, NextResponse } from "next/server";
import { generatePDFStarterQuestions } from "@/lib/ai";

export async function POST(req: NextRequest) {
  try {
    const { title } = (await req.json()) as { title: string };
    if (!title?.trim()) return NextResponse.json({ questions: [] });

    const questions = await generatePDFStarterQuestions(title.trim());
    return NextResponse.json({ questions });
  } catch {
    return NextResponse.json({ questions: [] });
  }
}
