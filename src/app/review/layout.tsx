import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Literature Review Generator — Researchly",
  description:
    "Generate publication-quality literature reviews with proper citations in minutes. Powered by AI, sourced from 200M+ academic papers. Made for Indian students & researchers.",
  keywords: [
    "literature review generator",
    "AI literature review",
    "automatic literature review",
    "academic literature review tool",
    "research paper review",
    "literature survey generator",
    "thesis literature review",
  ],
  alternates: {
    canonical: "https://researchly.in/review",
  },
  openGraph: {
    title: "AI Literature Review Generator — Researchly",
    description:
      "Generate publication-quality literature reviews with proper citations in minutes.",
    url: "https://researchly.in/review",
    siteName: "Researchly",
    type: "website",
    images: [{ url: "/api/og", width: 1200, height: 630 }],
  },
};

export default function ReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
