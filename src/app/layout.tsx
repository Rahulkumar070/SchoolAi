import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/layout/Providers";

export const metadata: Metadata = {
  title: "Researchly — AI Research Assistant",
  description: "Search 200M+ academic papers, generate literature reviews, and chat with PDFs — powered by Claude AI. Made in India 🇮🇳",
  keywords: ["research", "academic", "papers", "AI", "literature review", "citations", "JEE", "UPSC", "NEET", "Researchly"],
  verification: {
    google: "SNsDG-vuMzdIKetn9V5jNKEcjdZs5MK5xWYH8LUSptQ",
  },
  themeColor: "#e8a045",
  colorScheme: "dark",
  viewport: "width=device-width, initial-scale=1, maximum-scale=5",
  icons: {
    icon: [
      { url: "/favicon.ico",        sizes: "any"    },
      { url: "/favicon-16x16.png",  sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png",  sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png",  sizes: "48x48", type: "image/png" },
    ],
    apple:   [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    other: [
      { rel: "mask-icon",       url: "/icon-maskable-512.png" },
      { rel: "msapplication-TileImage", url: "/mstile-150x150.png" },
    ],
  },
  openGraph: {
    title: "Researchly — AI Research Assistant",
    description: "Search 200M+ academic papers, generate literature reviews, and chat with PDFs.",
    type: "website",
    locale: "en_IN",
    siteName: "Researchly",
  },
  twitter: {
    card: "summary",
    title: "Researchly — AI Research Assistant",
    description: "Search 200M+ papers, generate literature reviews, chat with PDFs. Free to start.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* Favicon — all browsers */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon-16x16.png" type="image/png" sizes="16x16" />
        <link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32" />
        <link rel="icon" href="/favicon-48x48.png" type="image/png" sizes="48x48" />

        {/* Apple / iOS */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />

        {/* Android / PWA */}
        <meta name="theme-color" content="#e8a045" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
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
