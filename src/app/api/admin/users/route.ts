import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "rk035199@gmail.com";

// GET — list users with optional search/filter
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.email !== ADMIN_EMAIL)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const plan = searchParams.get("plan") ?? "all";
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = 20;

  await connectDB();

  const filter: Record<string, unknown> = {};
  if (search) filter.email = { $regex: search, $options: "i" };
  if (plan !== "all") filter.plan = plan;

  const [users, total] = await Promise.all([
    UserModel.find(filter, {
      email: 1,
      name: 1,
      image: 1,
      plan: 1,
      subscriptionStatus: 1,
      planExpiresAt: 1,
      searchesToday: 1,
      searchesThisMonth: 1,
      lastActiveAt: 1,
      createdAt: 1,
      savedPapers: { $slice: 0 }, // just count
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    UserModel.countDocuments(filter),
  ]);

  return NextResponse.json({
    users,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}

// PATCH — update a user's plan
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.email !== ADMIN_EMAIL)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email, plan } = (await req.json()) as { email: string; plan: string };
  if (!email || !["free", "student", "pro"].includes(plan))
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  await connectDB();
  await UserModel.findOneAndUpdate({ email }, { plan });
  return NextResponse.json({ ok: true });
}

// DELETE — remove a user
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.email !== ADMIN_EMAIL)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email } = (await req.json()) as { email: string };
  if (!email)
    return NextResponse.json({ error: "Email required" }, { status: 400 });

  await connectDB();
  await UserModel.deleteOne({ email });
  return NextResponse.json({ ok: true });
}
