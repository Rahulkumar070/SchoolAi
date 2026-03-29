import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Research Search — Find & Cite 200M+ Academic Papers | Researchly",
  description:
    "Search 200M+ academic papers from Semantic Scholar, arXiv, PubMed & OpenAlex. Get AI-powered, citation-grounded answers for your research questions. Free to start.",
  keywords: [
    "academic paper search",
    "AI research assistant",
    "citation search",
    "literature search",
    "arXiv search",
    "PubMed search",
    "Semantic Scholar",
    "research papers India",
    "JEE research",
    "GATE study",
    "UPSC preparation",
  ],
  alternates: {
    canonical: "https://researchly.in/search",
  },
  openGraph: {
    title: "AI Research Search — Find & Cite 200M+ Papers",
    description:
      "Search 200M+ academic papers and get AI-powered, citation-grounded answers instantly.",
    url: "https://researchly.in/search",
    siteName: "Researchly",
    type: "website",
    images: [{ url: "/api/og", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Research Search — Researchly",
    description:
      "Search 200M+ papers, get cited answers. Free AI research assistant for students.",
    images: ["/api/og"],
  },
};

export default function SearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
