import { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider  from "next-auth/providers/github";
import { connectDB } from "./mongodb";
import { UserModel } from "@/models/User";

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID ?? "", clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "" }),
    GitHubProvider ({ clientId: process.env.GITHUB_CLIENT_ID  ?? "", clientSecret: process.env.GITHUB_CLIENT_SECRET  ?? "" }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/auth/signin" },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      try {
        await connectDB();
        if (!await UserModel.findOne({ email: user.email }))
          await UserModel.create({ email: user.email, name: user.name, image: user.image });
        return true;
      } catch { return false; }
    },
    async jwt({ token, user, trigger }) {
      // Refresh plan from DB on sign-in or manual session update
      const emailToUse = user?.email ?? (typeof token.email === "string" ? token.email : null);
      if (emailToUse && (user?.email || trigger === "update")) {
        try {
          await connectDB();
          const u = await UserModel.findOne({ email: emailToUse }).lean() as {
            _id: unknown; plan?: string; subscriptionStatus?: string;
          } | null;
          if (u) {
            token.id   = String(u._id);
            token.plan = u.plan ?? "free";
            token.subscriptionStatus = u.subscriptionStatus ?? "";
          }
        } catch { /* ignore */ }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id   = (token.id as string) ?? "";
        session.user.plan = (token.plan as string) ?? "free";
      }
      return session;
    },
  },
};
