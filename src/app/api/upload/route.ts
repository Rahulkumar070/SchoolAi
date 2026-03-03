import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { ChatMessage } from "@/types";
import Anthropic from "@anthropic-ai/sdk";

const ant = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const STUDENT_PDF_LIMIT = 20; // per month

const PDF_PROMPT = `You are Researchly's PDF Assistant — an expert at reading and explaining academic documents.

YOUR RULES:
1. Answer based ONLY on the document content provided
2. Quote relevant passages directly when they support your answer
3. If something is NOT in the document, say clearly: "This document doesn't cover [topic]"
4. For complex questions: use clear ## headings
5. For simple questions: give a direct concise answer
6. If asked to summarize: cover Purpose, Methods, Key Findings, and Conclusions
7. Always mention specific numbers, names, dates from the document
8. Be the world's best research paper explainer — accurate, clear, genuinely helpful`;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  try {
    await connectDB();
    const u = await UserModel.findOne({ email: session.user.email });
    const plan = u?.plan ?? "free";

    // ── Free plan — locked ───────────────────────────────────
    if (plan === "free") {
      return NextResponse.json(
        {
          error:
            "PDF Chat is available on Student (₹199/mo) and Pro (₹499/mo) plans. Upgrade to access this feature.",
        },
        { status: 403 },
      );
    }

    // ── Student plan — 20 uploads/month ─────────────────────
    if (plan === "student") {
      const now = new Date();
      const lastReset = u?.pdfUploadMonthReset
        ? new Date(u.pdfUploadMonthReset)
        : new Date(0);
      const isNewMonth =
        now.getMonth() !== lastReset.getMonth() ||
        now.getFullYear() !== lastReset.getFullYear();

      // Reset counter if new month
      if (isNewMonth) {
        await UserModel.updateOne(
          { email: session.user.email },
          { pdfUploadsThisMonth: 0, pdfUploadMonthReset: now },
        );
        u.pdfUploadsThisMonth = 0;
      }

      const uploadsThisMonth = u?.pdfUploadsThisMonth ?? 0;

      if (uploadsThisMonth >= STUDENT_PDF_LIMIT) {
        return NextResponse.json(
          {
            error: `Monthly PDF limit reached (${STUDENT_PDF_LIMIT}/month). Upgrade to Pro ₹499/mo for unlimited PDF uploads.`,
          },
          { status: 429 },
        );
      }

      // Increment counter
      await UserModel.updateOne(
        { email: session.user.email },
        { $inc: { pdfUploadsThisMonth: 1 } },
      );
    }

    // ── Pro plan — unlimited, no check needed ───────────────

    const { question, pdfText, history } = (await req.json()) as {
      question: string;
      pdfText: string;
      history: ChatMessage[];
    };

    if (!question?.trim() || !pdfText)
      return NextResponse.json(
        { error: "Question and PDF text required" },
        { status: 400 },
      );

    const cleanText = pdfText.startsWith("__PDF_BASE64__")
      ? "[PDF could not be read — please re-upload]"
      : pdfText;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [
      ...history.slice(-6).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: question },
    ];

    const r = await ant.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: `${PDF_PROMPT}\n\n--- DOCUMENT CONTENT ---\n${cleanText.slice(0, 40000)}\n--- END DOCUMENT ---`,
      messages,
    });

    const b = r.content[0];

    // Return remaining count for student plan
    const uploadsUsed = (u?.pdfUploadsThisMonth ?? 0) + 1;
    const remaining =
      plan === "student" ? Math.max(0, STUDENT_PDF_LIMIT - uploadsUsed) : null; // null = unlimited (pro)

    return NextResponse.json({
      answer: b.type === "text" ? b.text : "",
      remaining,
    });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    console.error("PDF chat error:", err);
    if (err.status === 429)
      return NextResponse.json(
        { error: "Rate limit — wait 30 seconds and try again." },
        { status: 429 },
      );
    return NextResponse.json(
      { error: err.message || "Chat failed" },
      { status: 500 },
    );
  }
}
