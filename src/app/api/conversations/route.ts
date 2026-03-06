import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { ConversationModel } from "@/models/Conversation";
import mongoose from "mongoose";

type UserLean = {
  _id: mongoose.Types.ObjectId;
};

type ConversationLean = {
  _id: mongoose.Types.ObjectId;
  title: string;
  updatedAt: Date;
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ conversations: [] });
    }

    await connectDB();

    const user = await UserModel.findOne({ email: session.user.email })
      .select("_id")
      .lean<UserLean | null>();

    if (!user) {
      return NextResponse.json({ conversations: [] });
    }

    const conversations = await ConversationModel.find({ userId: user._id })
      .select("title updatedAt")
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean<ConversationLean[]>();

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
