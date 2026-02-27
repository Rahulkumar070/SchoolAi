import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email)
      return NextResponse.json({ history: [], searchesToday: 0 });
    await connectDB();
    const u = (await UserModel.findOne({
      email: session.user.email,
    }).lean()) as {
      searchHistory?: { query: string; searchedAt: Date }[];
      searchesToday?: number;
      searchDateReset?: Date;
    } | null;
    if (!u) return NextResponse.json({ history: [], searchesToday: 0 });

    // Reset count if new day
    const isNewDay = u.searchDateReset
      ? new Date().toDateString() !== new Date(u.searchDateReset).toDateString()
      : true;
    const searchesToday = isNewDay ? 0 : (u.searchesToday ?? 0);

    return NextResponse.json({
      history: u.searchHistory ?? [],
      searchesToday,
    });
  } catch {
    return NextResponse.json({ history: [], searchesToday: 0 });
  }
}
