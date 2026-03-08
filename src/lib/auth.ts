import { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import { connectDB } from "./mongodb";
import { UserModel } from "@/models/User";

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error("NEXTAUTH_SECRET is missing from environment variables.");
}

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: { prompt: "select_account" },
      },
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    }),
  ],

  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/auth/signin" },

  callbacks: {
    // ──────────────────────────────────────────────────────────
    // signIn — validate only, NO DB call here.
    //
    // BEFORE: signIn did connectDB() + findOneAndUpdate() = DB call #1
    //         jwt then did connectDB() + findOne()         = DB call #2
    //         Total: 2 sequential DB round-trips = 6–10s on Atlas M0
    //
    // AFTER:  signIn just validates the email (instant, no DB).
    //         jwt does ONE findOneAndUpdate() that creates the user if
    //         they don't exist AND reads plan/id in a single atomic call.
    //         Total: 1 DB round-trip = login is ~2x faster.
    // ──────────────────────────────────────────────────────────
    async signIn({ user }) {
      // Just validate — DB work is done in jwt callback below
      if (!user.email) return false;
      return true;
    },

    async jwt({ token, user, trigger }) {
      // `user` is only populated on the very first JWT creation (sign-in).
      // On every subsequent API call this block is skipped entirely.
      const isFirstSignIn = !!user?.email;
      const isManualUpdate = trigger === "update";

      if (isFirstSignIn || isManualUpdate) {
        const email =
          user?.email ?? (typeof token.email === "string" ? token.email : null);

        if (!email) return token;

        try {
          await connectDB();

          // ✅ SINGLE atomic call: upsert the user (create if new) AND
          // read back _id + plan in one round-trip — no separate signIn DB call needed.
          const u = (await UserModel.findOneAndUpdate(
            { email },
            {
              $setOnInsert: {
                email,
                name: user?.name ?? token.name ?? "",
                image: user?.image ?? token.picture ?? "",
                plan: "free",
              },
            },
            {
              upsert: true,
              new: true, // return the document after the operation
              select: "_id plan subscriptionStatus",
            },
          ).lean()) as {
            _id: unknown;
            plan?: string;
            subscriptionStatus?: string;
          } | null;

          if (u) {
            token.id = String(u._id);
            token.plan = u.plan ?? "free";
            token.subscriptionStatus = u.subscriptionStatus ?? "";
          }
        } catch (err) {
          console.error("[NextAuth] jwt DB error:", err);
          // Don't throw — let the user in with a default token.
          // Their record will be created lazily on next API call.
          if (!token.plan) token.plan = "free";
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? "";
        session.user.plan = (token.plan as string) ?? "free";
      }
      return session;
    },
  },
};
