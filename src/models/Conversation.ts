import { Schema, model, models, Types } from "mongoose";

const ConversationSchema = new Schema(
  {
    userId: { type: Types.ObjectId, required: true, ref: "User", index: true },
    title: { type: String, required: true, default: "New Research" },
    type: { type: String, enum: ["search", "review", "upload"], default: "search" },
    updatedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

// Keep updatedAt in sync automatically
ConversationSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export const ConversationModel =
  models.Conversation ?? model("Conversation", ConversationSchema);
