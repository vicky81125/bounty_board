import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Forward requests to /api/* to the FastAPI backend
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL}/:path*`,
      },
    ]
  },
}

export default nextConfig
