import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { FeedbackModel } from "@/models/Feedback";
import { CacheModel } from "@/models/Cache";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "rk035199@gmail.com";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.email !== ADMIN_EMAIL)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    freeUsers,
    studentUsers,
    proUsers,
    newToday,
    newThisWeek,
    activeToday,
    activeThisMonth,
    thumbsDown,
    thumbsUp,
    cacheCount,
    topQueries,
    recentFeedback,
    cancelledSubs,
    haltedSubs,
  ] = await Promise.all([
    UserModel.countDocuments(),
    UserModel.countDocuments({ plan: "free" }),
    UserModel.countDocuments({ plan: "student" }),
    UserModel.countDocuments({ plan: "pro" }),
    UserModel.countDocuments({ createdAt: { $gte: todayStart } }),
    UserModel.countDocuments({ createdAt: { $gte: weekStart } }),
    UserModel.countDocuments({ lastActiveAt: { $gte: todayStart } }),
    UserModel.countDocuments({ lastActiveAt: { $gte: monthStart } }),
    FeedbackModel.countDocuments({ rating: "down" }),
    FeedbackModel.countDocuments({ rating: "up" }),
    CacheModel.countDocuments(),
    CacheModel.find({}, { originalQuery: 1, usageCount: 1, _id: 0 })
      .sort({ usageCount: -1 })
      .limit(10)
      .lean(),
    FeedbackModel.find({ rating: "down" })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean<{ query: string; userId: string; createdAt: Date }[]>(),
    UserModel.countDocuments({ subscriptionStatus: "cancelled" }),
    UserModel.countDocuments({ subscriptionStatus: "halted" }),
  ]);

  const estimatedRevenue = studentUsers * 199 + proUsers * 499;

  return NextResponse.json({
    users: {
      total: totalUsers,
      free: freeUsers,
      student: studentUsers,
      pro: proUsers,
      newToday,
      newThisWeek,
      activeToday,
      activeThisMonth,
    },
    revenue: {
      estimated: estimatedRevenue,
      student: studentUsers * 199,
      pro: proUsers * 499,
    },
    feedback: {
      thumbsUp,
      thumbsDown,
      satisfactionRate:
        thumbsUp + thumbsDown > 0
          ? Math.round((thumbsUp / (thumbsUp + thumbsDown)) * 100)
          : 0,
    },
    cache: { count: cacheCount, topQueries },
    subscriptions: { cancelled: cancelledSubs, halted: haltedSubs },
    recentComplaints: recentFeedback,
  });
}
