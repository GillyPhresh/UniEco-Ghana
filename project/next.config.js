/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
  webpack: (config, { isServer }) => {
    config.parallelism = 1;
    return config;
  },
  async headers() {
    const production = process.env.NODE_ENV === 'production';
    const headers = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=(), usb=()' },
    ];

    if (production) {
      headers.push(
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        {
          // Next.js requires inline bootstrap scripts/styles. External sources
          // are limited to the current Supabase project family, approved public
          // images, and the existing OpenStreetMap iframe.
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "base-uri 'self'",
            "object-src 'none'",
            "frame-ancestors 'none'",
            "form-action 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https://*.supabase.co https://images.pexels.com",
            "font-src 'self' data:",
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
            "frame-src https://www.openstreetmap.org",
            "worker-src 'self' blob:",
            "manifest-src 'self'",
          ].join('; '),
        },
      );
    }

    return [{ source: '/:path*', headers }];
  },
};

module.exports = nextConfig;
