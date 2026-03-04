import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { ConversationModel } from "@/models/Conversation";
import { MessageModel } from "@/models/Message";
import mongoose from "mongoose";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = params;
    if (!mongoose.isValidObjectId(id))
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    await connectDB();

    const user = (await UserModel.findOne({
      email: session.user.email,
    }).lean()) as { _id: unknown } | null;
    if (!user)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    const conversation = (await ConversationModel.findOne({
      _id: id,
      userId: user._id,
    }).lean()) as {
      _id: { toString(): string };
      title: string;
      updatedAt: Date;
    } | null;

    if (!conversation)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const messages = (await MessageModel.find({
      conversationId: id,
      userId: user._id,
    })
      .sort({ createdAt: 1 })
      .lean()) as unknown as {
      _id: { toString(): string };
      role: string;
      content: string;
      papers?: unknown[];
      createdAt: Date;
    }[];

    return NextResponse.json({
      conversation: {
        _id: conversation._id.toString(),
        title: conversation.title,
        updatedAt: conversation.updatedAt,
      },
      messages: messages.map((m) => ({
        _id: m._id.toString(),
        role: m.role,
        content: m.content,
        papers: m.papers ?? [],
        createdAt: m.createdAt,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
