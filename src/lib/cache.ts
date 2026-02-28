import { connectDB } from "./mongodb";
import { CacheModel } from "@/models/Cache";

// ─────────────────────────────────────────────
// QUERY NORMALIZATION
// Maps similar queries to the same cache key
// ─────────────────────────────────────────────
export function normalizeQuery(query: string): string {
  return query
    .toLowerCase() // "Climate Change" → "climate change"
    .trim() // remove leading/trailing spaces
    .replace(/[^\w\s]/g, "") // remove punctuation: "what's?" → "whats"
    .replace(/\s+/g, " ") // multiple spaces → single space
    .replace(
      /\b(a|an|the|in|of|for|to|and|or|is|are|was|were|what|how|why|when|where|which)\b/g,
      "",
    ) // remove stop words
    .replace(/\s+/g, " ") // clean up again after stop word removal
    .trim();
}

// ─────────────────────────────────────────────
// GET CACHED RESULT
// ─────────────────────────────────────────────
export async function getCachedResult(
  query: string,
): Promise<{ answer: string; papers: unknown[] } | null> {
  try {
    await connectDB();
    const key = normalizeQuery(query);
    const cached = await CacheModel.findOne({ query: key });

    if (!cached) return null;

    // Increment usage count without waiting
    void CacheModel.findByIdAndUpdate(cached._id, { $inc: { usageCount: 1 } });

    return {
      answer: cached.answer,
      papers: cached.papers ?? [],
    };
  } catch {
    // Cache failure should never break the app — just return null
    return null;
  }
}

// ─────────────────────────────────────────────
// SAVE TO CACHE
// Uses upsert to prevent duplicate write race conditions
// ─────────────────────────────────────────────
export async function saveToCache(
  originalQuery: string,
  answer: string,
  papers: unknown[],
): Promise<void> {
  try {
    await connectDB();
    const key = normalizeQuery(originalQuery);

    // upsert = insert if not exists, update if exists
    // This prevents duplicate writes if two users search same thing simultaneously
    await CacheModel.findOneAndUpdate(
      { query: key },
      {
        $setOnInsert: {
          query: key,
          originalQuery: originalQuery,
          answer: answer,
          papers: papers,
          createdAt: new Date(),
          usageCount: 1,
        },
      },
      { upsert: true, new: true },
    );
  } catch {
    // Cache save failure should never break the app — silently ignore
  }
}

// ─────────────────────────────────────────────
// GET CACHE STATS (for admin/monitoring)
// ─────────────────────────────────────────────
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

  const entries: CacheEntry[] = raw.map((e) => ({
    query: String(e.query ?? ""),
    usageCount: Number(e.usageCount ?? 0),
  }));

  const totalHits = entries.reduce((sum, e) => sum + e.usageCount, 0);

  return {
    totalEntries: await CacheModel.countDocuments(),
    totalHits,
    topQueries: entries,
  };
}
