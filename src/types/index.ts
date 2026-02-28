export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  abstract: string;
  journal?: string;
  doi?: string;
  url?: string;
  citationCount?: number;
  source: string;
}
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
export interface SavedPaper {
  paperId: string;
  title: string;
  authors: string[];
  year: number | null;
  journal?: string;
  doi?: string;
  url?: string;
  abstract?: string;
  savedAt: string;
}
export type CitationFormat =
  | "apa"
  | "mla"
  | "ieee"
  | "chicago"
  | "vancouver"
  | "bibtex";
