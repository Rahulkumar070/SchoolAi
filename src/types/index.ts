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
  // FEAT: reserved for future embedding-based retrieval
  _embedding?: number[];
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

// IMPROVED: Harvard format added
export type CitationFormat =
  | "apa"
  | "mla"
  | "ieee"
  | "chicago"
  | "harvard"
  | "vancouver"
  | "bibtex";
