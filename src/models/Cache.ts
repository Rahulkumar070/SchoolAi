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

  // ✅ NEW: track which model generated this answer
  // Used to invalidate stale cache entries when model is upgraded
  modelVersion: { type: String, default: "" },

  updatedAt: { type: Date, default: Date.now },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24 * 30, // auto-delete after 30 days
  },
});

CacheSchema.index({ query: 1, createdAt: -1 });

export const CacheModel =
  models.SearchCache ?? model("SearchCache", CacheSchema);
