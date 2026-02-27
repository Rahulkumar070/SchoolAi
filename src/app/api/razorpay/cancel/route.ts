import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Razorpay from "razorpay";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";

const rzp = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await connectDB();
    const user = await UserModel.findOne({ email: session.user.email });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (!user.razorpaySubscriptionId)
      return NextResponse.json({ error: "No active subscription found" }, { status: 400 });

    // Cancel at period end (cancel_at_cycle_end = 1 means user keeps access till period end)
    await rzp.subscriptions.cancel(user.razorpaySubscriptionId, true);

    await UserModel.findOneAndUpdate(
      { email: session.user.email },
      { subscriptionStatus: "cancelled" }
    );

    return NextResponse.json({ success: true, message: "Subscription cancelled. You keep access until the end of your billing period." });
  } catch (e) {
    console.error("Cancel error:", e);
    return NextResponse.json({ error: (e as Error).message || "Cancellation failed" }, { status: 500 });
  }
}
