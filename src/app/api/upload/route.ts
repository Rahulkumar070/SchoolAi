import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { ChatMessage } from "@/types";
import Anthropic from "@anthropic-ai/sdk";

const ant = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const STUDENT_PDF_LIMIT = 20;

const PDF_SYSTEM = `You are Researchly's PDF Assistant — an expert at reading and explaining academic documents.

YOUR RULES:
1. Answer based ONLY on the document content provided
2. Quote relevant passages directly using "quote" format when they support your answer
3. If something is NOT in the document, say: "This document doesn't cover [topic]. It focuses on [X]. Try asking about [Y]."
4. For complex questions: use clear ## headings to structure your answer
5. For simple questions: give a direct 1-2 sentence answer first, then expand
6. If asked to summarize: cover Purpose, Methods, Key Findings, and Conclusions in order
7. Always mention which section your answer comes from (e.g. "According to the Methods section...")
8. Start every response with "Based on this document..." or "The paper states..." or "According to [section]..."
9. At the end of each answer, suggest 2 follow-up questions the user might want to ask
10. Never say "I don't know" — if info isn't in the doc, suggest what the user SHOULD ask instead`;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  try {
    await connectDB();
    const u = await UserModel.findOne({ email: session.user.email });
    const plan = u?.plan ?? "free";

    // ── Free plan — locked ────────────────────────────────────
    if (plan === "free") {
      return NextResponse.json(
        {
          error:
            "PDF Chat is available on Student (₹199/mo) and Pro (₹499/mo) plans.",
        },
        { status: 403 },
      );
    }

    // ── Student plan — 20 uploads/month ──────────────────────
    if (plan === "student") {
      const now = new Date();
      const lastReset = u?.pdfUploadMonthReset
        ? new Date(u.pdfUploadMonthReset)
        : new Date(0);
      const isNewMonth =
        now.getMonth() !== lastReset.getMonth() ||
        now.getFullYear() !== lastReset.getFullYear();

      if (isNewMonth) {
        await UserModel.updateOne(
          { email: session.user.email },
          { pdfUploadsThisMonth: 0, pdfUploadMonthReset: now },
        );
        u.pdfUploadsThisMonth = 0;
      }

      if ((u?.pdfUploadsThisMonth ?? 0) >= STUDENT_PDF_LIMIT) {
        return NextResponse.json(
          {
            error: `Monthly PDF limit reached (${STUDENT_PDF_LIMIT}/month). Upgrade to Pro ₹499/mo for unlimited.`,
          },
          { status: 429 },
        );
      }

      await UserModel.updateOne(
        { email: session.user.email },
        { $inc: { pdfUploadsThisMonth: 1 } },
      );
    }

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

    const messages: { role: "user" | "assistant"; content: string }[] = [
      ...history
        .slice(-6)
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      { role: "user", content: question },
    ];

    const uploadsUsed = (u?.pdfUploadsThisMonth ?? 0) + 1;
    const remaining =
      plan === "student" ? Math.max(0, STUDENT_PDF_LIMIT - uploadsUsed) : null;

    // ── SSE Streaming response ────────────────────────────────
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(obj)}\n\n`),
          );

        try {
          const streamResp = await ant.messages.stream({
            model: "claude-haiku-4-5-20251001", // Haiku is fine for PDF chat — faster
            max_tokens: 1800,
            system: `${PDF_SYSTEM}\n\n--- DOCUMENT CONTENT ---\n${cleanText.slice(0, 40000)}\n--- END DOCUMENT ---`,
            messages,
          });

          for await (const event of streamResp) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              send({ type: "text", text: event.delta.text });
            }
          }

          send({ type: "done", remaining });
        } catch (e) {
          send({
            type: "error",
            message: (e as Error).message || "Chat failed",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    const err = e as { status?: number; message?: string };
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
