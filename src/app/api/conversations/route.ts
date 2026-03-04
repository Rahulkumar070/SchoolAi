import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { ConversationModel } from "@/models/Conversation";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ conversations: [] });

    await connectDB();

    const user = (await UserModel.findOne({
      email: session.user.email,
    }).lean()) as { _id: unknown } | null;
    if (!user) return NextResponse.json({ conversations: [] });

    const conversations = (await ConversationModel.find({ userId: user._id })
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean()) as unknown as {
      _id: { toString(): string };
      title: string;
      updatedAt: Date;
    }[];

    return NextResponse.json({
      conversations: conversations.map((c) => ({
        _id: c._id.toString(),
        title: c.title,
        updatedAt: c.updatedAt,
      })),
    });
  } catch {
    return NextResponse.json({ conversations: [] });
  }
}
