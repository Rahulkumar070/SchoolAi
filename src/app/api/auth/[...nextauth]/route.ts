import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// ✅ Standard NextAuth route handler — no changes needed here
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
