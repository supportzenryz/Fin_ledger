import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page here is private, per-request data, so Cache Components is left off.
  experimental: {
    // Files upload straight to Supabase Storage, so actions only carry small form data.
    serverActions: { bodySizeLimit: "1mb" },
  },
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
