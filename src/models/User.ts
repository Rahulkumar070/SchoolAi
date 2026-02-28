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

// Search history now stores the full answer + papers
const SearchHistoryItem = new Schema(
  {
    query: { type: String, required: true },
    answer: { type: String, default: "" }, // full AI answer
    papers: { type: Schema.Types.Mixed, default: [] }, // paper results
    searchedAt: { type: Date, default: Date.now },
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
  },
  { timestamps: true },
);

export const UserModel = models.User ?? model("User", User);
