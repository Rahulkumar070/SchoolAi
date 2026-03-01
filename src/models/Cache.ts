import { Schema, model, models } from "mongoose";

const CacheSchema = new Schema({
  // Normalized query — indexed for fast lookup
  query: {
    type:     String,
    required: true,
    unique:   true,
    index:    true,
    lowercase: true,
    trim:     true,
  },

  // Original query — for display purposes
  originalQuery: {
    type: String,
    required: true,
  },

  // AI generated answer
  answer: {
    type:     String,
    required: true,
  },

  // Papers returned with this answer
  papers: {
    type:    Schema.Types.Mixed,
    default: [],
  },

  // How many times this cache entry was served
  usageCount: {
    type:    Number,
    default: 1,
  },

  // Auto delete after 30 days using MongoDB TTL index
  createdAt: {
    type:    Date,
    default: Date.now,
    expires: 60 * 60 * 24 * 30, // 30 days in seconds
  },
});

// Compound index for fast queries
CacheSchema.index({ query: 1, createdAt: -1 });

export const CacheModel = models.SearchCache ?? model("SearchCache", CacheSchema);
