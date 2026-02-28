import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email)
      return NextResponse.json({
        history: [],
        reviewHistory: [],
        searchesToday: 0,
        searchesThisMonth: 0,
      });

    await connectDB();
    const u = (await UserModel.findOne({
      email: session.user.email,
    }).lean()) as {
      plan?: string;
      searchHistory?: {
        query: string;
        answer?: string;
        papers?: unknown[];
        searchedAt: Date;
      }[];
      reviewHistory?: {
        topic: string;
        review?: string;
        papers?: unknown[];
        reviewedAt: Date;
      }[];
      searchesToday?: number;
      searchDateReset?: Date;
      searchesThisMonth?: number;
      searchMonthReset?: Date;
    } | null;

    if (!u)
      return NextResponse.json({
        history: [],
        reviewHistory: [],
        searchesToday: 0,
        searchesThisMonth: 0,
      });

    const now = new Date();
    const isNewDay = u.searchDateReset
      ? now.toDateString() !== new Date(u.searchDateReset).toDateString()
      : true;
    const rd = new Date(u.searchMonthReset ?? now);
    const isNewMonth =
      now.getMonth() !== rd.getMonth() ||
      now.getFullYear() !== rd.getFullYear();

    return NextResponse.json({
      history: (u.searchHistory ?? []).map((h) => ({
        query: h.query,
        answer: h.answer ?? "",
        papers: h.papers ?? [],
        searchedAt: h.searchedAt,
      })),
      reviewHistory: (u.reviewHistory ?? []).map((r) => ({
        topic: r.topic,
        review: r.review ?? "",
        papers: r.papers ?? [],
        reviewedAt: r.reviewedAt,
      })),
      searchesToday: isNewDay ? 0 : (u.searchesToday ?? 0),
      searchesThisMonth: isNewMonth ? 0 : (u.searchesThisMonth ?? 0),
      plan: u.plan ?? "free",
    });
  } catch {
    return NextResponse.json({
      history: [],
      reviewHistory: [],
      searchesToday: 0,
      searchesThisMonth: 0,
    });
  }
}
