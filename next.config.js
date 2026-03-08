/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverComponentsExternalPackages: ["mongoose"] },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  async redirects() {
    if (process.env.NODE_ENV === "production") {
      return [{ source: "/test", destination: "/", permanent: false }];
    }
    return [];
  },
};
module.exports = nextConfig;
