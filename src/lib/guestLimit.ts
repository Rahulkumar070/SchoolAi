// Guest limit tracking — bypass proof
// Uses TWO independent methods stored in MongoDB:
// 1. Browser fingerprint (IP + UserAgent hash) — survives browser close/reopen
// 2. Cookie ID (_rly_gid) — survives incognito if same device
// Both are checked — whichever has higher count wins → blocks bypass attempts

import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { CacheModel } from "@/models/Cache";
import crypto from "crypto";

const GUEST_DAILY_LIMIT = 2;
const SECRET = process.env.NEXTAUTH_SECRET ?? "researchly-secret";

// ── Fingerprint: stable hash of IP + UserAgent ──────────────
// Same device/browser = same fingerprint even after browser close
export function createFingerprint(req: NextRequest): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "127.0.0.1")
    .split(",")[0]
    .trim();
  const ua = req.headers.get("user-agent") ?? "unknown";
  return crypto
    .createHmac("sha256", SECRET)
    .update(`${ip}:${ua}`)
    .digest("hex")
    .slice(0, 32);
}

// ── Get count from MongoDB for a given ID ───────────────────
async function getCount(id: string): Promise<number> {
  const today = new Date().toDateString();
  const key = `gid:${id}:${today}`;
  const doc = (await CacheModel.findOne({ query: key }).lean()) as {
    answer?: string;
  } | null;
  return doc ? parseInt(doc.answer ?? "0", 10) : 0;
}

// ── Increment count in MongoDB ───────────────────────────────
async function incrementCount(id: string): Promise<void> {
  const today = new Date().toDateString();
  const key = `gid:${id}:${today}`;
  const current = await getCount(id);
  await CacheModel.findOneAndUpdate(
    { query: key },
    {
      query: key,
      answer: String(current + 1),
      papers: [],
      createdAt: new Date(),
    },
    { upsert: true },
  );
}

// ── Main function: check + increment guest limit ─────────────
// Returns allowed/blocked status + the guestId to store in cookie
export async function checkGuestLimit(req: NextRequest): Promise<{
  allowed: boolean;
  count: number;
  limit: number;
  fingerprintId: string;
}> {
  await connectDB();

  const fingerprintId = createFingerprint(req);
  const cookieId = req.cookies.get("_rly_gid")?.value ?? null;

  // Check fingerprint count
  const fpCount = await getCount(fingerprintId);

  // Check cookie count (if different from fingerprint)
  let cookieCount = 0;
  if (cookieId && cookieId !== fingerprintId) {
    cookieCount = await getCount(cookieId);
  }

  // Use the HIGHER count — prevents bypass by clearing cookies
  const maxCount = Math.max(fpCount, cookieCount);

  if (maxCount >= GUEST_DAILY_LIMIT) {
    // Also increment fingerprint so it stays in sync even if blocked
    // This prevents the trick: clear cookies → get new count
    if (fpCount < maxCount) await incrementCount(fingerprintId);
    return {
      allowed: false,
      count: maxCount,
      limit: GUEST_DAILY_LIMIT,
      fingerprintId,
    };
  }

  // Allowed — increment BOTH fingerprint AND cookie ID to keep in sync
  await incrementCount(fingerprintId);
  if (cookieId && cookieId !== fingerprintId) {
    await incrementCount(cookieId);
  }

  return {
    allowed: true,
    count: maxCount + 1,
    limit: GUEST_DAILY_LIMIT,
    fingerprintId,
  };
}
