import { Schema, model, models, Types } from "mongoose";

// Papers are stored inline on assistant messages (same shape as Paper type)
const PaperSchema = new Schema(
  {
    id: String,
    title: String,
    authors: [String],
    year: Number,
    abstract: String,
    journal: String,
    doi: String,
    url: String,
    citationCount: Number,
    source: String,
  },
  { _id: false },
);

const MessageSchema = new Schema(
  {
    conversationId: {
      type: Types.ObjectId,
      required: true,
      ref: "Conversation",
      index: true,
    },
    userId: { type: Types.ObjectId, required: true, ref: "User", index: true },
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true, default: "" },
    papers: { type: [PaperSchema], default: [] }, // only on assistant messages
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

export const MessageModel = models.Message ?? model("Message", MessageSchema);
