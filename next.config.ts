import type { NextConfig } from "next";

// Cache Components is off on purpose: every screen in this app shows
// per-user money/credit data that must be read fresh on each request.
const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: false,
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
