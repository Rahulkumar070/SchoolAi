import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             "Researchly — AI Research Assistant",
    short_name:       "Researchly",
    description:      "Search 200M+ academic papers, generate literature reviews, and chat with PDFs.",
    start_url:        "/",
    display:          "standalone",
    background_color: "#0f0f0f",
    theme_color:      "#e8a045",
    icons: [
      { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png",      sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-touch-icon.png",       sizes: "180x180", type: "image/png" },
    ],
  };
}
