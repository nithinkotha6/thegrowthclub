import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // PERF-04: narrowed from a wildcard '**' hostname (which is only safe
    // because every call site also passed `unoptimized`, disabling the
    // proxy) to the actual Supabase Storage hostname. Avatars are the only
    // remote images the app renders; local `/avatars/*.jpg` fallbacks don't
    // go through remotePatterns at all.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  // SEC-06: baseline security headers — none were previously configured.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
