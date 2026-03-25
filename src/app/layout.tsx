import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/layout/Providers";

export const metadata: Metadata = {
  title: "Researchly — AI Research Assistant",
  description:
    "Search 200M+ academic papers, generate literature reviews, and chat with PDFs — powered by AI. Made in India 🇮🇳",
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
    "Researchly",
  ],
  verification: {
    google: "SNsDG-vuMzdIKetn9V5jNKEcjdZs5MK5xWYH8LUSptQ",
  },
  themeColor: "#e8a045",
  colorScheme: "dark",
  viewport: "width=device-width, initial-scale=1, maximum-scale=5",
  icons: {
    icon: "/researchly-icon-dark.svg?v=2",
    shortcut: "/researchly-icon-dark.svg?v=2",
    apple: "/researchly-icon-dark.svg?v=2",
  },
  openGraph: {
    title: "Researchly — AI Research Assistant",
    description:
      "Search 200M+ academic papers, generate literature reviews, and chat with PDFs.",
    type: "website",
    locale: "en_IN",
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
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
