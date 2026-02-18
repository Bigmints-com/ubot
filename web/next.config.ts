import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
