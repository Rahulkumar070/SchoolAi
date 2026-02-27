import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { chatPDF } from "@/lib/ai";
import { ChatMessage } from "@/types";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status:401 });
  try {
    const { question, pdfText, history } = await req.json() as { question: string; pdfText: string; history: ChatMessage[] };
    if (!question?.trim() || !pdfText) return NextResponse.json({ error: "Question and PDF text required" }, { status:400 });
    const answer = await chatPDF(question, pdfText, history ?? []);
    return NextResponse.json({ answer });
  } catch (e) { return NextResponse.json({ error: (e as Error).message || "Chat failed" }, { status:500 }); }
}
