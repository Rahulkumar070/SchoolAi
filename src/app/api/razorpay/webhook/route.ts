import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import { UserModel } from "@/models/User";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const sig = req.headers.get("x-razorpay-signature") ?? "";
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";

    // Verify webhook authenticity
    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    if (expected !== sig) {
      console.warn("Webhook: invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const event = JSON.parse(rawBody) as {
      event: string;
      payload: {
        subscription?: {
          entity: { id: string; notes?: { email?: string }; status?: string };
        };
        payment?: { entity: { id: string; email?: string } };
      };
    };

    await connectDB();
    const subEntity = event.payload.subscription?.entity;
    const subscriptionId = subEntity?.id ?? "";
    const email =
      subEntity?.notes?.email ?? event.payload.payment?.entity?.email ?? "";

    console.log(
      `Webhook event: ${event.event} | sub: ${subscriptionId} | email: ${email}`,
    );

    switch (event.event) {
      // Subscription activated / renewed
      case "subscription.activated":
      case "subscription.charged": {
        if (email) {
          const expiresAt = new Date();
          expiresAt.setMonth(expiresAt.getMonth() + 1);
          await UserModel.findOneAndUpdate(
            { email },
            { subscriptionStatus: "active", planExpiresAt: expiresAt },
          );
        }
        break;
      }

      // Subscription cancelled by user
      case "subscription.cancelled": {
        if (email) {
          await UserModel.findOneAndUpdate(
            { email },
            { subscriptionStatus: "cancelled" },
          );
        } else if (subscriptionId) {
          await UserModel.findOneAndUpdate(
            { razorpaySubscriptionId: subscriptionId },
            { subscriptionStatus: "cancelled" },
          );
        }
        break;
      }

      // Subscription expired / halted (failed payments)
      case "subscription.expired":
      case "subscription.halted": {
        const filter = email
          ? { email }
          : { razorpaySubscriptionId: subscriptionId };
        await UserModel.findOneAndUpdate(filter, {
          plan: "free",
          subscriptionStatus:
            event.event === "subscription.halted" ? "halted" : "expired",
          razorpaySubscriptionId: "",
        });
        break;
      }

      // Subscription completed (all billing cycles done)
      case "subscription.completed": {
        const filter = email
          ? { email }
          : { razorpaySubscriptionId: subscriptionId };
        await UserModel.findOneAndUpdate(filter, {
          plan: "free",
          subscriptionStatus: "expired",
          razorpaySubscriptionId: "",
        });
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${event.event}`);
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("Webhook error:", e);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
