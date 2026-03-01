import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { chatPDF } from "@/lib/ai";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { ChatMessage } from "@/types";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  try {
    await connectDB();
    const u = await UserModel.findOne({ email: session.user.email }).lean() as { plan?: string } | null;
    const plan = u?.plan ?? "free";

    // PDF Chat is a PAID feature — student and pro only
    if (plan === "free") {
      return NextResponse.json(
        { error: "PDF Chat is available on Student (₹199/mo) and Pro (₹499/mo) plans. Upgrade to access this feature." },
        { status: 403 }
      );
    }

    const { question, pdfText, history } = await req.json() as {
      question: string; pdfText: string; history: ChatMessage[];
    };
    if (!question?.trim() || !pdfText)
      return NextResponse.json({ error: "Question and PDF text required" }, { status: 400 });

    const answer = await chatPDF(question, pdfText, history ?? []);
    return NextResponse.json({ answer });

  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Chat failed" }, { status: 500 });
  }
}
