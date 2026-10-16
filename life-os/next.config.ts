import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every screen is personal, live data behind auth, so pages render per request
  // (no Cache Components / PPR). Revisit for the static PWA shell in Phase 10.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  serverExternalPackages: ["@prisma/adapter-pg", "pg"],
};

export default nextConfig;
