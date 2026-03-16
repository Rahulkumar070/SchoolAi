import { MetadataRoute } from "next";
import { connectDB } from "@/lib/mongodb";
import { PublicResearchModel } from "@/models/PublicResearch";

// Revalidate the sitemap every hour so new research pages appear promptly
export const revalidate = 3600;

const BASE = "https://researchly.in";

const STATIC: MetadataRoute.Sitemap = [
  { url: BASE, lastModified: new Date(), priority: 1.0 },
  { url: `${BASE}/search`, lastModified: new Date(), priority: 0.9 },
  { url: `${BASE}/review`, lastModified: new Date(), priority: 0.8 },
  { url: `${BASE}/upload`, lastModified: new Date(), priority: 0.7 },
  { url: `${BASE}/pricing`, lastModified: new Date(), priority: 0.8 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    await connectDB();
    const docs = (await PublicResearchModel.find(
      {},
      { slug: 1, createdAt: 1, _id: 0 },
    ).lean()) as unknown as { slug: string; createdAt?: Date }[];

    const researchUrls: MetadataRoute.Sitemap = docs.map((d) => ({
      url: `${BASE}/research/${d.slug}`,
      lastModified: d.createdAt ?? new Date(),
      priority: 0.7,
    }));

    return [...STATIC, ...researchUrls];
  } catch {
    // Fall back to static-only if DB is unavailable
    return STATIC;
  }
}
