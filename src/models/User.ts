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
const User = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    name: String,
    image: String,
    plan: { type: String, enum: ["free", "student", "pro"], default: "free" },
    // Razorpay
    razorpayCustomerId: String,
    razorpaySubscriptionId: String,
    subscriptionStatus: {
      type: String,
      enum: ["active", "cancelled", "expired", "halted", ""],
      default: "",
    },
    planExpiresAt: Date,
    // Usage — free plan (daily)
    searchesToday: { type: Number, default: 0 },
    searchDateReset: { type: Date, default: Date.now },
    // Usage — student plan (monthly)
    searchesThisMonth: { type: Number, default: 0 },
    searchMonthReset: { type: Date, default: Date.now },
    // History & saved
    savedPapers: { type: [SavedPaper], default: [] },
    searchHistory: {
      type: [{ query: String, searchedAt: { type: Date, default: Date.now } }],
      default: [],
    },
  },
  { timestamps: true },
);
export const UserModel = models.User ?? model("User", User);
