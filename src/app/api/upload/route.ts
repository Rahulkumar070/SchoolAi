import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { ChatMessage } from "@/types";
import Anthropic from "@anthropic-ai/sdk";

const ant = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PDF_PROMPT = `You are Researchly's PDF Assistant — the world's best academic paper reader and explainer.

YOUR RULES:
1. Read the PDF document provided and answer based ONLY on its content
2. Quote relevant passages directly using "quote" format when they support your answer
3. If something is NOT in the document, say clearly: "This document doesn't cover [topic]"
4. For complex questions: use clear ## headings to structure your answer
5. For simple questions: give a direct, concise answer
6. If asked to summarize: cover Title, Abstract/Purpose, Methods, Key Findings, and Conclusions
7. Always be specific — mention actual numbers, names, dates from the paper
8. Make complex research accessible — explain jargon clearly
9. If asked about limitations, methodology, or future work — look for those specific sections
10. Be the world's best research paper explainer — accurate, clear, and genuinely helpful`;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  try {
    await connectDB();
    const u = (await UserModel.findOne({
      email: session.user.email,
    }).lean()) as { plan?: string } | null;
    const plan = u?.plan ?? "free";

    if (plan === "free") {
      return NextResponse.json(
        {
          error:
            "PDF Chat is available on Student (₹199/mo) and Pro (₹499/mo) plans. Upgrade to access this feature.",
        },
        { status: 403 },
      );
    }

    const { question, pdfText, history } = (await req.json()) as {
      question: string;
      pdfText: string;
      history: ChatMessage[];
    };

    if (!question?.trim() || !pdfText)
      return NextResponse.json(
        { error: "Question and PDF required" },
        { status: 400 },
      );

    // Build history messages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const historyMsgs: any[] = history.slice(-6).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const isBase64PDF = pdfText.startsWith("__PDF_BASE64__");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let userContent: any;

    if (isBase64PDF) {
      const base64Data = pdfText.replace("__PDF_BASE64__", "");
      userContent = [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: base64Data,
          },
        },
        { type: "text", text: question },
      ];
    } else {
      userContent = question;
    }

    const r = await ant.messages.create({
      model: isBase64PDF ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: isBase64PDF
        ? PDF_PROMPT
        : `${PDF_PROMPT}\n\nDOCUMENT CONTENT:\n${pdfText.slice(0, 14000)}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [...historyMsgs, { role: "user", content: userContent }] as any,
    });

    const b = r.content[0];
    const answer = b.type === "text" ? b.text : "";
    return NextResponse.json({ answer });
  } catch (e) {
    console.error("PDF chat error:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Chat failed" },
      { status: 500 },
    );
  }
}
