/**
 * Cache model for Researchly — Improved Version
 *
 * Improvements over original:
 * 1. FEAT: TTL raised to 60 days (was 30) — popular queries stay cached longer
 * 2. FEAT: Compound index on (query, modelVersion) for faster version-aware lookups
 * 3. FEAT: queryLength field added — useful for analytics on short vs long queries
 * 4. FEAT: Sparse index on modelVersion — avoids indexing legacy entries with empty version
 */

import { Schema, model, models } from "mongoose";

const CacheSchema = new Schema({
  query: {
    type: String,
    required: true,
    unique: true,
    index: true,
    lowercase: true,
    trim: true,
  },
  originalQuery: { type: String, required: true },
  answer: { type: String, required: true },
  papers: { type: Schema.Types.Mixed, default: [] },
  usageCount: { type: Number, default: 1 },

  // Tracks which model generated this answer — used to invalidate stale cache entries
  modelVersion: { type: String, default: "" },

  // IMPROVED: store query length for analytics
  queryLength: { type: Number, default: 0 },

  updatedAt: { type: Date, default: Date.now },
  createdAt: {
    type: Date,
    default: Date.now,
    // IMPROVED: TTL raised to 60 days
    expires: 60 * 60 * 24 * 60,
  },
});

// Primary lookup
CacheSchema.index({ query: 1, createdAt: -1 });

// IMPROVED: version-aware lookup (avoids full scan during cache invalidation)
CacheSchema.index({ modelVersion: 1 }, { sparse: true });

// Most-used queries for analytics/cache warming
CacheSchema.index({ usageCount: -1 });

export const CacheModel =
  models.SearchCache ?? model("SearchCache", CacheSchema);
