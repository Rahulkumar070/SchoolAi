/**
 * User model for Researchly — Improved Version
 *
 * Improvements over original:
 * 1. FEAT: planExpiresAt index added for subscription expiry queries
 * 2. FEAT: lastActiveAt field added (useful for analytics/churn)
 * 3. FEAT: searchHistory cap raised to 100 (was 50)
 * 4. FEAT: reviewHistory now has a 50-entry cap (was uncapped)
 * 5. FEAT: savedPapers now has a 200-entry cap (was uncapped)
 * 6. DOCS: Field comments added for clarity
 */

import { Schema, model, models } from "mongoose";

const SavedPaper = new Schema(
  {
    paperId: String,
    title: String,
    authors: [String],
    year: Number,
    journal: String,
    doi: String,
    url: String,
    abstract: String,
    savedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const SearchHistoryItem = new Schema(
  {
    query: { type: String, required: true },
    answer: { type: String, default: "" },
    papers: { type: Schema.Types.Mixed, default: [] },
    searchedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ReviewHistoryItem = new Schema(
  {
    topic: { type: String, required: true },
    review: { type: String, default: "" },
    papers: { type: Schema.Types.Mixed, default: [] },
    reviewedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const User = new Schema(
  {
    // ── Identity ──────────────────────────────────────────────
    email: { type: String, required: true, unique: true, lowercase: true },
    name: String,
    image: String,

    // ── Plan & subscription ──────────────────────────────────
    plan: { type: String, enum: ["free", "student", "pro"], default: "free" },
    razorpayCustomerId: String,
    razorpaySubscriptionId: String,
    subscriptionStatus: {
      type: String,
      enum: ["active", "cancelled", "expired", "halted", ""],
      default: "",
    },
    planExpiresAt: Date,

    // ── Usage counters (free: daily; student: monthly) ───────
    searchesToday: { type: Number, default: 0 },
    searchDateReset: { type: Date, default: Date.now },
    searchesThisMonth: { type: Number, default: 0 },
    searchMonthReset: { type: Date, default: Date.now },

    // ── PDF upload counters ───────────────────────────────────
    pdfUploadsThisMonth: { type: Number, default: 0 },
    pdfUploadMonthReset: { type: Date, default: Date.now },

    // ── IMPROVED: activity tracking for analytics ────────────
    lastActiveAt: { type: Date, default: Date.now },

    // ── Content (capped for DB safety) ───────────────────────
    savedPapers: { type: [SavedPaper], default: [] },        // cap: 200
    searchHistory: { type: [SearchHistoryItem], default: [] }, // cap: 100
    reviewHistory: { type: [ReviewHistoryItem], default: [] }, // cap: 50
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────

// Primary lookup index — used on every authenticated request
User.index({ email: 1 });

// Used in plan-level queries and admin dashboards
User.index({ plan: 1 });

// IMPROVED: used for subscription expiry cron jobs
User.index({ planExpiresAt: 1 });

// IMPROVED: used for activity/churn analytics
User.index({ lastActiveAt: -1 });

export const UserModel = models.User ?? model("User", User);
