import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { BroadcastModel } from "@/models/Broadcast";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "rk035199@gmail.com";

// GET — admin: returns all active broadcasts for management panel
//       user:  returns unread broadcasts targeted at their plan
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ broadcasts: [] });

    await connectDB();

    const isAdmin = session.user.email === ADMIN_EMAIL;

    // Admin sees ALL active broadcasts (for management)
    if (isAdmin) {
      const broadcasts = await BroadcastModel.find({ active: true })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean<
          {
            _id: { toString(): string };
            title: string;
            message: string;
            type: string;
            targetPlan: string;
            createdAt: Date;
            expiresAt: Date;
            readBy: string[];
          }[]
        >();

      return NextResponse.json({
        broadcasts: broadcasts.map((b) => ({
          _id: b._id.toString(),
          title: b.title,
          message: b.message,
          type: b.type,
          targetPlan: b.targetPlan,
          createdAt: b.createdAt,
          expiresAt: b.expiresAt,
          readCount: b.readBy?.length ?? 0,
        })),
      });
    }

    // Regular user — get unread broadcasts for their plan
    const userEmail = session.user.email;
    // Cast to any to access plan which is set by our custom JWT callback
    const userPlan = (session.user as any).plan ?? "free";

    const broadcasts = await BroadcastModel.find({
      active: true,
      expiresAt: { $gt: new Date() },
      readBy: { $ne: userEmail },
      $or: [{ targetPlan: "all" }, { targetPlan: userPlan }],
    })
      .sort({ createdAt: -1 })
      .limit(3)
      .lean<
        {
          _id: { toString(): string };
          title: string;
          message: string;
          type: string;
        }[]
      >();

    return NextResponse.json({
      broadcasts: broadcasts.map((b) => ({
        _id: b._id.toString(),
        title: b.title,
        message: b.message,
        type: b.type,
      })),
    });
  } catch (e) {
    console.error("Broadcast GET error:", e);
    return NextResponse.json({ broadcasts: [] });
  }
}

// POST — create a new broadcast (admin only)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.email !== ADMIN_EMAIL)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as {
      title: string;
      message: string;
      targetPlan?: string;
      type?: string;
      expiresInDays?: number;
    };

    const { title, message, targetPlan, type, expiresInDays } = body;

    if (!title?.trim() || !message?.trim())
      return NextResponse.json(
        { error: "Title and message are required" },
        { status: 400 },
      );

    await connectDB();

    const days = Number(expiresInDays) || 7;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const broadcast = await BroadcastModel.create({
      title: title.trim(),
      message: message.trim(),
      targetPlan: targetPlan ?? "all",
      type: type ?? "info",
      sentBy: session.user.email,
      expiresAt,
    });

    return NextResponse.json({ ok: true, id: broadcast._id.toString() });
  } catch (e) {
    console.error("Broadcast POST error:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Failed to send broadcast" },
      { status: 500 },
    );
  }
}

// PATCH — dismiss a broadcast for this user
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = (await req.json()) as { id: string };
    if (!id)
      return NextResponse.json({ error: "ID required" }, { status: 400 });

    await connectDB();
    await BroadcastModel.findByIdAndUpdate(id, {
      $addToSet: { readBy: session.user.email },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Broadcast PATCH error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// DELETE — deactivate a broadcast (admin only)
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.email !== ADMIN_EMAIL)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = (await req.json()) as { id: string };
    if (!id)
      return NextResponse.json({ error: "ID required" }, { status: 400 });

    await connectDB();
    await BroadcastModel.findByIdAndUpdate(id, { active: false });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Broadcast DELETE error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
