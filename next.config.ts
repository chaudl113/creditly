import type { NextConfig } from "next";

// Cache Components is off on purpose: every screen in this app shows
// per-user money/credit data that must be read fresh on each request.
// Standalone output keeps the Docker image small; migrate/seed ship as
// esbuild bundles (scripts/bundle-scripts.mjs) next to the traced server.
const nextConfig: NextConfig = {
  output: "standalone",
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
