import { Schema, model, models } from "mongoose";

const FeedbackSchema = new Schema({
  query: { type: String, required: true },
  rating: { type: String, enum: ["up", "down"], required: true },
  conversationId: { type: String, default: null },
  userId: { type: String, default: "guest" }, // email or "guest"
  createdAt: { type: Date, default: Date.now },
});

FeedbackSchema.index({ rating: 1, createdAt: -1 });
FeedbackSchema.index({ query: 1 });

export const FeedbackModel =
  models.Feedback ?? model("Feedback", FeedbackSchema);
