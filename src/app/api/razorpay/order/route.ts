import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Razorpay from "razorpay";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";

const rzp = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  try {
    const { planId, planName } = await req.json() as { planId: string; planName: string };
    if (!planId) return NextResponse.json({ error: "Plan ID required" }, { status: 400 });

    await connectDB();
    const user = await UserModel.findOne({ email: session.user.email });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Create Razorpay subscription
    const subscription = await rzp.subscriptions.create({
      plan_id:         planId,
      total_count:     12,          // 12 months
      quantity:        1,
      customer_notify: 1,
      notes: {
        email:    session.user.email,
        plan:     planName,
        userId:   String(user._id),
      },
    });

    return NextResponse.json({
      subscriptionId:   subscription.id,
      razorpayKeyId:    process.env.RAZORPAY_KEY_ID,
      amount:           subscription.amount,
      currency:         "INR",
      planName,
      userName:         session.user.name ?? "",
      userEmail:        session.user.email,
    });
  } catch (e) {
    console.error("Razorpay order error:", e);
    return NextResponse.json({ error: (e as Error).message || "Failed to create order" }, { status: 500 });
  }
}
