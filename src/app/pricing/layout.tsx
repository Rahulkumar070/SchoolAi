import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — Researchly | AI Research Plans from ₹0/month",
  description:
    "Choose a Researchly plan — Free (5 searches/day), Student (₹199/mo, 500 searches), or Pro (₹499/mo, unlimited). Literature reviews, PDF chat, citation export included.",
  keywords: [
    "Researchly pricing",
    "AI research tool pricing",
    "academic research tool India",
    "student research plan",
    "cheap research tool",
    "research paper search pricing",
  ],
  alternates: {
    canonical: "https://researchly.in/pricing",
  },
  openGraph: {
    title: "Pricing — Researchly | Plans from ₹0/month",
    description:
      "Free, Student (₹199/mo), and Pro (₹499/mo) plans. Search 200M+ papers, generate literature reviews, chat with PDFs.",
    url: "https://researchly.in/pricing",
    siteName: "Researchly",
    type: "website",
    images: [{ url: "/api/og", width: 1200, height: 630 }],
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
