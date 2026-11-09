import type { NextConfig } from 'next';

const internalApiUrl = (process.env.API_INTERNAL_URL || 'http://localhost:4000').replace(/\/+$/, '');

const nextConfig: NextConfig = {
  transpilePackages: ['@proofline/ui', '@proofline/domain', '@proofline/contracts'],
  images: {
    unoptimized: true
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${internalApiUrl}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
