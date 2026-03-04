import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  // In production, export as static HTML/CSS/JS (served by the backend)
  // In development, use Next.js dev server with API proxying
  ...(isProd ? { output: "export" } : {}),

  // Increase proxy timeout for long-running browser automation tasks (default is ~30s)
  experimental: {
    proxyTimeout: 5 * 60 * 1000, // 5 minutes
  },

  // Rewrites only work in dev mode (not with static export)
  ...(!isProd
    ? {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: "http://localhost:4081/api/:path*",
            },
            {
              source: "/health",
              destination: "http://localhost:4081/health",
            },
          ];
        },
      }
    : {}),
};

export default nextConfig;
