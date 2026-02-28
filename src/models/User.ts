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
  { _id: false },
);

const SearchHistoryItem = new Schema(
  {
    query: { type: String, required: true },
    answer: { type: String, default: "" },
    papers: { type: Schema.Types.Mixed, default: [] },
    searchedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

// Literature review history
const ReviewHistoryItem = new Schema(
  {
    topic: { type: String, required: true },
    review: { type: String, default: "" },
    papers: { type: Schema.Types.Mixed, default: [] },
    reviewedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const User = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    name: String,
    image: String,
    plan: { type: String, enum: ["free", "student", "pro"], default: "free" },
    razorpayCustomerId: String,
    razorpaySubscriptionId: String,
    subscriptionStatus: {
      type: String,
      enum: ["active", "cancelled", "expired", "halted", ""],
      default: "",
    },
    planExpiresAt: Date,
    searchesToday: { type: Number, default: 0 },
    searchDateReset: { type: Date, default: Date.now },
    searchesThisMonth: { type: Number, default: 0 },
    searchMonthReset: { type: Date, default: Date.now },
    savedPapers: { type: [SavedPaper], default: [] },
    searchHistory: { type: [SearchHistoryItem], default: [] },
    reviewHistory: { type: [ReviewHistoryItem], default: [] },
  },
  { timestamps: true },
);

export const UserModel = models.User ?? model("User", User);
