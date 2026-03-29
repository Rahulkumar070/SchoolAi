import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chat With PDF — AI PDF Reader & Q&A | Researchly",
  description:
    "Upload any academic PDF and ask questions. Get precise, section-aware answers with citations. Supports research papers, textbooks, and thesis documents.",
  keywords: [
    "chat with PDF",
    "AI PDF reader",
    "PDF question answering",
    "academic PDF chat",
    "research paper reader",
    "PDF AI assistant",
    "ask questions about PDF",
  ],
  alternates: {
    canonical: "https://researchly.in/upload",
  },
  openGraph: {
    title: "Chat With PDF — AI PDF Reader | Researchly",
    description:
      "Upload any academic PDF and ask questions. Get precise, cited answers instantly.",
    url: "https://researchly.in/upload",
    siteName: "Researchly",
    type: "website",
    images: [{ url: "/api/og", width: 1200, height: 630 }],
  },
};

export default function UploadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
