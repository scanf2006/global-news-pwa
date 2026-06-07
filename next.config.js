/** @type {import('next').NextConfig} */
const nextConfig = {
    compress: true,
    images: {
        formats: ['image/webp', 'image/avif'],
        deviceSizes: [640, 750, 828, 1080, 1200, 1920],
        imageSizes: [16, 32, 48, 64, 96, 128, 256],
        minimumCacheTTL: 60,
    },
    productionBrowserSourceMaps: false,
    experimental: {
        optimizeCss: true,
        optimizePackageImports: ['@/components', '@/lib', '@/services'],
    },
    poweredByHeader: false,
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    {
                        key: 'X-DNS-Prefetch-Control',
                        value: 'on',
                    },
                    {
                        key: 'X-Frame-Options',
                        value: 'SAMEORIGIN',
                    },
                ],
            },
        ];
    },
    reactStrictMode: true,
};

const withPWA = require('@ducanh2912/next-pwa').default({
    dest: 'public',
    disable: process.env.NODE_ENV === 'development',
    register: true,
    skipWaiting: true,
});

const { withSentryConfig } = require('@sentry/nextjs');

module.exports = withSentryConfig(
    withPWA(nextConfig),
    {
        silent: true,
        org: 'scanf2006',
        project: 'global-news-pwa',
    }
);
