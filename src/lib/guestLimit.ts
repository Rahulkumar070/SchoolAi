/**
 * Guest limit tracking for Researchly — Improved Version
 *
 * Strategy: dual-method tracking using browser fingerprint + cookie.
 * Both methods store counts in MongoDB.
 * The HIGHER count always wins — prevents bypass via cookie clearing.
 *
 * Improvements over original:
 * 1. FEAT: GUEST_DAILY_LIMIT raised to 3 (was 2) — reduces friction for first-time users
 * 2. FEAT: getCount() now handles errors gracefully (returns 0 instead of crashing)
 * 3. FEAT: createFingerprint() includes Accept-Language for slightly better uniqueness
 * 4. DOCS: All logic is documented inline
 */

import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { CacheModel } from "@/models/Cache";
import crypto from "crypto";

const GUEST_DAILY_LIMIT = 3; // IMPROVED: was 2
const SECRET = process.env.NEXTAUTH_SECRET ?? "researchly-secret";

// ── Fingerprint: stable hash of IP + UserAgent + Accept-Language ──────────
// Same device/browser = same fingerprint even after browser close/reopen
export function createFingerprint(req: NextRequest): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "127.0.0.1")
    .split(",")[0]
    .trim();
  const ua = req.headers.get("user-agent") ?? "unknown";
  // IMPROVED: include Accept-Language for slightly better device uniqueness
  const lang = req.headers.get("accept-language") ?? "";
  return crypto
    .createHmac("sha256", SECRET)
    .update(`${ip}:${ua}:${lang}`)
    .digest("hex")
    .slice(0, 32);
}

// ── Get count from MongoDB for a given ID ───────────────────
async function getCount(id: string): Promise<number> {
  try {
    const today = new Date().toDateString();
    const key = `gid:${id}:${today}`;
    const doc = (await CacheModel.findOne({ query: key }).lean()) as {
      answer?: string;
    } | null;
    return doc ? parseInt(doc.answer ?? "0", 10) : 0;
  } catch {
    // IMPROVED: graceful error handling — treat DB error as 0 count
    return 0;
  }
}

// ── Increment count in MongoDB ───────────────────────────────
async function incrementCount(id: string): Promise<void> {
  try {
    const today = new Date().toDateString();
    const key = `gid:${id}:${today}`;
    const current = await getCount(id);
    await CacheModel.findOneAndUpdate(
      { query: key },
      {
        query: key,
        originalQuery: key,
        answer: String(current + 1),
        papers: [],
        createdAt: new Date(),
      },
      { upsert: true }
    );
  } catch {
    // Increment failure should not break the app
  }
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

  const fpCount = await getCount(fingerprintId);

  let cookieCount = 0;
  if (cookieId && cookieId !== fingerprintId) {
    cookieCount = await getCount(cookieId);
  }

  // Always use the HIGHER count — prevents bypass by clearing cookies
  const maxCount = Math.max(fpCount, cookieCount);

  if (maxCount >= GUEST_DAILY_LIMIT) {
    // Keep fingerprint in sync even when blocked
    if (fpCount < maxCount) await incrementCount(fingerprintId);
    return {
      allowed: false,
      count: maxCount,
      limit: GUEST_DAILY_LIMIT,
      fingerprintId,
    };
  }

  // Allowed — increment BOTH to keep counts in sync
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
