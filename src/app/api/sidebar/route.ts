import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { ConversationModel } from "@/models/Conversation";
import mongoose from "mongoose";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({
        conversations: [],
        searchesToday: 0,
        searchesThisMonth: 0,
        plan: "free",
      });
    }

    await connectDB();

    const user = (await UserModel.findOne({ email: session.user.email })
      .select(
        "_id plan searchesToday searchDateReset searchesThisMonth searchMonthReset",
      )
      .lean()) as {
      _id: mongoose.Types.ObjectId;
      plan?: string;
      searchesToday?: number;
      searchDateReset?: Date;
      searchesThisMonth?: number;
      searchMonthReset?: Date;
    } | null;

    if (!user) {
      return NextResponse.json({
        conversations: [],
        searchesToday: 0,
        searchesThisMonth: 0,
        plan: "free",
      });
    }

    const conversations = await ConversationModel.find({ userId: user._id })
      .select("title updatedAt")
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean<
        { _id: mongoose.Types.ObjectId; title: string; updatedAt: Date }[]
      >();

    const now = new Date();
    const isNewDay = user.searchDateReset
      ? now.toDateString() !== new Date(user.searchDateReset).toDateString()
      : true;
    const rd = new Date(user.searchMonthReset ?? now);
    const isNewMonth =
      now.getMonth() !== rd.getMonth() ||
      now.getFullYear() !== rd.getFullYear();

    return NextResponse.json({
      conversations: conversations.map((c) => ({
        _id: c._id.toString(),
        title: c.title,
        updatedAt: c.updatedAt,
      })),
      searchesToday: isNewDay ? 0 : (user.searchesToday ?? 0),
      searchesThisMonth: isNewMonth ? 0 : (user.searchesThisMonth ?? 0),
      plan: user.plan ?? "free",
    });
  } catch {
    return NextResponse.json({
      conversations: [],
      searchesToday: 0,
      searchesThisMonth: 0,
      plan: "free",
    });
  }
}
