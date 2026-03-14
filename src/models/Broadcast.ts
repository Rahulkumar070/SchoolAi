import { Schema, model, models } from "mongoose";

const BroadcastSchema = new Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  targetPlan: {
    type: String,
    enum: ["all", "free", "student", "pro"],
    default: "all",
  },
  type: { type: String, enum: ["info", "warning", "success"], default: "info" },
  sentBy: { type: String, required: true }, // admin email
  readBy: { type: [String], default: [] }, // array of user emails who dismissed
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  },
});

BroadcastSchema.index({ active: 1, createdAt: -1 });
BroadcastSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const BroadcastModel =
  models.Broadcast ?? model("Broadcast", BroadcastSchema);
