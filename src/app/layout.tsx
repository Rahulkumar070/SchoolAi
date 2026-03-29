import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/layout/Providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://researchly.in"),
  title: {
    default: "Researchly — AI Research Assistant for Students & Researchers",
    template: "%s | Researchly",
  },
  description:
    "Search 200M+ academic papers, generate literature reviews, and chat with PDFs — powered by AI. Made for Indian students preparing for JEE, GATE, NEET, UPSC & research.",
  keywords: [
    "research",
    "academic",
    "papers",
    "AI",
    "literature review",
    "citations",
    "JEE",
    "UPSC",
    "NEET",
    "GATE",
    "Researchly",
    "academic paper search",
    "AI research tool",
    "research assistant India",
    "citation generator",
    "PDF chat AI",
  ],
  verification: {
    google: "SNsDG-vuMzdIKetn9V5jNKEcjdZs5MK5xWYH8LUSptQ",
  },
  themeColor: "#e8a045",
  colorScheme: "dark",
  viewport: "width=device-width, initial-scale=1, maximum-scale=5",
  icons: {
    icon: "/researchly-icon-dark.svg?v=3",
    shortcut: "/researchly-icon-dark.svg?v=3",
    apple: "/researchly-icon-dark.svg?v=3",
  },
  alternates: {
    canonical: "https://researchly.in",
  },
  openGraph: {
    title: "Researchly — AI Research Assistant",
    description:
      "Search 200M+ academic papers, generate literature reviews, and chat with PDFs.",
    type: "website",
    locale: "en_IN",
    url: "https://researchly.in",
    siteName: "Researchly",
    images: [{ url: "/api/og", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Researchly — AI Research Assistant",
    description:
      "Search 200M+ papers, generate literature reviews, chat with PDFs. Free to start.",
    images: ["/api/og"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  "@id": "https://researchly.in/#website",
                  url: "https://researchly.in",
                  name: "Researchly",
                  description:
                    "AI-powered academic research assistant. Search 200M+ papers, generate literature reviews, chat with PDFs.",
                  potentialAction: {
                    "@type": "SearchAction",
                    target: {
                      "@type": "EntryPoint",
                      urlTemplate:
                        "https://researchly.in/search?q={search_term_string}",
                    },
                    "query-input": "required name=search_term_string",
                  },
                  inLanguage: "en-IN",
                },
                {
                  "@type": "Organization",
                  "@id": "https://researchly.in/#organization",
                  name: "Researchly by Exovio",
                  url: "https://researchly.in",
                  logo: {
                    "@type": "ImageObject",
                    url: "https://researchly.in/researchly-icon-dark.svg",
                  },
                  sameAs: [
                    "https://instagram.com/hello.exovio/",
                    "https://linkedin.com/company/exovio-ai/",
                  ],
                  contactPoint: {
                    "@type": "ContactPoint",
                    email: "hello.exovio@gmail.com",
                    contactType: "customer support",
                  },
                },
                {
                  "@type": "WebApplication",
                  name: "Researchly",
                  url: "https://researchly.in",
                  applicationCategory: "EducationalApplication",
                  operatingSystem: "Web",
                  offers: [
                    {
                      "@type": "Offer",
                      price: "0",
                      priceCurrency: "INR",
                      name: "Free Plan",
                    },
                    {
                      "@type": "Offer",
                      price: "199",
                      priceCurrency: "INR",
                      name: "Student Plan",
                      priceValidUntil: "2027-12-31",
                    },
                    {
                      "@type": "Offer",
                      price: "499",
                      priceCurrency: "INR",
                      name: "Pro Plan",
                      priceValidUntil: "2027-12-31",
                    },
                  ],
                },
              ],
            }),
          }}
        />

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=Lora:ital,wght@0,400;0,500;1,400&display=swap"
          rel="stylesheet"
        />

        {/* Android / PWA */}
        <meta name="theme-color" content="#e8a045" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="Researchly" />

        {/* Windows */}
        <meta name="msapplication-TileColor" content="#e8a045" />
        <meta name="msapplication-TileImage" content="/mstile-150x150.png" />
        <meta name="msapplication-config" content="none" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
