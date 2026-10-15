import type { NextConfig } from "next";

// Cache Components is off on purpose: every screen in this app shows
// per-user money/credit data that must be read fresh on each request.
// The Docker image runs `next start` with full node_modules because the same
// image also applies migrations and seeds (drizzle + tsx), so no standalone output.
const nextConfig: NextConfig = {
  cacheComponents: false,
  devIndicators: false,
  serverExternalPackages: ["postgres"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
