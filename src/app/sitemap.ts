import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url:          "https://researchly.in",
      lastModified: new Date(),
      priority:     1.0,
    },
    {
      url:          "https://researchly.in/search",
      lastModified: new Date(),
      priority:     0.9,
    },
    {
      url:          "https://researchly.in/review",
      lastModified: new Date(),
      priority:     0.8,
    },
    {
      url:          "https://researchly.in/upload",
      lastModified: new Date(),
      priority:     0.7,
    },
    {
      url:          "https://researchly.in/pricing",
      lastModified: new Date(),
      priority:     0.8,
    },
  ];
}
