import { connectDB } from "./mongodb";
import { CacheModel } from "@/models/Cache";

// Current model version — bump this whenever you upgrade the AI model
// Old cache entries with a different version will be ignored and regenerated
const CURRENT_MODEL_VERSION = "sonnet-4-6";

// ── Query normalization ───────────────────────────────────────
export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .replace(
      /\b(a|an|the|in|of|for|to|and|or|is|are|was|were|what|how|why|when|where|which)\b/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

// ── Get cached result ─────────────────────────────────────────
export async function getCachedResult(
  query: string,
): Promise<{ answer: string; papers: unknown[] } | null> {
  try {
    await connectDB();
    const key = normalizeQuery(query);
    const cached = await CacheModel.findOne({ query: key });

    if (!cached) return null;

    // ✅ FIX: Invalidate cache entries written by old models (e.g. Haiku)
    // If modelVersion is missing or doesn't match current, treat as cache miss
    if (cached.modelVersion !== CURRENT_MODEL_VERSION) {
      // Delete the stale entry so it gets regenerated with the better model
      void CacheModel.findByIdAndDelete(cached._id);
      return null;
    }

    void CacheModel.findByIdAndUpdate(cached._id, { $inc: { usageCount: 1 } });

    return { answer: cached.answer, papers: cached.papers ?? [] };
  } catch {
    return null;
  }
}

// ── Save to cache ─────────────────────────────────────────────
// Detect time-sensitive queries (recent, latest, current, 2024, 2025, etc.)
// These get a short 7-day TTL instead of the default 60-day TTL
function isTimeSensitive(query: string): boolean {
  return /\b(latest|recent|current|new|2024|2025|2026|today|this year|this month|trending|state of the art|sota)\b/i.test(query);
}

export async function saveToCache(
  originalQuery: string,
  answer: string,
  papers: unknown[],
): Promise<void> {
  try {
    await connectDB();
    const key = normalizeQuery(originalQuery);

    // Smart TTL: time-sensitive queries expire in 7 days, stable ones in 60 days
    const ttlDays = isTimeSensitive(originalQuery) ? 7 : 60;
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await CacheModel.findOneAndUpdate(
      { query: key },
      {
        $set: {
          query: key,
          originalQuery: originalQuery,
          answer: answer,
          papers: papers,
          modelVersion: CURRENT_MODEL_VERSION,
          updatedAt: new Date(),
          createdAt: expiresAt, // MongoDB TTL index on createdAt — reset expiry on update
        },
        $setOnInsert: {
          usageCount: 1,
        },
      },
      { upsert: true, new: true },
    );
  } catch {
    // Cache failure should never break the app
  }
}

// ── Cache stats ───────────────────────────────────────────────
interface CacheEntry {
  query: string;
  usageCount: number;
}

export async function getCacheStats(): Promise<{
  totalEntries: number;
  totalHits: number;
  topQueries: CacheEntry[];
}> {
  await connectDB();
  const raw = await CacheModel.find({}, { query: 1, usageCount: 1, _id: 0 })
    .sort({ usageCount: -1 })
    .limit(10)
    .lean<CacheEntry[]>();

  const entries = raw.map((e) => ({
    query: String(e.query ?? ""),
    usageCount: Number(e.usageCount ?? 0),
  }));
  return {
    totalEntries: await CacheModel.countDocuments(),
    totalHits: entries.reduce((s, e) => s + e.usageCount, 0),
    topQueries: entries,
  };
}

export { searchAll } from "./rag";
