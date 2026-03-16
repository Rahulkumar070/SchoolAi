import { Schema, model, models } from "mongoose";

// Same shape as Message's PaperSchema — no _id on subdocs
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
    badges: [String],
  },
  { _id: false },
);

const PublicResearchSchema = new Schema({
  slug: { type: String, unique: true, index: true, required: true },
  query: { type: String, required: true },
  answer: { type: String, required: true },
  papers: { type: [PaperSchema], default: [] },
  evidenceIdToPaperId: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
});

export const PublicResearchModel =
  models.PublicResearch ?? model("PublicResearch", PublicResearchSchema);
