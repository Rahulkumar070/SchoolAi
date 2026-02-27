import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
      planName,
    } = await req.json() as {
      razorpay_payment_id: string;
      razorpay_subscription_id: string;
      razorpay_signature: string;
      planName: string;
    };

    // Verify signature
    const body     = `${razorpay_payment_id}|${razorpay_subscription_id}`;
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(body)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return NextResponse.json({ error: "Payment verification failed. Invalid signature." }, { status: 400 });
    }

    // Upgrade user plan
    await connectDB();
    const plan = planName.toLowerCase().includes("student") ? "student" : "pro";
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    await UserModel.findOneAndUpdate(
      { email: session.user.email },
      {
        plan,
        razorpaySubscriptionId: razorpay_subscription_id,
        subscriptionStatus: "active",
        planExpiresAt: expiresAt,
      }
    );

    return NextResponse.json({ success: true, plan });
  } catch (e) {
    console.error("Verify error:", e);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
